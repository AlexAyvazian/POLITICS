#!/usr/bin/env python3
"""Refresh California 2026 Governor county results from the official SOS media feed.

This updater only publishes when all 58 counties are present. President and
U.S. Senate use separate certified 2024 Statement-of-Vote county winners.
"""
from __future__ import annotations

import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'assets/data/elections/ca-governor-2026.js'
COUNTIES_URL='https://media.sos.ca.gov/media/S26GG.txt'
RESULTS_URL='https://media.sos.ca.gov/media/V26GG.txt'
CONTEST='020000000000'
DEM_ID='3654'
REP_ID='3631'
DEM_NAME='Xavier Becerra'
REP_NAME='Steve Hilton'
HEADERS={'User-Agent':'POLITICS-CA-Election-Map/1.0 (public election results)'}

def rows(text):
    for raw in str(text or '').splitlines():
        raw=raw.strip()
        if raw.startswith('[') and raw.endswith(']'):
            yield raw[1:-1].split('|')

def parse_counties(text):
    result={}
    for row in rows(text):
        if len(row)<5 or row[0]!='S':continue
        try:code=int(row[3])
        except ValueError:continue
        if not 1<=code<=58:continue
        fips='06'+str(code*2-1).zfill(3)
        name=row[4].strip()
        if name:result[code]=(fips,name)
    return result

def header_timestamp(text):
    for row in rows(text):
        if len(row)>=5 and row[0]=='B' and re.fullmatch(r'20\d{6}',row[3]):
            time=re.sub(r'\D','',row[4])[:6].ljust(6,'0')
            try:
                dt=datetime.strptime(row[3]+time,'%Y%m%d%H%M%S').replace(tzinfo=timezone.utc)
                return dt.isoformat(timespec='seconds').replace('+00:00','Z')
            except ValueError:
                pass
    return None

def parse_governor_results(text,counties):
    data={}
    for row in rows(text):
        if len(row)<16 or row[0]!='V' or row[3]!=CONTEST:continue
        try:county_code=int(row[4])
        except ValueError:continue
        if county_code not in counties:continue
        if row[8]!=DEM_ID or row[12]!=REP_ID:continue
        try:
            dem_votes=int(row[9]);dem_pct=float(row[11])
            rep_votes=int(row[13]);rep_pct=float(row[15])
        except ValueError:
            continue
        fips,name=counties[county_code]
        democratic=dem_votes>rep_votes
        data[fips]={
            'name':name,
            'party':'democratic' if democratic else 'republican',
            'winner':DEM_NAME if democratic else REP_NAME,
            'demName':DEM_NAME,'demVotes':dem_votes,'demPct':dem_pct,
            'repName':REP_NAME,'repVotes':rep_votes,'repPct':rep_pct
        }
    return {
        'title':'Governor',
        'electionDate':'2026-11-03',
        'status':'unofficial',
        'asOf':header_timestamp(text),
        'sourceUrl':'https://media.sos.ca.gov/',
        'statewideParty':'democratic',
        'counties':data
    }

def fetch(url):
    request=urllib.request.Request(url,headers=HEADERS)
    with urllib.request.urlopen(request,timeout=60) as response:
        raw=response.read(8_000_000)
    return raw.decode('utf-8-sig','replace')

def javascript(record):
    payload=json.dumps(record,ensure_ascii=False,separators=(',',':'))
    return (
        '/* Generated from California Secretary of State S26GG/V26GG media files. */\n'
        '(function(root){root.CA_GOVERNOR_2026_RESULTS=Object.freeze('+
        payload+');})(typeof window!==\'undefined\'?window:globalThis);\n'
    )

def publish():
    counties=parse_counties(fetch(COUNTIES_URL))
    if len(counties)!=58:
        raise ValueError(f'Expected 58 California counties, got {len(counties)}')
    record=parse_governor_results(fetch(RESULTS_URL),counties)
    if len(record['counties'])!=58:
        raise ValueError(f'Expected 58 Governor county results, got {len(record["counties"])}')
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(javascript(record))
    print('Published California Governor county results:',len(record['counties']),'as of',record['asOf'])

if __name__=='__main__':
    publish()
