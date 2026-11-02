#!/usr/bin/env python3
"""Daily cache of official Congress.gov bill titles and nonpartisan summaries.
Never auto-generate an interpretation of a bill's economic effects.
"""
import html, json, os, re, time, urllib.request
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/data/records/measures-119.json'
VOTES=ROOT/'assets/data/records/members'
PATTERN=re.compile(r'^(HR|S|HJRES|SJRES|HCONRES|SCONRES|HRES|SRES)([1-9][0-9]*)$',re.I)
TYPES={'HR':'hr','S':'s','HJRES':'hjres','SJRES':'sjres','HCONRES':'hconres','SCONRES':'sconres','HRES':'hres','SRES':'sres'}
class Stripper(HTMLParser):
 def __init__(self):super().__init__();self.out=[]
 def handle_data(self,d):self.out.append(d)
def plain(text):
 t=Stripper();t.feed(str(text or ''))
 return ' '.join(html.unescape(' '.join(t.out)).split())[:1800]
def extract_votes():
 votes={}
 for path in sorted(VOTES.glob('*.json')):
  try:data=json.loads(path.read_text())
  except (OSError,ValueError):continue
  for row in data.get('votes',[])[:45]:
   raw=re.sub(r'[^A-Za-z0-9]','',str(row.get('measure') or '')).upper()
   match=PATTERN.fullmatch(raw)
   if not match:continue
   weight=1 if row.get('year')==2026 else 0
   votes[raw]=max(votes.get(raw,0),weight)
 return votes
def get(url):
 req=urllib.request.Request(url,headers={'User-Agent':'POLITICS-Civic-Records/1.0','Accept':'application/json'})
 with urllib.request.urlopen(req,timeout=27) as resp:return json.load(resp)
def main():
 prior={}
 if OUT.exists():
  try:prior=json.loads(OUT.read_text())
  except (OSError,ValueError):pass
 if not isinstance(prior,dict):prior={}
 key=os.environ.get('CONGRESS_API_KEY') or 'DEMO_KEY'
 selected=extract_votes()
 if not selected:raise SystemExit('No verified recent bill references')
 # Cache grows gradually; no per-visitor requests and no invented official summaries.
 keys=[k for k,_ in sorted(selected.items(),key=lambda p:(-p[1],p[0])) if k not in prior][:26]
 added=0
 for item in keys:
  match=PATTERN.fullmatch(item);typ,num=match.groups()
  route=f'https://api.congress.gov/v3/bill/119/{TYPES[typ]}/{int(num)}'
  try:
   info=get(route+'?api_key='+key)
   title=plain(info.get('bill',{}).get('title',''))
   summaries=get(route+'/summaries?api_key='+key).get('summaries',[])
   descriptions=[plain(x.get('text','')) for x in summaries if x.get('text')]
   summary=max(descriptions,key=len) if descriptions else ''
   if not title and not summary:continue
   prior[item]={'title':title[:240],'summary':summary,
    'source':'Congress.gov (Congressional Research Service when summary supplied)',
    'url':'https://www.congress.gov/bill/119th-congress/'+
       ('house' if typ.startswith('H') else 'senate')+'-'+
       ('bill' if typ in ('HR','S') else 'joint-resolution' if 'JRES' in typ else 'resolution')+
       '/'+str(int(num))}
   added+=1
  except Exception as err:print(item,'unavailable:',str(err)[:150],flush=True)
  time.sleep(.8)
 if added:
  OUT.parent.mkdir(parents=True,exist_ok=True)
  OUT.write_text(json.dumps(prior,separators=(',',':'),ensure_ascii=False)+'\n')
 print('Verified bill summaries available:',len(prior),'new:',added)
if __name__=='__main__':main()
