#!/usr/bin/env python3
"""Rebuild the stored statewide housing-finance context used by County Atlas.

HMDA: 2025 state-level Data Browser aggregation for action 1 (loan originated)
and action 3 (application denied).

CFPB: rolling 24-month state search for published complaints matching
"mortgage". Complaints are allegations and are not a representative sample.
"""
from __future__ import annotations
import json
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path

OUTPUT=Path("assets/data/state/housing-finance.json")
HMDA_YEAR=2025
STATES="AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split()
USER_AGENT="POLITICS civic transparency project (+https://politics-e5yt.onrender.com)"

def shift_year(d: date, years: int) -> date:
    try:
        return d.replace(year=d.year+years)
    except ValueError:
        return d.replace(month=2,day=28,year=d.year+years)

def cfpb_window(today: date) -> tuple[str,str]:
    return shift_year(today,-2).isoformat(),today.isoformat()

def first_bucket(raw: dict, *path: str):
    node=raw
    for key in path:
        if not isinstance(node,dict):
            return None
        node=node.get(key)
    buckets=node.get("buckets") if isinstance(node,dict) else None
    if not isinstance(buckets,list) or not buckets:
        return None
    row=buckets[0]
    if not isinstance(row,dict):
        return None
    name=row.get("key")
    count=row.get("doc_count")
    if not isinstance(name,str) or not isinstance(count,(int,float)):
        return None
    return {"name":name[:180],"count":int(count)}

def normalize_hmda(raw: dict) -> dict:
    rows=raw.get("aggregations")
    if not isinstance(rows,list):
        raise ValueError("HMDA response missing aggregations")
    by_action={}
    for row in rows:
        if not isinstance(row,dict):
            continue
        action=str(row.get("actions_taken") or "")
        if action not in {"1","3"}:
            continue
        by_action[action]={
            "count":int(row.get("count") or 0),
            "amount":round(float(row.get("sum") or 0),2),
        }
    if "1" not in by_action or "3" not in by_action:
        raise ValueError("HMDA response missing originated or denied rows")
    originated=by_action["1"]["count"]
    denied=by_action["3"]["count"]
    denom=originated+denied
    return {
        "originatedCount":originated,
        "deniedCount":denied,
        "originatedAmount":by_action["1"]["amount"],
        "deniedAmount":by_action["3"]["amount"],
        "denialShareOriginatedPlusDeniedPct":round(denied/denom*100,2) if denom else None,
    }

def normalize_cfpb(raw: dict) -> dict:
    total=(raw.get("hits") or {}).get("total") or {}
    count=total.get("value") if isinstance(total,dict) else total
    if not isinstance(count,(int,float)):
        raise ValueError("CFPB response missing hit count")
    aggs=raw.get("aggregations") or {}
    timely=(aggs.get("timely") or {}).get("timely",{}).get("buckets",[])
    yes=sum(int(x.get("doc_count") or 0) for x in timely if isinstance(x,dict) and x.get("key")=="Yes")
    no=sum(int(x.get("doc_count") or 0) for x in timely if isinstance(x,dict) and x.get("key")=="No")
    denom=yes+no
    return {
        "complaintCount":int(count),
        "topIssue":first_bucket(aggs,"issue","issue"),
        "topCompany":first_bucket(aggs,"company","company"),
        "topCompanyResponse":first_bucket(aggs,"company_response","company_response"),
        "timelyResponsePct":round(yes/denom*100,2) if denom else None,
    }

def get_json(url: str, attempts: int=3) -> dict:
    last=None
    for attempt in range(attempts):
        try:
            req=urllib.request.Request(url,headers={"Accept":"application/json","User-Agent":USER_AGENT})
            with urllib.request.urlopen(req,timeout=75) as response:
                if response.status!=200:
                    raise RuntimeError(f"HTTP {response.status}")
                return json.load(response)
        except Exception as exc:
            last=exc
            if attempt+1<attempts:
                time.sleep(1.0*(attempt+1))
    raise RuntimeError(str(last))

def fetch_hmda(state: str) -> dict:
    params=urllib.parse.urlencode({"states":state,"years":HMDA_YEAR,"actions_taken":"1,3"})
    raw=get_json("https://ffiec.cfpb.gov/v2/data-browser-api/view/aggregations?"+params)
    return normalize_hmda(raw)

def fetch_cfpb(state: str, today: date) -> dict:
    start,end=cfpb_window(today)
    params=urllib.parse.urlencode({
        "size":1,
        "sort":"created_date_desc",
        "no_highlight":"true",
        "state":state,
        "search_term":"mortgage",
        "date_received_min":start,
        "date_received_max":end,
    })
    raw=get_json("https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/?"+params)
    return normalize_cfpb(raw)

def fetch_all(today: date):
    hmda,cfpb={},{}
    def job(kind,state):
        return kind,state,(fetch_hmda(state) if kind=="hmda" else fetch_cfpb(state,today))
    futures=[]
    with ThreadPoolExecutor(max_workers=8) as pool:
        for state in STATES:
            futures.append(pool.submit(job,"hmda",state))
            futures.append(pool.submit(job,"cfpb",state))
        for future in as_completed(futures):
            kind,state,value=future.result()
            (hmda if kind=="hmda" else cfpb)[state]=value
    return hmda,cfpb

def build_snapshot(states,hmda,cfpb,today: date) -> dict:
    missing=[state for state in states if state not in hmda or state not in cfpb]
    if missing:
        raise ValueError("Incomplete housing-finance state coverage: "+",".join(missing))
    start,end=cfpb_window(today)
    return {
        "source":"FFIEC HMDA + CFPB Consumer Complaint Database",
        "retrievedAt":today.isoformat(),
        "stateCount":len(states),
        "hmdaYear":HMDA_YEAR,
        "hmdaSourceUrl":"https://ffiec.cfpb.gov/data-browser/",
        "cfpbPeriod":{"start":start,"end":end},
        "cfpbSourceUrl":"https://www.consumerfinance.gov/data-research/consumer-complaints/",
        "coverage":"Statewide housing-finance context; not county-specific. HMDA shows 2025 originated and denied application actions. CFPB shows published mortgage-related complaints matching the search term 'mortgage' received in the latest 24 months. CFPB complaints are allegations, are not a statistical sample, and are not representative of all consumers' experiences.",
        "states":{state:{"hmda":hmda[state],"cfpb":cfpb[state]} for state in states},
    }

def main() -> int:
    today=date.today()
    hmda,cfpb=fetch_all(today)
    snapshot=build_snapshot(STATES,hmda,cfpb,today)
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(snapshot,separators=(",",":"),sort_keys=True)+"\n",encoding="utf-8")
    print(f"Wrote housing-finance context for {snapshot['stateCount']} states/DC to {OUTPUT}")
    return 0

if __name__=="__main__":
    raise SystemExit(main())
