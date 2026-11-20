#!/usr/bin/env python3
"""Refresh recent county-level federal prime-award obligations from USAspending.gov.

This creates one compact nationwide static snapshot for the County Atlas. The
amounts are federal action obligations by place of performance over the latest
24-month window; they are not resident income, household benefits, or a complete
measure of local economic impact.
"""
from __future__ import annotations
import json
import sys
import urllib.request
from datetime import date
from pathlib import Path

ENDPOINT="https://api.usaspending.gov/api/v2/search/spending_by_geography/"
OUTPUT=Path("assets/data/county/usaspending.json")
AWARD_TYPE_CODES=[
    "02","03","04","05","06","07","08","09","10","11",
    "A","B","C","D","IDV_A","IDV_B","IDV_B_A","IDV_B_B","IDV_B_C",
    "IDV_C","IDV_D","IDV_E"
]

def shift_year(d: date, years: int) -> date:
    try:
        return d.replace(year=d.year+years)
    except ValueError:
        return d.replace(month=2,day=28,year=d.year+years)

def build_request(today: date) -> dict:
    start=shift_year(today,-2).isoformat()
    end=today.isoformat()
    return {
        "scope":"place_of_performance",
        "geo_layer":"county",
        "spending_type":"obligation",
        "filters":{
            "time_period":[{"start_date":start,"end_date":end}],
            "award_type_codes":AWARD_TYPE_CODES,
        },
    }

def normalize_response(raw: dict, today: date, min_count: int = 2500) -> dict:
    if raw.get("geo_layer")!="county" or not isinstance(raw.get("results"),list):
        raise ValueError("USAspending response is not a county geography result")
    counties={}
    states={}
    for row in raw["results"]:
        fips=str(row.get("shape_code") or "")
        if len(fips)!=5 or not fips.isdigit():
            continue
        try:
            amount=float(row.get("aggregated_amount") or 0)
        except (TypeError,ValueError):
            continue
        if not (amount==amount):
            continue
        amount=round(amount,2)
        counties[fips]={
            "name":str(row.get("display_name") or "")[:120],
            "obligations":amount,
        }
        state=fips[:2]
        agg=states.setdefault(state,{"obligations":0.0,"countyCount":0})
        agg["obligations"]=round(agg["obligations"]+amount,2)
        agg["countyCount"]+=1
    if len(counties)<min_count:
        raise ValueError(f"Incomplete USAspending county dataset ({len(counties)} counties)")
    req=build_request(today)
    period=req["filters"]["time_period"][0]
    return {
        "source":"USAspending.gov",
        "sourceUrl":"https://www.usaspending.gov/",
        "apiUrl":"https://api.usaspending.gov/api/v2/search/spending_by_geography/",
        "retrievedAt":today.isoformat(),
        "period":{"start":period["start_date"],"end":period["end_date"]},
        "scope":"place_of_performance",
        "measure":"Federal prime award obligations",
        "coverage":"Prime-award obligations by county place of performance over the latest 24 months. Obligations are federal commitments, not household income, resident benefits, outlays, or economic impact.",
        "count":len(counties),
        "counties":counties,
        "states":states,
    }

def fetch(today: date) -> dict:
    payload=json.dumps(build_request(today)).encode("utf-8")
    req=urllib.request.Request(
        ENDPOINT,data=payload,method="POST",
        headers={"Accept":"application/json","Content-Type":"application/json","User-Agent":"POLITICS civic transparency project"},
    )
    with urllib.request.urlopen(req,timeout=120) as response:
        if response.status!=200:
            raise RuntimeError(f"USAspending HTTP {response.status}")
        raw=json.load(response)
    return normalize_response(raw,today)

def main() -> int:
    today=date.today()
    data=fetch(today)
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(data,separators=(",",":"),sort_keys=True)+"\n",encoding="utf-8")
    print(f"Wrote {data['count']} counties to {OUTPUT}")
    return 0

if __name__=="__main__":
    sys.exit(main())
