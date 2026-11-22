#!/usr/bin/env python3
"""Install the user-supplied Foreign Agents continent maps and vector flag archive."""
from __future__ import annotations
import io, re, zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BUNDLE=ROOT/'assets/source/foreign-agents-assets.zip'
MAP_TARGET=ROOT/'assets/img/foreign-agents'
FLAG_TARGET=MAP_TARGET/'flags'

def install():
    if not BUNDLE.exists():
        raise FileNotFoundError(f'Missing Foreign Agents asset bundle: {BUNDLE}')
    MAP_TARGET.mkdir(parents=True,exist_ok=True)
    FLAG_TARGET.mkdir(parents=True,exist_ok=True)

    with zipfile.ZipFile(BUNDLE) as bundle:
        names=set(bundle.namelist())
        expected_maps={
            'north-america.webp','south-america.webp','europe.webp',
            'asia.webp','africa.webp','oceania.webp'
        }
        for name in sorted(expected_maps):
            member='maps/'+name
            if member not in names:
                raise ValueError(f'Missing continent map in asset bundle: {member}')
            (MAP_TARGET/name).write_bytes(bundle.read(member))

        flag_zip=bundle.read('foreign-agent-flags.zip')

    with zipfile.ZipFile(io.BytesIO(flag_zip)) as flags:
        members=[n for n in flags.namelist() if re.fullmatch(r'[a-z]{2}\.svg',Path(n).name,re.I)]
        if len(members)<240:
            raise ValueError(f'Flag archive unexpectedly small: {len(members)} two-letter SVGs')
        for member in members:
            name=Path(member).name.lower()
            data=flags.read(member)
            if b'<svg' not in data[:1000].lower():
                raise ValueError(f'Invalid SVG flag: {member}')
            (FLAG_TARGET/name).write_bytes(data)

    print(f'Installed 6 continent maps and {len(members)} vector country flags')

if __name__=='__main__':
    install()
