#!/usr/bin/env python3
"""Fetch current state legislators from Open States' nightly public CSV files.

Only this scheduled GitHub Action contacts Open States. Website visitors read
static JSON produced here, never the provider's API or its credentials.
Retain the last validated state file on upstream failures or truncated rosters.
"""
from __future__ import annotations
import csv
import io
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'data' / 'legislators'
STATES = ('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI '
          'MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT '
          'VT VA WA WV WI WY').split()
REQUIRED = {'id','name','current_party','current_district','current_chamber'}
SOURCE = 'Open States / Plural nightly current-legislator CSV'

def csv_url(state):
 if state not in STATES:
  raise ValueError('Unknown state')
 return 'https://data.openstates.org/people/current/'+state.lower()+'.csv'

def parse_current_csv(state, fileobj, min_rows=18):
 reader = csv.DictReader(fileobj)
 if not reader.fieldnames or not REQUIRED.issubset(set(reader.fieldnames)):
  raise ValueError('Missing required Open States current-roster CSV fields')
 people = []
 seen = set()
 for row in reader:
  pid = (row.get('id') or '').strip()
  name = (row.get('name') or '').strip()
  party = (row.get('current_party') or '').strip()
  district = (row.get('current_district') or '').strip()
  chamber = (row.get('current_chamber') or '').strip().lower()
  # Nebraska's official chamber is a unicameral Legislature in Open States.
  if state=='NE' and chamber=='legislature': chamber='upper'
  if not pid.startswith('ocd-person/') or not name or not party or not district or chamber not in ('upper','lower'):
   continue
  if pid in seen: continue
  seen.add(pid)
  if re.fullmatch(r'\d{1,3}',district):
   district=str(int(district))
  urls = (row.get('links') or '').split(';')
  link=next((u.strip() for u in urls if u.strip().startswith('https://')), '')
  people.append({'id':pid[:100], 'name':name[:140], 'party':party[:80],
                 'role':'Senator' if chamber=='upper' else 'Representative',
                 'district':district[:65], 'url':link[:360]})
 if len(people)<min_rows:
  raise ValueError(f'Incomplete {state} roster ({len(people)} people, expected at least {min_rows})')
 if not any(p['role']=='Senator' for p in people):
  raise ValueError('Missing upper chamber members')
 if state!='NE' and not any(p['role']=='Representative' for p in people):
  raise ValueError('Missing lower chamber members')
 return {'source':SOURCE,'state':state,'sourceUrl':csv_url(state),
         'totalPeople':len(people),'people':sorted(people,key=lambda x:(x['role'],x['district'],x['name']))}

def fetch_csv(state):
 error = None
 for attempt in range(3):
  try:
   req=Request(csv_url(state),headers={'Accept':'text/csv','User-Agent':'POLITICS-Atlas-Boundary-Research/1.0'})
   with urlopen(req,timeout=50) as response:
    raw=response.read(5_000_001)
   if len(raw)>5_000_000: raise ValueError('Unexpected large roster file')
   return parse_current_csv(state,io.StringIO(raw.decode('utf-8-sig')))
  except Exception as exc:
   error=exc
   if attempt<2: time.sleep(2*(attempt+1))
 raise RuntimeError(f'{state}: {error}')

def update_one(state):
 path=OUT/(state.lower()+'.json')
 doc=fetch_csv(state)
 if path.exists():
  try:
   old=json.loads(path.read_text('utf-8'))
   if old.get('people')==doc['people'] and old.get('sourceUrl')==doc['sourceUrl']:
    return state,len(doc['people']),'unchanged'
  except (ValueError,OSError): pass
 doc['retrievedAt']=datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
 path.parent.mkdir(parents=True,exist_ok=True)
 tmp=path.with_suffix('.json.pending')
 tmp.write_text(json.dumps(doc,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
 tmp.replace(path)
 return state,len(doc['people']),'updated'

def main():
 failures={}
 with ThreadPoolExecutor(max_workers=4) as pool:
  future_map={pool.submit(update_one,state):state for state in STATES}
  for future in as_completed(future_map):
   state=future_map[future]
   try:
    _, count, status=future.result()
    print(state,count,status,flush=True)
   except Exception as exc:
    failures[state]=str(exc)
    print('RETAIN old file for',state,str(exc),flush=True)
 files=[state for state in STATES if (OUT/(state.lower()+'.json')).exists()]
 if len(files)<45:
  raise SystemExit('Too few validated state roster files available: '+str(len(files))+'/50')
 # Only write manifest if recorded coverage changes, not every time schedule runs.
 manifest={'source':SOURCE,'sourceDetails':'https://open.pluralpolicy.com/data/legislator-csv/',
           'states':files,'missing':[s for s in STATES if s not in files],
           'recordCounts':{s:len(json.loads((OUT/(s.lower()+'.json')).read_text('utf-8'))['people']) for s in files}}
 manifestPath=OUT/'manifest.json'
 content=json.dumps(manifest,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n'
 if not manifestPath.exists() or manifestPath.read_text('utf-8')!=content:
  manifestPath.write_text(content,encoding='utf-8')
 print('Cached',len(files),'state rosters; failures during this run:',len(failures),flush=True)
 return 0

if __name__=='__main__':
 raise SystemExit(main())
