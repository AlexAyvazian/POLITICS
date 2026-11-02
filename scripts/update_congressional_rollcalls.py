#!/usr/bin/env python3
"""Official recorded individual floor votes, cached daily by GitHub Actions.
Read-only public JSON. No request to Congress or API key on visitor clicks.
"""
from __future__ import annotations
import concurrent.futures as futures
from datetime import datetime, timezone
import json
import re
import time
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from pathlib import Path

OUT=Path(__file__).resolve().parents[1]/'assets/data/records'
CHOICES={'Yea','Nay','Present','Not Voting','Aye','No'}
YEARS=(2025,2026)
CAP={2025:45,2026:90}

def house_url(year,roll):
 return f'https://clerk.house.gov/evs/{year}/roll{roll:03d}.xml'
def senate_url(year,roll):
 session=year-2024
 return f'https://www.senate.gov/legislative/LIS/roll_call_votes/vote119{session}/vote_119_{session}_{roll:05d}.xml'
def tag(t):return t.rsplit('}',1)[-1]
def kids(e,t):
 return [x for x in e.iter() if tag(x.tag)==t] if e is not None else []
def child_text(e,t):
 found=kids(e,t)
 return ' '.join((found[0].text or '').split()).strip() if found else ''
def date(raw):
 for fmt in ('%d-%b-%Y','%B %d, %Y','%b %d, %Y'):
  try:return datetime.strptime(raw.strip(),fmt).strftime('%Y-%m-%d')
  except ValueError:pass
 return raw[:60]
def parse_house(body,year,roll,min_members=200):
 try:root=ET.fromstring(body)
 except ET.ParseError as exc:raise ValueError('Invalid House XML') from exc
 if tag(root.tag)!='rollcall-vote':raise ValueError('Not House Clerk data')
 metadata=kids(root,'vote-metadata')
 meta=metadata[0] if metadata else None
 number=child_text(meta,'rollcall-num')
 question=child_text(meta,'vote-question')
 if not number or int(number)!=roll or not question:raise ValueError('House roll number/question mismatch')
 members={}
 for rv in kids(root,'recorded-vote'):
  legislator=kids(rv,'legislator')
  identifier=legislator[0].attrib.get('name-id','') if legislator else ''
  cast=child_text(rv,'vote')
  if re.fullmatch(r'[A-Z][0-9]{6}',identifier) and cast in CHOICES:
   members[identifier]=cast
 if len(members)<min_members:raise ValueError(f'Incomplete House roll: {len(members)} choices')
 return {'year':year,'roll':roll,'date':date(child_text(meta,'action-date')),
  'question':question[:300],'measure':child_text(meta,'legis-num')[:100],
  'result':child_text(meta,'vote-result')[:100],
  'members':members,'url':f'https://clerk.house.gov/Votes/{year}{roll}'}
def parse_senate(body,year,roll,min_members=70):
 try:root=ET.fromstring(body)
 except ET.ParseError as exc:raise ValueError('Invalid Senate XML') from exc
 if tag(root.tag)!='roll_call_vote':raise ValueError('Not Senate roll-call data')
 number=child_text(root,'vote_number');question=child_text(root,'vote_question_text')
 if not number or int(number)!=roll or not question:raise ValueError('Senate roll number/question mismatch')
 members=[]
 for m in kids(root,'member'):
  surname=child_text(m,'last_name');state=child_text(m,'state');cast=child_text(m,'vote_cast')
  if surname and re.fullmatch('[A-Z]{2}',state) and cast in CHOICES:
   members.append({'state':state,'lastName':surname[:65],'cast':cast})
 if len(members)<min_members:raise ValueError(f'Incomplete Senate roll: {len(members)} choices')
 session=year-2024
 return {'year':year,'roll':roll,'date':date(child_text(root,'vote_date')),
  'question':question[:300],'measure':child_text(root,'vote_document_text')[:100],
  'result':child_text(root,'vote_result')[:100],'members':members,
  'url':senate_url(year,roll).replace('.xml','.htm')}
def fetch(url):
 req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (POLITICS Civic Records Daily)','Accept':'application/xml, text/xml, */*'})
 for attempt in range(3):
  try:
   with urllib.request.urlopen(req,timeout=24) as res:
    if res.status!=200:raise ValueError(f'HTTP {res.status}')
    body=res.read(500001)
   if len(body)>500000:raise ValueError('Unexpected large response')
   return body
  except urllib.error.HTTPError as e:
   if e.code==404:return None
   if attempt==2:raise
  except Exception:
   if attempt==2:raise
  time.sleep(attempt+1)
def latest_house(year):
 # Official House roll numbers are sequential.
 low=0;high=1
 while high<2048 and fetch(house_url(year,high)) is not None:
  low=high;high*=2
 while high-low>1:
  middle=(low+high)//2
  if fetch(house_url(year,middle)) is not None:low=middle
  else:high=middle
 return low
def latest_senate(year):
 session=year-2024
 url=f'https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_{session}.xml'
 body=fetch(url)
 if not body:raise ValueError('Senate vote menu missing')
 root=ET.fromstring(body)
 numbers=[int(e.text) for e in kids(root,'vote_number') if e.text and e.text.strip().isdigit()]
 if not numbers:raise ValueError('No official Senate roll numbers')
 return max(numbers)
def existing(chamber):
 path=OUT/f'{chamber}-votes.json'
 try:
  doc=json.loads(path.read_text())
  return {(r['year'],r['roll']):r for r in doc['votes'] if r.get('year') in YEARS}
 except (KeyError,OSError,ValueError):return {}
def save(chamber):
 collected=existing(chamber)
 new=[]
 for year in YEARS:
  try:
   latest=(latest_house if chamber=='house' else latest_senate)(year)
  except Exception as exc:
   print(chamber,year,'discovery error',repr(exc),flush=True)
   continue
  picks=[n for n in range(max(1,latest-CAP[year]+1),latest+1) if (year,n) not in collected]
  url=house_url if chamber=='house' else senate_url
  parse=parse_house if chamber=='house' else parse_senate
  def one(n):
   raw=fetch(url(year,n))
   if raw is None:raise ValueError('Missing official XML')
   return parse(raw,year,n)
  with futures.ThreadPoolExecutor(max_workers=5) as pool:
   fs={pool.submit(one,n):n for n in picks}
   for result in futures.as_completed(fs):
    try:new.append(result.result())
    except Exception as exc:print(chamber,year,'roll',fs[result],'skipped:',str(exc),flush=True)
  print(chamber,year,'latest',latest,'new valid',len([v for v in new if v['year']==year]),flush=True)
 for row in new:collected[row['year'],row['roll']]=row
 if not collected:raise ValueError('No validated official '+chamber+' votes; preserving any existing file')
 if not new:return len(collected)
 votes=sorted(collected.values(),key=lambda r:(r['year'],r['roll']),reverse=True)
 document={'source':'U.S. House Clerk' if chamber=='house' else 'U.S. Senate',
  'sourceUrl':'https://clerk.house.gov/Votes' if chamber=='house' else 'https://www.senate.gov/votes/',
  'congress':119,'chamber':chamber.title(),'retrievedAt':datetime.now(timezone.utc).isoformat(),
  'count':len(votes),'note':'Captured official individual roll calls, not necessarily all votes in the session.',
  'votes':votes}
 OUT.mkdir(parents=True,exist_ok=True)
 target=OUT/f'{chamber}-votes.json'
 temp=target.with_suffix('.pending')
 temp.write_text(json.dumps(document,separators=(',',':'),ensure_ascii=False)+'\n')
 temp.replace(target)
 return len(votes)
if __name__=='__main__':
 succeeded=0
 for chamber in ('house','senate'):
  try:
   print('Cached',chamber,save(chamber),'rolls',flush=True);succeeded+=1
  except Exception as exc:print(chamber,'retained previous snapshot:',repr(exc),flush=True)
 if not succeeded:raise SystemExit(1)
