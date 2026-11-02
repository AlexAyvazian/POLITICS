#!/usr/bin/env python3
"""Daily source-check of congressional vacancies and California AD03.

Official current-vacancy registry: U.S. House Clerk. State Assembly district
status: California State Assembly. Produces a short-lived public JavaScript
snapshot; it never requests an API key on website visits.
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen
import json
import re

BASE=Path(__file__).resolve().parents[1]
OUTPUT=BASE/'assets'/'js'/'verified-vacancies.js'
CLERK='https://clerk.house.gov/Members/ViewVacancies'
ASSEMBLY='https://www.assembly.ca.gov/assemblymembers/03'
STATE_NAMES=dict(zip(
 ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas',
  'Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota',
  'Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey',
  'New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon',
  'Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas',
  'Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'],
 ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV',
  'WI','WY']
))

class TextOnly(HTMLParser):
 def __init__(self):
  super().__init__();self.items=[];self.ignore=0
 def handle_starttag(self,tag,attrs):
  if tag in ('script','style'):self.ignore+=1
 def handle_endtag(self,tag):
  if tag in ('script','style') and self.ignore:self.ignore-=1
 def handle_data(self,s):
  if not self.ignore and s.strip():self.items.append(s)
 def text(self):return re.sub(r'\s+',' ',' '.join(self.items)).strip()

def html_text(html):
 p=TextOnly();p.feed(html);return unescape(p.text())

def parse_current_house(html):
 text=html_text(html)
 if 'Vacancies of the 119th Congress' not in text or 'Session 2' not in text:
  raise ValueError('House Clerk current 119th Congress vacancy list heading not found')
 pattern=re.compile(r'(?<![A-Za-z])('+ '|'.join(re.escape(s) for s in sorted(STATE_NAMES,key=len,reverse=True))
                    +r')\s*[–—-]\s*(\d{1,2})(?:st|nd|rd|th)\s+District',re.I)
 matches=list(pattern.finditer(text))
 if len(matches)<3:raise ValueError('House Clerk district section parser did not find expected entries')
 results=[]
 for i,match in enumerate(matches):
  segment=text[match.end():matches[i+1].start() if i+1<len(matches) else len(text)]
  # Only vacancies without a successor sworn in. An old vacancy page is
  # NOT evidence that an office remains vacant after a special election.
  if 'Special Election' not in segment or re.search(r'\bSucceeded\b|Oath of Office',segment,re.I):
   continue
  state=STATE_NAMES[match.group(1).title()]
  district=match.group(2).zfill(2)
  member=re.search(r'\bRep\.\s+([^\n]+?)(?=\s+(?:Special Election|Date TBD|Florida Secretary|Texas Secretary))',segment)
  previous=member.group(1).strip() if member else None
  results.append({
   'layer':'house','state':state,'district':district,'status':'vacant',
   'title':f'{match.group(1)} Congressional District {int(district)} — vacant',
   'detail':f'The U.S. House Clerk lists this congressional seat as vacant.'+
       (f' Previously held by {previous}.' if previous else ''),
   'sourceName':'U.S. House Clerk',
   'sourceUrl':CLERK
  })
 return results

def parse_ca_assembly(html):
 text=html_text(html)
 if not re.search(r'District\s*:\s*0?3\b',text,re.I):
  raise ValueError('CA Assembly District 03 not confirmed on official district page')
 if re.search(r'Member\s+Vacant\b',text,re.I) and re.search(r'Party\s*:\s*Vacant\b',text,re.I):
  return {
   'layer':'stateHouse','state':'CA','district':'003','status':'vacant',
   'title':'California Assembly District 3 — vacant',
   'detail':'The California State Assembly lists Assembly District 3 as vacant.',
   'sourceName':'California State Assembly','sourceUrl':ASSEMBLY
  }
 # A non-vacant explicit party is evidence that this district needs its
 # incumbent roster rather than an obsolete vacancy flag.
 if re.search(r'Party\s*:\s*(?:Republican|Democrat(?:ic)?|Independent)\b',text,re.I):
  return None
 raise ValueError('California Assembly status could not be verified')

def fetch(url):
 request=Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; POLITICS-Atlas-Verified-Vacancy-Check/1.0)',
                              'Accept':'text/html'})
 with urlopen(request,timeout=35) as response:
  return response.read(2_000_000).decode('utf-8','replace')

def main():
 federal=parse_current_house(fetch(CLERK))
 ca=parse_ca_assembly(fetch(ASSEMBLY))
 rows=sorted(federal+([ca] if ca else []),key=lambda v:(v['layer'],v['state'],v['district']))
 if len(rows)!=len({(r['layer'],r['state'],r['district']) for r in rows}):
  raise ValueError('Duplicate verified vacancy records')
 today=datetime.now(timezone.utc).date()
 snapshot={'asOf':today.isoformat(),'reviewBy':(today+timedelta(days=7)).isoformat(),'records':rows}
 body=('/* Government-source-checked vacancy status snapshot. Never assume an '
       'unmatched roster is vacant. */\n'
       '(function(root){root.POLITICS_VERIFIED_VACANCIES=Object.freeze('+
       json.dumps(snapshot,ensure_ascii=False,separators=(',',':'))+
       ');})(typeof window!=="undefined"?window:globalThis);\n')
 if not OUTPUT.exists() or OUTPUT.read_text('utf-8')!=body:
  OUTPUT.write_text(body,'utf-8')
 print('Verified active U.S. House vacancies:',len(federal),'CA Assembly 03 vacant:',bool(ca),
       'source date:',snapshot['asOf'])
 return 0

if __name__=='__main__':
 raise SystemExit(main())
