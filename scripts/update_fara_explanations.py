#!/usr/bin/env python3
"""Incremental plain-English FARA filing summaries for the existing POLITICS map.

Read official DOJ supplemental-statement PDFs; summarize only text that is
actually present in the statement. Avoid false financial totals (especially
$0.01 placeholder values) and invented political contacts. Daily refresh
prioritizes unprocessed newest filings across ALL registrants, not named people.
"""
from __future__ import annotations

import argparse
import io
import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'assets/data/foreign-influence'
OUTPUT=DATA/'filing-insights'
FAILED=OUTPUT/'unreadable.json'
LIMIT_BYTES=12_000_000
SCHEMA_VERSION=2

def compact(s,limit=520):
    return re.sub(r'\s+',' ',s or '').strip()[:limit]

def clean_activity(s):
    t=compact(s,520)
    if not t or len(t)<26:return None
    boilerplate=('if yes, identify','during this 6 month reporting period, has',
                 'foreign principal date contact','foreign principal activities/services',
                 'set forth below','describe in full detail','name foreign principal')
    if any(t.lower().startswith(x) for x in boilerplate):return None
    if 'see appendix' in t.lower() and len(t)<100:return None
    return t

def parse_period(text):
    m=re.search(r'(?:6\s*Month\s*Period\s*Ending)\s*([01]?\d/[0-3]?\d/20\d\d)',text,re.I)
    if not m:return None
    try:return datetime.strptime(m.group(1),'%m/%d/%Y').date().isoformat()
    except ValueError:return None


def parse_usd(value):
    raw=re.sub(r'[^0-9.-]','',str(value or ''))
    if not raw or raw in ('-','.','-.'):return None
    try:
        amount=float(raw)
    except ValueError:
        return None
    return round(amount,2) if amount>=0 else None

def _section(text,start,end):
    match=re.search(start+r'([\s\S]*?)'+end,text,re.I)
    return match.group(1) if match else ''

def _section_total(section):
    if not section:return None
    amounts=[]
    for pattern in (
        r'\$\s*([0-9][0-9,]*\.\d{2})\s*(?:_+\s*)?Total\b',
        r'\bTotal\s*\$?\s*([0-9][0-9,]*\.\d{2})\b'
    ):
        amounts.extend(parse_usd(x) for x in re.findall(pattern,section,re.I))
    values=[x for x in amounts if x is not None]
    return values[-1] if values else None

def extract_money_totals(text,placeholder=False):
    if placeholder:return None,None
    receipts=_section(text,
        r'14\.\s*\(?a\)?\s*RECEIPTS\s*[-–]?\s*MONIES',
        r'(?:14\.\s*\(?b\)?|RECEIPTS\s*[-–]\s*FUNDRAISING)')
    disbursements=_section(text,
        r'15\.\s*\(?a\)?\s*DISBURSEMENTS\s*[-–]?\s*MONIES',
        r'(?:15\.\s*\(?b\)?|DISBURSEMENTS\s*[-–]\s*THINGS)')
    return _section_total(receipts),_section_total(disbursements)

_US_GOV_CONTACT=re.compile(
    r'\b(?:Rep(?:resentative)?\.?|Congress(?:man|woman)?|Sen(?:ator)?\.?|'
    r'House(?:\s+[A-Za-z& -]+)?\s+Committee|Senate(?:\s+[A-Za-z& -]+)?\s+Committee|'
    r'House Foreign Affairs Committee|House Armed Services Committee|'
    r'Senate Foreign Relations Committee|Senate Armed Services Committee|'
    r'White House|National Security Council|State Department|Department of State|'
    r'Department of Defense|Executive Office of the President|U\.?S\.?\s+Congress)\b',re.I)

def extract_political_contacts(text,known_principals=None):
    principals=[re.sub(r'\s+',' ',str(x or '')).strip() for x in (known_principals or []) if str(x or '').strip()]
    if not principals:return []
    principal_pattern='|'.join(re.escape(x) for x in sorted(set(principals),key=len,reverse=True))
    methods=r'(?:E-?mail|Meeting|Telephone|Phone|Phone call|Call|Text message|Text|Zoom|Video conference|Videoconference|In-person|In person|Letter|Briefing)'
    flat=re.sub(r'\s+',' ',str(text or '').replace('\u00a0',' ')).strip()
    pattern=re.compile(
        rf'(?P<principal>{principal_pattern})\s*(?:\|\s*)?'
        rf'(?P<date>[01]?\d/[0-3]?\d/20\d{{2}})\s*(?:\|\s*)?'
        rf'(?P<contact>.{{2,180}}?)\s*(?:\|\s*)?'
        rf'(?P<method>{methods})\s*(?:\|\s*)?'
        rf'(?P<purpose>.{{2,260}}?)(?=(?:{principal_pattern})\s*(?:\|\s*)?[01]?\d/[0-3]?\d/20\d{{2}}|\b13\.\s|$)',
        re.I)
    rows=[]
    seen=set()
    for match in pattern.finditer(flat):
        contact=compact(match.group('contact'),180).strip(' |,-')
        if not _US_GOV_CONTACT.search(contact):continue
        row={
            'principal':compact(match.group('principal'),180),
            'date':match.group('date'),
            'contact':contact,
            'method':compact(match.group('method'),45),
            'purpose':compact(match.group('purpose'),240).strip(' |,-')
        }
        key=tuple(row.values())
        if key in seen:continue
        seen.add(key);rows.append(row)
        if len(rows)>=300:break
    return rows

def filing_day(raw):
    try:return datetime.strptime(str(raw or ''),'%m/%d/%Y').date().toordinal()
    except ValueError:return 0

def prioritize_plan_entries(entries):
    return sorted(list(entries),key=lambda e:(
        not bool(e.get('active')),
        -filing_day((e.get('doc') or {}).get('filed')),
        int(e.get('reg')) if str(e.get('reg','')).isdigit() else 9999999))

def publish_insight_index(now=None):
    now=now or datetime.now(timezone.utc)
    rows=[]
    for path in OUTPUT.glob('*.json'):
        if path.name in ('unreadable.json','index.json'):continue
        try:record=json.loads(path.read_text())
        except (OSError,ValueError):continue
        reg=str(record.get('registrationNumber',''))
        if not re.fullmatch(r'\d{1,6}',reg):continue
        rows.append({
            'registrationNumber':reg,
            'sourceUrl':record.get('sourceUrl'),
            'periodEnd':record.get('periodEnd'),
            'hasServices':bool(record.get('servicesSummary')),
            'moneyStatus':record.get('moneyStatus'),
            'politicalContactCount':len(record.get('politicalContacts') or []),
            'namedPrincipals':record.get('namedPrincipals') or []
        })
    rows.sort(key=lambda x:int(x['registrationNumber']))
    payload={'schemaVersion':1,'generatedAt':now.isoformat(timespec='seconds'),
             'count':len(rows),'registrations':rows}
    (OUTPUT/'index.json').write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n')

def find_activity(text):
    # Extract supplied response in Item 11, never the FARA form's questions.
    # Registrant-level services are still labeled registrant-level in UI.
    section=re.search(r'(?:\bIII\s*[-–]\s*ACTIVITIES)(.*?)(?:\bIV\s*[-–]\s*FINANCIAL)',text,re.S|re.I)
    if not section:return None
    txt=section.group(1)
    # Prefer table's Activities/Services value preceding numbered question 12.
    field=re.search(r'Activities/Services\s*\n?([\s\S]{1,1200}?)(?=\n\s*12\s*[.\)]|\n\s*\b12\.\s*During|\n\s*Foreign Principal\s+Date\s+Contact)',txt,re.I)
    if field:
        lines=[l.strip() for l in field.group(1).splitlines() if l.strip()]
        result=' '.join(lines)
        if result.lower().startswith('see attachment') or 'see attached' in result.lower()[:60]:return None
        return clean_activity(result)
    return None

def explain_supplemental(text,reg,source_url,known_principals=None):
    reg=str(reg)
    if not re.fullmatch(r'\d{1,6}',reg):raise ValueError('Invalid FARA registration ID')
    if not re.fullmatch(r'https://efile\.fara\.gov/docs/'+re.escape(reg)+r'-Supplemental-Statement-[^\s?#]+\.pdf',source_url,re.I):
        raise ValueError('Document URL not an official filing for this registrant')
    # Guard against accidental misattribution of downloaded documents.
    doc_match=re.search(r'(?:\bRegistration\s+Number)\s*:?\s*(\d{1,6})',text,re.I)
    if doc_match and doc_match.group(1)!=reg:raise ValueError('Filing registration ID does not match')
    section14=re.search(r'Rider\s+14\s*\(a\)(.*?)(?:Rider\s+15\s*\(a\)|Response to Item|Appendix|$)',text,re.S|re.I)
    section15=re.search(r'Rider\s+15\s*\(a\)(.*?)(?:Rider\s+[0-9]+\s*\(|Response to Item|Appendix|$)',text,re.S|re.I)
    r14=compact(section14.group(1),1400) if section14 else ''
    r15=compact(section15.group(1),1400) if section15 else ''
    placeholder=bool(re.search(r'(?:\$\s*0?\.01|\$\s*0\.01)',text) and
        re.search(r'\bplaceholder\b',r14+' '+r15,re.I) and
        re.search(r'non.zero numerical entry|does not represent the amount',r14+' '+r15,re.I))
    total_received,total_disbursed=extract_money_totals(text,placeholder)
    if placeholder:
        money_status='placeholder_not_actual'
        money_note=('The filing reports receipts and disbursements, but its $0.01 totals are '
                    'explicitly identified as electronic-form placeholders. The true amounts '
                    'cannot be determined from those entries.')
    elif total_received is not None or total_disbursed is not None:
        money_status='verified_filing_totals'
        parts=[]
        if total_received is not None:
            parts.append(chr(36)+format(total_received,',.2f')+' in total receipts')
        if total_disbursed is not None:
            parts.append(chr(36)+format(total_disbursed,',.2f')+' in total disbursements')
        money_note=('The supplemental statement reports '+(' and '.join(parts))+
                    ' for this registrant during the filing period. These are registrant-level '
                    'filing totals and are not automatically attributable to any one foreign principal.')
    else:
        money_status='not_extracted'
        money_note=('No verified receipts or expenditures have yet been extracted from this '
                    'filing. The absence of an extracted amount does not mean no money moved.')
    service=find_activity(text)
    rider_service=re.search(r'legal services exempt from registration under 22\s*U\.?S\.?C',r14+' '+r15,re.I)
    if not service and rider_service:service='The registrant reported providing legal services.'
    if re.search(r'UK\s+Office\s+of\s+Financial\s+Sanctions',r14+' '+r15,re.I):
        suffix=' The filing says related payments and disbursements were made under licenses from the UK Office of Financial Sanctions.'
        service=(service or 'The registrant reported legal services.')+suffix
    # A form's printed question is not evidence that a political contact
    # occurred. Contacts require itemized names, dates, or separately
    # extractable actual responses. We do not infer them here.
    normalized_text=re.sub(r'\s+',' ',text).casefold()
    names=[n for n in (known_principals or []) if re.sub(r'\s+',' ',n).casefold() in normalized_text]
    contacts=extract_political_contacts(text,names)
    contacts_summary=None
    if contacts:
        examples='; '.join(x['contact']+' — '+x['purpose'] for x in contacts[:3])
        contacts_summary=(str(len(contacts))+' disclosed U.S. political-contact entr'+
                          ('y' if len(contacts)==1 else 'ies')+' in this filing, including '+examples+'.')
    return {'schemaVersion':SCHEMA_VERSION,'registrationNumber':reg,'sourceUrl':source_url,
        'periodEnd':parse_period(text),'servicesSummary':service,
        'moneyStatus':money_status,'moneyExplanation':money_note,
        'totalReceivedUsd':total_received,'totalDisbursedUsd':total_disbursed,
        'contactsSummary':contacts_summary,'politicalContacts':contacts,'namedPrincipals':names,
        'extractionMethod':'Text of the original DOJ FARA supplemental filing; source-verified structured extraction',
        'coverage':'Registrant-level filing totals are reported only when the form provides an explicit total. '
                   'U.S. political contacts require an itemized principal/date/contact/method/purpose row. '
                   'No payment to a politician or principal-specific share is inferred.'}

def pdf_text(url,registration):
    if not re.fullmatch(r'https://efile\.fara\.gov/docs/'+re.escape(registration)+r'-Supplemental-Statement-[^\s?#]+\.pdf',url,re.I):
        raise ValueError('Unrecognized official PDF')
    from pypdf import PdfReader
    req=urllib.request.Request(url,headers={'User-Agent':'POLITICS-FARA-Reader/1.0','Accept':'application/pdf'})
    with urllib.request.urlopen(req,timeout=40) as response:
        size=int(response.headers.get('Content-Length','0') or 0)
        if size>LIMIT_BYTES:raise ValueError('PDF too large')
        raw=response.read(LIMIT_BYTES+1)
    if len(raw)>LIMIT_BYTES or not raw.startswith(b'%PDF'):raise ValueError('Invalid PDF')
    pdf=PdfReader(io.BytesIO(raw),strict=False)
    if len(pdf.pages)>45:raise ValueError('Unexpectedly long PDF')
    txt='\n'.join((p.extract_text(extraction_mode='layout') or '') for p in pdf.pages)
    if len(txt)<200:raise ValueError('PDF text layer absent; no unverified OCR substitution')
    return txt

def plan():
    # One latest supplemental document per unique registrant, reused across all
    # country entries. No handwritten country or politician lists.
    files=DATA/'countries'
    choices={}
    for path in files.glob('??.json'):
        try:country=json.loads(path.read_text())
        except (OSError,ValueError):continue
        for principal in country.get('principals',[]):
            reg=str(principal.get('registrationNumber',''))
            if not re.fullmatch(r'\d{1,6}',reg):continue
            candidates=[d for d in principal.get('documents',[]) if
                        d.get('type','').lower().startswith('supplemental statement') and
                        re.fullmatch(r'https://efile\.fara\.gov/docs/'+re.escape(reg)+r'-Supplemental-Statement-[^\s?#]+\.pdf',str(d.get('url','')),re.I)]
            if not candidates:continue
            def date(doc):
                try:return datetime.strptime(doc.get('filed',''),'%m/%d/%Y')
                except ValueError:return datetime.min
            chosen=max(candidates,key=date)
            entry=choices.setdefault(reg,{'reg':reg,'doc':chosen,'names':set(),'active':False})
            entry['names'].add(principal['principalName'])
            entry['active']=entry['active'] or principal.get('status')=='active'
            if date(chosen)>date(entry['doc']):entry['doc']=chosen
    return prioritize_plan_entries(choices.values())

def should_attempt(failure,source_url,now):
    """Skip unreadable or oversized originals for a week; retry revised filings."""
    if not isinstance(failure,dict) or failure.get('sourceUrl')!=source_url:return True
    try:
        last=datetime.fromisoformat(failure.get('attemptedAt',''))
        if last.tzinfo is None:last=last.replace(tzinfo=timezone.utc)
    except (ValueError,TypeError):return True
    return now-last>=timedelta(days=7)

def refresh(limit=60):
    OUTPUT.mkdir(parents=True,exist_ok=True)
    now=datetime.now(timezone.utc)
    try:failures=json.loads(FAILED.read_text())
    except (OSError,ValueError):failures={}
    queue=[]
    for entry in plan():
        path=OUTPUT/(entry['reg']+'.json')
        if path.is_file():
            try:
                old=json.loads(path.read_text())
                if old.get('sourceUrl')==entry['doc']['url'] and old.get('schemaVersion')==SCHEMA_VERSION:continue
            except (OSError,ValueError):pass
        if not should_attempt(failures.get(entry['reg']),entry['doc']['url'],now):
            continue
        queue.append(entry)
        if len(queue)>=limit:break
    if not queue:
        publish_insight_index(now)
        print('No new eligible FARA supplements in current incremental batch')
        return
    def process(e):
        txt=pdf_text(e['doc']['url'],e['reg'])
        result=explain_supplemental(txt,e['reg'],e['doc']['url'],list(e['names']))
        result['extractedAt']=datetime.now(timezone.utc).isoformat(timespec='seconds')
        return e['reg'],result
    count=0
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures={pool.submit(process,e):e for e in queue}
        for future in as_completed(futures):
            entry=futures[future]
            try:
                reg,record=future.result()
                (OUTPUT/(reg+'.json')).write_text(json.dumps(record,ensure_ascii=False,separators=(',',':'))+'\n')
                failures.pop(reg,None)
                count+=1
            except Exception as error:
                # A scanned PDF without a text layer is not an empty
                # disclosure. Leave it unavailable and continue to other
                # registrants on the next daily run.
                failures[entry['reg']]={'sourceUrl':entry['doc']['url'],
                     'attemptedAt':now.isoformat(),'reason':str(error)[:100]}
                print('Original PDF needs another extraction method: '+str(error)[:100])
    FAILED.write_text(json.dumps(failures,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n')
    publish_insight_index(now)
    print('Processed',count,'of',len(queue),'eligible supplemental statements; 
          'unreadable originals postponed for seven days')

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--limit',type=int,default=60)
    args=ap.parse_args()
    refresh(max(1,min(150,args.limit)))
+format(total_received,',.2f')+' in total receipts')
        if total_disbursed is not None:parts.append('
    rider_service=re.search(r'legal services exempt from registration under 22\s*U\.?S\.?C',r14+' '+r15,re.I)
    if not service and rider_service:service='The registrant reported providing legal services.'
    if re.search(r'UK\s+Office\s+of\s+Financial\s+Sanctions',r14+' '+r15,re.I):
        suffix=' The filing says related payments and disbursements were made under licenses from the UK Office of Financial Sanctions.'
        service=(service or 'The registrant reported legal services.')+suffix
    # A form's printed question is not evidence that a political contact
    # occurred. Contacts require itemized names, dates, or separately
    # extractable actual responses. We do not infer them here.
    names=[]
    section9=re.search(r'9\.\s*In addition.*?\brepresent\s+during\s+this\s+6\s+month\s+reporting\s+period[.:]?(.+?)(?:\n\s*10\.|10\.\s*During)',text,re.I|re.S)
    if section9 and known_principals:
        haystack=re.sub(r'\s+',' ',section9.group(1)).casefold()
        names=[n for n in known_principals if n.casefold() in haystack]
    # Default classification deliberately avoids labeling foreign principals
    # foreign governments or declaring that Congress was lobbied.
    return {'schemaVersion':1,'registrationNumber':reg,'sourceUrl':source_url,
        'periodEnd':parse_period(text),'servicesSummary':service,
        'moneyStatus':money_status,'moneyExplanation':money_note,
        'totalReceivedUsd':None,'totalDisbursedUsd':None,
        'contactsSummary':None,'namedPrincipals':names,
        'extractionMethod':'Text of the original DOJ FARA supplemental filing; incomplete by design',
        'coverage':'Documented registrant services and explicit monetary caveats only. '
                   'Activities, contacts and payment figures are not inferred.'}

def pdf_text(url,registration):
    if not re.fullmatch(r'https://efile\.fara\.gov/docs/'+re.escape(registration)+r'-Supplemental-Statement-[^\s?#]+\.pdf',url,re.I):
        raise ValueError('Unrecognized official PDF')
    from pypdf import PdfReader
    req=urllib.request.Request(url,headers={'User-Agent':'POLITICS-FARA-Reader/1.0','Accept':'application/pdf'})
    with urllib.request.urlopen(req,timeout=40) as response:
        size=int(response.headers.get('Content-Length','0') or 0)
        if size>LIMIT_BYTES:raise ValueError('PDF too large')
        raw=response.read(LIMIT_BYTES+1)
    if len(raw)>LIMIT_BYTES or not raw.startswith(b'%PDF'):raise ValueError('Invalid PDF')
    pdf=PdfReader(io.BytesIO(raw),strict=False)
    if len(pdf.pages)>45:raise ValueError('Unexpectedly long PDF')
    txt='\n'.join((p.extract_text(extraction_mode='layout') or '') for p in pdf.pages)
    if len(txt)<200:raise ValueError('PDF text layer absent; no unverified OCR substitution')
    return txt

def plan():
    # One latest supplemental document per unique registrant, reused across all
    # country entries. No handwritten country or politician lists.
    files=DATA/'countries'
    choices={}
    for path in files.glob('??.json'):
        try:country=json.loads(path.read_text())
        except (OSError,ValueError):continue
        for principal in country.get('principals',[]):
            reg=str(principal.get('registrationNumber',''))
            if not re.fullmatch(r'\d{1,6}',reg):continue
            candidates=[d for d in principal.get('documents',[]) if
                        d.get('type','').lower().startswith('supplemental statement') and
                        re.fullmatch(r'https://efile\.fara\.gov/docs/'+re.escape(reg)+r'-Supplemental-Statement-[^\s?#]+\.pdf',str(d.get('url','')),re.I)]
            if not candidates:continue
            def date(doc):
                try:return datetime.strptime(doc.get('filed',''),'%m/%d/%Y')
                except ValueError:return datetime.min
            chosen=max(candidates,key=date)
            entry=choices.setdefault(reg,{'reg':reg,'doc':chosen,'names':set(),'active':False})
            entry['names'].add(principal['principalName'])
            entry['active']=entry['active'] or principal.get('status')=='active'
            if date(chosen)>date(entry['doc']):entry['doc']=chosen
    sorted_choices=sorted(choices.values(),key=lambda e:(not e['active'],e['reg']))
    return sorted_choices

def should_attempt(failure,source_url,now):
    """Skip unreadable or oversized originals for a week; retry revised filings."""
    if not isinstance(failure,dict) or failure.get('sourceUrl')!=source_url:return True
    try:
        last=datetime.fromisoformat(failure.get('attemptedAt',''))
        if last.tzinfo is None:last=last.replace(tzinfo=timezone.utc)
    except (ValueError,TypeError):return True
    return now-last>=timedelta(days=7)

def refresh(limit=60):
    OUTPUT.mkdir(parents=True,exist_ok=True)
    now=datetime.now(timezone.utc)
    try:failures=json.loads(FAILED.read_text())
    except (OSError,ValueError):failures={}
    queue=[]
    for entry in plan():
        path=OUTPUT/(entry['reg']+'.json')
        if path.is_file():
            try:
                old=json.loads(path.read_text())
                if old.get('sourceUrl')==entry['doc']['url']:continue
            except (OSError,ValueError):pass
        if not should_attempt(failures.get(entry['reg']),entry['doc']['url'],now):
            continue
        queue.append(entry)
        if len(queue)>=limit:break
    if not queue:
        print('No new eligible FARA supplements in current incremental batch')
        return
    def process(e):
        txt=pdf_text(e['doc']['url'],e['reg'])
        result=explain_supplemental(txt,e['reg'],e['doc']['url'],list(e['names']))
        result['extractedAt']=datetime.now(timezone.utc).isoformat(timespec='seconds')
        return e['reg'],result
    count=0
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures={pool.submit(process,e):e for e in queue}
        for future in as_completed(futures):
            entry=futures[future]
            try:
                reg,record=future.result()
                (OUTPUT/(reg+'.json')).write_text(json.dumps(record,ensure_ascii=False,separators=(',',':'))+'\n')
                failures.pop(reg,None)
                count+=1
            except Exception as error:
                # A scanned PDF without a text layer is not an empty
                # disclosure. Leave it unavailable and continue to other
                # registrants on the next daily run.
                failures[entry['reg']]={'sourceUrl':entry['doc']['url'],
                     'attemptedAt':now.isoformat(),'reason':str(error)[:100]}
                print('Original PDF needs another extraction method: '+str(error)[:100])
    FAILED.write_text(json.dumps(failures,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n')
    print('Processed',count,'of',len(queue),'eligible supplemental statements; '
          'unreadable originals postponed for seven days')

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--limit',type=int,default=60)
    args=ap.parse_args()
    refresh(max(1,min(150,args.limit)))
+format(total_disbursed,',.2f')+' in total disbursements')
        money_note=('The supplemental statement reports '+(' and '.join(parts))+
                    ' for this registrant during the filing period. These are registrant-level '
                    'filing totals and are not automatically attributable to any one foreign principal.')
    else:
        money_status='not_extracted'
        money_note=('No verified receipts or expenditures have yet been extracted from this '
                    'filing. The absence of an extracted amount does not mean no money moved.')
    service=find_activity(text)
    rider_service=re.search(r'legal services exempt from registration under 22\s*U\.?S\.?C',r14+' '+r15,re.I)
    if not service and rider_service:service='The registrant reported providing legal services.'
    if re.search(r'UK\s+Office\s+of\s+Financial\s+Sanctions',r14+' '+r15,re.I):
        suffix=' The filing says related payments and disbursements were made under licenses from the UK Office of Financial Sanctions.'
        service=(service or 'The registrant reported legal services.')+suffix
    # A form's printed question is not evidence that a political contact
    # occurred. Contacts require itemized names, dates, or separately
    # extractable actual responses. We do not infer them here.
    names=[]
    section9=re.search(r'9\.\s*In addition.*?\brepresent\s+during\s+this\s+6\s+month\s+reporting\s+period[.:]?(.+?)(?:\n\s*10\.|10\.\s*During)',text,re.I|re.S)
    if section9 and known_principals:
        haystack=re.sub(r'\s+',' ',section9.group(1)).casefold()
        names=[n for n in known_principals if n.casefold() in haystack]
    # Default classification deliberately avoids labeling foreign principals
    # foreign governments or declaring that Congress was lobbied.
    return {'schemaVersion':1,'registrationNumber':reg,'sourceUrl':source_url,
        'periodEnd':parse_period(text),'servicesSummary':service,
        'moneyStatus':money_status,'moneyExplanation':money_note,
        'totalReceivedUsd':None,'totalDisbursedUsd':None,
        'contactsSummary':None,'namedPrincipals':names,
        'extractionMethod':'Text of the original DOJ FARA supplemental filing; incomplete by design',
        'coverage':'Documented registrant services and explicit monetary caveats only. '
                   'Activities, contacts and payment figures are not inferred.'}

def pdf_text(url,registration):
    if not re.fullmatch(r'https://efile\.fara\.gov/docs/'+re.escape(registration)+r'-Supplemental-Statement-[^\s?#]+\.pdf',url,re.I):
        raise ValueError('Unrecognized official PDF')
    from pypdf import PdfReader
    req=urllib.request.Request(url,headers={'User-Agent':'POLITICS-FARA-Reader/1.0','Accept':'application/pdf'})
    with urllib.request.urlopen(req,timeout=40) as response:
        size=int(response.headers.get('Content-Length','0') or 0)
        if size>LIMIT_BYTES:raise ValueError('PDF too large')
        raw=response.read(LIMIT_BYTES+1)
    if len(raw)>LIMIT_BYTES or not raw.startswith(b'%PDF'):raise ValueError('Invalid PDF')
    pdf=PdfReader(io.BytesIO(raw),strict=False)
    if len(pdf.pages)>45:raise ValueError('Unexpectedly long PDF')
    txt='\n'.join((p.extract_text(extraction_mode='layout') or '') for p in pdf.pages)
    if len(txt)<200:raise ValueError('PDF text layer absent; no unverified OCR substitution')
    return txt

def plan():
    # One latest supplemental document per unique registrant, reused across all
    # country entries. No handwritten country or politician lists.
    files=DATA/'countries'
    choices={}
    for path in files.glob('??.json'):
        try:country=json.loads(path.read_text())
        except (OSError,ValueError):continue
        for principal in country.get('principals',[]):
            reg=str(principal.get('registrationNumber',''))
            if not re.fullmatch(r'\d{1,6}',reg):continue
            candidates=[d for d in principal.get('documents',[]) if
                        d.get('type','').lower().startswith('supplemental statement') and
                        re.fullmatch(r'https://efile\.fara\.gov/docs/'+re.escape(reg)+r'-Supplemental-Statement-[^\s?#]+\.pdf',str(d.get('url','')),re.I)]
            if not candidates:continue
            def date(doc):
                try:return datetime.strptime(doc.get('filed',''),'%m/%d/%Y')
                except ValueError:return datetime.min
            chosen=max(candidates,key=date)
            entry=choices.setdefault(reg,{'reg':reg,'doc':chosen,'names':set(),'active':False})
            entry['names'].add(principal['principalName'])
            entry['active']=entry['active'] or principal.get('status')=='active'
            if date(chosen)>date(entry['doc']):entry['doc']=chosen
    sorted_choices=sorted(choices.values(),key=lambda e:(not e['active'],e['reg']))
    return sorted_choices

def should_attempt(failure,source_url,now):
    """Skip unreadable or oversized originals for a week; retry revised filings."""
    if not isinstance(failure,dict) or failure.get('sourceUrl')!=source_url:return True
    try:
        last=datetime.fromisoformat(failure.get('attemptedAt',''))
        if last.tzinfo is None:last=last.replace(tzinfo=timezone.utc)
    except (ValueError,TypeError):return True
    return now-last>=timedelta(days=7)

def refresh(limit=60):
    OUTPUT.mkdir(parents=True,exist_ok=True)
    now=datetime.now(timezone.utc)
    try:failures=json.loads(FAILED.read_text())
    except (OSError,ValueError):failures={}
    queue=[]
    for entry in plan():
        path=OUTPUT/(entry['reg']+'.json')
        if path.is_file():
            try:
                old=json.loads(path.read_text())
                if old.get('sourceUrl')==entry['doc']['url']:continue
            except (OSError,ValueError):pass
        if not should_attempt(failures.get(entry['reg']),entry['doc']['url'],now):
            continue
        queue.append(entry)
        if len(queue)>=limit:break
    if not queue:
        print('No new eligible FARA supplements in current incremental batch')
        return
    def process(e):
        txt=pdf_text(e['doc']['url'],e['reg'])
        result=explain_supplemental(txt,e['reg'],e['doc']['url'],list(e['names']))
        result['extractedAt']=datetime.now(timezone.utc).isoformat(timespec='seconds')
        return e['reg'],result
    count=0
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures={pool.submit(process,e):e for e in queue}
        for future in as_completed(futures):
            entry=futures[future]
            try:
                reg,record=future.result()
                (OUTPUT/(reg+'.json')).write_text(json.dumps(record,ensure_ascii=False,separators=(',',':'))+'\n')
                failures.pop(reg,None)
                count+=1
            except Exception as error:
                # A scanned PDF without a text layer is not an empty
                # disclosure. Leave it unavailable and continue to other
                # registrants on the next daily run.
                failures[entry['reg']]={'sourceUrl':entry['doc']['url'],
                     'attemptedAt':now.isoformat(),'reason':str(error)[:100]}
                print('Original PDF needs another extraction method: '+str(error)[:100])
    FAILED.write_text(json.dumps(failures,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n')
    print('Processed',count,'of',len(queue),'eligible supplemental statements; '
          'unreadable originals postponed for seven days')

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--limit',type=int,default=60)
    args=ap.parse_args()
    refresh(max(1,min(150,args.limit)))
