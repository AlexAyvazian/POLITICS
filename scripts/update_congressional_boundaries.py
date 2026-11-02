#!/usr/bin/env python3
"""Prebuild authoritative congressional and state legislative GeoJSON for website visitors.

No browser ever queries Census. GitHub Actions checks once per day; last good
files remain in place when a provider request fails. Python standard library.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
import argparse
import json
import math
from pathlib import Path
import random
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "assets" / "data" / "congressional"
CENSUS = "https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2025/Legislative/MapServer"
LAYERS = {"house": 5, "stateSenate": 8, "stateHouse": 9}
FIPS = ("01 02 04 05 06 08 09 10 11 12 13 15 16 17 18 19 20 21 22 23 24 "
        "25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 44 45 "
        "46 47 48 49 50 51 53 54 55 56").split()
# Nebraska has a unicameral Senate; D.C. has no state legislative chambers.
NO_CHAMBER = {("stateHouse", "31"), ("stateHouse", "11"), ("stateSenate", "11")}


def endpoint(layer: str, state: str, count_only: bool = False) -> str:
    assert layer in LAYERS and state in FIPS
    params = {"where": "STATE='" + state + "'", "f": "json" if count_only else "geojson"}
    if count_only:
        params["returnCountOnly"] = "true"
    else:
        params.update({"outFields": "GEOID,BASENAME,STATE",
                       "outSR": "4326", "returnGeometry": "true",
                       "geometryPrecision": "4"})
    return f"{CENSUS}/{LAYERS[layer]}/query?{urlencode(params)}"


def request_json(url: str, attempts: int = 3) -> dict:
    for attempt in range(attempts):
        try:
            req = Request(url, headers={"Accept": "application/json",
                                        "User-Agent": "POLITICS-Atlas-Boundary-Snapshot/1.0"})
            with urlopen(req, timeout=70) as response:
                result = json.load(response)
            if not isinstance(result, dict) or result.get("error"):
                raise ValueError(f"Census returned an error: {str(result)[:250]}")
            return result
        except (TimeoutError, HTTPError, URLError, ValueError, OSError) as error:
            if attempt == attempts - 1:
                raise RuntimeError(str(error)) from error
            time.sleep(min(18, 3 * 2 ** attempt + random.random()))
    raise RuntimeError("Unreachable")


def validate(layer: str, state: str, data: dict, count: int) -> dict:
    if data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list):
        raise ValueError(f"{layer}/{state}: missing FeatureCollection")
    features = data["features"]
    if len(features) != count:
        raise ValueError(f"{layer}/{state}: expected {count} polygons, received {len(features)}")
    expected_length = 4 if layer == "house" else 5
    for feature in features:
        props, geometry = feature.get("properties") or {}, feature.get("geometry") or {}
        geoid = props.get("GEOID")
        if not isinstance(geoid, str) or len(geoid) != expected_length or not geoid.startswith(state):
            raise ValueError(f"{layer}/{state}: invalid district GEOID {geoid}")
        if str(props.get("STATE")) != state or geometry.get("type") not in ("Polygon", "MultiPolygon"):
            raise ValueError(f"{layer}/{state}: unexpected state or geometry type")
        if not geometry.get("coordinates"):
            raise ValueError(f"{layer}/{state}: empty district coordinates")
    return {"type": "FeatureCollection", "features": sorted(features, key=lambda f: f["properties"]["GEOID"])}


def squared_line_distance(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    if dx == dy == 0:
        return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2
    t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
    return (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2


def simplify_ring(ring, tolerance=0.015):
    """Use simplified national overview only; retain full resolution for state files."""
    if len(ring) <= 5:
        return ring
    pts = ring[:-1] if ring[0] == ring[-1] else ring
    if len(pts) < 4:
        return ring
    keep = {0, len(pts) - 1}
    queue = [(0, len(pts) - 1)]
    while queue:
        start, end = queue.pop()
        if end - start <= 1:
            continue
        index = max(range(start + 1, end),
                    key=lambda i: squared_line_distance(pts[i], pts[start], pts[end]))
        if squared_line_distance(pts[index], pts[start], pts[end]) > tolerance ** 2:
            keep.add(index)
            queue.extend([(start, index), (index, end)])
    result = [pts[i] for i in sorted(keep)]
    if len(result) < 3:
        return ring
    result.append(result[0])
    return result


def overview_geometry(geometry):
    def simplify_polygon(polygon):
        return [simplify_ring(ring) for ring in polygon]
    if geometry["type"] == "Polygon":
        return {"type": "Polygon", "coordinates": simplify_polygon(geometry["coordinates"])}
    return {"type": "MultiPolygon", "coordinates":
            [simplify_polygon(polygon) for polygon in geometry["coordinates"]]}


def store(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n"
    if path.exists() and path.read_text(encoding="utf-8") == serialized:
        return
    temp = path.with_name(path.name + ".pending")
    temp.write_text(serialized, encoding="utf-8")
    temp.replace(path)


def build_one(layer: str, state: str) -> tuple[str, str, int]:
    path = DATA / layer / f"{state}.geojson"
    if (layer, state) in NO_CHAMBER:
        store(path, {"type": "FeatureCollection", "features": []})
        return layer, state, 0
    expected = request_json(endpoint(layer, state, count_only=True)).get("count")
    if not isinstance(expected, int) or expected < 1:
        raise ValueError(f"{layer}/{state}: invalid Census district count {expected}")
    data = validate(layer, state, request_json(endpoint(layer, state)), expected)
    store(path, data)
    return layer, state, expected


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=3)
    args = parser.parse_args()
    failures = []
    jobs = [(layer, fips) for layer in LAYERS for fips in FIPS]
    with ThreadPoolExecutor(max_workers=min(4, max(1, args.workers))) as executor:
        tasks = {executor.submit(build_one, layer, fips): (layer, fips) for layer, fips in jobs}
        for future in as_completed(tasks):
            layer, state = tasks[future]
            try:
                _, _, count = future.result()
                print(f"OK {layer}/{state}: {count} districts", flush=True)
            except Exception as exc:
                path = DATA / layer / f"{state}.geojson"
                if path.exists():
                    print(f"RETAIN prior {layer}/{state}: {exc}", flush=True)
                else:
                    failures.append(f"{layer}/{state}: {exc}")
                    print(f"MISSING {layer}/{state}: {exc}", flush=True)
    if failures:
        print("No initial data for: " + "; ".join(failures), flush=True)
        return 1

    national_features = []
    manifest = {"source": "U.S. Census Bureau TIGERweb / Generalized_ACS2025",
                "mapVintage": {"house": "119th Congress (January 2025)",
                               "stateSenate": "2024 districts",
                               "stateHouse": "2024 districts"},
                "states": FIPS, "counts": {}}
    for layer in LAYERS:
        counts = {}
        for fips in FIPS:
            data = json.loads((DATA / layer / f"{fips}.geojson").read_text(encoding="utf-8"))
            counts[fips] = len(data["features"])
            if layer == "house":
                for feature in data["features"]:
                    national_features.append({**feature, "geometry": overview_geometry(feature["geometry"])})
        manifest["counts"][layer] = counts

    if len(national_features) < 430:
        raise ValueError(f"National congressional map incomplete: {len(national_features)} districts")
    store(DATA / "US-house.geojson",
          {"type": "FeatureCollection", "features": sorted(national_features, key=lambda f: f["properties"]["GEOID"])})
    store(DATA / "manifest.json", manifest)
    print(f"Ready: {len(national_features)} national districts; {len(jobs)} state/layer files", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
