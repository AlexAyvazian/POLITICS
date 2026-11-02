#!/usr/bin/env python3
"""Import 2025–2026 candidate financial totals from official FEC bulk files.

Source and candidate-to-Bioguide mapping are explicit: we never match by
surname or infer a missing amount. This feed is campaign finance, not personal
assets, travel funding, or donations to the legislator personally.
"""
from __future__ import annotations
import csv, io, json, re, sys, urllib.request, zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/data/records/finance'
FEC='https://www.fec.gov/files/bulk-downloads/2026/weball26.zip'
ROSTER='https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml'
HEADERS={'User-Agent':'POLITICS-Civic-Records/1.0 (daily cache; public FEC data)','Accept':'*/*'}

def request(url,limit):
 req=urllib.request.Request(url,headers=HEADERS)
 with urllib.request.urlopen(req,timeout=85) as r:
  body=r.read(limit+1)
 if len(body)>limit:raise ValueError('Download exceeded permitted size')
 return body

def amount(row,index):
 raw=row[index].strip().replace(',','') if len(row)>index else ''
 if not raw:return None
 try:value=round(float(raw),2)
 except ValueError:raise ValueError('Nonnumeric FEC financial amount')
 if not -1e10<value<1e12:raise ValueError('FEC amount outside expected range')
 return value

def parse_fec_text(text):
 out={}
 rows=csv.reader(io.StringIO(text),delimiter='|')
 for row in rows:
  if len(row)<30:continue
  fid=row[0].strip()
  if not re.fullmatch('[HS][A-Z0-9]{8}',fid):continue
  out[fid]={
   'candidateId':fid,'candidateName':row[1].strip(),
   'raised':amount(row,5),'authorizedTransfersIn':amount(row,6),
   'spent':amount(row,7),'authorizedTransfersOut':amount(row,8),
   'cashOnHand':amount(row,10),'selfContributions':amount(row,11),
   'loansFromCandidate':amount(row,12),'otherLoans':amount(row,13),
   'debts':amount(row,16),'individualContributions':amount(row,17),
   'committeeContributions':amount(row,25),'partyContributions':amount(row,26),
   'coverageEnd':row[27].strip(),'refundedToIndividuals':amount(row,28),
   'refundedToCommittees':amount(row,29)}
 return out

def crosswalk(legislators):
 mapping={}
 for person in legislators:
  ids=person.get('id') or {}
  bioguide=ids.get('bioguide')
  fec=ids.get('fec') or []
  if isinstance(fec,str):fec=[fec]
  if not isinstance(bioguide,str) or not re.fullmatch('[A-Z][0-9]{6}',bioguide):continue
  terms=person.get('terms') or []
  chamber='S' if terms and terms[-1].get('type')=='sen' else 'H'
  acceptable=sorted(set(fid for fid in fec if isinstance(fid,str) and re.fullmatch('[HS][A-Z0-9]{8}',fid) and fid[0]==chamber))
  if acceptable:mapping[bioguide]=acceptable
 return mapping

def select_candidates(mapping,report):
 selected={}
 for bio,ids in mapping.items():
  matches=[report[fid] for fid in ids if fid in report]
  if len(matches)!=1:continue # ambiguous financial coverage; do not combine or guess
  selected[bio]=matches[0]
 return selected

def main():
 try:import yaml
 except ImportError:raise SystemExit('Install PyYAML in workflow')
 raw=request(FEC,35_000_000)
 with zipfile.ZipFile(io.BytesIO(raw)) as z:
  txt=[name for name in z.namelist() if name.lower().endswith(('.txt','.csv'))]
  if len(txt)!=1:raise ValueError('Expected exactly one FEC bulk data file')
  with z.open(txt[0]) as stream:report=parse_fec_text(io.TextIOWrapper(stream,encoding='utf-8-sig',errors='replace').read())
 if len(report)<1000:raise ValueError('FEC bulk candidate file too small; not publishing')
 people=yaml.safe_load(request(ROSTER,6_000_000))
 mapped=select_candidates(crosswalk(people),report)
 if len(mapped)<180:raise ValueError(f'Only {len(mapped)} confident FEC member matches: refusing partial publish')
 OUT.mkdir(parents=True,exist_ok=True)
 count=0
 for bio,finance in mapped.items():
  data={'bioguide':bio,'cycle':2026,'source':'Federal Election Commission, all-candidates bulk summary',
    'sourceUrl':'https://www.fec.gov/data/browse-data/','retrievedAt':datetime.now(timezone.utc).strftime('%Y-%m-%d'),
    **finance}
  dest=OUT/f'{bio}.json'
  # Avoid rewriting every single file unless the figures or coverage date changed.
  if dest.exists():
   try:
    old=json.loads(dest.read_text())
    if all(old.get(k)==v for k,v in finance.items()):continue
   except (ValueError,OSError):pass
  dest.write_text(json.dumps(data,separators=(',',':'))+'\n')
  count+=1
 print(f'Validated FEC candidate summary matches: {len(mapped)}, updated: {count}',flush=True)
 return 0

if __name__=='__main__':sys.exit(main())
