from urllib.request import Request,urlopen
from xml.etree import ElementTree as ET
for url in ['https://www.govinfo.gov/bulkdata/BILLSUM/119/hr/BILLSUM-119hr2102.xml','https://www.govinfo.gov/bulkdata/BILLSUM/119/hr/BILLSUM-119hr1.xml']:
 try:
  with urlopen(Request(url,headers={'User-Agent':'Mozilla/5.0 (POLITICS Civic Records)'}),timeout=30) as r:raw=r.read(2_000_000)
  root=ET.fromstring(raw)
  def tag(t):return t.split('}')[-1]
  print('URL',url,'BYTES',len(raw),'ROOT',tag(root.tag),'CHILDREN',[(tag(x.tag),len(x)) for x in list(root)[:20]],flush=True)
  print('TAGS',[tag(x.tag) for x in list(root.iter())][:60],flush=True)
  sums=[x for x in root.iter() if tag(x.tag).lower() in ('summary','text','actiondesc')]
  print('SUMMARY COUNT',len(sums),'CONTENT',[(tag(x.tag),''.join(x.itertext())[:270]) for x in sums[:4]],flush=True)
 except Exception as exc:print('ERROR',url,repr(exc),flush=True)
