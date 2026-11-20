#!/usr/bin/env python3
"""Refresh official EPA 2025 county air-quality monitoring statistics.

Source: EPA Air Trends "Air Quality Statistics by County, 2025" workbook.
The workbook reports the highest standards-related statistics among monitoring
sites in each county. It is not intended to rank counties and may not represent
county-wide air quality. "ND" stays missing; it is never converted to zero.
"""
from __future__ import annotations
import json, os, sys, urllib.request
from datetime import datetime, timezone
from pathlib import Path

YEAR=2025
URL="https://www.epa.gov/system/files/documents/2026-06/aqstatsbycounty2025.xlsx"
SOURCE_PAGE="https://www.epa.gov/air-trends/air-quality-cities-and-counties"
OUTPUT=Path("assets/data/county/epa-air-quality-2025.json")
USER_AGENT="POLITICS civic transparency project (+https://politics-e5yt.onrender.com)"

def _clean(value):
    return " ".join(str(value or "").replace("\n"," ").split())

def _key(value):
    return _clean(value).lower().replace("₂","2").replace("µ","u").replace("μ","u")

def _lookup(row,*aliases):
    normalized={_key(k):v for k,v in row.items()}
    for alias in aliases:
        if _key(alias) in normalized:
            return normalized[_key(alias)]
    return None

def _number(value):
    if value is None:
        return None
    text=str(value).strip()
    if not text or text.upper() in {"ND","NA","N/A","--","-"}:
        return None
    try:
        return round(float(text.replace(",","")),4)
    except ValueError:
        return None

def normalize_row(row: dict):
    fips_raw=_lookup(row,"County FIPS Code","County FIPS","FIPS")
    if fips_raw is None:
        return None
    try:
        fips=str(int(float(str(fips_raw).strip()))).zfill(5)
    except ValueError:
        return None
    if len(fips)!=5:
        return None
    metrics={
        "co8hPpm":_number(_lookup(row,"CO 8-hour (ppm)","CO 8-hour")),
        "lead3MonthUgM3":_number(_lookup(row,"Lead 3-month (µg/m3)","Lead 3-month (ug/m3)")),
        "no2AnnualMeanPpb":_number(_lookup(row,"NO2 AM (ppb)","NO2 AM")),
        "no2OneHourPpb":_number(_lookup(row,"NO2 1-hour (ppb)","NO2 1-hour")),
        "ozone8hPpb":_number(_lookup(row,"Ozone 8-hour (ppb)","Ozone 8-hour")),
        "pm10DailyUgM3":_number(_lookup(row,"PM10 24-hour (µg/m3)","PM10 24-hour (ug/m3)")),
        "pm25AnnualUgM3":_number(_lookup(row,"PM2.5 Wtd AM (µg/m3)","PM2.5 Wtd AM (ug/m3)")),
        "pm25DailyUgM3":_number(_lookup(row,"PM2.5 24-hour (µg/m3)","PM2.5 24-hour (ug/m3)")),
        "so2OneHourPpb":_number(_lookup(row,"SO2 1-hour (ppb)","SO2 1-hour")),
        "so2AnnualMeanPpb":_number(_lookup(row,"SO2 Wtd AM (ppb)","SO2 Wtd AM")),
    }
    if not any(value is not None for value in metrics.values()):
        return None
    population=_number(_lookup(row,"Population (2020 Census)"))
    return {
        "fips":fips,
        "state":_clean(_lookup(row,"State"))[:80],
        "county":_clean(_lookup(row,"County"))[:120],
        "population2020":int(population) if population is not None else None,
        **metrics,
    }

def build_snapshot(rows, retrieved_at: str, min_count: int=850):
    counties={}
    for row in rows:
        item=normalize_row(row)
        if not item:
            continue
        fips=item.pop("fips")
        counties[fips]=item
    if len(counties)<min_count:
        raise ValueError(f"Incomplete EPA county monitoring workbook ({len(counties)} usable counties)")
    return {
        "source":"U.S. EPA Air Quality System / Air Trends",
        "dataset":"Air Quality Statistics by County, 2025",
        "year":YEAR,
        "dataAsOf":"2026-06-22",
        "sourceUrl":SOURCE_PAGE,
        "sourceFileUrl":URL,
        "retrievedAt":retrieved_at,
        "count":len(counties),
        "scope":"counties with 2025 EPA monitoring statistics",
        "coverage":"The values shown are the highest among monitoring sites in each county. Exceptional-events data are included. EPA states this summary is not intended to numerically rank counties; the measurements represent air quality near monitoring sites and may not represent county-wide air quality.",
        "missingCountyMeaning":"A county missing from this snapshot has no usable 2025 row in the EPA county monitoring workbook. That is not a zero pollution value and does not mean no air pollution occurred.",
        "counties":dict(sorted(counties.items())),
    }

def read_workbook(path: Path):
    from openpyxl import load_workbook
    wb=load_workbook(path,read_only=True,data_only=True)
    ws=wb[wb.sheetnames[0]]
    header=None
    rows=[]
    for raw in ws.iter_rows(values_only=True):
        values=list(raw)
        cleaned=[_clean(v) for v in values]
        if header is None:
            if "State" in cleaned and "County" in cleaned and "County FIPS Code" in cleaned:
                header=cleaned
            continue
        if not any(v not in (None,"") for v in values):
            continue
        row={header[i]:values[i] for i in range(min(len(header),len(values)))}
        rows.append(row)
    if header is None:
        raise ValueError("EPA workbook header row not found")
    return rows

def download(path: Path):
    req=urllib.request.Request(URL,headers={"Accept":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","User-Agent":USER_AGENT})
    with urllib.request.urlopen(req,timeout=90) as response:
        if response.status!=200:
            raise RuntimeError(f"EPA workbook HTTP {response.status}")
        path.write_bytes(response.read())

def main():
    supplied=os.environ.get("EPA_COUNTY_XLSX","").strip()
    path=Path(supplied) if supplied else Path("/tmp/epa-county-2025.xlsx")
    if not supplied:
        download(path)
    rows=read_workbook(path)
    now=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00","Z")
    snapshot=build_snapshot(rows,now)
    if OUTPUT.exists():
        try:
            old=json.loads(OUTPUT.read_text(encoding="utf-8"))
            stable=("source","dataset","year","dataAsOf","count","scope","coverage","missingCountyMeaning","counties")
            if all(old.get(k)==snapshot.get(k) for k in stable):
                print(f"EPA county monitoring snapshot unchanged: {snapshot['count']} counties")
                return 0
        except Exception:
            pass
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(snapshot,separators=(",",":"),sort_keys=True)+"\n",encoding="utf-8")
    print(f"Wrote EPA 2025 county monitoring statistics for {snapshot['count']} counties to {OUTPUT}")
    return 0

if __name__=="__main__":
    sys.exit(main())
