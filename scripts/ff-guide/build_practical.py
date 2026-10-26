#!/usr/bin/env python3
"""Assemble source-reviewed Chinese strategy articles without altering imported records."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'scripts/ff-guide/practical'
out = {'schemaVersion': 1, 'checkedAt': '2026-10-26', 'sources': [], 'entries': [], 'rankings': [],
       'topics': [
           {'title': '角色强度', 'subtitle': '八人定位与培养顺序', 'id': 'play-characters'},
           {'title': '幻兵排行', 'subtitle': '上场与传承分开看', 'id': 'play-visions'},
           {'title': '角色搭配', 'subtitle': '整队方案与操作顺序', 'id': 'play-builds'},
           {'title': '武器推荐', 'subtitle': '过渡、专武与解放', 'id': 'play-weapons'},
           {'title': '隐藏攻略', 'subtitle': '前置、地点与回访', 'id': 'play-secrets'},
           {'title': '刷级攻略', 'subtitle': '经验、精通与吉尔', 'id': 'play-leveling'}
       ],
       'corrections': [
           {'id': 'skill-400330', 'title': '模仿', 'fields': {'技能分类': '模仿'}},
       ]}
for path in sorted(SOURCE.glob('*.json')):
    part = json.loads(path.read_text())
    out['sources'].extend(part.get('sources', []))
    out['entries'].extend(part.get('entries', []))
    out['corrections'].extend(part.get('corrections', []))
    out['rankings'].extend(part.get('rankings', []))
# Names are the existing site's Chinese comparison names, not a claim of official text.
aliases = {'尼科尔': '尼柯尔', '利德': '莉德', '蕾因': '雷因', '雅修特拉': '雅·修特拉'}
def names(value):
    if isinstance(value, str):
        for old, new in aliases.items():
            value = value.replace(old, new)
        return value
    if isinstance(value, list):
        return [names(v) for v in value]
    if isinstance(value, dict):
        return {k: names(v) for k, v in value.items()}
    return value
out['entries'] = names(out['entries'])
image_manifest = json.loads((SOURCE / 'original-images.json').read_text())
for im in image_manifest['images']:
    article = next(e for e in out['entries'] if e['id'] == im['articleId'])
    block = next(b for b in article['blocks'] if im['blockTitle'] in
                 [b['title'], b.get('originalTitle'), names(b.get('originalTitle', ''))])
    block.setdefault('images', []).append(im)
connections = {
    'play-characters': ['play-builds', 'play-visions', 'play-mastery'],
    'play-visions': ['play-mastery', 'play-builds', 'play-combos'],
    'play-builds': ['play-weapons', 'play-combos', 'play-mastery'],
    'play-weapons': ['play-secrets', 'play-money'],
    'play-secrets': ['play-weapons', 'play-leveling'],
}
scopes = {
    'play-characters': '全阶段 · 均衡流程与成型组合分别比较',
    'play-visions': '全阶段 · 装备强度与传承价值分别比较',
    'play-builds': '按章节选队 · 成型方案有技能与觉醒前置',
    'play-weapons': '全八角色 · 过渡到终盘，按职责选装',
    'play-secrets': '按章节回访 · 先做前置再取奖励',
}
for e in out['entries']:
    e['related'] = list(dict.fromkeys(connections.get(e['id'], []) + e.get('related', [])))
    if e['id'] in scopes:
        e['scope'] = scopes[e['id']]
base = json.loads((ROOT / 'apps/ff-guide/data.json').read_text())
records = {e['id']: e for e in base['entries']}
trial_note = ('来源差异：新试炼攻略要求完成对应等级50试炼，武器使用者达到70级；'
              '防具和饰品看雷因70级。旧白金攻略写集齐12件后开放等级75，'
              '此处保留分歧，不把旧条件作为唯一硬锁。')
for n in range(1, 13):
    eid = f'ancient-{n}'
    old = records[eid]
    out['corrections'].append({
        'id': eid, 'fields': {'解放条件': '对应等级50试炼后，按相关角色70级检查等级75进阶；具体来源差异见说明。'},
        'note': trial_note,
        'sourceIds': list(dict.fromkeys(old['sourceIds'] + ['practical-trials-source'])),
        'related': list(dict.fromkeys(old.get('related', []) + ['play-weapons', 'play-secrets']))})
for eid, chapter, summary in [
    ('ancient-2', 6, '新攻略列第6章起，巡航商船40000吉尔购买；旧来源列第8章，具体以商品解锁为准。'),
    ('ancient-8', 7, '新攻略列第7章起，巡航商船45000吉尔购买；旧来源列第8章，具体以商品解锁为准。'),
    ('ancient-4', 6, '第6章雷达寻宝第二件：先领取奥德里昂北岸精金，再查格罗诺亚附近海岸；来源方位描述有差异，请对照雷达顺序与源图。'),
    ('ancient-12', 5, '先完成克洛伊的“发掘秘密”，第5章取得飞空艇后回费利西塔斯道具店对话，再到武具之间找她。')]:
    old = records[eid]
    out['corrections'].append({'id': eid, 'chapter': chapter, 'summary': summary,
        'fields': {'获得原型': summary}, 'steps': [summary, '携带原型回武具之间，调查对应底座并完成试炼。'],
        'sourceIds': list(dict.fromkeys(old['sourceIds'] + ['practical-trials-source', 'practical-ancient-source'])),
        'related': list(dict.fromkeys(old.get('related', []) + ['play-weapons', 'play-secrets'] +
                    (['quest-secrets-unearthed'] if eid == 'ancient-12' else [])))})
old = records['guide-arms-workflow']
out['corrections'].append({'id': old['id'], 'steps': [
    '第5章获得飞空艇后，前往迪尔纳多西北小岛的武具之间。',
    '携带对应古老装备，调查发光底座，挑战等级50的初次试炼。',
    '新攻略记载：对应角色达到70级且完成该初次试炼后，检查等级75进阶是否开放；防具和饰品看雷因等级。',
    '旧来源写完成全部12件后再进阶，存在来源分歧；详情请看新版武器路线。白金不要求加号版本。'],
    'note': trial_note, 'sourceIds': old['sourceIds'] + ['practical-trials-source'],
    'related': ['play-weapons', 'play-secrets']})
order = ['play-characters', 'play-visions', 'play-builds', 'play-weapons',
         'play-secrets', 'play-leveling', 'play-mastery', 'play-combos', 'play-money']
out['entries'].sort(key=lambda e: order.index(e['id']) if e['id'] in order else 99)
target = ROOT / 'apps/ff-guide/practical.json'
target.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n')
print(json.dumps({'articles': len(out['entries']), 'sources': len(out['sources']),
                  'output': str(target)}, ensure_ascii=False))
