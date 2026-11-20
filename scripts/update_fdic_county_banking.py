#!/usr/bin/env python3
"""Refresh current FDIC-insured banking-office presence by county.

Source: FDIC BankFind Suite Locations API. This measures physical office
presence for FDIC-insured institutions. It excludes credit unions, nonbank
lenders, and online-only financial access, and does not measure affordability,
lending approval, service quality, or whether residents use a local branch.
"""
from __future__ import annotations
import concurrent.futures
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

OUTPUT=Path("assets/data/county/fdic-banking-access.json")
BASE="https://banks.data.fdic.gov/api/locations"
STATES="AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split()
USER_AGENT="POLITICS civic transparency project (+https://politics-e5yt.onrender.com)"
FIELDS="STCNTY,CERT,NAME,STALP,COUNTY,SERVTYPE,SERVTYPE_DESC,MAINOFF,RUNDATE"

def _text(v):
    return str(v or "").strip()

def _iso_date(value):
    text=_text(value)
    if not text:
        return None
    for fmt in ("%m/%d/%Y","%Y-%m-%d"):
        try:
            return datetime.strptime(text,fmt).date().isoformat()
        except ValueError:
            pass
    return None

def normalize_location(row: dict):
    raw_fips=_text(row.get("STCNTY"))
    if not raw_fips or not raw_fips.isdigit():
        return None
    fips=raw_fips.zfill(5)
    if len(fips)!=5:
        return None
    cert=_text(row.get("CERT"))
    if not cert:
        return None
    desc=_text(row.get("SERVTYPE_DESC"))
    main=_text(row.get("MAINOFF"))
    return {
        "fips":fips,
        "state":_text(row.get("STALP"))[:2],
        "county":_text(row.get("COUNTY"))[:100],
        "cert":cert[:20],
        "institution":_text(row.get("NAME"))[:160],
        "serviceType":_text(row.get("SERVTYPE"))[:20],
        "serviceTypeDescription":desc[:120],
        "fullServiceBrickMortar":"FULL SERVICE - BRICK AND MORTAR" in desc.upper(),
        "mainOffice":main in {"1","Y","YES","TRUE"},
        "runDate":_iso_date(row.get("RUNDATE")),
    }

def build_snapshot(rows, retrieved_at: str, min_offices: int=70000, min_counties: int=2000):
    groups={}
    newest=None
    office_count=0
    for raw in rows:
        item=normalize_location(raw)
        if not item:
            continue
        office_count+=1
        newest=max(newest or item["runDate"] or "",item["runDate"] or "") or newest
        g=groups.setdefault(item["fips"],{
            "state":item["state"],"county":item["county"],"officeCount":0,
            "institutions":set(),"fullServiceBrickMortar":0,"mainOfficeCount":0
        })
        g["officeCount"]+=1
        g["institutions"].add(item["cert"])
        if item["fullServiceBrickMortar"]: g["fullServiceBrickMortar"]+=1
        if item["mainOffice"]: g["mainOfficeCount"]+=1
    if office_count<min_offices:
        raise ValueError(f"Incomplete FDIC location snapshot ({office_count} offices)")
    if len(groups)<min_counties:
        raise ValueError(f"Incomplete FDIC county coverage ({len(groups)} counties with offices)")
    counties={}
    for fips,g in sorted(groups.items()):
        counties[fips]={
            "state":g["state"],"county":g["county"],"officeCount":g["officeCount"],
            "institutionCount":len(g["institutions"]),
            "fullServiceBrickMortar":g["fullServiceBrickMortar"],
            "mainOfficeCount":g["mainOfficeCount"],
        }
    return {
        "source":"FDIC BankFind Suite",
        "dataset":"Current FDIC-insured institution locations",
        "sourceUrl":"https://banks.data.fdic.gov/bankfind-suite/bankfind",
        "apiUrl":"https://banks.data.fdic.gov/api/locations",
        "retrievedAt":retrieved_at,
        "dataAsOf":newest,
        "officeCount":office_count,
        "countyCount":len(counties),
        "scope":"physical offices of FDIC-insured institutions in the 50 states and District of Columbia",
        "coverage":"Current FDIC BankFind Suite office-location records. Counts represent physical offices of FDIC-insured banks and savings associations. They exclude credit unions, nonbank lenders, fintech/online-only access, ATMs and other financial-service channels.",
        "limitations":"Physical office presence does not measure account affordability, lending approval, lending fairness, service quality, digital access, or whether residents use a local office.",
        "counties":counties,
    }

def get_json(url: str, attempts: int=6):
    last=None
    for attempt in range(attempts):
        try:
            req=urllib.request.Request(url,headers={"Accept":"application/json","User-Agent":USER_AGENT})
            with urllib.request.urlopen(req,timeout=90) as response:
                if response.status!=200: raise RuntimeError(f"HTTP {response.status}")
                return json.load(response)
        except Exception as exc:
            last=exc
            if attempt+1<attempts: time.sleep(1.8*(attempt+1))
    raise RuntimeError(str(last))

def state_filter(state: str) -> str:
    if state not in STATES:
        raise ValueError("Invalid state abbreviation")
    return f'STALP:"{state}"'

def fetch_state(state: str):
    params=urllib.parse.urlencode({
        "filters":state_filter(state),
        "fields":FIELDS,
        "limit":"10000",
        "format":"json",
    })
    body=get_json(BASE+"?"+params)
    data=body.get("data") if isinstance(body,dict) else None
    meta=body.get("meta") if isinstance(body,dict) else None
    if not isinstance(data,list) or not isinstance(meta,dict):
        raise RuntimeError(f"FDIC {state} response missing data/meta")
    total=int(meta.get("total") or 0)
    if total>len(data):
        raise RuntimeError(f"FDIC {state} returned {len(data)} of {total}; pagination required")
    return data,total

def fetch_all():
    rows=[]
    totals={}
    failed=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures={pool.submit(fetch_state,state):state for state in STATES}
        for future in concurrent.futures.as_completed(futures):
            state=futures[future]
            try:
                data,total=future.result()
                rows.extend(data);totals[state]=total
                print(f"{state}: {total:,} FDIC office locations")
            except Exception as exc:
                failed.append((state,str(exc)))
                print(f"{state}: initial FDIC request failed; will retry sequentially: {exc}")
    for state,first_error in failed:
        try:
            data,total=fetch_state(state)
            rows.extend(data);totals[state]=total
            print(f"{state}: {total:,} FDIC office locations (sequential retry)")
        except Exception as exc:
            raise RuntimeError(f"FDIC {state} failed after parallel and sequential retries: {first_error} | {exc}")
    if len(totals)!=len(STATES):
        raise RuntimeError(f"Incomplete FDIC state coverage ({len(totals)}/{len(STATES)})")
    return rows

def main():
    rows=fetch_all()
    now=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00","Z")
    snapshot=build_snapshot(rows,now)
    if OUTPUT.exists():
        try:
            old=json.loads(OUTPUT.read_text(encoding="utf-8"))
            stable=("source","dataset","dataAsOf","officeCount","countyCount","scope","coverage","limitations","counties")
            if all(old.get(k)==snapshot.get(k) for k in stable):
                print(f"FDIC county banking snapshot unchanged: {snapshot['officeCount']:,} offices")
                return 0
        except Exception:
            pass
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(snapshot,separators=(",",":"),sort_keys=True)+"\n",encoding="utf-8")
    print(f"Wrote {snapshot['officeCount']:,} FDIC offices across {snapshot['countyCount']:,} counties")
    return 0

if __name__=="__main__":
    sys.exit(main())
