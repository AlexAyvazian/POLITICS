#!/usr/bin/env python3
"""Refresh statewide CMS Medicare Part B rendering-provider activity.

Counts come from the 2024 Medicare Physician & Other Practitioners - by Provider
dataset's filtered stats endpoint. They are published provider-level rows with
Medicare Part B activity, not a count of all licensed clinicians, all enrolled
providers, or providers accepting new patients.
"""
from __future__ import annotations
import json
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path

OUTPUT=Path("assets/data/state/cms-partb-provider-activity.json")
GATEWAY="https://crimson-mud-d254.alxayvazian.workers.dev/api/cms"
# Annual CMS public-use data; the scheduled refresh keeps publication changes visible.
REPORTING_YEAR=2024
DATASET_ID="4d0b2df0-1e99-4db7-a574-a571d99217f1"
STATES="AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split()
USER_AGENT="POLITICS civic transparency project"

def normalize_stats(raw: dict) -> dict:
    if not isinstance(raw,dict) or not raw.get("meta",{}).get("success"):
        raise ValueError("CMS stats response not successful")
    data=raw.get("data") or {}
    found=data.get("found_rows")
    total=data.get("total_rows")
    if not isinstance(found,(int,float)) or not isinstance(total,(int,float)):
        raise ValueError("CMS stats response missing row counts")
    if found<0 or total<found:
        raise ValueError("CMS stats row counts invalid")
    return {"publishedProviderRows":int(found),"nationalDatasetRows":int(total)}

def get_json(url: str, attempts: int=3) -> dict:
    last=None
    for attempt in range(attempts):
        try:
            req=urllib.request.Request(url,headers={"Accept":"application/json","User-Agent":USER_AGENT})
            with urllib.request.urlopen(req,timeout=40) as response:
                if response.status!=200:
                    raise RuntimeError(f"HTTP {response.status}")
                return json.load(response)
        except Exception as exc:
            last=exc
            if attempt+1<attempts:
                time.sleep(1.5*(attempt+1))
    raise RuntimeError(str(last))

def fetch_state(state: str) -> dict:
    params=urllib.parse.urlencode({"record":"physician_stats","state":state,"limit":1})
    wrapped=get_json(GATEWAY+"?"+params)
    raw=wrapped.get("data") if isinstance(wrapped,dict) else None
    if not isinstance(raw,dict):
        raise ValueError("POLITICS CMS gateway returned no data object for "+state)
    return normalize_stats(raw)

def fetch_all() -> dict:
    rows={}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures={pool.submit(fetch_state,state):state for state in STATES}
        for future in as_completed(futures):
            state=futures[future]
            rows[state]=future.result()
    return rows

def build_snapshot(states,rows,today: date) -> dict:
    missing=[s for s in states if s not in rows]
    if missing:
        raise ValueError("Incomplete CMS state coverage: "+",".join(missing))
    totals={rows[s]["nationalDatasetRows"] for s in states}
    if len(totals)!=1:
        raise ValueError("CMS national dataset row totals disagree across state queries")
    return {
        "source":"Centers for Medicare & Medicaid Services",
        "dataset":"Medicare Physician & Other Practitioners - by Provider",
        "datasetId":DATASET_ID,
        "reportingYear":REPORTING_YEAR,
        "publicationDate":"2026-05-21",
        "retrievedAt":today.isoformat(),
        "stateCount":len(states),
        "nationalDatasetRows":next(iter(totals)),
        "sourceUrl":"https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners/medicare-physician-other-practitioners-by-provider",
        "coverage":"Published provider-level rows with Medicare Part B physician/other-practitioner activity in 2024. This is not a count of all licensed clinicians, all Medicare-enrolled providers, providers accepting new patients, or guaranteed access. CMS redacts physician data elements representing fewer than 11 beneficiaries; counts and displayed measures cover the remaining published provider records.",
        "states":rows,
    }

def main() -> int:
    today=date.today()
    rows=fetch_all()
    snapshot=build_snapshot(STATES,rows,today)
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(snapshot,separators=(",",":"),sort_keys=True)+"\n",encoding="utf-8")
    print(f"Wrote CMS Part B provider activity for {snapshot['stateCount']} states to {OUTPUT}")
    return 0

if __name__=="__main__":
    raise SystemExit(main())
