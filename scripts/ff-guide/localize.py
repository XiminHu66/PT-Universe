#!/usr/bin/env python3
"""Localize the factual catalog, retaining source text and checking every numeric token.

Uses versioned, independently translated sentence pairs and a reviewed glossary.
No network service or credential is required for repeat runs. Translations are
comparison translations, not a claim to be official in-game Chinese strings.
"""
import argparse
import copy
import datetime
import json
import os
from pathlib import Path
import re
import tempfile

ROOT = Path(__file__).resolve().parents[2]
FIELDS = ['title','summary','fields','steps','tags','note','provenance','sections','version']
BUILTIN = {
 'None':'无', 'No status ailment resistances.':'无异常状态抗性。',
 'Easily staggered.':'容易被击破。', 'Key & Quest Items':'关键与任务道具',
 'Recovery Items':'恢复道具','Battle Items':'战斗道具','Materials':'材料',
 'Weapon':'武器','Weapons':'武器','Armor':'防具','Accessories':'饰品',
 'Active':'主动','Passive':'被动','Master':'精通之魂','Ability':'能力',
 'Physical':'物理','Magical':'魔法','Enemy':'单体敌人','Enemies':'全体敌人',
 'Ally':'单体友方','Allies':'全体友方','Battle Skill':'战斗技能',
 'Attack':'攻击','Potion':'治疗剂','Hi-Potion':'高级治疗剂','X-Potion':'特级治疗剂',
 'Ether':'以太','Turbo Ether':'高级以太','Elixir':'圣灵药','Megalixir':'百万圣灵药',
 'Phoenix Down':'凤凰尾巴','Phoenix Pinion':'凤凰尾羽','Tent':'帐篷',
 'Smoke Bomb':'烟雾弹','Remedy':'万能药','Antidote Herb':'解毒草',
 'Echo Herb':'回声草','Unicorn Horn':'独角兽之角','Magicite':'魔石',
 'Magicite Shard':'魔石碎片','Magicite Cryst':'魔石结晶','Adamantite':'精金',
 'Rain':'雷因','Lasswell':'拉斯韦尔','Fina':'菲娜','Lid':'利德','Nichol':'尼科尔',
 'Jake':'杰克','Sakura':'樱','Archwitch Fina':'魔人菲娜','Cloud':'克劳德',
 'Lightning':'雷光','Sephiroth':'萨菲罗斯','Terra':'蒂娜','Tronn':'特隆',
 'Leah':'莉亚','Ayaka':'彩香','Siren':'塞壬','Ramuh':'拉姆','Carbuncle':'卡邦克尔',
 'Titan':'泰坦','Ifrit':'伊弗利特','Shiva':'希瓦','Leviathan':'利维亚桑',
 'Odin':'奥丁','Bahamut':'巴哈姆特','Grandshelt':'格兰谢尔特','Mitra':'米特拉',
 'Dilmagia':'迪尔玛吉亚','Olderion':'奥尔德里昂','Zoldaad':'佐尔达德',
 'Mysidia':'米西迪亚','Gronoa':'格罗诺亚','Fohlen':'法姆','Kol':'科尔',
 'HP':'生命值','MP':'魔力值','AP':'能力点','MRP':'精通经验','MR':'精通等级',
 'BP':'韧性值','LB':'极限爆发','EXP':'经验值','SANC':'神圣属性','ID':'编号',
 'BOSS':'首领','Boss':'首领','Lv':'等级','FF':'最终幻想','PS5':'平台奖杯',
 'ATMA':'阿特玛资料库','Codex':'共鸣宝典','Steam':'蒸汽平台',
 'TEMP':'原始文本待完善','Shop':'商店','Map':'地图','Story event reward':'剧情事件奖励',
 '原文效果':'效果说明','效果原文':'效果说明','共鸣效果原文':'共鸣效果',
 '技能效果原文':'技能效果','神圣（SANC）':'神圣属性','记录ID':'记录编号',
}
REVIEW_FILE = Path(__file__).with_name('zh-overrides.json')
CACHE_FILE = Path(__file__).with_name('translations.json')
ALPHABET = re.compile(r'[A-Za-z]')
MARKERS = re.compile(r'[\[【(（]\s*Z\s*(\d+)\s*[\]】)）]')


def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', dir=path.parent, delete=False, encoding='utf-8') as stream:
        json.dump(data,stream,ensure_ascii=False,separators=(',',':'))
        stream.write('\n');temporary=Path(stream.name)
    os.replace(temporary,path)


def strings(value):
    if isinstance(value,str):
        yield value
    elif isinstance(value,list):
        for item in value:yield from strings(item)
    elif isinstance(value,dict):
        for key,item in value.items():
            yield key
            yield from strings(item)


def numeric_tokens(value):
    value = re.sub(r'(?<=\d),(?=\d{3}\b)','',value)
    return sorted(re.findall(r'\d+(?:\.\d+)?',value))


def has_han(value):return bool(re.search(r'[\u3400-\u9fff]',value))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=ROOT/'apps/ff-guide/data.json')
    parser.add_argument('--output',type=Path,default=ROOT/'apps/ff-guide/data.json')
    parser.add_argument('--allow-incomplete',action='store_true',help='Development only: emit a report and incomplete output to an explicit scratch path.')
    args=parser.parse_args()
    data=json.loads(args.source.read_text())
    original_entries={e['id']:copy.deepcopy(e.get('original') or {k:e[k] for k in FIELDS if k in e}) for e in data['entries']}
    existing_names={e['en']:original_entries[e['id']]['title'] for e in data['entries'] if e.get('en') and has_han(original_entries[e['id']]['title']) and not ALPHABET.search(original_entries[e['id']]['title']) and len(original_entries[e['id']]['title'])<50}
    reviewed={}
    if REVIEW_FILE.exists():reviewed=json.loads(REVIEW_FILE.read_text()).get('translations',{})
    glossary={**existing_names,**BUILTIN,**reviewed}
    # Character Lightning is separate from the elemental label, which is already 雷.
    glossary['Lightning']='雷光'
    for e in data['entries']:
        if e['category'] in ['characters','visions','espers'] and e.get('en') in reviewed:
            old=original_entries[e['id']]['title'];new=reviewed[e['en']]
            if has_han(old) and not ALPHABET.search(old) and old!=new:glossary[old]=new
    # Keep Arabic identifiers inside translated names so cross-language audit is exact.
    numeral_names={'The Hunger v2':'饿鬼·第2型','The Hunger v5':'饿鬼·第5型','Test Subject No. 9':'9号实验体','No. 999':'999号','Page 32':'第32页','Page 64':'第64页','Page 256':'第256页','消費MP1/20':'魔力消耗：1/20'}
    for a,b in numeral_names.items():glossary[a]=b
    for n in [1,2,3]:
        glossary[f'Level {n} Lab Key Card']=f'{n}级实验室门卡'
        glossary[f'Level {n} Lab Key Card+']=f'{n}级实验室门卡＋'
    for n in [1,2,3,4]:glossary[f'アルテマスキル{n}']=f'究极技能{n}'
    glossary['オートLBチャージ2']='自动积蓄极限爆发2'
    cache=json.loads(CACHE_FILE.read_text()).get('translations',{}) if CACHE_FILE.exists() else {}
    for f in sorted(Path(__file__).parent.glob('effects-*.json')):
        cache.update(json.loads(f.read_text()).get('translations',{}))
    cache.update(reviewed)
    supplemental=Path(__file__).with_name('zh-supplement.json')
    if supplemental.exists():
        extra=json.loads(supplemental.read_text()).get('translations',{});glossary.update(extra);cache.update(extra)
    stats={'requests':0,'numericRepairs':0,'manualGlossary':len(reviewed)}
    problems=[]

    patterns={}
    def replace_terms(text,terms):
        if text in terms:return terms[text]
        signature=(id(terms),len(terms))
        pattern=patterns.get(signature)
        if pattern is None:
            choices=sorted((k for k,v in terms.items() if k and k!=v),key=len,reverse=True)
            pattern=re.compile(r'(?<![A-Za-z])(?:'+('|'.join(re.escape(k) for k in choices))+r')(?![A-Za-z])')
            patterns[signature]=pattern
        text=pattern.sub(lambda m:terms[m.group()],text)
        text=text.replace('雷（雷光）','雷光').replace('雷(雷光)','雷光')
        text=re.sub(r'([\u3400-\u9fff·]+)[（(]\1[）)]',r'\1',text)
        return text

    def finish(text):
        for _ in range(2):
            new=replace_terms(text,glossary)
            if new==text:break
            text=new
        text=text.replace('No status ailment resistances.','无异常状态抗性。').replace('[TEMP]','原始文本待完善')
        for token,chinese in [('Lv','等级'),('MRP','精通经验'),('MR','精通等级'),('HP','生命值'),('MP','魔法值'),('AP','能力点'),('BP','韧性值')]:
            text=re.sub(r'(?<![A-Za-z])'+token+r'\.?(?=\d)',chinese,text)
        for a,b in [('雷（雷光）','雷光'),('雷(雷光)','雷光'),('精通等级精通','精通等级'),('精通 精通等级','精通等级'),('。。','。'),('等级.','等级'),('利德','莉德'),('尼科尔','尼柯尔')]:text=text.replace(a,b)
        text=re.sub(r'([\u3400-\u9fff·]+)[（(]\1[）)]',r'\1',text)
        return text.strip()

    # Runtime is fully offline: translated prose and reviewed terminology are versioned.
    # Numeric tokens may move with Chinese clause order but cannot be added or removed.
    def run_phase(texts,label):
        missing=[]
        for raw in dict.fromkeys(texts):
            if not ALPHABET.search(raw):continue
            prepared=replace_terms(raw,glossary)
            if raw in cache or prepared in cache:continue
            if not ALPHABET.search(prepared):cache[prepared]=prepared;continue
            missing.append({'source':raw,'prepared':prepared})
        print(label,'pending',len(missing),flush=True)
        return missing

    # Phase 1: establish a single name for each entity before translating references to it.
    title_strings=[o['title'] for o in original_entries.values()]
    run_phase(title_strings,'names')
    for e in data['entries']:
        original_title=original_entries[e['id']]['title']
        prepared=replace_terms(original_title,glossary)
        chinese=finish(cache.get(prepared,prepared))
        if e.get('en') and has_han(chinese):glossary[e['en']]=chinese
    glossary.update(BUILTIN);glossary.update(reviewed);glossary.update(numeral_names);glossary['Lightning']='雷光'
    if supplemental.exists():glossary.update(extra)
    for n in [1,2,3]:
        glossary[f'Level {n} Lab Key Card']=f'{n}级实验室门卡'
        glossary[f'Level {n} Lab Key Card+']=f'{n}级实验室门卡＋'
    all_strings=[]
    for o in original_entries.values():all_strings.extend(strings(o))
    # Source branding is preserved behind the evidence pane, but source descriptions are Chinese.
    for source in data['sources']:
        for k in ['title','scope','note','description','kind','author']:
            if isinstance(source.get(k),str):all_strings.append(source[k])
    run_phase(all_strings,'content')

    def localize(text):
        if not isinstance(text,str):return text
        if text in glossary:return finish(glossary[text])
        if text in cache:
            result=cache[text]
        else:
            prepared=replace_terms(text,glossary)
            result=cache.get(prepared,prepared)
        result=finish(result)
        if numeric_tokens(text)!=numeric_tokens(result):
            problems.append({'source':text,'translated':result,'reason':'Final numeric tokens mismatch'})
            if not args.allow_incomplete:raise ValueError('Final number check failed: '+text+' => '+result)
        return result

    def recursive(value):
        if isinstance(value,str):return localize(value)
        if isinstance(value,list):return [recursive(v) for v in value]
        if isinstance(value,dict):return {localize(k):recursive(v) for k,v in value.items()}
        return value

    for e in data['entries']:
        original=original_entries[e['id']]
        e['original']=original
        for key,value in original.items():e[key]=recursive(value)
        if e.get('en') in glossary and e['id'].startswith(('skill-','equipment-','item-','character-','vision-','esper-','enemy-','location-','quest-')):
            e['title']=finish(glossary[e['en']])
        if e.get('en') and e['title']!=e.get('en'):
            e['translationNote']='中文对照译名；可展开原文核对，不冒称全部使用官方本地化文本。'
    for source in data['sources']:
        source.setdefault('original',{k:source[k] for k in ['title','scope','note','description','kind','author'] if k in source})
        for k in ['title','scope','note','description','kind','author']:
            if isinstance(source.get(k),str):source[k]=localize(source[k])
    residual=[]
    for e in data['entries']:
        for k in FIELDS:
            for text in strings(e.get(k)):
                if ALPHABET.search(text) or re.search(r'[\u3040-\u30ff]',text):residual.append({'id':e['id'],'field':k,'text':text})
    stats.update({'entries':len(data['entries']),'cachedStrings':len(cache),'residualStrings':len(residual),'residualUnique':len({x['text'] for x in residual}),'translatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()})
    data['localization']={'language':'zh-CN','method':'中文对照翻译＋统一术语校订','originalText':'各条目 original 字段保留完整展示原文；英文名称保留在 en 字段供检索','numericPolicy':'所有展示字符串逐一校验原始数字；原始数值类型与数据编号不变',**stats}
    report={'statistics':stats,'numericRepairs':problems,'residualEnglish':residual}
    atomic_json(Path(__file__).with_name('localization-report.json'),report)
    atomic_json(CACHE_FILE,{'schemaVersion':1,'provider':'逐句对照翻译与统一术语校订（离线缓存）','translations':cache})
    if residual and not args.allow_incomplete:
        raise RuntimeError(f'{len(residual)} untranslated strings remain; original output retained. See localization-report.json.')
    atomic_json(args.output,data)
    print(json.dumps(stats,ensure_ascii=False),flush=True)

if __name__=='__main__':main()
