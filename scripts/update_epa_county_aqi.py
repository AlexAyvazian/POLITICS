#!/usr/bin/env python3
"""Refresh EPA AirData 2025 annual AQI summaries by county.

The official annual AQI-by-county file contains one row per county with a
reported annual AQI summary. Counties absent from the file are missing
monitoring/reporting coverage, not zero pollution.
"""
from __future__ import annotations
import csv
import io
import json
import re
import urllib.request
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path

YEAR=2025
URL=f"https://aqs.epa.gov/aqsweb/airdata/annual_aqi_by_county_{YEAR}.zip"
OUTPUT=Path(f"assets/data/county/epa-aqi-{YEAR}.json")
STATE_ABBR={
"Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO","Connecticut":"CT",
"Delaware":"DE","District Of Columbia":"DC","District of Columbia":"DC","Florida":"FL","Georgia":"GA","Hawaii":"HI",
"Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA","Maine":"ME",
"Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT",
"Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY",
"North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA",
"Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT",
"Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY"
}

def county_key(name: str) -> str:
    value=re.sub(r"\s+"," ",str(name or "").strip().lower())
    for suffix in (" city and borough"," census area"," municipality"," borough"," parish"," county"," city"):
        if value.endswith(suffix):
            value=value[:-len(suffix)].strip()
            break
    return re.sub(r"[^a-z0-9]+"," ",value).strip()

def number(row,name,default=0):
    raw=row.get(name)
    if raw is None or str(raw).strip()=="":
        return default
    try:return int(float(str(raw).replace(",","").strip()))
    except ValueError:return default

def parse_csv(handle) -> dict:
    reader=csv.DictReader(handle)
    required={
      "State","County","Year","Days with AQI","Good Days","Moderate Days",
      "Unhealthy for Sensitive Groups Days","Unhealthy Days","Very Unhealthy Days",
      "Hazardous Days","Max AQI","90th Percentile AQI","Median AQI"
    }
    fields=set(reader.fieldnames or [])
    missing=required-fields
    if missing:
        raise ValueError("EPA annual AQI file missing columns: "+", ".join(sorted(missing)))
    counties={}
    for row in reader:
        if number(row,"Year")!=YEAR:
            continue
        state_name=str(row.get("State") or "").strip()
        abbr=STATE_ABBR.get(state_name)
        county=str(row.get("County") or "").strip()
        key=county_key(county)
        if not abbr or not key:
            continue
        usg=number(row,"Unhealthy for Sensitive Groups Days")
        unhealthy=number(row,"Unhealthy Days")
        very=number(row,"Very Unhealthy Days")
        hazardous=number(row,"Hazardous Days")
        counties[f"{abbr}|{key}"]={
          "state":abbr,"county":county,
          "daysWithAqi":number(row,"Days with AQI"),
          "goodDays":number(row,"Good Days"),
          "moderateDays":number(row,"Moderate Days"),
          "unhealthySensitiveDays":usg,
          "unhealthyDays":unhealthy,
          "veryUnhealthyDays":very,
          "hazardousDays":hazardous,
          "aqiAbove100Days":usg+unhealthy+very+hazardous,
          "maxAqi":number(row,"Max AQI"),
          "p90Aqi":number(row,"90th Percentile AQI"),
          "medianAqi":number(row,"Median AQI"),
          "daysCO":number(row,"Days CO"),
          "daysNO2":number(row,"Days NO2"),
          "daysOzone":number(row,"Days Ozone"),
          "daysPM25":number(row,"Days PM2.5"),
          "daysPM10":number(row,"Days PM10"),
        }
    return counties

def build_snapshot(counties: dict,retrieved_at: str) -> dict:
    states=defaultdict(lambda:{
      "monitoredCounties":0,"countyDaysWithAqi":0,"goodCountyDays":0,"moderateCountyDays":0,
      "aqiAbove100CountyDays":0,"maxCountyAqi":0
    })
    for row in counties.values():
        agg=states[row["state"]]
        agg["monitoredCounties"]+=1
        agg["countyDaysWithAqi"]+=row["daysWithAqi"]
        agg["goodCountyDays"]+=row["goodDays"]
        agg["moderateCountyDays"]+=row["moderateDays"]
        agg["aqiAbove100CountyDays"]+=row["aqiAbove100Days"]
        agg["maxCountyAqi"]=max(agg["maxCountyAqi"],row["maxAqi"])
    return {
      "source":"U.S. EPA AirData",
      "dataset":"Annual AQI by County",
      "year":YEAR,
      "retrievedAt":retrieved_at,
      "sourceUrl":"https://aqs.epa.gov/aqsweb/airdata/download_files.html#Annual",
      "fileUrl":URL,
      "countyCount":len(counties),
      "coverage":"EPA annual AQI summaries cover counties with reported AQI monitoring data. Many areas monitor some, but not all, criteria pollutants. A county with no annual AQI record is missing monitoring/reporting coverage, not zero pollution. State totals are monitored county-days, not statewide exposure or calendar-day counts.",
      "counties":counties,
      "states":dict(states),
    }

def fetch() -> dict:
    req=urllib.request.Request(URL,headers={"User-Agent":"POLITICS civic transparency project","Accept":"application/zip"})
    with urllib.request.urlopen(req,timeout=90) as response:
        blob=response.read()
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        csv_names=[n for n in archive.namelist() if n.lower().endswith(".csv")]
        if not csv_names:raise ValueError("EPA archive contains no CSV")
        with archive.open(csv_names[0]) as raw:
            text=io.TextIOWrapper(raw,encoding="utf-8-sig",newline="")
            counties=parse_csv(text)
    if len(counties)<800 or len(counties)>1300:
        raise ValueError(f"Unexpected EPA monitored-county count: {len(counties)}")
    return build_snapshot(counties,date.today().isoformat())

def main() -> int:
    data=fetch()
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(data,separators=(",",":"),sort_keys=True)+"\n",encoding="utf-8")
    print(f"Wrote {data['countyCount']} monitored counties to {OUTPUT}")
    return 0

if __name__=="__main__":
    raise SystemExit(main())
