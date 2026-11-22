#!/usr/bin/env python3
"""Build a daily people-level FARA short-form directory for POLITICS.

Country grouping is based on the foreign-principal countries tied to the
person's primary FARA registration number in DOJ bulk data. The Short Form
filing remains the authoritative source for the principal(s) that individual
person actually serves.
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

try:
    from scripts.update_fara_world import (
        fetch_dataset,catalog_countries,country_index,normalize_country,pick,text,normalize
    )
except ImportError:
    from update_fara_world import (
        fetch_dataset,catalog_countries,country_index,normalize_country,pick,text,normalize
    )

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'assets/data/foreign-agents'

def short_form_name(row):
    first=text(pick(row,'Short_Form_First_Name','First_Name'),90)
    last=text(pick(row,'Short_Form_Last_Name','Last_Name'),90)
    full=' '.join(x for x in (first,last) if x).strip()
    return full or text(pick(row,'Short_Form_Name','Name'),180)

def short_form_lookup_name(row):
    first=text(pick(row,'Short_Form_First_Name','First_Name'),90)
    last=text(pick(row,'Short_Form_Last_Name','Last_Name'),90)
    return ', '.join(x for x in (last,first) if x).strip(', ')

def build_document_index(docs):
    index={}
    for row in docs:
        if 'short' not in pick(row,'Document_Type','Doc_Type').casefold():continue
        reg=pick(row,'Registration_Number','REG_NUMBER')
        person=pick(row,'Short_Form_Name','ShortFormName')
        url=pick(row,'URL','Document_URL','Document_Link')
        if not re.fullmatch(r'[0-9]{1,6}',reg):continue
        if not person or not re.fullmatch(r'https://efile\.fara\.gov/docs/[^\s?#]+\.pdf',url,re.I):continue
        key=(reg,normalize(person))
        stamp=text(pick(row,'Date_Stamped','Date_Received','Filing_Date'),30)
        prior=index.get(key)
        if not prior or stamp>prior['date']:
            index[key]={'url':url,'date':stamp}
    return index

def build_agent_outputs(shortforms,principals,docs,catalog,now):
    idx=country_index(catalog)
    names={c['iso2']:c['name'] for c in catalog if c.get('iso2')}
    reg_countries=defaultdict(set)
    for row in principals:
        reg=pick(row,'Registration_Number','REG_NUMBER')
        iso=normalize_country(pick(row,'Country_Location','Country_Name','Country_Location_Represented'),idx)
        if re.fullmatch(r'[0-9]{1,6}',reg) and iso:reg_countries[reg].add(iso)

    doc_index=build_document_index(docs)
    by_country=defaultdict(list)
    seen=defaultdict(set)
    unmatched=0
    for row in shortforms:
        reg=pick(row,'Registration_Number','REG_NUMBER')
        name=short_form_name(row)
        if not re.fullmatch(r'[0-9]{1,6}',reg) or not name:continue
        countries=sorted(reg_countries.get(reg,()))
        if not countries:
            unmatched+=1
            continue
        termination=text(pick(row,'Short_Form_Termination_Date','Termination_Date'),30) or None
        filed=text(pick(row,'Short_Form_Date','Short_Form_Registration_Date','Registration_Date'),30) or None
        registrant=text(pick(row,'Registrant_Name','REGISTRANT_NAME'),180)
        lookup=short_form_lookup_name(row) or name
        doc=doc_index.get((reg,normalize(lookup))) or doc_index.get((reg,normalize(name)))
        item={
            'name':name,
            'registrantName':registrant or 'Registrant not listed',
            'registrationNumber':reg,
            'shortFormDate':filed,
            'terminatedAt':termination,
            'status':'terminated' if termination else 'active',
            'city':text(pick(row,'City'),90) or None,
            'state':text(pick(row,'State'),40) or None,
            'documentUrl':doc['url'] if doc else None,
            'associationBasis':'Country grouping follows foreign-principal records attached to this FARA registration number.'
        }
        identity=(reg,normalize(name),filed or '',termination or '')
        for iso in countries:
            if identity in seen[iso]:continue
            seen[iso].add(identity)
            by_country[iso].append(dict(item))

    reports={}
    for iso,items in by_country.items():
        items.sort(key=lambda x:(x['status']!='active',x['name'].casefold(),x['registrantName'].casefold()))
        reports[iso]={
            'schemaVersion':1,'countryCode':iso,'countryName':names.get(iso,iso),
            'source':'U.S. Department of Justice FARA Short Form bulk registry',
            'checkedAt':now,'agentRecords':len(items),
            'activeAgents':sum(x['status']=='active' for x in items),
            'agents':items
        }

    summary={
        'schemaVersion':1,
        'source':'U.S. Department of Justice FARA bulk registry',
        'sourceUrl':'https://efile.fara.gov/ords/fara/f?p=107:21::::::',
        'checkedAt':now,
        'totalAgentRecords':sum(x['agentRecords'] for x in reports.values()),
        'uniqueShortForms':len({(a['registrationNumber'],normalize(a['name']),a['shortFormDate'] or '',a['terminatedAt'] or '')
                               for report in reports.values() for a in report['agents']}),
        'countryCount':len(reports),
        'unmatchedShortForms':unmatched,
        'countries':{iso:{'agents':r['agentRecords'],'activeAgents':r['activeAgents']} for iso,r in sorted(reports.items())},
        'groupingNote':'Country grouping follows foreign-principal records associated with the person’s primary FARA registration number. Open the DOJ Short Form to confirm the principal(s) served by that individual.'
    }
    return summary,reports

def publish():
    now=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
    catalog=catalog_countries()
    shortforms=fetch_dataset('FARA_All_ShortForms')
    principals=fetch_dataset('FARA_All_ForeignPrincipals')
    docs=fetch_dataset('FARA_All_RegistrantDocs')
    if len(shortforms)<1000 or len(principals)<1000 or len(docs)<1000:
        raise ValueError('FARA bulk response too small; refusing incomplete Foreign Agents publish')
    summary,reports=build_agent_outputs(shortforms,principals,docs,catalog,now)
    if summary['uniqueShortForms']<1000 or len(reports)<20:
        raise ValueError('FARA agent join unexpectedly small; refusing to replace prior good snapshot')
    target=OUTPUT/'countries'
    target.mkdir(parents=True,exist_ok=True)
    for iso,report in reports.items():
        (target/(iso+'.json')).write_text(json.dumps(report,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    (OUTPUT/'latest.json').write_text(json.dumps(summary,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    print('FARA Short Forms:',len(shortforms),'unique:',summary['uniqueShortForms'],'country files:',len(reports),'at',now,flush=True)

if __name__=='__main__':
    publish()
