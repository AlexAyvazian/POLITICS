#!/usr/bin/env python3
"""Cached member-by-member roll calls from Voteview (UCLA), 119th Congress.

Voteview is a curated transcription of Congressional roll calls, and includes
Bioguide identifiers and original Clerk vote numbers. Each website visitor
downloads one small JSON per chosen member, never the full chamber archive
or live upstream sources. The weekly Voteview release is checked daily.
"""
from __future__ import annotations
import csv
from datetime import datetime, timezone
import io
import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets'/'data'/'records'
BASE='https://voteview.com/static/data/out'
CAST={1:'Yea',2:'Paired Yea',3:'Announced Yea',4:'Announced Nay',
      5:'Paired Nay',6:'Nay',7:'Present',8:'Present',9:'Not Voting'}

def csv_url(chamber,kind):
 short={'House':'H','Senate':'S'}[chamber]
 return f'{BASE}/{kind}/{short}119_{kind}.csv'

def fetch_csv(url):
 request=Request(url,headers={
  'User-Agent':'POLITICS-Civic-Records/1.0 (scheduled public university data collection)',
  'Accept':'text/csv,*/*'})
 with urlopen(request,timeout=65) as response:
  content=response.read(16_000_001)
 if len(content)>16_000_000:raise ValueError('Unexpectedly large 119th Congress CSV')
 return io.StringIO(content.decode('utf-8-sig'))

def parse_members(handle):
 reader=csv.DictReader(handle)
 if not {'icpsr','bioguide_id','congress','chamber'}.issubset(reader.fieldnames or []):
  raise ValueError('Invalid Voteview member fields')
 members={}
 for row in reader:
  code=str(row.get('bioguide_id') or '').strip()
  if row.get('congress')!='119' or row.get('chamber') not in ('House','Senate'):
   continue
  if len(code)==7 and code[0].isalpha() and code[1:].isdigit():
   members[int(row['icpsr'])]=code
 return members

def parse_rollcalls(handle,chamber):
 reader=csv.DictReader(handle)
 needed={'rollnumber','date','session','clerk_rollnumber','vote_question','vote_desc','vote_result','bill_number'}
 if not needed.issubset(reader.fieldnames or []):raise ValueError('Invalid Voteview roll-call fields')
 calls={}
 for row in reader:
  if row.get('congress')!='119' or row.get('chamber')!=chamber:
   continue
  try:
   n=int(row['rollnumber']);session=int(row['session']);roll=int(row['clerk_rollnumber'])
   date=row['date']
   if session not in (1,2) or not date or roll<=0:continue
   year=int(date[:4])
   if year not in (2025,2026):continue
  except (KeyError,TypeError,ValueError):continue
  if chamber=='House':url=f'https://clerk.house.gov/Votes/{year}{roll}'
  else:url=(f'https://www.senate.gov/legislative/LIS/roll_call_votes/'
            f'vote119{session}/vote_119_{session}_{roll:05d}.htm')
  calls[n]={
   'year':year,'roll':roll,'voteviewRoll':n,'date':date,
   'measure':str(row.get('bill_number') or '').strip()[:110],
   'question':(str(row.get('vote_question') or '').strip() or str(row.get('vote_desc') or '').strip())[:350],
   'result':str(row.get('vote_result') or '').strip()[:120],
   'url':url}
 return calls

def parse_votes(handle,chamber):
 reader=csv.DictReader(handle)
 if not {'rollnumber','icpsr','cast_code','chamber','congress'}.issubset(reader.fieldnames or []):
  raise ValueError('Invalid Voteview member votes schema')
 votes=[]
 for row in reader:
  if row.get('congress')!='119' or row.get('chamber')!=chamber:continue
  try:
   roll=int(row['rollnumber']);person=int(row['icpsr']);cast=int(row['cast_code'])
  except (KeyError,TypeError,ValueError):continue
  if cast in CAST:votes.append((roll,person,cast))
 return votes

def assemble(members,rolls,votes,chamber):
 profiles={}
 for number,member,cast in votes:
  bid=members.get(member)
  entry=rolls.get(number)
  if not bid or not entry:continue
  profiles.setdefault(bid,[]).append({**entry,'cast':CAST[cast]})
 for choices in profiles.values():
  choices.sort(key=lambda v:(v['date'],v['roll']),reverse=True)
 return profiles

def write_if_changed(path,data):
 path.parent.mkdir(parents=True,exist_ok=True)
 body=json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n'
 if path.exists() and path.read_text('utf-8')==body:return False
 temporary=path.with_suffix('.json.pending')
 temporary.write_text(body,'utf-8')
 temporary.replace(path)
 return True

def collect(chamber):
 members=parse_members(fetch_csv(csv_url(chamber,'members')))
 rolls=parse_rollcalls(fetch_csv(csv_url(chamber,'rollcalls')),chamber)
 votes=parse_votes(fetch_csv(csv_url(chamber,'votes')),chamber)
 if len(members)<(90 if chamber=='Senate' else 400):
  raise ValueError(chamber+' Voteview member crosswalk suspiciously small')
 if len(rolls)<250 or len(votes)<25000:
  raise ValueError(chamber+' Voteview 119th Congress vote feed suspiciously incomplete')
 profiles=assemble(members,rolls,votes,chamber)
 if len(profiles)<(90 if chamber=='Senate' else 400):
  raise ValueError(chamber+' member-vote associations are too sparse')
 as_of=max(r['date'] for r in rolls.values())
 if as_of<'2026-08-01':
  raise ValueError(chamber+' current 119th Congress snapshot unexpectedly stale')
 changed=0
 for bid,records in profiles.items():
  if write_if_changed(OUT/'members'/f'{bid}.json',{
   'bioguide':bid,'chamber':chamber,'congress':119,'asOf':as_of,
   'source':'Voteview Congressional Roll-Call Votes (UCLA)',
   'sourceUrl':'https://voteview.com/articles/data_help_votes',
   'count':len(records),'votes':records
  }):changed+=1
 print(chamber,'rolls',len(rolls),'members',len(profiles),'individual votes',len(votes),
       'files changed',changed,'data through',as_of,flush=True)
 return len(profiles)

def main():
 total=0;successful=[]
 for chamber in ('House','Senate'):
  try:
   total+=collect(chamber)
   successful.append(chamber)
  except Exception as exc:
   print(chamber,'data import blocked; retaining prior snapshot:',repr(exc),flush=True)
 if not successful:return 1
 print('Verified member snapshots',total,flush=True)
 return 0
if __name__=='__main__':raise SystemExit(main())
