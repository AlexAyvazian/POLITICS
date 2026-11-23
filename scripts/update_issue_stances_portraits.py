#!/usr/bin/env python3
"""Build a static, keyless portrait manifest for the Voterist Issue Stances hall.

Runs in GitHub Actions; visitors read a static JSON file (zero third-party
lookup requests per visitor). Every identity join uses exact candidate name
and state plus a source record. Never assign a random portrait or infer it
from a party label.
"""
from __future__ import annotations

import csv
import io
import json
import re
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets/data/issue-stances/portraits.json"
PHOTO_DIR = ROOT / "assets/img/issue-portraits"
VOTERIST = "https://www.voterist.com/api/public/candidates"
OPENSTATES = "https://data.openstates.org/people/current/{state}.csv"
WIKIPEDIA = "https://en.wikipedia.org/w/api.php"
UA = "POLITICS-IssueStances/1.0 (https://politics-e5yt.onrender.com)"
STATES = dict(zip(
 "AL AK AZ AR CA CO CT DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY DC".split(),
 "Alabama Alaska Arizona Arkansas California Colorado Connecticut Delaware Florida Georgia Hawaii Iowa Idaho Illinois Indiana Kansas Kentucky Louisiana Massachusetts Maryland Maine Michigan Minnesota Missouri Mississippi Montana North-Carolina North-Dakota Nebraska New-Hampshire New-Jersey New-Mexico Nevada New-York Ohio Oklahoma Oregon Pennsylvania Rhode-Island South-Carolina South-Dakota Tennessee Texas Utah Virginia Vermont Washington Wisconsin West-Virginia Wyoming District-of-Columbia".split()
))
# Display names for matching textual Wikipedia leads.
STATES = {key: value.replace("-", " ") for key, value in STATES.items()}
POLITICIAN = re.compile(r"\b(politic(?:ian|al)|governor|senator|legislator|representative|congress(?:man|woman|person)?|mayor|attorney general|secretary of state|state assembly|state house|lieutenant governor)\b", re.I)
WEB_IMAGE = re.compile(r"^https://[^\s<>\"']{8,650}$", re.I)
WIKI_IMAGE = re.compile(r"^https://upload\.wikimedia\.org/wikipedia/commons/", re.I)


def fetch(url: str, cap: int = 5_000_000):
    request = Request(url, headers={"Accept": "application/json, text/csv;q=0.8", "User-Agent": UA})
    with urlopen(request, timeout=28) as response:
        raw = response.read(cap + 1)
    if len(raw) > cap:
        raise ValueError("Oversized source response")
    return raw.decode("utf-8-sig")


def clean_name(name: str):
    s = unicodedata.normalize("NFKD", str(name or ""))
    s = "".join(x for x in s if not unicodedata.combining(x))
    parts = [re.sub(r"[^a-z0-9]", "", v.lower()) for v in s.split()]
    parts = [p for p in parts if p not in {"jr", "sr", "ii", "iii", "iv"}]
    return (parts[0] + "-" + parts[-1]) if len(parts) >= 2 else "".join(parts)


def state_from(row):
    direct = str(row.get("state") or row.get("stateCode") or "").upper()
    if direct in STATES:
        return direct
    m = re.match(r"^us\.([a-z]{2})(?:\.|$)", str(row.get("jurisdictionId") or ""), re.I)
    if not m:
        m = re.match(r"^([a-z]{2})\.20\d\d\.", str(row.get("electionId") or ""), re.I)
    code = m.group(1).upper() if m else ""
    return code if code in STATES else ""


def party_kind(party):
    p = str(party or "").lower()
    dem = bool(re.search(r"\bdem\b|democrat|democratic|dfl\b", p))
    rep = bool(re.search(r"\brep\b|republican|\bgop\b", p))
    return "dem" if dem and not rep else "rep" if rep and not dem else "other"


def get_directory():
    value = json.loads(fetch(VOTERIST))
    rows = value.get("candidates") or []
    if not isinstance(rows, list) or len(rows) < 100:
        raise ValueError("Candidate directory is missing or unexpectedly short")
    candidates = []
    for row in rows:
        slug = row.get("slug")
        state = state_from(row)
        name = str(row.get("name") or "").strip()
        if not slug or not state or not name:
            continue
        candidates.append({
            "slug": slug, "state": state, "name": name, "nameKey": clean_name(name),
            "party": party_kind(row.get("party")), "office": row.get("office") or ""
        })
    return candidates


def openstates_photos(state):
    text = fetch(OPENSTATES.format(state=state.lower()), 6_000_000)
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or "name" not in reader.fieldnames:
        raise ValueError("No state legislator rows")
    output = {}
    for row in reader:
        image = (row.get("image") or row.get("image_url") or "").strip()
        name = (row.get("name") or "").strip()
        key = clean_name(name)
        if key and WEB_IMAGE.match(image):
            output.setdefault(key, []).append({
                "url": image, "name": name,
                "party": party_kind(row.get("current_party")),
                "state": state
            })
    return state, output


def official_photos(candidates, states):
    by_state = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        jobs = {pool.submit(openstates_photos, state): state for state in states}
        for task in as_completed(jobs):
            state = jobs[task]
            try:
                code, entries = task.result()
                by_state[code] = entries
                print("Official photo source", state, sum(map(len, entries.values())))
            except Exception as exc:
                print("State images unavailable", state, str(exc)[:180])
    found = {}
    for person in candidates:
        matches = by_state.get(person["state"], {}).get(person["nameKey"], [])
        # An exact, unambiguous first+last/state match is required. If an
        # official party is known and conflicts, don't guess the identity.
        matches = [p for p in matches if
                   (p["party"] == person["party"] or
                    p["party"] == "other" or person["party"] == "other")]
        if len(matches) != 1:
            continue
        photo = matches[0]
        found[person["slug"]] = {
            "url": photo["url"], "source": "Open States official legislator portrait",
            "creditUrl": "https://open.pluralpolicy.com/data/legislator-csv/"
        }
    return found


def wikipedia_titles(people):
    names = set()
    for p in people:
        names.add(p["name"])
        names.add(p["name"] + " (politician)")
        names.add(p["name"] + " (American politician)")
    return sorted(names)


def wiki_batch(titles):
    url = WIKIPEDIA + "?" + urlencode({
        "action": "query", "format": "json", "formatversion": "2",
        "redirects": "1", "prop": "pageimages|pageterms|extracts|pageprops",
        "piprop": "thumbnail", "pithumbsize": "480", "wbptterms": "description",
        "exintro": "1", "explaintext": "1", "exsentences": "4",
        "titles": "|".join(titles)
    })
    result = json.loads(fetch(url, 1_800_000))
    return result.get("query", {}).get("pages", [])


def match_wikipedia_page(person, page):
    """Accept only an actual article for a politician in the right state."""
    if not isinstance(page, dict) or page.get("missing") or page.get("pageprops", {}).get("disambiguation") is not None:
        return False
    title = str(page.get("title") or "")
    stem = re.sub(r"\s*\([^)]*\)\s*$", "", title)
    if clean_name(stem) != person["nameKey"]:
        return False
    url = (page.get("thumbnail") or {}).get("source") or ""
    if not WIKI_IMAGE.match(url):
        return False
    desc = " ".join((page.get("terms") or {}).get("description") or [])
    lead = page.get("extract") or ""
    if not POLITICIAN.search(desc + " " + lead):
        return False
    state_name = STATES[person["state"]]
    # Require explicit geographical evidence. A matching name alone is not
    # sufficient to identify the right person, particularly for common names.
    if not re.search(r"\b" + re.escape(state_name) + r"\b", desc + " " + lead, re.I):
        return False
    return True


def wikipedia_photos(people):
    titles = wikipedia_titles(people)
    pages = []
    batches = [titles[i:i + 35] for i in range(0, len(titles), 35)]
    # Sequential polite requests; a modest 0.2 s between batches.
    for i, batch in enumerate(batches):
        try:
            pages.extend(wiki_batch(batch))
        except Exception as exc:
            print("Wikipedia batch failed", i, str(exc)[:190])
        time.sleep(.20)
    candidates = {}
    for person in people:
        matches = [page for page in pages if match_wikipedia_page(person, page)]
        urls = {page["thumbnail"]["source"] for page in matches}
        # Two different pages with matching first/last and state are ambiguous.
        if len(urls) != 1:
            continue
        page = matches[0]
        title = quote(page["title"].replace(" ", "_"), safe="()")
        candidates[person["slug"]] = {
            "url": page["thumbnail"]["source"],
            "source": "Wikipedia / Wikimedia Commons portrait",
            "creditUrl": "https://en.wikipedia.org/wiki/" + title
        }
    return candidates


def cache_photos(photos):
    """Download identity-matched public portraits once, for local WebGL loading.

    Browser WebGL texture loading requires image CORS; official state pages may
    not set a usable Access-Control-Allow-Origin header. Locally serving a
    bounded thumbnail is both faster and avoids per-visitor upstream requests.
    Original photo URLs and source credits stay in portraits.json.
    """
    from PIL import Image, ImageOps, UnidentifiedImageError

    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    saved = 0
    failed = 0
    reused = 0
    for slug, record in photos.items():
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,150}", slug):
            continue
        dest = PHOTO_DIR / (slug + ".webp")
        local_path = "assets/img/issue-portraits/" + slug + ".webp"
        if dest.exists() and dest.stat().st_size > 1000:
            record["localUrl"] = local_path
            reused += 1
            continue
        urls = [record.get("url"), record.get("backupUrl")]
        for url in urls:
            if not isinstance(url, str) or not WEB_IMAGE.match(url):
                continue
            try:
                headers = {"User-Agent": UA, "Accept": "image/avif,image/webp,image/jpeg,image/png,image/*"}
                request = Request(url, headers=headers)
                with urlopen(request, timeout=16) as response:
                    content_type = response.headers.get("Content-Type", "").lower()
                    if not content_type.startswith("image/"):
                        raise ValueError("Source did not return an image")
                    raw = response.read(5_500_001)
                if len(raw) > 5_500_000:
                    raise ValueError("Photo exceeds cache image limit")
                image = Image.open(io.BytesIO(raw))
                image = ImageOps.exif_transpose(image)
                image.thumbnail((440, 580), Image.Resampling.LANCZOS)
                image = image.convert("RGB")
                tmp = dest.with_suffix(".pending.webp")
                image.save(tmp, "WEBP", quality=82, method=4)
                tmp.replace(dest)
                record["localUrl"] = local_path
                saved += 1
                break
            except (OSError, ValueError, UnidentifiedImageError, Exception) as error:
                print("Photo cache source unavailable:", slug, str(error)[:120])
        else:
            failed += 1
    print("Local portrait cache: saved", saved, "reused", reused, "unavailable", failed)
    return saved + reused


def main():
    people = get_directory()
    states = sorted({person["state"] for person in people})
    official = official_photos(people, states)
    wiki = wikipedia_photos(people)
    # Wikimedia thumbnails are broadly WebGL-CORS accessible. When an
    # exact-match official photo is also available, keep it as a backup.
    photos = dict(official)
    for slug, record in wiki.items():
        entry = dict(record)
        if slug in official and official[slug]["url"] != record["url"]:
            entry["backupUrl"] = official[slug]["url"]
        photos[slug] = entry
    print("Photo matches: official =", len(official), "Wikimedia =", len(wiki),
          "combined =", len(photos))
    if not photos:
        raise SystemExit("No source-verified portrait matches; retaining old file")
    cache_photos(photos)
    doc = {"source": "POLITICS cached official state portraits and Wikipedia verified identity matches",
           "candidateCount": len(people),
           "photoCount": len(photos),
           "candidates": {key: photos[key] for key in sorted(photos)}}
    serialized = json.dumps(doc, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    if OUTPUT.exists() and OUTPUT.read_text("utf-8") == serialized:
        print("Portrait cache unchanged", len(photos), "for", len(people), "candidate records")
        return
    tmp = OUTPUT.with_suffix(".json.pending")
    tmp.write_text(serialized, encoding="utf-8")
    tmp.replace(OUTPUT)
    print("Saved", len(photos), "verified portraits for", len(people), "candidate records")


if __name__ == "__main__":
    main()
