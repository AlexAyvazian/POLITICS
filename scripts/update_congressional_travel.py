#!/usr/bin/env python3
"""Import official Senate office-associated travel filings (2025–2026).

The Senate Gift Rule archive identifies *offices* and filers, often employees.
NEVER present an office-associated staff trip as the senator's personal trip.
A travel disclosure is not an expenditure total unless its PDF is itemized.
"""
from __future__ import annotations
import io,json,re,urllib.request,xml.etree.ElementTree as ET,zipfile
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/data/records/travel'
ARCHIVE='https://giftrule-disclosure.senate.gov/media/giftruledownloads/giftruledata.zip'
ROSTER='https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml'
def download(url,limit=8_000_000):
 req=urllib.request.Request(url,headers={'User-Agent':'POLITICS-Civic-Records/1.0 (civic disclosure cache)'})
 with urllib.request.urlopen(req,timeout=70) as resp:raw=resp.read(limit+1)
 if len(raw)>limit:raise ValueError('Archive larger than expected')
 return raw
def safe_doc(url):
 if not isinstance(url,str):return ''
 if not re.fullmatch(r'https://giftrule-disclosure\.senate\.gov/media/[A-Za-z0-9_./-]+\.pdf',url,re.I):
  return ''
 return url
def normalize(s):
 return re.sub(r'[^A-Z0-9]+',' ',str(s or '').upper()).strip()
def parse_office(xml):
 root=ET.fromstring(xml)
 if root.tag!='GiftRule':raise ValueError('Not official Senate GiftRule XML')
 offices={}
 for filer in root.findall('dbo.filer'):
  first=(filer.attrib.get('FirstName') or '').strip()
  last=(filer.attrib.get('LastName') or '').strip()
  for office in filer.findall('dbo.Office'):
   name=normalize(office.attrib.get('OfficeName'))
   if not name:continue
   for doc in office.findall('dbo.Document'):
    year=str(doc.attrib.get('ReportingYear') or '')
    if year not in ('2025','2026'):continue
    reports=doc.findall('dbo.Reports')
    for report in reports:
     title=report.attrib.get('ReportTitle','').strip()
     href=safe_doc(report.attrib.get('DocURL',''))
     if not href:continue
     status='staff' if 'employee' in title.lower() else 'unknown'
     offices.setdefault(name,[]).append({
       'reportedYear':int(year),
       'beginDate':doc.attrib.get('BeginTravelDate','')[:10],
       'endDate':doc.attrib.get('EndTravelDate','')[:10],
       'receivedDate':doc.attrib.get('DateReceived','')[:10],
       'title':title[:140],
       'traveler':(' '.join([first,last])).strip()[:100] or None,
       'travelerType':status,
       'sourceUrl':href,
     })
 return offices
def select_senate_office(legislators,offices):
 alias_candidates={}
 for person in legislators:
  terms=person.get('terms') or []
  if not terms or terms[-1].get('type')!='sen':continue
  bio=(person.get('id') or {}).get('bioguide')
  if not isinstance(bio,str) or not re.fullmatch('[A-Z][0-9]{6}',bio):continue
  n=person.get('name') or {}
  last=normalize(n.get('last'))
  if not last:continue
  first_names={normalize(n.get('first')),normalize(n.get('nickname'))}
  official=normalize(n.get('official_full'))
  if official:first_names.add(official.split()[0])
  for first in first_names:
   if first:alias_candidates.setdefault(normalize(last+' '+first),set()).add(bio)
 mapped={}
 for office,items in offices.items():
  parts=office.split(' ',1)
  if len(parts)!=2:continue
  potential=alias_candidates.get(office)
  if not potential or len(potential)!=1:continue
  bio=next(iter(potential))
  # Preserve individual entries. Avoid asserting traveler identity from office name.
  for row in items:mapped.setdefault(bio,[]).append(row)
 return mapped
def main():
 try:import yaml
 except ImportError:raise SystemExit('PyYAML required')
 raw=download(ARCHIVE)
 with zipfile.ZipFile(io.BytesIO(raw)) as z:
  target=[n for n in z.namelist() if n.lower().endswith('.xml')]
  if len(target)!=1:raise ValueError('Expected single official Senate XML')
  parsed=parse_office(z.read(target[0]))
 if len(parsed)<40:raise ValueError('Official office archive unexpectedly sparse')
 roster=yaml.safe_load(download(ROSTER))
 mapped=select_senate_office(roster,parsed)
 if len(mapped)<25:raise ValueError('Too few exact Senate office matches; refusing partial publish')
 OUT.mkdir(parents=True,exist_ok=True)
 updated=0
 for bio,rows in mapped.items():
  rows.sort(key=lambda x:(x['reportedYear'],x['beginDate']),reverse=True)
  doc={'bioguide':bio,'officeAssociation':'Senate office',
       'source':'U.S. Senate Gift Rule Disclosure System',
       'sourceUrl':'https://giftrule-disclosure.senate.gov/',
       'asOf':datetime.now(timezone.utc).strftime('%Y-%m-%d'),
       'filings':rows}
  target=OUT/f'{bio}.json'
  if target.exists():
   try:
    existing=json.loads(target.read_text())
    if existing.get('filings')==rows:continue
   except (OSError,ValueError):pass
  target.write_text(json.dumps(doc,separators=(',',':'),ensure_ascii=False)+'\n')
  updated+=1
 print('Exact Senate office matches',len(mapped),'new/changed',updated,'total filings',sum(len(v) for v in mapped.values()))
if __name__=='__main__':main()
