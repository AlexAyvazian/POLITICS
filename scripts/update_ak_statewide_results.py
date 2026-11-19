#!/usr/bin/env python3
"""Refresh Alaska statewide election results by State House district.

Alaska's statewide election reporting geography is State House district, not
borough/census-area county equivalents. 2026 Governor and U.S. Senate counts
come from Call the Map's public result API, whose payload identifies the
underlying official/civicAPI count and update timestamp. The 2024 presidential
district winners are certified Alaska results.
"""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/"assets/data/elections/ak-statewide.js"

API_SOURCE={
    "governor":"https://www.callthemap.com/api/results/v1/race/GOV-AK",
    "senate":"https://www.callthemap.com/api/results/v1/race/SEN-AK",
}
PAGE_SOURCE={
    "governor":"https://www.callthemap.com/results/governors/alaska",
    "senate":"https://www.callthemap.com/results/senate/alaska",
}
PRESIDENT_SOURCE="https://www.elections.alaska.gov/results/24GENR/ENRbyPrecinct.csv"
HEADERS={"User-Agent":"POLITICS-Alaska-Atlas/1.0"}

PRESIDENT_DEM={2,3,4,9,12,13,14,16,17,19,20,21,22,35,38,39}
PRESIDENT_MARGINS={
  1:17.4,2:.4,3:14.7,4:37.4,5:12.8,6:16.1,7:44.4,8:49.7,9:2.3,10:3.3,
  11:2.3,12:1.3,13:1.2,14:21.2,15:2.5,16:14.6,17:33.5,18:15.7,19:17.0,20:12.2,
  21:8.0,22:1.2,23:18.6,24:32.1,25:35.6,26:54.3,27:56.2,28:48.5,29:44.9,30:44.7,
  31:3.4,32:31.7,33:51.2,34:20.7,35:5.0,36:21.8,37:6.6,38:11.8,39:11.7,40:9.9,
}

def _party(code):
    return "democratic" if code=="D" else "republican" if code=="R" else "other"

def build_race(payload,title,page_url,data_source_url=None):
    pair=payload.get("pair") or {}
    a,b=pair.get("a"),pair.get("b")
    candidates={str(row.get("name")):str(row.get("party") or "") for row in payload.get("candidates") or []}
    if not a or not b or a not in candidates or b not in candidates:
        raise ValueError("Missing Alaska statewide comparison pair")
    districts={}
    for row in payload.get("units") or []:
        if not isinstance(row,list) or len(row)<4:continue
        code=str(row[0])
        if not code.startswith("029") or len(code)!=5:continue
        try:
            district=int(code[-2:]);av=int(row[1]);bv=int(row[2]);total=int(row[3])
        except (TypeError,ValueError):
            continue
        if not 1<=district<=40:continue
        a_wins=av>bv
        winner=a if a_wins else b
        runner=b if a_wins else a
        winner_votes=av if a_wins else bv
        runner_votes=bv if a_wins else av
        districts[str(district)]={
            "district":district,
            "party":_party(candidates.get(winner)),
            "winner":winner,
            "winnerVotes":winner_votes,
            "winnerPct":round(winner_votes/total*100,1) if total else None,
            "runner":runner,
            "runnerVotes":runner_votes,
            "runnerPct":round(runner_votes/total*100,1) if total else None,
            "totalVotes":total,
        }
    if len(districts)!=40:
        raise ValueError(f"Expected 40 Alaska House districts, got {len(districts)}")
    status="certified" if payload.get("status")=="final" else "unofficial"
    key="governor" if title=="Governor" else "senate"
    return {
        "title":title,
        "electionDate":"2026-11-03",
        "status":status,
        "asOf":payload.get("updated_utc"),
        "geography":"stateHouseDistrict",
        "sourceUrl":page_url,
        "dataSourceUrl":data_source_url or API_SOURCE[key],
        "sourceNote":"Counts compiled from Alaska election-office results; statewide race data via Call the Map / civicAPI.",
        "districts":districts,
    }

def build_president():
    districts={}
    for district in range(1,41):
        dem=district in PRESIDENT_DEM
        districts[str(district)]={
            "district":district,
            "party":"democratic" if dem else "republican",
            "winner":"Kamala D. Harris" if dem else "Donald J. Trump",
            "runner":"Donald J. Trump" if dem else "Kamala D. Harris",
            "marginPts":PRESIDENT_MARGINS[district],
        }
    return {
        "title":"President",
        "electionDate":"2024-11-05",
        "status":"certified",
        "asOf":"2024-11-30",
        "geography":"stateHouseDistrict",
        "sourceUrl":PRESIDENT_SOURCE,
        "dataSourceUrl":PRESIDENT_SOURCE,
        "sourceNote":"Certified Alaska 2024 presidential results by State House district.",
        "districts":districts,
    }

def fetch_json(url):
    req=urllib.request.Request(url,headers=HEADERS)
    with urllib.request.urlopen(req,timeout=60) as response:
        return json.load(response)

def javascript(data):
    body=json.dumps(data,ensure_ascii=False,separators=(",",":"),sort_keys=True)
    return (
        "/* Alaska statewide election geography uses State House districts, not boroughs/census areas. */\n"
        "(function(root){root.AK_STATEWIDE_ELECTION_RESULTS=Object.freeze("+body+
        ");})(typeof window!=='undefined'?window:globalThis);\n"
    )

def publish():
    governor=build_race(fetch_json(API_SOURCE["governor"]),"Governor",PAGE_SOURCE["governor"],API_SOURCE["governor"])
    senate=build_race(fetch_json(API_SOURCE["senate"]),"U.S. Senate",PAGE_SOURCE["senate"],API_SOURCE["senate"])
    data={"governor":governor,"senate":senate,"president":build_president()}
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(javascript(data),encoding="utf-8")
    print("Published Alaska statewide House-district results:",
          "Governor",len(governor["districts"]),"Senate",len(senate["districts"]),
          "Governor as of",governor["asOf"],"Senate as of",senate["asOf"])

if __name__=="__main__":
    publish()
