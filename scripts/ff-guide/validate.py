#!/usr/bin/env python3
"""Validate guide coverage, evidence links, and numeric source-boundary regressions."""
import collections
import json
import re
from pathlib import Path
from urllib.parse import urlparse

root = Path(__file__).resolve().parents[2]
data = json.loads((root / 'apps/ff-guide/data.json').read_text())
entries = data['entries']
ids = {e['id']: e for e in entries}
sources = {s['id']: s for s in data['sources']}
counts = collections.Counter(e['category'] for e in entries)
assert len(ids) == len(entries), 'Duplicate record ID'
assert counts == data['counts'], 'Stale coverage counters'
for category, expected in {'characters': 8, 'visions': 26, 'espers': 9,
                           'equipment': 454, 'items': 103, 'skills': 798,
                           'collectibles': 119, 'achievements': 40}.items():
    assert counts[category] == expected, (category, counts[category])
for e in entries:
    assert e['title'] and e['sourceIds'] and all(s in sources for s in e['sourceIds']), e['id']
    assert urlparse(e['sourceUrl']).scheme == 'https', e['id']
    assert isinstance(e['fields'], dict) and isinstance(e['steps'], list), e['id']
for s in sources.values():
    assert urlparse(s['url']).scheme == 'https', s['id']
shards = [e for e in entries if e['category'] == 'collectibles' and '石板' in e['title']]
assert len(shards) == 99, f'Expected 99 individual tablet-shard entries: {len(shards)}'
for chapter in range(1, 9):
    e = ids[f'walkthrough-chapter-{chapter}']
    assert e['chapter'] == chapter and len(e['steps']) >= 10, e['id']
enemies = [e for e in entries if e['id'].startswith('enemy-')]
assert len(enemies) == 596
assert all('普通·HP' in e.get('original', e)['fields'] for e in enemies), 'Partial enemy detail import'
assert ids['enemy-2'].get('original',ids['enemy-2'])['fields']['普通·HP'] == 68, 'Steel Bat normal HP source regression'
assert ids['enemy-2'].get('original',ids['enemy-2'])['fields']['专家·HP'] == 109, 'Steel Bat expert HP source regression'
assert ids['enemy-2'].get('original',ids['enemy-2'])['fields']['简单·HP'] == 41, 'Steel Bat easy HP source regression'
assert all(any('0 星' in step for step in e['steps']) for e in entries if e['category'] == 'visions'), 'Awakening initial state omitted'
assert any('24032336' in str(e['fields']) for e in entries if e['category'] == 'espers'), 'Demo provenance lost'
assert ids['vision-13080']['chapter'] == 5, 'Aileen recruitment/crafting stages confused'
assert ids['guide-forge-workflow']['chapter'] == 6
if data.get('localization'):
    def text_strings(value):
        if isinstance(value,str):yield value
        elif isinstance(value,list):
            for item in value:yield from text_strings(item)
        elif isinstance(value,dict):
            for key,item in value.items():
                yield key;yield from text_strings(item)
    for e in entries:
        assert e.get('original'),('Original source text missing',e['id'])
        assert len(e['fields'])==len(e['original'].get('fields',{})),('Lost fields',e['id'])
        before=[v for v in e['original'].get('fields',{}).values() if isinstance(v,(int,float))]
        after=[v for v in e['fields'].values() if isinstance(v,(int,float))]
        assert before==after,('Numeric field values changed',e['id'])
        for key in ['title','summary','fields','steps','tags','note','provenance','sections','version']:
            assert not any(re.search(r'[A-Za-z\u3040-\u30ff]',text) for text in text_strings(e.get(key))),('Untranslated display text',e['id'],key)
    assert data['localization']['residualStrings']==0
practical = json.loads((root / 'apps/ff-guide/practical.json').read_text())
articles = practical['entries']
assert len(articles) == 9
all_ids = {**ids, **{e['id']: e for e in articles}}
all_sources = {**sources, **{s['id']: s for s in practical['sources']}}
assert len(all_ids) == len(entries) + len(articles), 'Colliding strategy IDs'
assert len({s['id'] for s in practical['sources']}) == len(practical['sources'])
for e in articles:
    assert e['category'] == 'guide' and e['practical']
    assert e['conclusion'] and e['scope'] and e['blocks'], e['id']
    assert set(e['stages']) <= {'early', 'mid', 'late'}
    assert e['sourceIds'] and all(s in all_sources for s in e['sourceIds'])
    assert all(i in all_ids for i in e.get('related', [])), e['id']
    display = [e['title'], e['summary'], e['conclusion'], e['scope']]
    for b in e['blocks']:
        assert b.get('sourceIds') and all(i in all_sources for i in b['sourceIds']), (e['id'], b['title'])
        display += [b['title']] + b.get('body', []) + b.get('steps', []) + b.get('headers', [])
        for row in b.get('rows', []):
            assert len(row) == len(b['headers']), (e['id'], b['title'])
            for cell in row:
                if isinstance(cell, dict):
                    assert cell['id'] in all_ids, cell
                    display.append(cell['text'])
                else:
                    display.append(cell)
    assert not any(re.search(r'[A-Za-z\u3040-\u30ff]', str(t)) for t in display), e['id']
for s in practical['sources']:
    assert urlparse(s['url']).scheme == 'https', s['id']
for patch in practical['corrections']:
    assert patch['id'] in ids
    assert all(s in all_sources for s in patch.get('sourceIds', []))
    assert all(i in all_ids for i in patch.get('related', []))
def refs(eid, category):
    return {cell['id'] for b in all_ids[eid]['blocks'] for row in b.get('rows', [])
            for cell in row if isinstance(cell, dict) and all_ids[cell['id']]['category'] == category}
assert len(refs('play-characters', 'characters')) == 8
assert len(refs('play-builds', 'characters')) == 8
assert len(refs('play-visions', 'visions')) == 26
assert sum('rows' in b for b in all_ids['play-weapons']['blocks']) == 8
assert all(t['id'] in all_ids for t in practical['topics'])
print(json.dumps({'ok': True, 'practical_articles': len(articles), 'entries': len(entries), 'sources': len(sources),
                  'enemy_details': len(enemies), 'tablet_shards': len(shards),
                  'chapters': 8, 'counts': dict(counts)}, ensure_ascii=False))
