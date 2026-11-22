#!/usr/bin/env python3
"""Install the user-supplied vector flag archive into the Foreign Agents asset tree."""
from __future__ import annotations
import re, shutil, zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
ARCHIVE=ROOT/'assets/source/foreign-agent-flags.zip'
TARGET=ROOT/'assets/img/foreign-agents/flags'

def install():
    if not ARCHIVE.exists():
        raise FileNotFoundError(f'Missing flag source archive: {ARCHIVE}')
    TARGET.mkdir(parents=True,exist_ok=True)
    written=0
    with zipfile.ZipFile(ARCHIVE) as z:
        members=[n for n in z.namelist() if re.fullmatch(r'[a-z]{2}\.svg',Path(n).name,re.I)]
        if len(members)<240:
            raise ValueError(f'Flag archive unexpectedly small: {len(members)} two-letter SVGs')
        for member in members:
            name=Path(member).name.lower()
            data=z.read(member)
            if b'<svg' not in data[:1000].lower():
                raise ValueError(f'Invalid SVG flag: {member}')
            (TARGET/name).write_bytes(data)
            written+=1
    print(f'Installed {written} vector country flags into {TARGET}')

if __name__=='__main__':
    install()
