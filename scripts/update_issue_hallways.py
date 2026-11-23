"""Refresh the two Issue Stances directories from office, result and candidacy records."""
import csv
import io
import json
import gzip
import os
import re
import subprocess
import unicodedata
import zipfile
from datetime import date, timedelta, datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import unquote, urlencode, urljoin, urlsplit
from xml.etree import ElementTree
from lxml import html
from update_issue_stances_portraits import STATES, state_from, wikipedia_photos, clean_name

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/data/issue-stances/hallways.json"
CURRENT = "https://unitedstates.github.io/congress-legislators/legislators-current.json"
NGA = "https://www.nga.org/governors/"
VOTERIST = "https://www.voterist.com/api/public/candidates"


def read(url, optional=False):
    response = subprocess.run(["curl", "--compressed", "--retry", "2", "--max-time", "35", "-sSL", "-w", "%{http_code}", url], capture_output=True, check=True).stdout
    if optional and response[-3:] == b"404":
        return None
    if response[-3:] != b"200":
        raise RuntimeError(f"HTTP {response[-3:].decode()} from {url.split('?')[0]}")
    body = response[:-3]
    return gzip.decompress(body) if body.startswith(b"\x1f\x8b") else body


def norm(name):
    return re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()).strip("-")


def row(slug, name, office, state, party, source, **extra):
    return dict(slug=slug, name=name, office=office, state=state, party=party or "Unaffiliated / unspecified", source=source, **extra)


CONGRESSES = {119: ("2025-01-03", "2027-01-03"), 120: ("2027-01-03", "2029-01-03")}
NPR = "https://apps.npr.org/2026-election-results/"
TERRITORIES = {"DC", "AS", "MP", "GU", "VI"}


def election_winners():
    for chamber, title, expected in [("house", "Representative", 435), ("senate", "Senator", 35)]:
        races = json.loads(read(NPR + "data/" + chamber + ".json"))["results"]
        if len({race["id"] for race in races}) < expected:
            raise ValueError(f"Incomplete 2026 {chamber} election feed")
        for race in races:
            if race.get("test") or not race.get("called"):
                continue
            for candidate in race["candidates"]:
                if candidate.get("winner") == "X":
                    party = {"Dem": "Democratic", "GOP": "Republican"}.get(candidate["party"], candidate["party"])
                    yield (race["state"], title, int(race["seatNumber"]), candidate["first"] + " " + candidate["last"],
                           party, bool(candidate.get("incumbent")), NPR + chamber + ".html")
    # The national race feed covers the 435 voting seats. The five delegates
    # are elected separately. Puerto Rico's resident commissioner serves four years.
    for state, name, party, incumbent, source in [
        ("AS", "Aumua Amata Coleman Radewagen", "Republican", True, "https://pina.com.fj/2026/11/05/guam-elects-democrat-northern-marianas-retains-republican-delegate-as-american-samoa-re-elects-amata/"),
        ("MP", "Kimberlyn King-Hinds", "Republican", True, "https://www.islapublic.org/news/2026-11-04/king-hinds-wins-reelection-in-landslide-governor-ag-races-head-to-runoff"),
        ("DC", "Robert White", "Democratic", False, "https://www.washingtonpost.com/elections/results/2026/11/03/dc-house-delegate-rosado-white-live-updates/"),
        ("GU", "Alicia Limtiaco", "Democratic", False, "https://gec.guam.gov/2026/"),
        ("VI", "Janelle K. Sarauw", "Democratic", False, "https://vivote.gov/wp-content/uploads/2026/11/2026-General-Election-Certification-11.03.2026.pdf"),
    ]:
        yield state, "Delegate", 0, name, party, incumbent, source


def congress_directory(number):
    offset = 0
    collected = {}
    while True:
        params = {"format": "json", "limit": 250, "offset": offset,
                  "api_key": os.getenv("CONGRESS_API_KEY") or "DEMO_KEY"}
        batch = json.loads(read(f"https://api.congress.gov/v3/member/congress/{number}?" + urlencode(params)))
        for member in batch["members"]:
            collected[member["bioguideId"]] = member
        offset += len(batch["members"])
        if offset >= batch["pagination"]["count"]:
            break
        if not batch["members"]:
            raise ValueError(f"Incomplete Congress.gov pagination for {number}")
    if len(collected) != batch["pagination"]["count"]:
        raise ValueError(f"Incomplete Congress.gov roster for {number}")
    return collected


def officials(today):
    result, identities = [], []
    as_of = today.isoformat()
    members = {}
    for url in [CURRENT.replace("-current", "-historical"), CURRENT]:
        for member in json.loads(read(url)):
            members[member["id"]["bioguide"]] = member
    sitting_senators = {m.findtext("bioguide_id") for m in ElementTree.fromstring(read(
        "https://www.senate.gov/general/contact_information/senators_cfm.xml")).findall("member")}
    for bio, member in members.items():
        terms = [t for t in member["terms"] if t["end"] > CONGRESSES[119][0]
                 and t["start"] < CONGRESSES[120][1] and t["start"] <= as_of]
        if not terms:
            continue
        congresses = [number for number, (start, end) in CONGRESSES.items()
                      if any(t["start"] < end and t["end"] > start for t in terms)]
        term = terms[-1]
        state = term["state"]
        title = "Senator" if term["type"] == "sen" else "Representative"
        if title == "Representative" and (state in TERRITORIES or state == "PR"):
            title = "Resident Commissioner" if state == "PR" else "Delegate"
        names = member["name"]
        name = names.get("official_full") or names["first"] + " " + names["last"]
        variants = {name, names["first"] + " " + names["last"], names.get("nickname", "") + " " + names["last"]}
        entry = row(bio.lower(), name, title, state, term["party"], "https://bioguide.congress.gov/search/bio/"+bio,
                    congresses=congresses, portrait=f"https://unitedstates.github.io/images/congress/225x275/{bio}.jpg")
        if member["id"].get("fec"):
            entry["fecIds"] = member["id"]["fec"]
        if term["end"] <= as_of and bio not in sitting_senators:
            entry["former"] = True
        if bio == "H001103" and 120 not in congresses and as_of < CONGRESSES[120][0]:
            # The resident commissioner elected in 2024 has a four-year term.
            congresses.append(120)
        identities.append((entry, variants, term))
        result.append(entry)

    by_id = {r["slug"].upper(): r for r in result}
    codes = {name: code for code, name in STATES.items()}
    codes.update({"Puerto Rico": "PR", "Guam": "GU", "American Samoa": "AS",
                  "Northern Mariana Islands": "MP", "Virgin Islands": "VI"})
    for number in CONGRESSES:
        for bio, record in congress_directory(number).items():
            if bio not in by_id:
                term = record["terms"]["item"][-1]
                state = codes[record["state"]]
                last, _, first = record["name"].partition(", ")
                name = (first + " " + last).strip()
                title = "Senator" if term["chamber"] == "Senate" else (
                    "Delegate" if state in TERRITORIES else "Resident Commissioner" if state == "PR" else "Representative")
                entry = row(bio.lower(), name, title, state, record["partyName"],
                            "https://bioguide.congress.gov/search/bio/"+bio, congresses=[])
                by_id[bio] = entry
                result.append(entry)
                identities.append((entry, {name}, {}))
            entry = by_id[bio]
            if number not in entry["congresses"]:
                entry["congresses"].append(number)
            image = (record.get("depiction") or {}).get("imageUrl")
            if image:
                entry["officialPortrait"] = image
                entry.setdefault("portrait", image)

    if date(2026, 11, 3) <= today < date(2027, 1, 3):
        for state, title, seat, winner, party, incumbent, source in election_winners():
            pool = [(r, names, term) for r, names, term in identities if r["state"] == state]
            matches = [r for r, names, _ in pool if any(clean_name(winner) == clean_name(n) for n in names)]
            if not matches and incumbent:
                # Redistricting can change a returning incumbent's district number.
                matches = [r for r, names, _ in pool if r["office"] == title and not r.get("former")
                           and any(norm(n).split("-")[-1] == norm(winner).split("-")[-1] for n in names)]
            if len(matches) == 1:
                entry = matches[0]
                if 120 not in entry["congresses"]:
                    entry["congresses"].append(120)
                if entry["office"] != title or entry.get("former"):
                    entry["incomingOffice"] = title+"-elect"
            else:
                slug = "elect-" + norm(f"{state}-{seat}-{title}-{winner}")
                entry = row(slug, winner, title+"-elect", state, party, source, congresses=[120])
                result.append(entry)
            entry["electionSource"] = source
    if today >= date(2027, 1, 3) and sum(120 in r["congresses"] for r in result) < 500:
        raise ValueError("120th term data is incomplete; retaining the previous hallway snapshot")
    gov = html.fromstring(read(NGA))
    codes = {name: code for code,name in STATES.items() if code != "DC"}
    parties = {}
    party_page = html.fromstring(read("https://en.wikipedia.org/wiki/List_of_current_United_States_governors"))
    for tr in party_page.xpath('//table[contains(@class,"wikitable")]//tr'):
        cells = [c.text_content().strip() for c in tr.xpath('./td|./th')]
        if len(cells) >= 5:
            parties[(cells[0].split(" (")[0], norm(re.sub(r"\[[^\]]*\]", "", cells[2])))] = next((x for x in cells[3:5] if x in ("Democratic","Republican","Independent")), "")
    governors = {}
    for item in gov.xpath('//li[@class="current-governors__item"]'):
        state_name = item.xpath('string(.//small[@class="state"])').strip()
        if state_name not in codes:
            continue
        state = codes[state_name]
        name = item.xpath('string(.//img/@alt)').strip() or item.xpath('string(.//div[@class="current-governors__item__link"]/text()[last()])').strip().removeprefix("Gov. ")
        governors[state] = row("governor-"+state.lower(), name, "Governor", state, parties.get((state_name,norm(name))),
                               item.xpath('string(.//a/@href)'), portrait=item.xpath('string(.//img/@src)'))
    if len(governors) != 50 or len(result) < 500:
        raise ValueError("Incomplete serving roster")
    return result + list(governors.values())


def november_election(year):
    first = date(year,11,1)
    return first + timedelta(days=(7-first.weekday())%7+1)


def declared_race(spec):
    url, year, state, office = spec
    raw = read(url, optional=True)
    if not raw: return []
    doc = html.fromstring(raw)
    if year == date.today().year:
        info=doc.xpath('(//table[contains(@class,"infobox")])[1]')
        dates=[] if not info else re.findall(r"(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, "+str(year),info[0].text_content())
        if not dates or datetime.strptime(dates[0],"%B %d, %Y").date()<date.today():return []
    campaigns = {}
    for a in doc.xpath('//section[@aria-labelledby="External_links"]/ul/li/a[starts-with(@href,"https://")]'):
        label = re.sub(r"\s*(\([A-Z]+\)|for .*)$", "", a.text_content()).strip()
        campaigns[norm(label)] = a.get("href")
    records = []
    for section in doc.xpath('//section[starts-with(@aria-labelledby,"Declared") or starts-with(@aria-labelledby,"Filed")]'):
        headings = [s.get("aria-labelledby","") for s in section.iterancestors("section")]
        party = next((p for p in ("Democratic","Republican","Independent","Libertarian","Green") if any(h.startswith(p) for h in headings)), "")
        for li in section.xpath('./ul/li'):
            name = re.split(r",|\[",li.text_content())[0].strip()
            affiliation = re.search(r"\s*\((Democratic|Republican|Independent|Libertarian|Green|write-in|no party affiliation; write-in)\)$", name, re.I)
            listed_party = party
            if affiliation:
                name = name[:affiliation.start()].strip()
                if affiliation[1].lower() in ("democratic","republican","independent","libertarian","green"):
                    listed_party = affiliation[1].title()
            if not 1 < len(name.split()) <= 7 or not li.xpath('.//sup') or len(name)>68: continue
            record = row(norm(f"{url.rsplit('/',1)[-1]}-{name}"),name,"Candidate for "+office,state,listed_party,
                         url+"#"+section.get("aria-labelledby"),year=year)
            if norm(name) in campaigns: record["campaign"] = campaigns[norm(name)]
            records.append(record)
    return records


def declarations(today):
    specs = {}
    state_names = {name: abbr for abbr, name in STATES.items()}
    # Walk published election calendars. A two-year window misses the next
    # gubernatorial cycle and later declarations in years with existing pages.
    year = max(today.year, 2027)
    while True:
        url = f"https://en.wikipedia.org/wiki/{year}_United_States_elections"
        raw = read(url, optional=True)
        if not raw:
            break
        for href in html.fromstring(raw).xpath('//a[@href]/@href'):
            target = urljoin(url, href).split("#")[0]
            prefix = f"https://en.wikipedia.org/wiki/{year}_"
            if not target.startswith(prefix):
                continue
            name = unquote(target[len(prefix):]).replace("_", " ")
            if name == "United States presidential election":
                specs[target] = (target, year, "US", "President")
                continue
            governor = re.fullmatch(r"(.+) (?:special )?gubernatorial (?:special )?election", name)
            if governor and governor[1] in state_names and state_names[governor[1]] != "DC":
                specs[target] = (target, year, state_names[governor[1]], "Governor")
                continue
            federal = re.fullmatch(r"United States (Senate|House of Representatives) (?:special )?elections? in (.+)", name)
            district = re.fullmatch(r"(.+?)(?:'s|’) (?:.+?) congressional district special election", name)
            state = federal[2] if federal else district[1] if district else None
            if state in state_names:
                office = "U.S. Senate" if federal and federal[1] == "Senate" else "U.S. House"
                specs[target] = (target, year, state_names[state], office)
        year += 1
    records=[]
    with ThreadPoolExecutor(max_workers=5) as pool:
        for batch in pool.map(declared_race, specs.values()):
            records.extend(batch)
    return records


def policy_links(record):
    site=record.get("campaign")
    if not site:return []
    try:
        page=html.fromstring(read(site))
    except (RuntimeError,subprocess.SubprocessError,ValueError):
        return []
    found={}
    for a in page.xpath('//a[@href]'):
        title=" ".join(a.text_content().split())
        url=urljoin(site,a.get("href"))
        if urlsplit(url).netloc.removeprefix("www.")!=urlsplit(site).netloc.removeprefix("www."):continue
        if re.fullmatch(r"(?:the |our |my )?(?:issues|priorities|platform|policy|policies|agenda|vision)(?: for [\w ]+)?",title,re.I) or re.search(r"/(?:issues|priorities|platform|policies)/[^/#?]+",url):
            if title and len(title)<100:found[url]=title
    policies = []
    for url, label in list(found.items())[:15]:
        policy = {"label": label, "url": url}
        policies.append(policy)
        if len(policies) > 5:
            continue
        try:
            policy_page = html.fromstring(read(url))
        except (RuntimeError, subprocess.SubprocessError, ValueError):
            continue
        paragraphs = policy_page.xpath("//main//p | //article//p") or policy_page.xpath("//body//p")
        for paragraph in paragraphs:
            body = " ".join(paragraph.text_content().split())
            for sentence in re.split(r"(?<=[.!?])\s+", body):
                if (5 <= len(sentence.split()) <= 24 and
                    re.search(r"\b(?:I|we) (?:will|support|oppose|believe|propose|plan to|am committed to|are committed to)\b", sentence, re.I) and
                    re.search(r"\b(?:housing|rent|tax(?:es)?|education|schools?|health(?:care)?|wages?|jobs?|abortion|transit|transportation|climate|water|immigration|polic(?:e|ing)|safety|infrastructure|veterans|childcare|energy|labor|zoning)\b", sentence, re.I)):
                    policy["statement"] = sentence
                    break
            if "statement" in policy:
                break
    return policies


CANDIDATE_OFFICES = {
    "president":"President", "u.s. president":"President", "president of the united states":"President",
    "governor":"Governor", "u.s. senate":"U.S. Senate", "us senate":"U.S. Senate",
    "united states senate":"U.S. Senate", "u.s. house":"U.S. House",
    "u.s. house of representatives":"U.S. House", "united states house of representatives":"U.S. House",
    "u.s. representative":"U.S. House", "united states representative":"U.S. House",
}


FEC_OFFICES = {"S": "U.S. Senate", "H": "U.S. House", "P": "President"}


def federal_candidates(today):
    earliest = max(2027, today.year)
    records = {}
    possible_filers = {}
    def add(key, name, office, state, party, year, source=None):
        if office not in FEC_OFFICES or not str(year).isdigit() or not name or not key:
            return
        year = int(year)
        # Self-reported filing years sometimes contain typos such as 2999.
        if year < earliest or year > today.year + 100 or (office == "P" and year % 4) or november_election(year) < today:
            return
        last, comma, first = name.partition(",")
        display = ((first.strip() + " " + last) if comma else last).title()
        records[(key, year)] = row(
            f"fec-{key.lower()}-{year}", display, "Candidate for " + FEC_OFFICES[office],
            "US" if office == "P" else state, {"DEM":"Democratic","REP":"Republican"}.get(party,party),
            source or "https://www.fec.gov/data/candidate/"+key+"/", year=year, fecId=key)
    cycle = today.year + today.year % 2
    for year in [cycle-2, cycle, cycle+2]:
        base = f"https://www.fec.gov/files/bulk-downloads/{year}/"
        raw = read(base + f"cn{year%100:02}.zip", optional=True)
        if raw:
            with zipfile.ZipFile(io.BytesIO(raw)) as z:
                for f in csv.reader(io.StringIO(z.read(z.namelist()[0]).decode("latin1")), delimiter="|"):
                    # F denotes a statutory candidate specifically for a future election.
                    # An N record alone can originate with a third-party committee.
                    if len(f) < 10 or not f[3].isdigit() or int(f[3]) < earliest:
                        continue
                    if f[8] == "N":
                        possible_filers[f[0]] = int(f[3])
                    elif f[8] in ("C", "F"):
                        add(f[0], f[1], f[5], f[4], f[2], f[3])
        if year >= earliest:
            statements = read(base + f"Form2Filer_{year}.csv", optional=True)
            if statements:
                for f in csv.DictReader(io.StringIO(statements.decode("utf-8-sig", errors="replace"))):
                    add(f["CANDIDATE_ID"], f["CANDIDATE_NAME"], f["CANDIDATE_OFFICE_CODE"],
                        f["CANDIDATE_OFFICE_STATE_CODE"], f["PARTY_CODE"], f["ELECTION_YEAR"])
    # Confirm pre-threshold filers against their own Statement of Candidacy.
    # Candidate master rows can also be created by an independent draft committee.
    ids = sorted(possible_filers)
    api_key = os.getenv("FEC_API_KEY") or "DEMO_KEY"
    for i in range(0, len(ids), 100):
        params = {"api_key": api_key, "candidate_id": ids[i:i+100], "per_page": 100}
        profiles = json.loads(read("https://api.open.fec.gov/v1/candidates/?" + urlencode(params, doseq=True)))
        for profile in profiles["results"]:
            key = profile["candidate_id"]
            year = possible_filers[key]
            if (profile.get("last_f2_date") and not profile.get("candidate_inactive") and
                    year in profile["election_years"] and year not in (profile.get("inactive_election_years") or [])):
                add(key, profile["name"], profile["office"], profile["state"], profile["party"], year)
    # Electronic filings arrive before the future cycle's bulk file exists.
    # Keep prior verified filings and overlap receipt dates to pick up late indexing.
    past = json.loads(OUT.read_text()) if OUT.exists() else {}
    for record in past.get("upcoming", []):
        if record.get("filingId") and record["year"] >= earliest and november_election(record["year"]) >= today:
            records[(record["filingId"], record["year"])] = dict(record)
    checkpoint = past.get("filingsThrough")
    since = date.fromisoformat(checkpoint) - timedelta(days=14) if checkpoint else date(2026,11,3)
    page = 1
    while True:
        params = {"api_key": os.getenv("FEC_API_KEY") or "DEMO_KEY", "form_type":"F2",
                  "min_receipt_date":since.isoformat(), "max_receipt_date":today.isoformat(),
                  "most_recent":"true", "page":page, "per_page":100, "sort":"receipt_date"}
        payload = json.loads(read("https://api.open.fec.gov/v1/filings/?" + urlencode(params)))
        for filing in payload["results"]:
            key, election = filing.get("candidate_id"), filing.get("election_year")
            add(key, filing.get("candidate_name"), filing.get("office"), filing.get("state"),
                filing.get("party"), election, filing.get("html_url"))
            if (key, election) in records:
                records[key, election]["filingId"] = key
        if page >= payload["pagination"]["pages"]: break
        page += 1
    return records


def candidates(today, voters):
    result = []
    for v in voters:
        if (v.get("electionDate") or "") < max(str(today), "2027-01-01") or v.get("management",{}).get("lifecycleStatus") not in (None,"active"):
            continue
        office = CANDIDATE_OFFICES.get((v.get("office") or "").strip().lower().removeprefix("candidate for "))
        if not office or (office=="Governor" and state_from(v) not in set(STATES)-{"DC"}): continue
        result.append(row("v-"+v["slug"],v["name"],"Candidate for "+office,"US" if office == "President" else state_from(v),v.get("party"),
                          "https://www.voterist.com/candidate/"+v["slug"], issueSlug=v["slug"], year=int(v["electionDate"][:4])))
    fec = federal_candidates(today)
    seen={(norm(r["name"]),r["state"],norm(r["office"]),r["year"]) for r in result}
    result.extend(r for r in fec.values() if (norm(r["name"]),r["state"],norm(r["office"]),r["year"]) not in seen)
    entries = {(norm(r["name"]),r["year"],r["state"],norm(r["office"])): r for r in result}
    for record in declarations(today):
        key=(norm(record["name"]),record["year"],record["state"],norm(record["office"]))
        if key not in entries: entries[key]=record
        elif record.get("campaign"): entries[key]["campaign"]=record["campaign"]
    return list(entries.values())


def cache_portrait(record):
    from PIL import Image, ImageOps
    url=record.get("portrait","")
    if not url.startswith("https://"):return
    # Include the URL in the filename so changed portraits refresh automatically.
    import hashlib
    path=Path("assets/img/hallway-portraits")/(norm(record["slug"])+"-"+hashlib.sha256(url.encode()).hexdigest()[:10]+".webp")
    try:
        if not (ROOT/path).exists():
            response=subprocess.run(["curl","-fsSL","--max-time","12","--max-filesize","8500000",url],capture_output=True,check=True)
            with Image.open(io.BytesIO(response.stdout)) as image:
                image=ImageOps.exif_transpose(image)
                image.thumbnail((440,580))
                image.convert("RGB").save(ROOT/path,"WEBP",quality=82)
        record["originalPortrait"]=url
        record["portrait"]=str(path)
    except (OSError, ValueError, subprocess.SubprocessError):
        alternate = record.pop("officialPortrait", None)
        if alternate and alternate != url:
            record["portrait"] = alternate
            cache_portrait(record)


def main():
    today=date.today()
    voters=json.loads(read(VOTERIST))["candidates"]
    serving, upcoming=officials(today), candidates(today,voters)
    past = json.loads(OUT.read_text()) if OUT.exists() else {}
    stored = {r["slug"]:r for hall in ("serving","upcoming") for r in past.get(hall,[])}
    old_identity = {(norm(r["name"]), r["state"], r["office"], r.get("year")): r for r in stored.values()}
    by_fec = {key: r for r in serving for key in r.pop("fecIds", [])}
    manifest=json.loads((OUT.parent/"portraits.json").read_text())["candidates"]
    for r in serving+upcoming:
        office = r["office"].lower().replace("-elect","").removeprefix("candidate for ")
        office = {"senator":"u.s. senate","representative":"u.s. house"}.get(office,office)
        matches=[v for v in voters if norm(v["name"])==norm(r["name"]) and state_from(v)==r["state"] and v["office"].lower().removeprefix("candidate for ")==office]
        if len(matches)==1: r.setdefault("issueSlug",matches[0]["slug"])
        photo=manifest.get(r.get("issueSlug"),{})
        if not r.get("portrait") and photo:
            r.update(portrait=photo.get("localUrl") or photo["url"],portraitCredit=photo["creditUrl"])
        member = by_fec.get(r.get("fecId"))
        if member and not r.get("portrait"):
            r.update(portrait=member.get("portrait") or member.get("officialPortrait"), portraitCredit=member["source"])
        old = stored.get(r["slug"]) or old_identity.get((norm(r["name"]), r["state"], r["office"], r.get("year")), {})
        if not r.get("portrait") and old.get("portrait") and old["name"]==r["name"]:
            r["portrait"] = old["portrait"]
            for field in ("originalPortrait", "portraitCredit"):
                if old.get(field): r[field] = old[field]
    missing=[dict(r,nameKey=clean_name(r["name"])) for r in serving+upcoming if not r.get("portrait") and r["state"] in STATES]
    images=wikipedia_photos(missing) if missing else {}
    for r in serving+upcoming:
        if r["slug"] in images:
            image=images[r["slug"]]
            r.update(portrait=image["url"],portraitCredit=image["creditUrl"])
    with ThreadPoolExecutor(max_workers=5) as pool:
        campaigns=[r for r in upcoming if r.get("campaign")]
        for r,links in zip(campaigns,pool.map(policy_links,campaigns)):
            r["policyLinks"]=links or stored.get(r["slug"],{}).get("policyLinks",[])
    (ROOT/"assets/img/hallway-portraits").mkdir(exist_ok=True)
    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(cache_portrait, serving+upcoming))
    allowed = {"Candidate for "+office for office in CANDIDATE_OFFICES.values()}
    if any(r["office"] not in allowed for r in upcoming):
        raise ValueError("Unsupported office in upcoming hallway")
    OUT.write_text(json.dumps(dict(asOf=str(today),filingsThrough=str(today),serving=serving,upcoming=upcoming),ensure_ascii=False,separators=(",",":"))+"\n")
    print(len(serving),"officeholders and members-elect;",len(upcoming),"upcoming candidacies")


if __name__=="__main__":
    main()
