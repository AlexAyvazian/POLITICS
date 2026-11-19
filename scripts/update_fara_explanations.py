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
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'assets/data/foreign-influence'
OUTPUT=DATA/'filing-insights'
LIMIT_BYTES=12_000_000

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
    money_status='placeholder_not_actual' if placeholder else 'not_extracted'
    money_note=('The filing reports receipts and disbursements, but its $0.01 totals are '
                'explicitly identified as electronic-form placeholders. The true amounts '
                'cannot be determined from those entries.') if placeholder else (
                'No verified receipts or expenditures have yet been extracted from this '
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
            chosen=max(candidates,key=lambda x:str(x.get('filed','')))
            entry=choices.setdefault(reg,{'reg':reg,'doc':chosen,'names':set(),'active':False})
            entry['names'].add(principal['principalName'])
            entry['active']=entry['active'] or principal.get('status')=='active'
            def date(doc):
                try:return datetime.strptime(doc.get('filed',''),'%m/%d/%Y')
                except ValueError:return datetime.min
            if date(chosen)>date(entry['doc']):entry['doc']=chosen
    sorted_choices=sorted(choices.values(),key=lambda e:(not e['active'],e['reg']))
    return sorted_choices

def refresh(limit=60):
    OUTPUT.mkdir(parents=True,exist_ok=True)
    queue=[]
    for entry in plan():
        path=OUTPUT/(entry['reg']+'.json')
        if path.is_file():
            try:
                old=json.loads(path.read_text())
                if old.get('sourceUrl')==entry['doc']['url']:continue
            except (OSError,ValueError):pass
        queue.append(entry)
        if len(queue)>=limit:break
    if not queue:
        print('No new official FARA supplements in current incremental batch')
        return
    def process(e):
        txt=pdf_text(e['doc']['url'],e['reg'])
        result=explain_supplemental(txt,e['reg'],e['doc']['url'],list(e['names']))
        result['extractedAt']=datetime.now(timezone.utc).isoformat(timespec='seconds')
        return e['reg'],result
    count=0
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures=[pool.submit(process,e) for e in queue]
        for future in as_completed(futures):
            try:
                reg,record=future.result()
                (OUTPUT/(reg+'.json')).write_text(json.dumps(record,ensure_ascii=False,separators=(',',':'))+'\n')
                count+=1
            except Exception as e:
                print('One PDF could not be automatically explained: '+str(e)[:160])
    print('Processed',count,'of',len(queue),'latest supplemental statements; unmatched remain pending')

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--limit',type=int,default=60)
    args=ap.parse_args()
    refresh(max(1,min(150,args.limit)))
