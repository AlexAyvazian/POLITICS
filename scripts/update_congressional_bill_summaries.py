#!/usr/bin/env python3
"""Cache real CRS explanations from GovInfo's keyless 119th Congress BILLSUM XML.

The site reads one daily cached JSON; individual visitors never query GovInfo.
No vote is assigned a budget or household outcome without cited measurements.
"""
from __future__ import annotations
from collections import Counter
from concurrent.futures import ThreadPoolExecutor,as_completed
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
import json,re,urllib.request,xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
VOTES=ROOT/'assets/data/records/members'
OUT=ROOT/'assets/data/records/measures-119.json'
BILL=re.compile(r'^(HR|S|HJRES|SJRES|HCONRES|SCONRES|HRES|SRES)([1-9][0-9]*)$',re.I)
BILL_PREFIX={'HR':'hr','S':'s','HJRES':'hjres','SJRES':'sjres','HCONRES':'hconres','SCONRES':'sconres','HRES':'hres','SRES':'sres'}
MAX_FETCH=100

class TextReader(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.words=[]
 def handle_data(self,data):
  if data and data.strip():self.words.append(data.strip())

def plain_text(text):
 read=TextReader()
 read.feed(unescape(str(text or '')))
 return ' '.join(' '.join(read.words).split())

def govinfo_url(measure):
 match=BILL.fullmatch(str(measure or '').upper())
 if not match:return None
 typ,num=match.groups()
 return f'https://www.govinfo.gov/bulkdata/BILLSUM/119/{BILL_PREFIX[typ]}/BILLSUM-119{BILL_PREFIX[typ]}{int(num)}.xml'

def parse_summary(body,measure):
 try:root=ET.fromstring(body)
 except ET.ParseError:return None
 if root.tag!='BillSummaries':return None
 item=root.find('item')
 if item is None:return None
 title=plain_text(item.findtext('title',''))[:250]
 records=[]
 for summary in item.findall('summary'):
  text=plain_text(summary.findtext('summary-text',''))
  if len(text)<30:continue
  records.append({
   'summary':text[:5500],
   'summaryDate':str(summary.findtext('action-date',''))[:20],
   'summaryStage':plain_text(summary.findtext('action-desc',''))[:110]
  })
 if not records:return None
 # Official XML orders newest first, but always compare dates explicitly.
 item=max(records,key=lambda row:row['summaryDate'])
 return {**item,'title':title,'source':'Congressional Research Service via GovInfo',
  'url':govinfo_url(measure)}

def candidates():
 positions={}
 for path in VOTES.glob('*.json'):
  try:rows=json.loads(path.read_text()).get('votes',[])[:90]
  except (OSError,ValueError):continue
  for row in rows:
   key=re.sub('[^A-Za-z0-9]','',str(row.get('measure') or '')).upper()
   if not BILL.fullmatch(key):continue
   date=str(row.get('date') or '')
   if key not in positions:positions[key]=[date,0]
   positions[key][0]=max(date,positions[key][0])
   positions[key][1]+=1
 return [k for k,_ in sorted(positions.items(),key=lambda x:(x[1][0],x[1][1]),reverse=True)]

def fetch_one(measure):
 url=govinfo_url(measure)
 if not url:return None
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'POLITICS Civic Records (noncommercial daily bulk civic cache)'})
  with urllib.request.urlopen(req,timeout=22) as resp:
   body=resp.read(1_500_001)
  if len(body)>1_500_000:return None
  return parse_summary(body,measure)
 except Exception as exc:
  print(measure,'not available',str(exc)[:90],flush=True)
  return None

def main():
 try:prior=json.loads(OUT.read_text())
 except (OSError,ValueError):prior={}
 if not isinstance(prior,dict):prior={}
 selected=candidates()
 if not selected:raise ValueError('No captured legislative measures; retaining current summary cache')
 pending=[key for key in selected if key not in prior or prior[key].get('source')!='Congressional Research Service via GovInfo'][:MAX_FETCH]
 print('Identified measures',len(selected),'GovInfo fetch queue',len(pending),flush=True)
 updated=0
 with ThreadPoolExecutor(max_workers=4) as pool:
  jobs={pool.submit(fetch_one,key):key for key in pending}
  for future in as_completed(jobs):
   key=jobs[future]
   try:result=future.result()
   except Exception as exc:
    print(key,'skipped',repr(exc),flush=True);continue
   if result:
    prior[key]=result
    updated+=1
 if updated:
  OUT.parent.mkdir(parents=True,exist_ok=True)
  OUT.write_text(json.dumps(prior,ensure_ascii=False,separators=(',',':'))+'\n')
 print('Official bill explanations in cache',len(prior),'added this run',updated,flush=True)

if __name__=='__main__':main()
