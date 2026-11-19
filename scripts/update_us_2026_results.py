#!/usr/bin/env python3
"""Refresh nationwide 2026 federal and governor election results.

The public Call the Map download republishes counts from state election offices
(and civicAPI for some states) under CC BY 4.0. This collector stores only the
fields the Congressional Atlas needs. It never treats a lead as a certified win.
"""
from __future__ import annotations

import json
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/"assets/data/elections/us-2026.js"
RACES_URL="https://www.callthemap.com/results/data/2026/races.json"
COUNTIES_URL="https://www.callthemap.com/results/data/2026/counties.json"
PAGE_URL="https://www.callthemap.com/results"
HEADERS={"User-Agent":"POLITICS-2026-Election-Atlas/1.0","Accept":"application/json"}


def rows(payload):
    names=[c.get("name") for c in payload.get("columns") or []]
    if not names or any(not n for n in names):
        raise ValueError("Missing result columns")
    return [dict(zip(names,row)) for row in payload.get("rows") or []]


def party(code):
    value=str(code or "").upper()
    if value=="D": return "democratic"
    if value=="R": return "republican"
    if value in {"I","L","G","O"}: return "other"
    return "unknown"


def normalize_status(value):
    return "certified" if value=="final" else "unofficial" if value in {"called","counting"} else "pending"


def district_code(race_id,state):
    suffix=str(race_id).split("-",1)[1] if "-" in str(race_id) else ""
    if suffix=="AL":
        return "98" if state=="DC" else "00"
    try:
        return f"{int(suffix):02d}"
    except ValueError:
        return suffix


def summarize(group):
    ordered=sorted(group,key=lambda r:(int(r.get("votes") or 0),float(r.get("share_pct") or 0)),reverse=True)
    selected=next((r for r in group if r.get("outcome")=="won"),None)
    selected=selected or next((r for r in group if r.get("outcome")=="leads"),None)
    selected=selected or (ordered[0] if ordered else None)
    if not selected:
        return None
    runner=next((r for r in ordered if r is not selected),None)
    raw_status=str(selected.get("status") or "")
    raw_outcome=str(selected.get("outcome") or "")
    result_state="won" if raw_outcome=="won" else "leads" if raw_outcome=="leads" else "unresolved"
    return {
        "title":selected.get("title"),
        "status":normalize_status(raw_status),
        "rawStatus":raw_status,
        "outcome":raw_outcome or result_state,
        "resultState":result_state,
        "winner":selected.get("candidate"),
        "party":party(selected.get("party")) if result_state!="unresolved" else "unknown",
        "winnerPct":float(selected.get("share_pct")) if selected.get("share_pct") is not None else None,
        "winnerVotes":int(selected.get("votes") or 0),
        "runner":runner.get("candidate") if runner else None,
        "runnerParty":party(runner.get("party")) if runner else None,
        "runnerPct":float(runner.get("share_pct")) if runner and runner.get("share_pct") is not None else None,
        "totalVotes":int(selected.get("total_votes") or 0),
        "calledAt":selected.get("called_utc") or None,
        "countUpdatedAt":selected.get("count_updated_utc") or None,
        "sourceName":selected.get("source") or None,
        "sourceUrl":selected.get("source_url") or None,
        "pageUrl":selected.get("page_url") or None,
    }


def county_result(row):
    av=int(row.get("votes_a") or 0); bv=int(row.get("votes_b") or 0)
    other=int(row.get("votes_other") or 0); total=int(row.get("total_votes") or 0)
    if other>max(av,bv):
        return {
            "name":str(row.get("place") or "").replace(" County","").replace(" Parish",""),
            "party":"unknown","winner":"Other / write-in","winnerPct":round(other/total*100,1) if total else None,
            "totalVotes":total,"finished":row.get("finished") or None
        }
    a_wins=av>=bv
    winner=row.get("candidate_a") if a_wins else row.get("candidate_b")
    runner=row.get("candidate_b") if a_wins else row.get("candidate_a")
    winner_votes=av if a_wins else bv; runner_votes=bv if a_wins else av
    return {
        "name":str(row.get("place") or "").replace(" County","").replace(" Parish",""),
        "party":party(row.get("party_a") if a_wins else row.get("party_b")),
        "winner":winner,"winnerPct":round(winner_votes/total*100,1) if total else None,
        "runner":runner,"runnerPct":round(runner_votes/total*100,1) if total else None,
        "totalVotes":total,"finished":row.get("finished") or None
    }


def build_dataset(races_payload,counties_payload,strict=True):
    race_rows=rows(races_payload)
    grouped=defaultdict(list)
    for row in race_rows:
        if row.get("office") in {"House","Senate","Governor"}:
            grouped[row.get("race_id")].append(row)

    data={"house":{},"senate":{},"governor":{},
          "electionDate":"2026-11-03",
          "updatedAt":races_payload.get("last_updated_utc"),
          "sourceReadAt":races_payload.get("source_read_utc"),
          "source":"Call the Map 2026 open election results",
          "sourceUrl":PAGE_URL,
          "credit":"Call the Map (callthemap.com/results); counts in part from civicAPI (civicapi.org), compiled from state and county election offices"}

    race_index={}
    for race_id,group in grouped.items():
        result=summarize(group)
        if not result: continue
        state=str(group[0].get("state") or "")
        office=str(group[0].get("office") or "")
        result["electionDate"]="2026-11-03"
        if office=="House":
            code=district_code(race_id,state)
            data["house"].setdefault(state,{})[code]=result
        elif office=="Senate":
            data["senate"][state]=result; race_index[race_id]=result
        elif office=="Governor":
            data["governor"][state]=result; race_index[race_id]=result

    for row in rows(counties_payload):
        race_id=row.get("race_id")
        result=race_index.get(race_id)
        if not result: continue
        state=str(row.get("state") or "")
        place_kind=str(row.get("place_kind") or "").lower()
        fips=str(row.get("fips") or "")
        parsed=county_result(row)
        if state=="AK" and "house district" in place_kind:
            key=str(int(fips[-2:])) if fips[-2:].isdigit() else fips
            result.setdefault("districts",{})[key]=parsed
            result["geography"]="stateHouseDistrict"
        elif place_kind in {"county","parish"}:
            result.setdefault("counties",{})[fips]=parsed
            result.setdefault("geography","county")
        elif state=="CT" and "planning region" in place_kind:
            # The bundled national county topology uses historical Connecticut
            # counties, so do not falsely join planning-region results to it.
            result["geography"]="planningRegion"

    if strict:
        house_count=sum(len(v) for v in data["house"].values())
        if house_count<430:
            raise ValueError(f"Incomplete House result file: {house_count} races")
        if len(data["senate"])<30:
            raise ValueError(f"Incomplete Senate result file: {len(data['senate'])} states")
        if len(data["governor"])<30:
            raise ValueError(f"Incomplete governor result file: {len(data['governor'])} states")
    return data


def fetch_json(url):
    req=urllib.request.Request(url,headers=HEADERS)
    with urllib.request.urlopen(req,timeout=90) as response:
        return json.load(response)


def javascript(data):
    return (
        "/* Nationwide 2026 election results. CC BY 4.0; credit Call the Map and civicAPI where applicable. */\n"
        "(function(root){root.US_2026_ELECTION_RESULTS=Object.freeze("+
        json.dumps(data,ensure_ascii=False,separators=(",",":"),sort_keys=True)+
        ");})(typeof window!=='undefined'?window:globalThis);\n"
    )


def publish():
    data=build_dataset(fetch_json(RACES_URL),fetch_json(COUNTIES_URL),strict=True)
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(javascript(data),encoding="utf-8")
    print("Published 2026 results:",
          sum(len(v) for v in data["house"].values()),"House races,",
          len(data["senate"]),"Senate states,",
          len(data["governor"]),"governor states; updated",data["updatedAt"])


if __name__=="__main__":
    publish()
