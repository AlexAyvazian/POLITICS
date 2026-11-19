#!/usr/bin/env python3
"""Build a static nationwide 2026 federal/statewide election-result cache.

The browser never calls an election provider. GitHub Actions downloads Call the
Map's CC BY 4.0 open-data exports, whose counts come from state/county election
offices (with civicAPI attribution where identified), validates the schema, and
publishes a compact JavaScript cache.

Map semantics are deliberately conservative:
- called/final races use the reported winner's party;
- counting/uncalled races are "pending" even when a candidate currently leads;
- county/unit colors are assigned only when one compared candidate has more
  votes than the other candidate AND all other votes combined.
"""
from __future__ import annotations

import json
import re
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "data" / "elections" / "us-2026.js"
RACES_URL = "https://www.callthemap.com/results/data/2026/races.json"
COUNTIES_URL = "https://www.callthemap.com/results/data/2026/counties.json"
HEADERS = {"User-Agent": "POLITICS-2026-Election-Atlas/1.0 (static public-result cache)"}
ELECTION_DATE = "2026-11-03"
VALID_STATUS = {"counting", "called", "final"}


def _indexes(payload: dict) -> dict[str, int]:
    columns = payload.get("columns")
    if not isinstance(columns, list):
        raise ValueError("Missing result columns")
    names = [item.get("name") if isinstance(item, dict) else None for item in columns]
    if any(not isinstance(name, str) or not name for name in names):
        raise ValueError("Invalid result columns")
    return {name: index for index, name in enumerate(names)}


def _records(payload: dict) -> list[dict]:
    if payload.get("schema_version") != "ctm-results-open-data-v1":
        raise ValueError("Unexpected election-result schema")
    indexes = _indexes(payload)
    rows = payload.get("rows")
    if not isinstance(rows, list):
        raise ValueError("Missing result rows")
    records = []
    for row in rows:
        if not isinstance(row, list):
            continue
        record = {}
        for name, index in indexes.items():
            record[name] = row[index] if index < len(row) else None
        records.append(record)
    return records


def party_class(code) -> str:
    value = str(code or "").strip().upper()
    if value == "D":
        return "democratic"
    if value == "R":
        return "republican"
    if value in {"I", "L", "G", "O"}:
        return "other"
    return "unknown"


def _candidate(row: dict) -> dict:
    return {
        "name": row.get("candidate"),
        "party": party_class(row.get("party")),
        "partyCode": row.get("party"),
        "votes": row.get("votes"),
        "sharePct": row.get("share_pct"),
        "outcome": row.get("outcome") or None,
    }


def _race_record(rows: list[dict]) -> dict:
    if not rows:
        raise ValueError("Empty race")
    first = rows[0]
    status = str(first.get("status") or "").lower()
    if status not in VALID_STATUS:
        status = "counting"
    winner = next((row for row in rows if row.get("outcome") == "won"), None)
    leader = next((row for row in rows if row.get("outcome") == "leads"), None)
    decisive = winner if status in {"called", "final"} else None
    map_party = party_class(decisive.get("party")) if decisive else "pending"
    ordered = sorted(
        rows,
        key=lambda row: int(row.get("votes") or 0),
        reverse=True,
    )
    source_row = decisive or leader or ordered[0]
    record = {
        "raceId": first.get("race_id"),
        "state": first.get("state"),
        "office": first.get("office"),
        "title": first.get("title"),
        "electionDate": ELECTION_DATE,
        "status": status,
        "mapParty": map_party,
        "winner": decisive.get("candidate") if decisive else None,
        "winnerParty": party_class(decisive.get("party")) if decisive else None,
        "leader": leader.get("candidate") if leader else None,
        "leaderParty": party_class(leader.get("party")) if leader else None,
        "totalVotes": first.get("total_votes"),
        "calledUtc": first.get("called_utc") or None,
        "countUpdatedUtc": first.get("count_updated_utc") or None,
        "source": source_row.get("source"),
        "sourceUrl": source_row.get("source_url"),
        "pageUrl": source_row.get("page_url"),
        "candidates": [_candidate(row) for row in ordered],
    }
    return record


def _unit_record(row: dict) -> dict:
    try:
        a_votes = int(row.get("votes_a") or 0)
        b_votes = int(row.get("votes_b") or 0)
        other_votes = int(row.get("votes_other") or 0)
    except (TypeError, ValueError):
        a_votes = b_votes = other_votes = 0
    winner = None
    winner_party = "unknown"
    if a_votes > b_votes and a_votes > other_votes:
        winner = row.get("candidate_a")
        winner_party = party_class(row.get("party_a"))
    elif b_votes > a_votes and b_votes > other_votes:
        winner = row.get("candidate_b")
        winner_party = party_class(row.get("party_b"))
    return {
        "name": row.get("place"),
        "kind": row.get("place_kind"),
        "fips": str(row.get("fips") or ""),
        "mapParty": winner_party,
        "party": winner_party,
        "winner": winner,
        "candidateA": row.get("candidate_a"),
        "partyA": party_class(row.get("party_a")),
        "votesA": a_votes,
        "candidateB": row.get("candidate_b"),
        "partyB": party_class(row.get("party_b")),
        "votesB": b_votes,
        "votesOther": other_votes,
        "totalVotes": row.get("total_votes"),
        "finished": row.get("finished") or None,
        "countUpdatedUtc": row.get("count_updated_utc") or None,
    }


def _statewide(records_by_race: dict[str, dict], county_rows: list[dict], office: str) -> dict:
    unit_groups: dict[str, dict[str, dict]] = defaultdict(dict)
    for row in county_rows:
        race_id = str(row.get("race_id") or "")
        if race_id not in records_by_race:
            continue
        fips = str(row.get("fips") or "")
        if fips:
            unit_groups[race_id][fips] = _unit_record(row)

    by_state: dict[str, list[dict]] = defaultdict(list)
    for race_id, record in records_by_race.items():
        if record.get("office") != office:
            continue
        enriched = dict(record)
        enriched["units"] = unit_groups.get(race_id, {})
        state = str(record.get("state") or "")
        if re.fullmatch(r"[A-Z]{2}", state):
            by_state[state].append(enriched)

    result = {}
    for state, races in by_state.items():
        if len(races) == 1:
            result[state] = races[0]
            continue
        parties = {race["mapParty"] for race in races}
        if "pending" in parties:
            map_party = "pending"
        elif len(parties) == 1:
            map_party = next(iter(parties))
        elif parties:
            map_party = "split"
        else:
            map_party = "unknown"
        result[state] = {
            "state": state,
            "office": office,
            "title": f"Multiple {office} races",
            "electionDate": ELECTION_DATE,
            "status": "counting" if map_party == "pending" else "called",
            "mapParty": map_party,
            "races": races,
            "units": {},
        }
    return result


def build_cache(races_payload: dict, counties_payload: dict) -> dict:
    race_rows = _records(races_payload)
    county_rows = _records(counties_payload)
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in race_rows:
        office = row.get("office")
        race_id = str(row.get("race_id") or "")
        if office in {"House", "Senate", "Governor"} and race_id:
            grouped[race_id].append(row)

    records_by_race = {race_id: _race_record(rows) for race_id, rows in grouped.items()}
    house = {
        race_id: record
        for race_id, record in records_by_race.items()
        if record.get("office") == "House"
        and re.fullmatch(r"[A-Z]{2}-(?:\d{2}|AL)", race_id)
    }
    senate = _statewide(records_by_race, county_rows, "Senate")
    governor = _statewide(records_by_race, county_rows, "Governor")

    return {
        "schemaVersion": 1,
        "electionDate": ELECTION_DATE,
        "asOf": races_payload.get("last_updated_utc"),
        "sourceReadUtc": races_payload.get("source_read_utc"),
        "source": "Call the Map 2026 open election results",
        "sourceUrl": "https://www.callthemap.com/results/data",
        "credit": races_payload.get("credit") or "Call the Map (callthemap.com/results)",
        "license": (races_payload.get("license") or {}).get("name") or "CC BY 4.0",
        "house": house,
        "senate": senate,
        "governor": governor,
    }


def fetch_json(url: str) -> dict:
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=90) as response:
        payload = json.load(response)
    if not isinstance(payload, dict):
        raise ValueError("Election provider returned a non-object payload")
    return payload


def javascript(data: dict) -> str:
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return (
        "/* Generated static 2026 election-result cache. "
        "Credit: Call the Map; some rows credit civicAPI; counts originate with state/county election offices. */\n"
        "(function(root){root.US_ELECTION_2026=Object.freeze(" + body +
        ");})(typeof window!=='undefined'?window:globalThis);\n"
    )


def publish() -> None:
    data = build_cache(fetch_json(RACES_URL), fetch_json(COUNTIES_URL))
    if len(data["house"]) < 430:
        raise ValueError(f"Nationwide House result cache incomplete: {len(data['house'])} races")
    if len(data["senate"]) < 25:
        raise ValueError(f"Senate result cache unexpectedly small: {len(data['senate'])} states")
    if len(data["governor"]) < 25:
        raise ValueError(f"Governor result cache unexpectedly small: {len(data['governor'])} states")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(javascript(data), encoding="utf-8")
    print(
        "Published 2026 election cache:",
        len(data["house"]), "House races,",
        len(data["senate"]), "Senate states,",
        len(data["governor"]), "Governor states, as of", data["asOf"],
    )


if __name__ == "__main__":
    publish()
