#!/usr/bin/env python3
"""Install the exact vector flag set supplied for the Foreign Agents directory.

The uploaded archive matches vishiri/fantasia-archive/public/countryFlags.
We vendor that source in CI and verify sample files against hashes computed
from the user's uploaded archive before publishing.
"""
from __future__ import annotations

import hashlib
import io
import re
import urllib.request
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
TARGET=ROOT/'assets/img/foreign-agents/flags'
SOURCE='https://codeload.github.com/vishiri/fantasia-archive/zip/refs/heads/master'
EXPECTED={
    'us.svg':'e1792c011daad918fdbd99a21f7f46fd71018ffd052af5a7d7faf9954d593e31',
    'am.svg':'1eb2190d967efac59bb4f18f699b465f76dc3128593011e59243450cd593f846',
    'ge.svg':'dfba0d29f581ff00c2e46b69cc90e0e9ff6371ab92fbe300664f6622f7ca0355',
}

def sha256(data:bytes)->str:
    return hashlib.sha256(data).hexdigest()

def install():
    TARGET.mkdir(parents=True,exist_ok=True)
    with urllib.request.urlopen(SOURCE,timeout=60) as response:
        archive=response.read()
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        members=[
            n for n in z.namelist()
            if '/public/countryFlags/' in n
            and re.fullmatch(r'[a-z]{2}\.svg',Path(n).name,re.I)
        ]
        if len(members)<240:
            raise ValueError(f'Vector flag source unexpectedly small: {len(members)}')
        by_name={Path(n).name.lower():n for n in members}
        for name,expected in EXPECTED.items():
            data=z.read(by_name[name])
            actual=sha256(data)
            if actual!=expected:
                raise ValueError(f'{name} does not match uploaded vector archive: {actual}')
        for name,member in sorted(by_name.items()):
            data=z.read(member)
            if b'<svg' not in data[:1000].lower():
                raise ValueError(f'Invalid SVG flag: {member}')
            (TARGET/name).write_bytes(data)
    print(f'Installed {len(by_name)} verified vector country flags into {TARGET}')

if __name__=='__main__':
    install()
