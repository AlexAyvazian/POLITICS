#!/usr/bin/env python3
"""Daily, source-verified FARA world registry for the existing POLITICS app.

DOJ's bulk registry provides country/foreign principal/registrant links and
an index of filed PDFs. It does NOT provide reliable normalized dollar
amounts, federal official contacts or attribution to campaign contributions.
Never infer or total those fields from this registry.
"""
from __future__ import annotations

import csv
import io
import json
import re
import sys
import unicodedata
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'assets/data/foreign-influence'
CATALOG=ROOT/'assets/js/foreign-world-catalog.js'
BASE='https://efile.fara.gov/bulk/zip/'
SOURCES=('FARA_All_ForeignPrincipals','FARA_All_RegistrantDocs','FARA_All_Registrants')
HEADERS={'User-Agent':'POLITICS-FARA-Registry/1.0 (public DOJ data, daily archive)',
         'Accept':'application/zip,application/octet-stream'}
MAX_ZIP=25_000_000
MAX_UNPACKED=75_000_000

def pick(row,*fields):
    cleaned={re.sub(r'[^a-z0-9]','',k.casefold()):str(v or '').strip() for k,v in row.items() if k}
    for field in fields:
        value=cleaned.get(re.sub(r'[^a-z0-9]','',field.casefold()),'')
        if value:return value
    return ''

def text(value,length=180):
    return re.sub(r'[\x00-\x1f\x7f]',' ',str(value or '')).strip()[:length]

def normalize(value):
    s=unicodedata.normalize('NFKD',str(value or ''))
    s=''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^A-Z0-9]','',s.upper())

def country_index(catalog):
    result={}
    for c in catalog:
        for name in [c.get('name'),c.get('iso2'),c.get('iso3'),*(c.get('atlasNames') or [])]:
            if name:result[normalize(name)]=c['iso2']
    aliases={
        'SOUTHKOREA':'KR','NORTHKOREA':'KP','KOREAREPUBLICOF':'KR',
        'RUSSIANFEDERATION':'RU','IRANISLAMICREPUBLICOF':'IR',
        'SYRIANARABREPUBLIC':'SY','VIETNAM':'VN','BOLIVIAPLURINATIONALSTATEOF':'BO',
        'VENEZUELABOLIVARIANREPUBLICOF':'VE','TANZANIAUNITEDREPUBLICOF':'TZ',
        'MOLDOVAREPUBLICOF':'MD','UNITEDSTATESOFAMERICA':'US',
        'COTEDIVOIRE':'CI','IVORYCOAST':'CI','DEMOCRATICREPUBLICOFTHECONGO':'CD',
        'CONGODEMOCRATICREPUBLICOF':'CD','REPUBLICOFTHECONGO':'CG',
        'TURKIYE':'TR','TURKEY':'TR','BURMA':'MM','CZECHREPUBLIC':'CZ',
        'PALESTINIAN TERRITORIES'.replace(' ',''):'PS'
    }
    valid={c['iso2'] for c in catalog}
    for alias,iso in aliases.items():
        if iso in valid:result[alias]=iso
    return result

def normalize_country(value,index):
    return index.get(normalize(value))

def safe_fara_url(value):
    value=str(value or '').strip()
    if re.fullmatch(r'https://efile\.fara\.gov/(?:docs/[^\s?#]+\.pdf|api/v1/RegDocs/json/[0-9]+)',value,re.I):
        return value
    return None

def parse_zip_csv(data,name):
    if len(data)>MAX_ZIP:raise ValueError('FARA compressed data exceeds safety limit')
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        options=[x for x in archive.infolist() if x.filename.split('/')[-1].lower()==(name+'.csv').lower()]
        if len(options)!=1:raise ValueError('Expected one exact FARA bulk CSV: '+name)
        item=options[0]
        if item.file_size>MAX_UNPACKED:raise ValueError('FARA unpacked data exceeds safety limit')
        raw=archive.read(item)
    try:decoded=raw.decode('utf-8-sig')
    except UnicodeDecodeError:decoded=raw.decode('latin-1')
    reader=csv.DictReader(io.StringIO(decoded,newline=''))
    if not reader.fieldnames:raise ValueError('FARA CSV has no headers')
    return list(reader)

def fetch_dataset(name):
    request=urllib.request.Request(BASE+name+'.csv.zip',headers=HEADERS)
    with urllib.request.urlopen(request,timeout=100) as response:
        raw=response.read(MAX_ZIP+1)
    if len(raw)>MAX_ZIP:raise ValueError('Compressed FARA payload too large')
    return parse_zip_csv(raw,name)

def catalog_countries():
    raw=CATALOG.read_text()
    match=re.search(r'export const COUNTRIES\s*=\s*(\[[\s\S]*?\]);',raw)
    if not match:raise ValueError('Healthcare country catalog format changed')
    return json.loads(match.group(1))

def join_documents(docs):
    by_registration=defaultdict(list)
    for row in docs:
        number=pick(row,'Registration_Number','REG_NUMBER')
        if not re.fullmatch(r'[0-9]{1,6}',number):continue
        url=safe_fara_url(pick(row,'URL','Document_URL','Document_Link'))
        if not url:continue
        by_registration[number].append({
            'url':url,'type':text(pick(row,'Document_Type','Doc_Type'),65),
            'filed':text(pick(row,'Date_Stamped','Date_Received','Filing_Date'),30),
            'principal':text(pick(row,'Foreign_Principal_Name','Foreign_Principal'),180),
            'country':text(pick(row,'Foreign_Principal_Country','Country_Location'),90)
        })
    return by_registration

def extract_principal(row):
    return {
        'registrationNumber':pick(row,'Registration_Number','REG_NUMBER'),
        'principalName':text(pick(row,'Foreign_Principal','FP_NAME','Foreign_Principal_Name'),180),
        'countryReported':text(pick(row,'Country_Location','Country_Name','Country_Location_Represented'),90),
        'registrantName':text(pick(row,'Registrant_Name','REGISTRANT_NAME'),180),
        'registeredAt':text(pick(row,'Foreign_Principal_Registration_Date','Principal_Registration_Date','FP_REG_DATE','Registration_Date'),30),
        'terminatedAt':text(pick(row,'Foreign_Principal_Termination_Date','Principal_Termination_Date','Termination_Date'),30)
    }

def build_country_snapshot(iso,principals,docs,index,now,catalog=None):
    names={c['iso2']:c['name'] for c in (catalog or [])}
    index_docs=docs if isinstance(docs,dict) else join_documents(docs)
    seen=set()
    items=[]
    for row in principals:
        p=extract_principal(row)
        if normalize_country(p['countryReported'],index)!=iso or not p['principalName'] or not p['registrantName']:continue
        registration=p['registrationNumber']
        if not re.fullmatch(r'[0-9]{1,6}',registration):continue
        key=(registration,normalize(p['principalName']),p['terminatedAt'])
        if key in seen:continue
        seen.add(key)
        related=[]
        for d in index_docs.get(registration,[]):
            # A filing covering an entire registrant is indexed but NOT assumed
            # to concern any individual principal within that registrant.
            scoped=normalize(d['principal'])==normalize(p['principalName']) if d['principal'] else False
            scoped_country=normalize_country(d['country'],index)==iso if d['country'] else False
            if not scoped and not scoped_country and d['principal']:continue
            related.append({'url':d['url'],'type':d['type'],'filed':d['filed'],
                            'appliesTo':'named principal' if scoped else 'registrant filing'})
        related=sorted(related,key=lambda x:x['filed'],reverse=True)[:6]
        items.append({
            'registrationNumber':registration,'principalName':p['principalName'],
            'registrantName':p['registrantName'],
            'registeredAt':p['registeredAt'],'terminatedAt':p['terminatedAt'] or None,
            'status':'terminated' if p['terminatedAt'] else 'active',
            'documents':related,
            'allRegistrantDocumentsUrl':'https://efile.fara.gov/api/v1/RegDocs/json/'+registration
        })
    items.sort(key=lambda x:(x['status']!='active',x['registrantName'].casefold(),x['principalName'].casefold()))
    return {
        'schemaVersion':1,'countryCode':iso,'countryName':names.get(iso,iso),
        'source':'U.S. Department of Justice FARA bulk registry',
        'checkedAt':now,'registeredPrincipals':len(items),
        'activePrincipals':sum(p['status']=='active' for p in items),
        'registrants':len({p['registrationNumber'] for p in items}),
        'verifiedReceiptsUsd':None,'verifiedDisbursementsUsd':None,
        'coverage':{
            'financialStatus':'not_extracted',
            'moneyExplanation':'DOJ registry lists foreign principals, agents and filing PDFs. It does not provide standardized payments or lobbying spending totals; no amount has been attributed without a reviewed original financial disclosure.',
            'principalScope':'FARA foreign principals include governments, companies, organizations and individuals. A registration alone does not establish government ownership.',
            'activityScope':'Descriptions of lobbying, communications, policy targets and services remain in original filings until extracted and verified.',
            'recordScope':'All active and terminated principals in this DOJ bulk snapshot, not all possible foreign lobbying activities.'
        },'principals':items
    }

def build_summary(principals,index,now,catalog=None):
    grouped=defaultdict(list)
    unmatched=0
    for row in principals:
        p=extract_principal(row)
        if not p['principalName'] or not p['registrantName']:continue
        iso=normalize_country(p['countryReported'],index)
        if iso:grouped[iso].append(row)
        else:unmatched+=1
    counts={}
    for iso,rows in grouped.items():
        report=build_country_snapshot(iso,rows,{},index,now,catalog)
        counts[iso]={
            'principals':report['registeredPrincipals'],'activePrincipals':report['activePrincipals'],
            'registrants':report['registrants'],'verifiedReceiptsUsd':None,'verifiedDisbursementsUsd':None,
            'financialStatus':'not_extracted'
        }
    return {
        'schemaVersion':1,'source':'U.S. Department of Justice FARA bulk registry',
        'checkedAt':now,'countries':counts,
        'registeredPrincipals':sum(x['principals'] for x in counts.values()),
        'unmatchedPrincipals':unmatched,
        'countryCount':len(counts),
        'financialStatus':'not_extracted',
        'sourceUrl':'https://efile.fara.gov/ords/fara/f?p=107:21:::NO::'
    }

def publish():
    now=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
    countries=catalog_countries()
    index=country_index(countries)
    principals=fetch_dataset('FARA_All_ForeignPrincipals')
    docs=fetch_dataset('FARA_All_RegistrantDocs')
    registrants=fetch_dataset('FARA_All_Registrants')
    if len(principals)<1000 or len(registrants)<1000 or len(docs)<1000:
        raise ValueError('FARA DOJ bulk response too small; refusing incomplete publish')
    # Require the expected DOJ fields before touching published files.
    # Registrations may legitimately omit a country or principal name.
    # Validate column presence rather than incorrectly requiring each
    # of the first eight records to have every field populated.
    source_keys={normalize(k) for k in principals[0].keys() if k}
    required=[
        ('Foreign_Principal','FP_NAME','Foreign_Principal_Name'),
        ('Country_Location','Country_Name','Country_Location_Represented'),
        ('Registrant_Name','REGISTRANT_NAME'),
        ('Registration_Number','REG_NUMBER')
    ]
    missing=[group for group in required if not any(normalize(k) in source_keys for k in group)]
    if missing:
        raise ValueError('Unrecognized FARA columns '+str(sorted(source_keys))+'; missing '+str(missing))
    summary=build_summary(principals,index,now,countries)
    if summary['registeredPrincipals']<1000:
        raise ValueError('Too few country-joined foreign principals; not overwriting prior good snapshot')
    doc_index=join_documents(docs)
    # Group once. Calling build_country_snapshot with the full historical
    # principal dataset separately for every country makes each daily refresh
    # O(countries * principal-records) and can stall on a large DOJ archive.
    by_country=defaultdict(list)
    for row in principals:
        iso=normalize_country(pick(row,'Country_Location','Country_Name',
                                       'Country_Location_Represented'),index)
        if iso:by_country[iso].append(row)
    reports={}
    for iso,rows in by_country.items():
        reports[iso]=build_country_snapshot(iso,rows,doc_index,index,now,countries)
    target=OUTPUT/'countries'
    target.mkdir(parents=True,exist_ok=True)
    for iso,report in reports.items():
        (target/(iso+'.json')).write_text(json.dumps(report,ensure_ascii=False,separators=(',',':'))+'\n')
    (OUTPUT/'latest.json').write_text(json.dumps(summary,ensure_ascii=False,separators=(',',':'))+'\n')
    print('DOJ FARA records:',len(principals),'countries:',len(reports),
          'matched:',summary['registeredPrincipals'],'unmatched:',summary['unmatchedPrincipals'],
          'docs:',len(docs),'at',now,flush=True)

if __name__=='__main__':
    try:publish()
    except Exception as error:
        print('FARA refresh failed: '+str(error),file=sys.stderr)
        raise
