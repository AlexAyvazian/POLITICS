#!/usr/bin/env python3
"""Refresh EPA AirData annual county AQI summaries for the latest complete year.

Source: annual_aqi_by_county_2025.zip from EPA AirData. The source only
contains counties with monitoring data sufficient for an annual AQI row.
Missing counties are omitted, never converted to zero.
"""
from __future__ import annotations
import csv, io, json, os, sys, time, urllib.request, zipfile
from datetime import datetime, timezone
from pathlib import Path

YEAR=2025
URL=f"https://aqs.epa.gov/aqsweb/airdata/annual_aqi_by_county_{YEAR}.zip"
CENSUS_COUNTIES="https://api.census.gov/data/2024/acs/acs5?get=NAME&for=county:*&in=state:*"
ARCGIS_MIRROR="https://services1.arcgis.com/x5wCko8UnSi4h0CB/ArcGIS/rest/services/Air_Quality_Index_By_County_1980_2025/FeatureServer/0/query"
OUTPUT=Path(f"assets/data/county/epa-aqi-{YEAR}.json")
USER_AGENT="POLITICS civic transparency project (+https://politics-e5yt.onrender.com)"
STATE_FIPS={
 "01","02","04","05","06","08","09","10","11","12","13","15","16","17","18","19",
 "20","21","22","23","24","25","26","27","28","29","30","31","32","33","34","35",
 "36","37","38","39","40","41","42","44","45","46","47","48","49","50","51","53",
 "54","55","56"
}

def _clean_key(value):
    return " ".join(str(value or "").strip().lower().replace("_"," ").split())

def _lookup(row,*names):
    normalized={_clean_key(k):v for k,v in row.items()}
    for name in names:
        key=_clean_key(name)
        if key in normalized:
            return normalized[key]
    return None

def _int(value):
    try:
        if value is None or str(value).strip()=="":
            return None
        return int(float(str(value).replace(",","").strip()))
    except (TypeError,ValueError):
        return None

def _name(value):
    return " ".join(str(value or "").strip().lower().replace(".","").replace("'","").split())

def _strip_county_suffix(value):
    text=_name(value)
    for suffix in (" county"," parish"," borough"," census area"," municipality"," city and borough"," city"):
        if text.endswith(suffix):
            text=text[:-len(suffix)]
            break
    return text.strip()

def normalize_row(row: dict, name_lookup=None):
    fips_value=_int(_lookup(row,"FIPS_County","FIPS County"))
    if fips_value is not None:
        fips=str(fips_value).zfill(5)
        state,county=fips[:2],fips[2:]
    else:
        state=str(_lookup(row,"State Code","state_code","state fips") or "").strip().zfill(2)
        county=str(_lookup(row,"County Code","county_code","county fips") or "").strip().zfill(3)
    if state not in STATE_FIPS or len(county)!=3 or not county.isdigit():
        state_name=_name(_lookup(row,"State"))
        county_name=_name(_lookup(row,"County"))
        county_simple=_strip_county_suffix(_lookup(row,"County"))
        fips=(name_lookup or {}).get((state_name,county_name)) or (name_lookup or {}).get((state_name,county_simple))
        if not fips:
            return None
        state,county=fips[:2],fips[2:]
    year=_int(_lookup(row,"Year"))
    if year not in (None,YEAR):
        return None
    days=_int(_lookup(row,"Days with AQI","Days AQI"))
    if days is None or days<0:
        return None
    good=_int(_lookup(row,"Good Days","Days Good")) or 0
    moderate=_int(_lookup(row,"Moderate Days","Days Moderate")) or 0
    sensitive=_int(_lookup(row,"Unhealthy for Sensitive Groups Days","Days Unhealthy for Sensitive Groups","Unhealthy_for_Sensitive_Groups_")) or 0
    unhealthy=_int(_lookup(row,"Unhealthy Days","Days Unhealthy")) or 0
    very=_int(_lookup(row,"Very Unhealthy Days","Days Very Unhealthy")) or 0
    hazardous=_int(_lookup(row,"Hazardous Days","Days Hazardous")) or 0
    return {
        "fips":state+county,
        "state":str(_lookup(row,"State") or "").strip()[:80],
        "county":str(_lookup(row,"County") or "").strip()[:100],
        "daysWithAqi":days,
        "goodDays":good,
        "moderateDays":moderate,
        "unhealthySensitiveDays":sensitive,
        "unhealthyDays":unhealthy,
        "veryUnhealthyDays":very,
        "hazardousDays":hazardous,
        "unhealthyOrWorseDays":sensitive+unhealthy+very+hazardous,
        "maxAqi":_int(_lookup(row,"Max AQI","Maximum AQI")),
        "p90Aqi":_int(_lookup(row,"90th Percentile AQI","90th percentile AQI","F90th_Percentile_AQI")),
        "medianAqi":_int(_lookup(row,"Median AQI")),
    }

def build_snapshot(rows, retrieved_at: str, min_count: int=850, name_lookup=None, access_path="EPA AirData annual county ZIP"):
    counties={}
    for raw in rows:
        item=normalize_row(raw,name_lookup)
        if item:
            fips=item.pop("fips")
            counties[fips]=item
    if len(counties)<min_count:
        sample_keys=sorted(str(k) for k in (rows[0].keys() if rows else []))
        raise ValueError(f"Incomplete EPA annual county AQI dataset ({len(counties)} monitored counties); CSV headers={sample_keys}")
    return {
        "source":"U.S. EPA AirData / Air Quality System",
        "dataset":f"annual_aqi_by_county_{YEAR}",
        "year":YEAR,
        "sourceUrl":"https://www.epa.gov/outdoor-air-quality-data/air-quality-index-report",
        "sourceFileUrl":URL,
        "accessPath":access_path,
        "retrievedAt":retrieved_at,
        "count":len(counties),
        "scope":"counties with annual AQI monitoring data",
        "coverage":"Annual AQI summary for counties with monitoring data reported to EPA AQS. AQI combines available criteria-pollutant measurements; monitoring coverage varies by county and pollutant.",
        "missingCountyMeaning":"A county missing from this snapshot has no 2025 annual county AQI row in the EPA source file. That is not a zero AQI value and does not mean no pollution occurred.",
        "counties":dict(sorted(counties.items())),
    }

def fetch_county_lookup():
    rows=None
    last=None
    for attempt in range(4):
        try:
            req=urllib.request.Request(CENSUS_COUNTIES,headers={"Accept":"application/json","User-Agent":USER_AGENT})
            with urllib.request.urlopen(req,timeout=90) as response:
                if response.status!=200:
                    raise RuntimeError(f"Census county lookup HTTP {response.status}")
                rows=json.load(response)
            break
        except Exception as exc:
            last=exc
            if attempt<3:
                time.sleep(1.5*(attempt+1))
    if rows is None:
        raise RuntimeError(f"Census county lookup failed after retries: {last}")
    if not isinstance(rows,list) or len(rows)<2900:
        raise RuntimeError("Incomplete Census county lookup")
    header=rows[0]
    idx={name:i for i,name in enumerate(header)}
    lookup={}
    for row in rows[1:]:
        state=str(row[idx["state"]]).zfill(2)
        county=str(row[idx["county"]]).zfill(3)
        if state not in STATE_FIPS:
            continue
        full=str(row[idx["NAME"]])
        parts=[p.strip() for p in full.split(",")]
        if len(parts)<2:
            continue
        county_name,state_name=parts[0],parts[-1]
        fips=state+county
        exact=(_name(state_name),_name(county_name))
        simple=(_name(state_name),_strip_county_suffix(county_name))
        lookup[exact]=fips
        # Only keep suffix-stripped aliases when they are unambiguous.
        if simple not in lookup:
            lookup[simple]=fips
        elif lookup[simple]!=fips:
            lookup[simple]=None
    return {k:v for k,v in lookup.items() if v}

def fetch_arcgis_mirror():
    params=urllib.parse.urlencode({
        "where":f"Date >= DATE '{YEAR}-01-01' AND Date < DATE '{YEAR+1}-01-01'",
        "outFields":"FIPS_County,Date,Days_with_AQI,Good_Days,Moderate_Days,Unhealthy_for_Sensitive_Groups_,Unhealthy_Days,Very_Unhealthy_Days,Hazardous_Days,Max_AQI,F90th_Percentile_AQI,Median_AQI,Days_CO,Days_NO2,Days_Ozone,Days_PM2_5,Days_PM10",
        "returnGeometry":"false",
        "resultRecordCount":"2000",
        "f":"json",
    })
    req=urllib.request.Request(ARCGIS_MIRROR+"?"+params,headers={"Accept":"application/json","User-Agent":USER_AGENT})
    with urllib.request.urlopen(req,timeout=90) as response:
        if response.status!=200:
            raise RuntimeError(f"EPA-derived ArcGIS mirror HTTP {response.status}")
        body=json.load(response)
    features=body.get("features") if isinstance(body,dict) else None
    if not isinstance(features,list) or len(features)<850:
        raise RuntimeError(f"EPA-derived ArcGIS mirror returned {len(features) if isinstance(features,list) else 0} rows")
    return [feature.get("attributes") or {} for feature in features]

def fetch_rows():
    local=os.environ.get("EPA_AQI_ZIP","").strip()
    if local and Path(local).is_file():
        payload=Path(local).read_bytes()
    else:
        payload=None
    if payload is None:
        last=None
        for attempt in range(5):
            try:
                req=urllib.request.Request(URL,headers={"Accept":"application/zip","User-Agent":USER_AGENT})
                with urllib.request.urlopen(req,timeout=90) as response:
                    if response.status!=200:
                        raise RuntimeError(f"EPA AirData HTTP {response.status}")
                    payload=response.read()
                break
            except Exception as exc:
                last=exc
                if attempt<4:
                    time.sleep(2*(attempt+1))
        if payload is None:
            return fetch_arcgis_mirror(),"ArcGIS feature-service mirror whose service metadata cites the EPA AirData annual source"
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        names=[n for n in archive.namelist() if n.lower().endswith(".csv")]
        if not names:
            raise RuntimeError("EPA ZIP contains no CSV")
        with archive.open(names[0]) as raw:
            text=io.TextIOWrapper(raw,encoding="utf-8-sig",newline="")
            return list(csv.DictReader(text)),"EPA AirData annual county ZIP"

def main():
    rows,access_path=fetch_rows()
    lookup=fetch_county_lookup()
    now=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00","Z")
    snapshot=build_snapshot(rows,now,name_lookup=lookup,access_path=access_path)
    if OUTPUT.exists():
        try:
            old=json.loads(OUTPUT.read_text(encoding="utf-8"))
            comparable_keys=("source","dataset","year","count","scope","coverage","missingCountyMeaning","counties")
            if all(old.get(k)==snapshot.get(k) for k in comparable_keys):
                print(f"EPA AQI unchanged: {snapshot['count']} monitored counties")
                return 0
        except Exception:
            pass
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(snapshot,separators=(",",":"),sort_keys=True)+"\n",encoding="utf-8")
    print(f"Wrote EPA annual AQI for {snapshot['count']} monitored counties to {OUTPUT}")
    return 0

if __name__=="__main__":
    sys.exit(main())
