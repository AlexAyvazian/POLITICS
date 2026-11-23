"""Refresh the two Issue Stances directories from office, result and candidacy records."""
import csv
import io
import json
import re
import subprocess
import unicodedata
import zipfile
from datetime import date, timedelta, datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import unquote, urljoin, urlsplit
from xml.etree import ElementTree
from lxml import html
from update_issue_stances_portraits import STATES, state_from, wikipedia_photos, clean_name

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/data/issue-stances/hallways.json"
CURRENT = "https://unitedstates.github.io/congress-legislators/legislators-current.json"
NGA = "https://www.nga.org/governors/"
VOTERIST = "https://www.voterist.com/api/public/candidates"


def read(url, optional=False):
    response = subprocess.run(["curl", "--retry", "2", "--max-time", "35", "-sSL", "-w", "%{http_code}", url], capture_output=True, check=True).stdout
    if optional and response[-3:] == b"404":
        return None
    if response[-3:] != b"200":
        raise RuntimeError(f"HTTP {response[-3:].decode()} from {url}")
    return response[:-3]


def norm(name):
    return re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()).strip("-")


def row(slug, name, office, state, party, source, **extra):
    return dict(slug=slug, name=name, office=office, state=state, party=party or "Unaffiliated / unspecified", source=source, **extra)


def officials(today):
    result, seats = [], {}
    senators = {r.findtext("bioguide_id"):r for r in ElementTree.fromstring(read(
        "https://www.senate.gov/general/contact_information/senators_cfm.xml")).findall("member")}
    if len(senators)<90: raise ValueError("Incomplete Senate directory")
    for member in json.loads(read(CURRENT)):
        term = next((t for t in reversed(member["terms"]) if t["start"] <= str(today) < t["end"]), None)
        if member["terms"][-1]["type"]=="sen":
            if member["id"]["bioguide"] not in senators:continue
            term=member["terms"][-1]
        if not term:
            continue
        state, bio = term["state"], member["id"]["bioguide"]
        title = "Senator" if term["type"] == "sen" else "Representative"
        if title == "Representative" and state not in set(STATES) - {"DC"}:
            title = "Resident Commissioner" if state == "PR" else "Delegate"
        names = member["name"]
        name = names.get("official_full") or names["first"] + " " + names["last"]
        entry = row(bio.lower(), name, title, state, term["party"], term.get("url") or "https://bioguide.congress.gov/search/bio/"+bio,
                    portrait=f"https://unitedstates.github.io/images/congress/225x275/{bio}.jpg")
        result.append(entry)
        seats.setdefault((state, title, term.get("district", 0)), []).append((entry, names))

    for bio, senator in senators.items():
        if any(r["slug"]==bio.lower() for r in result):continue
        first,last=senator.findtext("first_name"),senator.findtext("last_name")
        state=senator.findtext("state")
        entry=row(bio.lower(),first+" "+last,"Senator",state,{"D":"Democratic","R":"Republican","I":"Independent"}.get(senator.findtext("party")),senator.findtext("website"),portrait=f"https://unitedstates.github.io/images/congress/225x275/{bio}.jpg")
        result.append(entry)
        seats.setdefault((state,"Senator",0),[]).append((entry,{"first":first,"last":last}))
    # Incoming winners are explicitly titled until the new Congress convenes.
    if date(2026, 11, 3) <= today < date(2027, 1, 3):
        js = (ROOT / "assets/data/elections/us-2026.js").read_text()
        races = json.JSONDecoder().raw_decode(js.split("Object.freeze(", 1)[1])[0]
        for chamber, title in [("senate", "Senator"), ("house", "Representative")]:
            for seat, race in races[chamber].items():
                winner, state = race.get("winner"), race["state"]
                if not winner or race.get("status") != "called":
                    continue
                district = seat.split("-")[-1]
                district = int(district) if district.isdigit() else 0
                sitting = [m for (st, role, _), members in seats.items() if st==state and role==title for m in members]
                def same_member(member, names):
                    variants = [member["name"], names["first"]+" "+names["last"], names.get("nickname","")+" "+names["last"]]
                    return any(norm(winner) == norm(v) or clean_name(winner) == clean_name(v) for v in variants)
                aliases = {"r000584":"Jim Risch","c001088":"Chris Coons","c001110":"Lou Correa","s001214":"Greg Steube",
                           "b001307":"Jim Baird","d000230":"Don Davis","c001123":"Gil Cisneros","k000375":"Bill Keating",
                           "o000176":"John “Johnny O” Olszewski, Jr.","o000177":"Bob Onder"}
                if any(same_member(member,names) or norm(aliases.get(member["slug"],""))==norm(winner) for member,names in sitting):
                    continue
                moving = [member for (st,role,_), members in seats.items() if st==state and role!=title
                          for member,names in members if same_member(member,names)]
                if len(moving)==1:
                    moving[0]["incomingOffice"]=title+"-elect"
                    continue
                result.append(row("elect-"+norm(seat+"-"+title+"-"+winner), winner, title+"-elect", state,
                                  race.get("winnerParty","").title(), race["pageUrl"]))
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
    doc = html.fromstring(read(url))
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
    for year in range(today.year, today.year+3):
        # Same-year race pages also need a dated election in their infobox.
        if year == today.year and today > november_election(year): continue
        url = f"https://en.wikipedia.org/wiki/{year}_United_States_elections"
        raw = read(url,optional=True)
        if not raw: continue
        for href in html.fromstring(raw).xpath('//*[contains(@class,"navbox")]//a/@href'):
            target = urljoin(url, href)
            name = unquote(target.split("/")[-1]).replace("_"," ")
            if not target.startswith(f"https://en.wikipedia.org/wiki/{year}_") or not name.endswith(" election"): continue
            if "presidential election in" in name or "special" in name.lower() and today.year == year: continue
            state = next((c for c,s in STATES.items() if re.search(r"\b"+s+r"\b",name)), "")
            office = name[len(str(year))+1:-len(" election")]
            if "Senate" in office and "United States" in office: office="U.S. Senate"
            elif "mayoral" in office:
                city = office.replace(" mayoral","").strip(",")
                city_states = {"Anchorage":"AK","Chicago":"IL","Colorado Springs":"CO","Denver":"CO",
                               "Houston":"TX","Indianapolis":"IN","Jacksonville":"FL","Kansas City":"MO",
                               "Madison":"WI","Nashville":"TN","Orlando":"FL","Philadelphia":"PA","Tampa":"FL"}
                state = city_states.get(city, state)
                office = "Mayor of "+city
            elif state:
                office=office.replace(STATES[state]+" ","").replace("lieutenant gubernatorial","Lieutenant Governor").replace("gubernatorial","Governor")
            else: continue
            specs[target]=(target,year,state,office)
        # Federal Senate special elections put the state after the word election.
        for href in html.fromstring(raw).xpath('//a/@href'):
            target=urljoin(url,href)
            match=re.fullmatch(r"https://en.wikipedia.org/wiki/"+str(year)+r"_United_States_Senate_special_election_in_([A-Za-z_]+)",target)
            if match and year>today.year:
                state=next((k for k,v in STATES.items() if v==match[1].replace("_"," ")),"")
                if state:specs[target]=(target,year,state,"U.S. Senate")
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
            for sentence in re.split(r"(?<=[.!?])\\s+", body):
                if (5 <= len(sentence.split()) <= 24 and
                    re.search(r"\\b(?:I|we) (?:will|support|oppose|believe|propose|plan to|am committed to|are committed to)\\b", sentence, re.I) and
                    re.search(r"\\b(?:housing|rent|tax(?:es)?|education|schools?|health(?:care)?|wages?|jobs?|abortion|transit|transportation|climate|water|immigration|polic(?:e|ing)|safety|infrastructure|veterans|childcare|energy|labor|zoning)\\b", sentence, re.I)):
                    policy["statement"] = sentence
                    break
            if "statement" in policy:
                break
    return policies


def candidates(today, voters):
    result = []
    for v in voters:
        if (v.get("electionDate") or "") < str(today) or v.get("management",{}).get("lifecycleStatus") not in (None,"active"):
            continue
        result.append(row("v-"+v["slug"],v["name"],v["office"],state_from(v),v.get("party"),
                          "https://www.voterist.com/candidate/"+v["slug"], issueSlug=v["slug"], year=int(v["electionDate"][:4])))
    cycle = today.year + today.year%2
    fec = {}
    for year in [cycle-2,cycle,cycle+2]:
        url=f"https://www.fec.gov/files/bulk-downloads/{year}/cn{year%100:02}.zip"
        raw=read(url,optional=True)
        if not raw:
            if year == cycle-2: raise ValueError("Missing prior FEC cycle")
            continue
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            for f in csv.reader(io.StringIO(z.read(z.namelist()[0]).decode("latin1")),delimiter="|"):
                if len(f)<10 or not f[3].isdigit(): continue
                key=f[0]
                fec.pop(key,None)
                election=int(f[3])
                if f[8]!="C" or election < today.year or november_election(election)<today or f[5] not in ("S","H","P"): continue
                last,comma,first=f[1].partition(",")
                name=((first.strip()+" "+last) if comma else last).title()
                office={"S":"U.S. Senate","H":"U.S. House","P":"President"}[f[5]]
                fec[key]=row("fec-"+key.lower(),name,"Candidate for "+office,f[4],{"DEM":"Democratic","REP":"Republican"}.get(f[2],f[2]),
                             "https://www.fec.gov/data/candidate/"+key+"/",year=election)
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
    except (OSError,ValueError,subprocess.SubprocessError):
        pass


def main():
    today=date.today()
    voters=json.loads(read(VOTERIST))["candidates"]
    serving, upcoming=officials(today), candidates(today,voters)
    past = json.loads(OUT.read_text()) if OUT.exists() else {}
    stored = {r["slug"]:r for hall in ("serving","upcoming") for r in past.get(hall,[])}
    manifest=json.loads((OUT.parent/"portraits.json").read_text())["candidates"]
    for r in serving+upcoming:
        office = r["office"].lower().replace("-elect","").removeprefix("candidate for ")
        office = {"senator":"u.s. senate","representative":"u.s. house"}.get(office,office)
        matches=[v for v in voters if norm(v["name"])==norm(r["name"]) and state_from(v)==r["state"] and v["office"].lower().removeprefix("candidate for ")==office]
        if len(matches)==1: r.setdefault("issueSlug",matches[0]["slug"])
        photo=manifest.get(r.get("issueSlug"),{})
        if not r.get("portrait") and photo:
            r.update(portrait=photo.get("localUrl") or photo["url"],portraitCredit=photo["creditUrl"])
        old=stored.get(r["slug"],{})
        if not r.get("portrait") and old.get("portrait") and old["name"]==r["name"]:
            r.update(portrait=old.get("originalPortrait") or old["portrait"],portraitCredit=old.get("portraitCredit"))
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
    OUT.write_text(json.dumps(dict(asOf=str(today),serving=serving,upcoming=upcoming),ensure_ascii=False,separators=(",",":"))+"\n")
    print(len(serving),"officeholders and members-elect;",len(upcoming),"upcoming candidacies")


if __name__=="__main__":
    main()
