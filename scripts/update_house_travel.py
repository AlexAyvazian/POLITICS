#!/usr/bin/env python3
"""Cache official House Clerk gift travel XML by current member for 2025/2026.

House files distinguish MemberName (associated office) from FilerName
(document filer). We cannot assume that the member personally traveled.
"""
from __future__ import annotations
import io,json,re,urllib.request,xml.etree.ElementTree as ET,zipfile
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/data/records/travel'
ROSTER='https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml'
def get(url,limit=8_000_000):
 req=urllib.request.Request(url,headers={'User-Agent':'POLITICS Civic Records/1.0'})
 with urllib.request.urlopen(req,timeout=55) as resp:payload=resp.read(limit+1)
 if len(payload)>limit:raise ValueError('Oversized public XML download')
 return payload
def plain(s):return ' '.join(str(s or '').split())[:165]
def norm(s):return re.sub(r'[^A-Z0-9]+',' ',str(s or '').upper()).strip()
def parse_house_xml(xml):
 root=ET.fromstring(xml)
 if root.tag!='GiftTravel':raise ValueError('Expected House Clerk GiftTravel XML')
 result=[]
 for row in root.findall('Travel'):
  d={e.tag:plain(e.text) for e in list(row)}
  if not re.fullmatch('[0-9]{8,12}',d.get('DocID','')):continue
  if d.get('Year') not in ('2025','2026'):continue
  st=d.get('State','')
  if not re.fullmatch('[A-Z]{2}',st):continue
  try:district=int(d['District'])
  except (KeyError,TypeError,ValueError):continue
  member=norm(d.get('MemberName','').replace(',',' '))
  if not member:continue
  result.append({
   'documentId':d['DocID'],'reportedYear':int(d['Year']),
   'memberName':member,'state':st,'district':district,
   'filer':d.get('FilerName') or None,
   'beginDate':d.get('DepartureDate',''),
   'endDate':d.get('ReturnDate',''),
   'destination':d.get('Destination','') or None,
   'sponsor':d.get('TravelSponsor','') or None,
   'filingType':d.get('FilingType','') or None,
   'travelerType':'not-established',
   'source':'U.S. House Clerk Gift Travel Filings'
  })
 return result
def match_house(rows,people):
 index={}
 for person in people:
  terms=person.get('terms') or []
  if not terms or terms[-1].get('type')!='rep':continue
  term=terms[-1]
  state=term.get('state')
  district=term.get('district')
  bio=(person.get('id') or {}).get('bioguide')
  if not isinstance(bio,str) or not re.fullmatch('[A-Z][0-9]{6}',bio):continue
  name=person.get('name') or {}
  last=norm(name.get('last'))
  first={norm(name.get('first')),norm(name.get('nickname'))}
  official=norm(name.get('official_full'))
  if official:first.add(official.split()[0])
  for f in first:
   if not f or not last:continue
   idx=(str(state or '').upper(),int(district or 0),norm(last+' '+f))
   index.setdefault(idx,set()).add(bio)
 result={}
 for row in rows:
  ids=index.get((row['state'],row['district'],row['memberName']),set())
  if len(ids)!=1:continue
  bio=next(iter(ids))
  data={key:value for key,value in row.items() if key not in ('memberName','state','district')}
  result.setdefault(bio,[]).append(data)
 return result
def main():
 try:import yaml
 except ImportError:raise SystemExit('Requires PyYAML')
 people=yaml.safe_load(get(ROSTER))
 rows=[]
 for year in (2025,2026):
  url=f'https://disclosures-clerk.house.gov/public_disc/gift-pdfs/{year}Travel.zip'
  raw=get(url,4_000_000)
  with zipfile.ZipFile(io.BytesIO(raw)) as zip:
   names=[x for x in zip.namelist() if x.lower().endswith('.xml')]
   if len(names)!=1:raise ValueError('Unexpected House archive contents')
   extracted=parse_house_xml(zip.read(names[0]))
   if not extracted:raise ValueError('Missing House XML records for '+str(year))
   print('House archive',year,'rows',len(extracted))
   rows.extend(extracted)
 mapping=match_house(rows,people)
 if len(mapping)<150:raise ValueError('Too few exact current House member matches')
 OUT.mkdir(parents=True,exist_ok=True)
 updated=0
 for bio,filings in mapping.items():
  filings.sort(key=lambda r:(r['reportedYear'],r['beginDate'],r['documentId']),reverse=True)
  record={'bioguide':bio,'officeAssociation':'House member office',
   'source':'U.S. House Clerk Gift Travel Filings',
   'sourceUrl':'https://disclosures-clerk.house.gov/GiftTravelFilings/ViewReport',
   'asOf':datetime.now(timezone.utc).strftime('%Y-%m-%d'),
   'filings':filings}
  path=OUT/f'{bio}.json'
  if path.exists():
   try:
    old=json.loads(path.read_text())
    if old.get('filings')==filings:continue
   except (OSError,ValueError):pass
  path.write_text(json.dumps(record,ensure_ascii=False,separators=(',',':'))+'\n')
  updated+=1
 print('House matched offices',len(mapping),'new/changed',updated,'filings',sum(len(x) for x in mapping.values()))
if __name__=='__main__':main()
