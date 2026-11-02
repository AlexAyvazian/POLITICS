#!/usr/bin/env python3
"""Read public Senate gift travel archive schema for verified ingestion."""
from urllib.request import Request,urlopen
from zipfile import ZipFile
from io import BytesIO
from collections import Counter
import xml.etree.ElementTree as ET
url='https://giftrule-disclosure.senate.gov/media/giftruledownloads/giftruledata.zip'
req=Request(url,headers={'User-Agent':'Mozilla/5.0 (POLITICS Civic Records)'})
with urlopen(req,timeout=65) as res:
 content=res.read(12_000_001)
if len(content)>12_000_000:raise ValueError('Unexpectedly large archive')
with ZipFile(BytesIO(content)) as archive:
 files=archive.namelist()
 print('FILES:',[(n,archive.getinfo(n).file_size) for n in files[:10]],flush=True)
 for name in files:
  if name.lower().endswith('.xml'):
   with archive.open(name) as stream:
    root=ET.parse(stream).getroot()
   print('ROOT',root.tag,'children',len(root),flush=True)
   print('ROOT ATTR',list(root.attrib),flush=True)
   children=list(root)
   print('CHILD_TAGS',Counter(c.tag for c in children).most_common(10),flush=True)
   if children:
    one=children[0]
    print('FIRST ITEM TAGS',[(a.tag,a.attrib,'nested='+str(len(a)), 'text='+repr((a.text or '')[:150])) for a in list(one)[:35]],flush=True)
    for sub in list(one)[:8]:
     print('SUB',sub.tag,'tags',[(x.tag,x.attrib, 'text='+repr((x.text or '')[:200]),'children='+str(len(x))) for x in list(sub)[:15]],flush=True)
   print('SECOND RECORD',ET.tostring(children[1],encoding='unicode')[:1800] if len(children)>1 else 'none',flush=True)
   break

print("HOUSE_ARCHIVE_START",flush=True)
house='https://disclosures-clerk.house.gov/public_disc/gift-pdfs/2026Travel.zip'
req=Request(house,headers={'User-Agent':'Mozilla/5.0 (compatible; public civic disclosures)'},method='HEAD')
try:
 with urlopen(req,timeout=25) as h:print("HOUSE_HEAD",h.status,h.headers.get('Content-Length'),h.headers.get('Content-Type'),flush=True)
except Exception as exc:print("HOUSE_HEAD_ERROR",repr(exc),flush=True)
