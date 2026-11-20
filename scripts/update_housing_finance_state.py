#!/usr/bin/env python3
"""Refresh statewide HMDA mortgage outcomes and CFPB mortgage complaint context.

HMDA: 2025 state-level Data Browser aggregation for action 1 (originated) and
action 3 (denied). The displayed denial share uses only those two action codes;
it is not an approval rate for all applications.

CFPB: rolling 24-month published complaint search for the term "mortgage" by
state. Complaint data are allegations submitted by consumers, not adjudicated
findings and not a representative statistical sample of all consumers.
"""
from __future__ import annotations
import concurrent.futures
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

OUTPUT=Path("assets/data/state/housing-finance.json")
HMDA_YEAR=2025
STATES=[
 "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME",
 "MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI",
 "SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
]
UA="POLITICS civic transparency project (+https://politics-e5yt.onrender.com)"

def _json_get(url: str, timeout: int = 60, attempts: int = 3) -> dict:
    last=None
    for attempt in range(attempts):
        try:
            req=urllib.request.Request(url,headers={"Accept":"application/json","User-Agent":UA})
            with urllib.request.urlopen(req,timeout=timeout) as res:
                if res.status!=200:
                    raise RuntimeError(f"HTTP {res.status}")
                return json.load(res)
        except Exception as exc:
            last=exc
            if attempt+1<attempts:
                time.sleep(0.8*(attempt+1))
    raise RuntimeError(f"GET failed for {url}: {last}")

def normalize_hmda(raw: dict) -> dict:
    rows=raw.get("aggregations") if isinstance(raw,dict) else None
    if not isinstance(rows,list):
        raise ValueError("HMDA response missing aggregations")
    by_action={str(r.get("actions_taken")):r for r in rows if isinstance(r,dict)}
    originated=by_action.get("1") or {}
    denied=by_action.get("3") or {}
    oc=int(originated.get("count") or 0)
    dc=int(denied.get("count") or 0)
    total=oc+dc
    return {
        "originatedCount":oc,
        "originatedAmount":round(float(originated.get("sum") or 0),2),
        "deniedCount":dc,
        "deniedAmount":round(float(denied.get("sum") or 0),2),
        "denialShareOriginatedPlusDeniedPct":round((dc/total*100) if total else 0,2),
    }

def _first_bucket(raw: dict, outer: str, inner: str|None=None) -> dict|None:
    node=(raw.get("aggregations") or {}).get(outer) or {}
    if inner:
        node=node.get(inner) or {}
    buckets=node.get("buckets") or []
    return buckets[0] if buckets and isinstance(buckets[0],dict) else None

def normalize_cfpb(raw: dict) -> dict:
    hits=raw.get("hits") or {}
    total=hits.get("total") or {}
    count=int(total.get("value") if isinstance(total,dict) else total or 0)
    issue=_first_bucket(raw,"issue","issue")
    company=_first_bucket(raw,"company","company")
    response=_first_bucket(raw,"company_response","company_response")
    timely=(raw.get("aggregations") or {}).get("timely") or {}
    timely_buckets=(timely.get("timely") or {}).get("buckets") or []
    timely_yes=sum(int(x.get("doc_count") or 0) for x in timely_buckets if x.get("key")=="Yes")
    return {
        "complaintCount":count,
        "topIssue":{"name":str(issue.get("key")),"count":int(issue.get("doc_count") or 0)} if issue else None,
        "topCompany":{"name":str(company.get("key")),"count":int(company.get("doc_count") or 0)} if company else None,
        "timelyResponsePct":round((timely_yes/count*100) if count else 0,2),
        "topCompanyResponse":{"name":str(response.get("key")),"count":int(response.get("doc_count") or 0)} if response else None,
    }

def _hmda_url(state: str) -> str:
    params={"states":state,"years":str(HMDA_YEAR),"actions_taken":"1,3"}
    return "https://ffiec.cfpb.gov/v2/data-browser-api/view/aggregations?"+urllib.parse.urlencode(params)

def _cfpb_url(state: str, start: date, end: date) -> str:
    params={
        "size":"0",
        "sort":"created_date_desc",
        "no_highlight":"true",
        "state":state,
        "search_term":"mortgage",
        "date_received_min":start.isoformat(),
        "date_received_max":end.isoformat(),
    }
    return "https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/?"+urllib.parse.urlencode(params)

def fetch_state(state: str, start: date, end: date) -> tuple[str,dict]:
    hmda=normalize_hmda(_json_get(_hmda_url(state),timeout=75))
    cfpb=normalize_cfpb(_json_get(_cfpb_url(state,start,end),timeout=75))
    return state,{"hmda":hmda,"cfpb":cfpb}

def build_snapshot(rows: dict, today: date) -> dict:
    start=today-timedelta(days=730)
    return {
        "source":"FFIEC HMDA + CFPB Consumer Complaint Database",
        "retrievedAt":today.isoformat(),
        "hmdaYear":HMDA_YEAR,
        "hmdaSourceUrl":"https://ffiec.cfpb.gov/data-browser/",
        "cfpbPeriod":{"start":start.isoformat(),"end":today.isoformat()},
        "cfpbSourceUrl":"https://www.consumerfinance.gov/data-research/consumer-complaints/",
        "scope":"statewide context",
        "coverage":"Statewide housing-finance context; not county-specific. HMDA shows 2025 originated and denied application actions. CFPB shows published mortgage-related complaints matching the search term 'mortgage' received in the latest 24 months. CFPB complaints are allegations, are not a statistical sample, and are not representative of all consumers' experiences.",
        "stateCount":len(rows),
        "states":dict(sorted(rows.items())),
    }

def fetch_all(today: date) -> dict:
    start=today-timedelta(days=730)
    rows={}
    errors=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        futures={pool.submit(fetch_state,state,start,today):state for state in STATES}
        for future in concurrent.futures.as_completed(futures):
            state=futures[future]
            try:
                key,value=future.result()
                rows[key]=value
                print(f"{key}: HMDA {value['hmda']['originatedCount']:,} originated / {value['hmda']['deniedCount']:,} denied; CFPB {value['cfpb']['complaintCount']:,}")
            except Exception as exc:
                errors.append(f"{state}: {exc}")
    if errors:
        raise RuntimeError("Housing finance refresh failed for "+str(len(errors))+" jurisdictions: "+" | ".join(errors[:5]))
    if len(rows)!=len(STATES):
        raise RuntimeError(f"Incomplete housing-finance snapshot ({len(rows)}/{len(STATES)} jurisdictions)")
    return build_snapshot(rows,today)

def main() -> int:
    snapshot=fetch_all(date.today())
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(snapshot,separators=(",",":"),sort_keys=True)+"\n",encoding="utf-8")
    print(f"Wrote {snapshot['stateCount']} states/DC to {OUTPUT}")
    return 0

if __name__=="__main__":
    sys.exit(main())
