#!/usr/bin/env python3
"""Build per-member PAC funding intelligence from official FEC bulk data.

This layer is intentionally separate from the existing candidate summary files.
It answers "which committees gave to this candidate, and how can those committees
be grouped for browsing?" without treating independent expenditures as direct
campaign contributions.

Sources:
- 2025-2026 Contributions from committees to candidates (PAS2)
- 2025-2026 Leadership PACs and sponsors
- Existing verified Bioguide -> FEC candidate IDs in assets/data/records/finance
"""
from __future__ import annotations

import csv
import io
import json
import re
import shutil
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FINANCE_DIR = ROOT / "assets" / "data" / "records" / "finance"
OUTPUT_DIR = ROOT / "assets" / "data" / "records" / "pac-funding"
PAS2_URL = "https://www.fec.gov/files/bulk-downloads/2026/pas226.zip"
LEADERSHIP_URL = "https://www.fec.gov/files/bulk-downloads/data.fec.gov/leadership2026.csv"
FEC_BROWSE_URL = "https://www.fec.gov/data/browse-data/?tab=bulk-data"

COMMITTEE_ID = re.compile(r"^C\d{8}$")
CANDIDATE_ID = re.compile(r"^[HSP]\d[A-Z]{2}\d{5}$")

# Deliberately broad, transparent site taxonomy. The FEC does not assign
# these sectors. Rules are ordered so specific insurance/health groups are
# classified before generic "health" or "financial" words.
SECTOR_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("Health Insurance", (
        "BLUE CROSS", "BLUE SHIELD", "UNITEDHEALTH", "UNITED HEALTH", "CIGNA",
        "HUMANA", "CENTENE", "ELEVANCE", "MOLINA HEALTH", "HIGHMARK",
        "CARESOURCE", "GUIDEWELL", "VSP HOLDING", "HEALTH PLANS",
    )),
    ("Insurance & Employee Benefits", (
        "INSURANCE", "AFLAC", "PRUDENTIAL", "MUTUAL OF OMAHA", "BENEFITS",
        "ACTUAR", "TRAVELERS", "CHUBB", "ALLSTATE", "STATE FARM",
        "NORTHWESTERN MUTUAL", "NEW YORK LIFE", "PACIFIC LIFE", "UNUM",
        "MARSH", "GUARDIAN LIFE", "PRIMERICA", "THRIVENT",
    )),
    ("Finance, Banking & Investment", (
        "BANK", "BANKERS", "BANCORP", "FINANCIAL", "INVESTMENT", "INVESTOR",
        "SECURITIES", "CAPITAL GROUP", "CAPITAL ONE", "CREDIT UNION", "CME GROUP",
        "MASTERCARD", "VISA", "BLACKROCK", "FIDELITY", "FMR LLC", "VANGUARD",
        "GOLDMAN SACHS", "MORGAN STANLEY", "JPMORGAN", "CITIGROUP", "BARCLAYS",
        "UBS ", "DELOITTE", "ERNST & YOUNG", "KPMG", "PRICEWATERHOUSE",
        "ACCOUNTANTS", "PENSION PROFESSIONALS", "FARM CREDIT",
    )),
    ("Healthcare & Pharmaceuticals", (
        "HEALTH", "PHARMA", "PHARMACY", "PHARMACEUT", "MEDICAL", "MEDICINE",
        "HOSPITAL", "PHYSICIAN", "NURSE", "DENTAL", "DERMATOLOGY", "NEUROLOGY",
        "OPHTHAL", "ANESTH", "CARDIO", "CHIROPRACT", "OSTEOPATH", "THERAP",
        "PSYCHIATR", "PSYCHOLOG", "SURGEON", "RADIOLOG", "PODIATR",
        "AUDIOLOGY", "ONCOLOGY", "RENAL", "DAVITA", "FRESENIUS", "CVS ",
        "WALGREEN", "ABBVIE", "CARDINAL HEALTH", "TELADOC",
    )),
    ("Housing, Real Estate & Construction", (
        "REAL ESTATE", "REALTOR", "APARTMENT", "MULTIFAMILY", "HOME BUILDER",
        "HOME BUILDERS", "HOUSING", "MORTGAGE", "LAND TITLE", "NAIOP",
        "NAREIT", "PROPERTY MANAGER", "PROPERTY MANAGEMENT", "ARCHITECT",
        "CONSTRUCTION", "CONTRACTOR", "CONCRETE", "SHOPPING CENTERS",
        "1031", "ROCK HOLDINGS", "ZILLOW",
    )),
    ("Technology & Telecommunications", (
        "TELECOM", "TELECOMM", "WIRELESS", "CABLE", "INTERNET", "SOFTWARE",
        "AMAZON", "GOOGLE", "META PLATFORMS", "MICROSOFT", "ORACLE", "CISCO",
        "VERIZON", "T-MOBILE", "AT&T", "COMCAST", "CHARTER COMMUNICATION",
        "SAMSUNG", "SYNOPSYS", "EBAY", "DOORDASH", "ECHOSTAR", "DISH NETWORK",
        "HEWLETT PACKARD", "NIELSEN", "GRAIL",
    )),
    ("Retail, Consumer & Media", (
        "RETAIL", "CONSUMER", "WALMART", "TARGET", "HOME DEPOT", "LOWE'S",
        "MCDONALD", "PROCTER & GAMBLE", "DISNEY", "NEWS CORP", "FOX CORPORATION",
        "BROADCAST", "MUSIC", "ENTERTAINMENT", "FRANCHISE", "BEER", "SPIRITS",
        "ANHEUSER", "BROWN-FORMAN", "SAZERAC", "CONVENIENCE STORES",
        "MAJOR LEAGUE BASEBALL", "PARAMOUNT", "DRAFTKINGS", "TRACTOR SUPPLY",
        "GAP INC",
    )),
    ("Defense & Federal Contracting", (
        "DEFENSE", "AEROSPACE", "LOCKHEED", "RAYTHEON", "NORTHROP", "GENERAL DYNAMICS",
        "L3HARRIS", "BAE SYSTEMS", "BOEING", "HUNTINGTON INGALLS", "LEIDOS",
        "PARSONS CORPORATION", "ROLLS-ROYCE", "TEXTRON", "AECOM", "HONEYWELL",
        "ACCENTURE", "DELL INC",
    )),
    ("Industry, Energy & Agriculture", (
        "ENERGY", "ELECTRIC", "UTILITY", "OIL", "GAS", "MINING", "METALS",
        "ALCOA", "3M ", "CATERPILLAR", "CUMMINS", "INDUSTRIAL", "EQUIPMENT",
        "FARM", "AGRICULT", "SOYBEAN", "SUGAR", "GROCERS", "TYSON", "LAND O'LAKES",
        "POET ", "RIO TINTO", "DOWPAC", "DOW ", "CNH", "JOHN DEERE", "DEERE &",
        "SYNGENTA",
    )),
    ("Transportation & Vehicles", (
        "AIRLINES", "AIR LINES", "AIRLINES", "AIRWAYS", "AIR WORLDWIDE",
        "TRUCKING", "AUTOMOBILE", "MOTOR COMPANY", "GENERAL MOTORS", "TOYOTA",
        "FEDEX", "FEDERAL EXPRESS", "UNITED PARCEL", " UPS ", "CSX",
        "TRANSPORT", "MARINE MANUFACTURERS", "SCHNEIDER NATIONAL",
    )),
    ("Legal, Lobbying & Professional", (
        "LAW ", " LAW", "LLP", "ATTORNEY", "LOBBY", "AKIN GUMP", "BALLARD SPAHR",
        "BROWNSTEIN", "BRYAN CAVE", "COZEN", "FOLEY & LARDNER", "HOLLAND & KNIGHT",
        "K&L GATES", "MCKINSEY", "SQUIRE PATTON", "STEPTOE", "WILLIAMS AND JENSEN",
        "INTELLECTUAL PROPERTY LAW", "COUNCIL OF ENGINEERING COMPANIES",
    )),
    ("Labor & Unions", (
        "AFL-CIO", "LABORERS", "TEAMSTERS", "UNION", "IBEW", "SEIU", "AFSCME",
        "UAW", "TEACHERS UNION", "FIREFIGHTERS", "LETTER CARRIERS", "PILOTS ASSOCIATION",
    )),
]

PAS2 = {
    "committee_id": 0,
    "amendment": 1,
    "report_type": 2,
    "election": 3,
    "image": 4,
    "transaction_type": 5,
    "entity_type": 6,
    "name": 7,
    "date": 13,
    "amount": 14,
    "other_id": 15,
    "candidate_id": 16,
    "transaction_id": 17,
    "file_number": 18,
    "memo_code": 19,
    "memo_text": 20,
    "sub_id": 21,
}


def classify_sector(name: str) -> str:
    value = re.sub(r"\s+", " ", str(name or "").upper()).strip()
    for sector, needles in SECTOR_RULES:
        if any(needle in value for needle in needles):
            return sector
    return "Other / Unclassified"


def normalize_sponsor(name: str) -> str:
    value = str(name or "").upper().replace(".", " ")
    value = re.sub(r"\b(?:REP|SEN|SENATOR|REPRESENTATIVE|HON|HONORABLE)\b$", "", value).strip()
    value = re.sub(r"[^A-Z0-9, '&-]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def leadership_for_candidate(candidate_name: str, rows: list[dict]) -> list[dict]:
    key = normalize_sponsor(candidate_name)
    if not key:
        return []
    return [dict(row) for row in rows if normalize_sponsor(row.get("sponsorName", "")) == key]


def _number(value):
    try:
        return float(str(value).replace(",", "").replace("$", "").strip())
    except (TypeError, ValueError):
        return None


def _file_number(row: list[str]) -> int:
    try:
        return int(row[PAS2["file_number"]])
    except (ValueError, TypeError, IndexError):
        return -1


def _amendment_rank(row: list[str]) -> int:
    value = row[PAS2["amendment"]].upper() if len(row) > PAS2["amendment"] else ""
    return {"A": 3, "T": 2, "N": 1}.get(value, 0)


def aggregate_candidate_rows(rows: list[list[str]], leadership_map: dict[str, dict]) -> dict:
    """Deduplicate amendments and aggregate direct committee contributions.

    PAS2 also contains independent expenditures (transaction types beginning 24).
    Those are counted as excluded rows here because they are not money received by
    the candidate committee. Memo rows marked X are preserved as a coverage count
    but not added to direct contribution totals.
    """
    latest: dict[tuple[str, str], list[str]] = {}
    excluded_ie = 0
    excluded_memo = 0
    malformed = 0

    for row in rows:
        if len(row) < 22:
            malformed += 1
            continue
        source_id = row[PAS2["committee_id"]].strip()
        transaction_type = row[PAS2["transaction_type"]].strip().upper()
        if transaction_type.startswith("24"):
            excluded_ie += 1
            continue
        if not COMMITTEE_ID.match(source_id):
            malformed += 1
            continue
        tx = row[PAS2["transaction_id"]].strip() or row[PAS2["sub_id"]].strip()
        key = (source_id, tx)
        prior = latest.get(key)
        if prior is None or (_file_number(row), _amendment_rank(row)) >= (_file_number(prior), _amendment_rank(prior)):
            latest[key] = row

    grouped: dict[str, dict] = {}
    direct_total = 0.0
    for row in latest.values():
        memo = row[PAS2["memo_code"]].strip().upper()
        if memo == "X":
            excluded_memo += 1
            continue
        amount = _number(row[PAS2["amount"]])
        if amount is None or amount <= 0:
            continue
        entity = row[PAS2["entity_type"]].strip().upper()
        if entity not in {"PAC", "COM", "CCM", "PTY"}:
            continue
        source_id = row[PAS2["committee_id"]].strip()
        name = re.sub(r"\s+", " ", row[PAS2["name"]].strip()) or source_id
        leadership = leadership_map.get(source_id)
        sector = "Party Committees" if entity == "PTY" else (
            "Leadership PACs" if leadership else classify_sector(name)
        )
        item = grouped.setdefault(source_id, {
            "committeeId": source_id,
            "name": name,
            "total": 0.0,
            "transactions": 0,
            "latestDate": None,
            "entityType": entity,
            "sector": sector,
            "leadershipPac": bool(leadership),
            "leadershipSponsor": leadership.get("sponsorName") if leadership else None,
            "sourceUrl": f"https://www.fec.gov/data/committee/{source_id}/?cycle=2026",
        })
        item["total"] += amount
        item["transactions"] += 1
        raw_date = row[PAS2["date"]].strip()
        if re.fullmatch(r"\d{8}", raw_date):
            date = f"{raw_date[4:8]}-{raw_date[0:2]}-{raw_date[2:4]}"
            if item["latestDate"] is None or date > item["latestDate"]:
                item["latestDate"] = date
        direct_total += amount

    contributors = sorted(grouped.values(), key=lambda x: (-x["total"], x["name"]))
    for item in contributors:
        item["total"] = round(item["total"], 2)
    return {
        "directTotal": round(direct_total, 2),
        "contributors": contributors,
        "excludedIndependentExpenditureRows": excluded_ie,
        "excludedMemoRows": excluded_memo,
        "malformedRows": malformed,
        "deduplicatedRows": len(latest),
    }


def _header_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def parse_leadership_csv(text: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for raw in reader:
        normalized = {_header_key(k): v for k, v in raw.items()}
        cid = (normalized.get("committeeid") or normalized.get("comid") or "").strip()
        if not COMMITTEE_ID.match(cid):
            continue
        item = {
            "committeeId": cid,
            "name": (normalized.get("committeename") or normalized.get("comnam") or "").strip(),
            "sponsorName": (normalized.get("sponsorname") or normalized.get("sponam") or "").strip(),
            "cashOnHand": _number(normalized.get("cashonhand")),
            "coverageEnd": (normalized.get("coverageenddate") or normalized.get("covenddat") or "").strip() or None,
            "totalDisbursements": _number(normalized.get("totaldisbursement") or normalized.get("totdis")),
            "totalReceipts": _number(normalized.get("totalreceipt") or normalized.get("totrec")),
            "sourceUrl": f"https://www.fec.gov/data/committee/{cid}/?cycle=2026",
        }
        rows.append(item)
    return rows


def _download(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "POLITICS congressional PAC funding cache"})
    with urllib.request.urlopen(req, timeout=90) as response:
        return response.read()


def _load_finance_index() -> tuple[dict[str, dict], dict[str, str]]:
    by_candidate: dict[str, dict] = {}
    candidate_to_bioguide: dict[str, str] = {}
    for path in sorted(FINANCE_DIR.glob("*.json")):
        try:
            doc = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        candidate_id = str(doc.get("candidateId") or "")
        bioguide = str(doc.get("bioguide") or "")
        if doc.get("cycle") != 2026 or not CANDIDATE_ID.match(candidate_id) or not re.fullmatch(r"[A-Z]\d{6}", bioguide):
            continue
        by_candidate[candidate_id] = {
            "bioguide": bioguide,
            "candidateId": candidate_id,
            "candidateName": str(doc.get("candidateName") or ""),
        }
        candidate_to_bioguide[candidate_id] = bioguide
    return by_candidate, candidate_to_bioguide


def _read_pas2_relevant(zip_bytes: bytes, candidate_ids: set[str]) -> dict[str, list[list[str]]]:
    rows: dict[str, list[list[str]]] = defaultdict(list)
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
        names = [n for n in archive.namelist() if n.lower().endswith((".txt", ".csv"))]
        if not names:
            raise RuntimeError("FEC PAS2 archive contains no delimited transaction file")
        with archive.open(names[0]) as raw:
            wrapper = io.TextIOWrapper(raw, encoding="latin-1", newline="")
            for row in csv.reader(wrapper, delimiter="|"):
                if len(row) < 22:
                    continue
                candidate_id = row[PAS2["candidate_id"]].strip()
                if candidate_id in candidate_ids:
                    rows[candidate_id].append(row)
    return rows


def _sector_summary(contributors: list[dict]) -> list[dict]:
    groups: dict[str, dict] = {}
    for item in contributors:
        sector = item["sector"]
        group = groups.setdefault(sector, {"sector": sector, "total": 0.0, "committeeCount": 0, "items": []})
        group["total"] += item["total"]
        group["committeeCount"] += 1
        group["items"].append(item)
    result = []
    for group in groups.values():
        group["total"] = round(group["total"], 2)
        group["items"] = sorted(group["items"], key=lambda x: (-x["total"], x["name"]))[:30]
        result.append(group)
    return sorted(result, key=lambda x: (-x["total"], x["sector"]))


def build_snapshot(identity: dict, rows: list[list[str]], leadership_rows: list[dict], retrieved_at: str) -> dict:
    leadership_map = {row["committeeId"]: row for row in leadership_rows}
    aggregated = aggregate_candidate_rows(rows, leadership_map)
    contributors = aggregated["contributors"]
    own_leadership = leadership_for_candidate(identity["candidateName"], leadership_rows)
    return {
        "source": "Federal Election Commission",
        "sourceUrl": FEC_BROWSE_URL,
        "cycle": 2026,
        "retrievedAt": retrieved_at,
        "bioguide": identity["bioguide"],
        "candidateId": identity["candidateId"],
        "candidateName": identity["candidateName"],
        "directCommitteeTotal": aggregated["directTotal"],
        "topContributors": contributors[:40],
        "sectors": _sector_summary(contributors),
        "leadershipPacContributors": [x for x in contributors if x["leadershipPac"]][:20],
        "memberLeadershipPacs": own_leadership,
        "coverage": {
            "sourceFile": "FEC 2025-2026 contributions from committees to candidates (PAS2)",
            "deduplicatedRows": aggregated["deduplicatedRows"],
            "excludedIndependentExpenditureRows": aggregated["excludedIndependentExpenditureRows"],
            "excludedMemoRows": aggregated["excludedMemoRows"],
            "malformedRows": aggregated["malformedRows"],
            "completeBulkSnapshot": True,
        },
        "methodology": (
            "Direct committee-to-candidate transactions are aggregated after keeping the latest filing "
            "version for each FEC transaction ID. Independent expenditures (24-series transaction types) "
            "are excluded from direct contribution totals. Memo rows marked X are not added to totals. "
            "Sector labels are a POLITICS browsing taxonomy based on committee names, not FEC industry classifications."
        ),
    }


def main() -> int:
    identities, candidate_to_bioguide = _load_finance_index()
    if len(identities) < 400:
        raise RuntimeError(f"Only {len(identities)} verified 2026 candidate mappings; refusing to publish partial national cache")

    pas2_bytes = _download(PAS2_URL)
    leadership_text = _download(LEADERSHIP_URL).decode("utf-8-sig", errors="replace")
    leadership_rows = parse_leadership_csv(leadership_text)
    if len(leadership_rows) < 50:
        raise RuntimeError("Leadership PAC source unexpectedly small")

    relevant = _read_pas2_relevant(pas2_bytes, set(candidate_to_bioguide))
    retrieved_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    temp = OUTPUT_DIR.with_name(OUTPUT_DIR.name + ".tmp")
    if temp.exists():
        shutil.rmtree(temp)
    temp.mkdir(parents=True)
    written = 0
    with_rows = 0
    with_leadership = 0
    for candidate_id, identity in sorted(identities.items(), key=lambda x: x[1]["bioguide"]):
        snapshot = build_snapshot(identity, relevant.get(candidate_id, []), leadership_rows, retrieved_at)
        if snapshot["topContributors"]:
            with_rows += 1
        if snapshot["memberLeadershipPacs"]:
            with_leadership += 1
        (temp / f'{identity["bioguide"]}.json').write_text(
            json.dumps(snapshot, separators=(",", ":"), ensure_ascii=False) + "\n"
        )
        written += 1

    if written < 400 or with_rows < 250:
        raise RuntimeError(f"National PAC funding validation failed: written={written}, members_with_rows={with_rows}")
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    temp.replace(OUTPUT_DIR)
    print(json.dumps({
        "members": written,
        "membersWithDirectCommitteeRows": with_rows,
        "membersWithOwnLeadershipPac": with_leadership,
        "leadershipPacRecords": len(leadership_rows),
        "retrievedAt": retrieved_at,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
