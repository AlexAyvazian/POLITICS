#!/usr/bin/env python3
"""Refresh nationwide FCC National Broadband Map county availability context."""
from __future__ import annotations
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE="https://broadbandmap.fcc.gov/nbm/map/api"
OUT=Path(__file__).resolve().parents[1]/"assets/data/county/fcc-broadband-availability.json"
HEADERS={
    "Accept":"application/json, text/plain, */*",
    "User-Agent":"Mozilla/5.0 (compatible; POLITICS/1.0; public-data research)",
    "Referer":"https://broadbandmap.fcc.gov/",
}
SPEEDS={
    "0_2_0_2":("s1","0.2/0.2"),
    "10_1":("s2","10/1"),
    "25_3":("s3","25/3"),
    "100_20":("s4","100/20"),
    "250_25":("s5","250/25"),
    "1000_100":("s6","1000/100"),
}

def get_json(url:str)->dict:
    req=urllib.request.Request(url,headers=HEADERS)
    with urllib.request.urlopen(req,timeout=90) as response:
        if response.status != 200:
            raise RuntimeError(f"FCC HTTP {response.status}: {url}")
        return json.load(response)

def release_date(label:str)->datetime:
    return datetime.strptime(label,"%B %d, %Y").replace(tzinfo=timezone.utc)

def pct(value):
    try:
        n=float(value)
    except (TypeError,ValueError):
        return None
    if n<0 or n>1:
        return None
    return round(n*100,3)

def fetch_rows(uuid:str,speed_code:str,area_type:str="total")->list[dict]:
    field=f"t1_2_3_6_7_{speed_code}_r"
    url=f"{BASE}/areaGeography/fixed/{uuid}/county/{field}?area_data_type={area_type}"
    body=get_json(url)
    rows=body.get("data")
    if not isinstance(rows,list) or len(rows)<3100:
        raise RuntimeError(f"Incomplete FCC county feed for {speed_code}/{area_type}: {len(rows) if isinstance(rows,list) else 'invalid'} rows")
    return rows

def main():
    filing=get_json(f"{BASE}/published/filing")
    releases=[row for row in filing.get("data",[]) if row.get("process_uuid") and row.get("filing_subtype")]
    if not releases:
        raise RuntimeError("FCC filing metadata contained no releases")
    current=max(releases,key=lambda row:release_date(row["filing_subtype"]))
    uuid=str(current["process_uuid"])
    label=str(current["filing_subtype"])
    as_of=release_date(label).date().isoformat()

    counties={}
    for key,(speed_code,speed_label) in SPEEDS.items():
        for row in fetch_rows(uuid,speed_code,"total"):
            fips=str(row.get("geography_id") or "")
            if not (len(fips)==5 and fips.isdigit()):
                continue
            entry=counties.setdefault(fips,{
                "name":str(row.get("geography_desc_full") or row.get("geography_desc") or fips)[:160],
                "totalUnits":None,
                "residentialCoveragePct":{},
            })
            units=row.get("data_type_total_units",row.get("total_units"))
            try:
                units_num=int(float(units))
                if units_num>=0:
                    entry["totalUnits"]=units_num
            except (TypeError,ValueError):
                pass
            value=row.get("percent_coverage",row.get(f"t1_2_3_6_7_{speed_code}_r"))
            entry["residentialCoveragePct"][key]=pct(value)

    for area_type,out_key in (("urban","urbanResidential100_20Pct"),("rural","ruralResidential100_20Pct")):
        for row in fetch_rows(uuid,"s4",area_type):
            fips=str(row.get("geography_id") or "")
            if fips not in counties:
                continue
            value=row.get("percent_coverage",row.get("t1_2_3_6_7_s4_r"))
            counties[fips][out_key]=pct(value)

    count=len(counties)
    if count<3100:
        raise RuntimeError(f"Incomplete normalized FCC county snapshot: {count}")
    fresno=counties.get("06019")
    if not fresno or fresno["residentialCoveragePct"].get("100_20") is None:
        raise RuntimeError("FCC validation county 06019 missing")

    now=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00","Z")
    payload={
        "source":"FCC National Broadband Map",
        "sourceUrl":"https://broadbandmap.fcc.gov/area-comparison/fixed",
        "releaseDate":as_of,
        "releaseLabel":label,
        "processUuid":uuid,
        "retrievedAt":now,
        "service":"Residential",
        "technology":"All Terrestrial",
        "technologyCodes":[1,2,3,6,7],
        "coverageDefinition":"Percent of FCC Area Summary units with provider-reported fixed broadband availability at or above each speed threshold.",
        "speedTiersMbps":{key:label for key,(_,label) in SPEEDS.items()},
        "count":count,
        "counties":dict(sorted(counties.items())),
    }
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(payload,indent=2,sort_keys=False)+"\n",encoding="utf-8")
    print(json.dumps({
        "source":payload["source"],"releaseDate":as_of,"count":count,
        "fresno100_20Pct":fresno["residentialCoveragePct"]["100_20"],
        "output":str(OUT)
    }))

if __name__=="__main__":
    main()
