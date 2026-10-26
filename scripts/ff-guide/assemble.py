#!/usr/bin/env python3
"""Merge factual game records with independently curated guides; never count duplicate visions."""
import argparse
import collections
import json
import re
from pathlib import Path


def normal(value):
    return re.sub(r'[^a-z0-9]', '', (value or '').lower())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--database', required=True)
    parser.add_argument('--curated', nargs='+', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    source = json.loads(Path(args.database).read_text())
    entries = source['entries']
    sources = {s['id']: s for s in source['sources']}
    for filename in args.curated:
        extra = json.loads(Path(filename).read_text())
        sources.update({s['id']: s for s in extra.get('sources', [])})
        for record in extra['entries']:
            existing = next((e for e in entries if e['category'] == record['category']
                             and e['category'] in ('visions', 'espers')
                             and normal(e.get('en')) == normal(record.get('en'))), None)
            if existing:
                existing['title'] = record['title']
                existing['summary'] = record['summary'] + '。' + existing.get('summary', '')
                existing['fields'] = {**record.get('fields', {}), **existing.get('fields', {})}
                existing['steps'] = record.get('steps', []) + existing.get('steps', [])
                existing['sourceIds'] = list(dict.fromkeys(existing['sourceIds'] + record['sourceIds']))
                existing['tags'] = list(dict.fromkeys(existing.get('tags', []) + record.get('tags', [])))
                existing['chapter'] = record.get('chapter', 0)
                existing['spoiler'] = record.get('spoiler', False)
                existing['provenance'] = '获取路线依据 PowerPyx 正式版攻略整理；能力数据保留原始版本说明。'
                if record.get('note'):
                    existing['note'] = record['note']
            else:
                entries.append(record)
    for entry in entries:
        if entry['category'] == 'bosses':
            entry['category'] = 'enemies'
            entry['title'] += ' · 洞窟攻略'
            entry.setdefault('tags', []).insert(0, '洞窟之主攻略')
            entry['collectible'] = True
        if entry['category'] == 'locations':
            entry['category'] = 'quests'
            entry.setdefault('tags', []).insert(0, '地点与奖励')
        for field in ('steps', 'sourceIds', 'tags'):
            entry.setdefault(field, [])
        entry.setdefault('fields', {})
        entry.setdefault('spoiler', False)
        if not entry.get('sourceUrl') and entry['sourceIds']:
            entry['sourceUrl'] = sources[entry['sourceIds'][0]]['url']
    # Canonical IDs survive new source snapshots. Reject malformed imports rather than losing old data.
    counts = collections.Counter(e['category'] for e in entries)
    assert len({e['id'] for e in entries}) == len(entries), 'Duplicate IDs'
    assert counts['visions'] == 26 and counts['espers'] == 9
    assert counts['characters'] == 8 and counts['collectibles'] >= 119
    assert counts['equipment'] >= 400 and counts['enemies'] >= 596
    for entry in entries:
        assert entry['title'] and entry['sourceIds'], entry['id']
        assert all(s in sources for s in entry['sourceIds']), entry['id']
    output = {'schemaVersion': 1, 'updatedAt': '2026-10-25',
              'game': 'FINAL FANTASY RESONANCE',
              'scope': '公开游戏表事实记录与独立中文攻略摘要；未游戏内全量实测',
              'counts': dict(counts), 'sources': list(sources.values()), 'entries': entries}
    path = Path(args.output)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n')
    temporary.replace(path)
    print(json.dumps({'entries': len(entries), 'counts': dict(counts), 'output': str(path)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
