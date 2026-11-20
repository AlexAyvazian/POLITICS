#!/usr/bin/env python3
"""Refresh the latest monthly BLS LAUS county labor-market snapshot.

BLS publishes a nationwide workbook containing the latest 14 months of county
labor-force data. This script keeps only the newest common month and writes a
compact JSON snapshot for the County Atlas.
"""
from __future__ import annotations

import io
import json
import re
import sys
import urllib.request
import zipfile
from datetime import date, datetime, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET

SOURCE_URL="https://www.bls.gov/web/metro/laucntycur14.zip"
OUTPUT=Path("assets/data/county/bls-laus.json")
NS={"m":"http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS={"r":"http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
PKG_REL_NS={"p":"http://schemas.openxmlformats.org/package/2006/relationships"}
MONTHS={m.lower():i for i,m in enumerate(
    ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],1)}
MONTHS.update({m.lower():i for i,m in enumerate(
    ["January","February","March","April","May","June","July","August","September","October","November","December"],1)})

def _col_index(ref: str) -> int:
    letters=re.match(r"([A-Z]+)",ref or "")
    if not letters:
        return 0
    value=0
    for ch in letters.group(1):
        value=value*26+(ord(ch)-64)
    return value-1

def _shared_strings(zf: zipfile.ZipFile) -> list[str]:
    try:
        root=ET.fromstring(zf.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    out=[]
    for si in root.findall("m:si",NS):
        out.append("".join(t.text or "" for t in si.iterfind(".//m:t",NS)))
    return out

def _first_sheet_path(zf: zipfile.ZipFile) -> str:
    workbook=ET.fromstring(zf.read("xl/workbook.xml"))
    sheet=workbook.find("m:sheets/m:sheet",NS)
    if sheet is None:
        raise ValueError("BLS workbook has no worksheets")
    rel_id=sheet.attrib.get("{%s}id"%REL_NS["r"])
    rels=ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    for rel in rels.findall("p:Relationship",PKG_REL_NS):
        if rel.attrib.get("Id")==rel_id:
            target=rel.attrib.get("Target","")
            if target.startswith("/"):
                return target.lstrip("/")
            return "xl/"+target.lstrip("/")
    raise ValueError("BLS workbook worksheet relationship missing")

def xlsx_rows(blob: bytes) -> list[list[object]]:
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        shared=_shared_strings(zf)
        root=ET.fromstring(zf.read(_first_sheet_path(zf)))
    rows=[]
    for row in root.findall(".//m:sheetData/m:row",NS):
        values={}
        max_col=-1
        for cell in row.findall("m:c",NS):
            idx=_col_index(cell.attrib.get("r","A1"))
            max_col=max(max_col,idx)
            kind=cell.attrib.get("t")
            if kind=="inlineStr":
                value="".join(t.text or "" for t in cell.iterfind(".//m:t",NS))
            else:
                node=cell.find("m:v",NS)
                raw=node.text if node is not None else ""
                if kind=="s" and raw.isdigit() and int(raw)<len(shared):
                    value=shared[int(raw)]
                else:
                    value=raw
            values[idx]=value
        if max_col>=0:
            rows.append([values.get(i,"") for i in range(max_col+1)])
    return rows

def normalize_period(value: object) -> str | None:
    if value is None:
        return None
    text=str(value).strip().replace("(p)","").replace("(P)","")
    if re.fullmatch(r"\d+(?:\.0+)?",text):
        try:
            serial=float(text)
            if 30000<=serial<=60000:
                d=datetime(1899,12,30)+timedelta(days=serial)
                return f"{d.year:04d}-{d.month:02d}"
        except ValueError:
            pass
    m=re.search(r"\b(20\d{2})[-/](0?[1-9]|1[0-2])\b",text)
    if m:
        return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}"
    m=re.search(r"\b([A-Za-z]{3,9})[-\s,/]+(\d{2,4})\b",text)
    if m and m.group(1).lower() in MONTHS:
        year=int(m.group(2))
        if year<100:
            year+=2000
        return f"{year:04d}-{MONTHS[m.group(1).lower()]:02d}"
    return None

def _number(value: object) -> float | None:
    text=str(value or "").strip().replace(",","").replace("%","")
    if not text or text in {"-","—","N/A","NA"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None

def _header_map(rows: list[list[object]]) -> tuple[int,dict[str,int]]:
    aliases={
        "area":["laus area code","area code"],
        "state":["state"],
        "county":["county"],
        "title":["area title","title"],
        "period":["period"],
        "labor":["labor force"],
        "employed":["employment"],
        "unemployed":["unemployment"],
        "rate":["unemployment rate","unemp rate"],
    }
    for row_index,row in enumerate(rows[:30]):
        norm=[re.sub(r"\s+"," ",str(x or "").strip().lower()) for x in row]
        mapping={}
        for key,options in aliases.items():
            for i,label in enumerate(norm):
                if any(option==label or option in label for option in options):
                    mapping[key]=i
                    break
        if all(key in mapping for key in aliases):
            return row_index,mapping
    raise ValueError("Could not identify BLS county workbook headers")

def normalize_rows(rows: list[list[object]],today: date,min_count: int=2500) -> dict:
    header_index,cols=_header_map(rows)
    parsed=[]
    for row in rows[header_index+1:]:
        def get(name):
            idx=cols[name]
            return row[idx] if idx<len(row) else ""
        state=str(get("state") or "").strip()
        county=str(get("county") or "").strip()
        try:
            state=f"{int(float(state)):02d}"
            county=f"{int(float(county)):03d}"
        except ValueError:
            state=county=""
        fips=state+county if state and county else ""
        if not re.fullmatch(r"\d{5}",fips):
            area=str(get("area") or "")
            m=re.search(r"CN(\d{5})",area)
            fips=m.group(1) if m else ""
        if not re.fullmatch(r"\d{5}",fips) or fips.endswith("000"):
            continue
        period=normalize_period(get("period"))
        labor=_number(get("labor"));employed=_number(get("employed"))
        unemployed=_number(get("unemployed"));rate=_number(get("rate"))
        if not period or any(value is None for value in (labor,employed,unemployed,rate)):
            continue
        parsed.append((period,fips,{
            "name":str(get("title") or "").strip()[:120],
            "laborForce":round(labor),
            "employed":round(employed),
            "unemployed":round(unemployed),
            "unemploymentRatePct":round(rate,1),
        }))
    if not parsed:
        raise ValueError("BLS county workbook contained no usable rows")
    latest=max(period for period,_,_ in parsed)
    counties={fips:item for period,fips,item in parsed if period==latest}
    if len(counties)<min_count:
        raise ValueError(f"Incomplete BLS county dataset ({len(counties)} counties)")
    return {
        "source":"U.S. Bureau of Labor Statistics",
        "dataset":"Local Area Unemployment Statistics (LAUS)",
        "sourceUrl":"https://www.bls.gov/lau/tables.htm",
        "downloadUrl":SOURCE_URL,
        "retrievedAt":today.isoformat(),
        "period":latest,
        "seasonalAdjustment":"Not seasonally adjusted",
        "coverage":"Latest common monthly county labor-force observation from the BLS 14-month LAUS county workbook. Estimates are by place of residence.",
        "count":len(counties),
        "fields":{
            "laborForce":{"label":"Civilian labor force","unit":"count"},
            "employed":{"label":"Employed residents","unit":"count"},
            "unemployed":{"label":"Unemployed residents","unit":"count"},
            "unemploymentRatePct":{"label":"Unemployment rate","unit":"percent"},
        },
        "counties":counties,
    }

def fetch_workbook() -> bytes:
    req=urllib.request.Request(
        SOURCE_URL,
        headers={
            "Accept":"application/zip,application/octet-stream,*/*",
            "User-Agent":"POLITICS civic transparency project (public BLS data refresh)",
        },
    )
    with urllib.request.urlopen(req,timeout=120) as response:
        if response.status!=200:
            raise RuntimeError(f"BLS county ZIP HTTP {response.status}")
        archive=response.read()
    with zipfile.ZipFile(io.BytesIO(archive)) as zf:
        names=[name for name in zf.namelist() if name.lower().endswith(".xlsx")]
        if not names:
            raise ValueError("BLS county ZIP contains no XLSX workbook")
        return zf.read(names[0])

def main() -> int:
    today=date.today()
    data=normalize_rows(xlsx_rows(fetch_workbook()),today)
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(data,separators=(",",":"),sort_keys=True)+"\n",encoding="utf-8")
    print(f"Wrote {data['count']} counties for {data['period']} to {OUTPUT}")
    return 0

if __name__=="__main__":
    sys.exit(main())
