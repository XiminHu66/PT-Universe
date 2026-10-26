import json,re,collections,os
from pathlib import Path
from bs4 import BeautifulSoup
ROOT=Path(os.environ.get('FF_GUIDE_CACHE_DIR',Path(__file__).resolve().parent))
from datetime import datetime, timezone
CHECKED=datetime.now(timezone.utc).date().isoformat()
RAW=ROOT/'raw'

def load(n):return json.loads((ROOT/('codex-'+n+'.json')).read_text())
def soup(n):return BeautifulSoup((RAW/(n+'.html')).read_text(),'html.parser')
def txt(n):return n.get_text(' ',strip=True) if n else ''
def full(url,domain='https://atma.gg'):return domain+url if url and url.startswith('/') else url
names={'Rain':'雷因','Lasswell':'拉斯韦尔','Fina':'菲娜','Lid':'利德','Nichol':'尼科尔','Jake':'杰克','Sakura':'樱','Archwitch Fina':'魔人菲娜','Warrior of Light':'光之战士','Firion':'菲利奥尼尔','Onion Knight':'洋葱剑士','Cecil':'塞西尔','Bartz':'巴兹','Terra':'蒂娜','Cloud':'克劳德','Squall':'斯考尔','Zidane':'吉坦','Tidus':'提达','Shantotto':'香托托','Vaan':'梵','Lightning':'雷霆','Y’shtola':'雅·修特拉','Noctis':'诺克提斯','Clive':'克莱夫','Sephiroth':'萨菲罗斯','Tronn':'特隆','Leah':'莉亚','Amelia':'艾米莉亚','Camille':'卡米尔','Wilhelm':'威廉','Aileen':'艾琳','Charlotte':'夏洛特','Victoria':'维多利亚','Ayaka':'彩香','Siren':'塞壬','Ramuh':'拉姆','Carbuncle':'卡邦克尔','Titan':'泰坦','Ifrit':'伊弗利特','Shiva':'希瓦','Leviathan':'利维亚桑','Odin':'奥丁','Bahamut':'巴哈姆特','Fire':'火','Ice':'冰','Lightning':'雷','Water':'水','Wind':'风','Earth':'土','Light':'光','Dark':'暗','Healing':'治疗','None':'无','Physical':'物理','Magical':'魔法','Enemy':'单体敌人','Enemies':'全体敌人','Ally':'单体友方','Allies':'全体友方','Attacker':'攻击者','Defender':'防御者','Healer':'治疗者','Breaker':'破坏者','Jammer':'干扰者','Sentinel':'防御者','Commando':'攻击者','Medic':'治疗者','Saboteur':'干扰者','Weapon':'武器','Armor':'防具','Accessory':'饰品','Greatsword':'大剑','Great Sword':'大剑','Katana':'刀','Bow':'弓','Hammer':'锤','Grimoire':'魔导书','Whip':'鞭','Gun':'枪','Rod':'杖','Light Armor':'轻甲','Heavy Armor':'重甲','Robe':'长袍','HP':'HP','MP':'MP','Physical Attack':'物攻','Magical Attack':'魔攻','Physical Defense':'物防','Magical Defense':'魔防','Magic Attack':'魔攻','Magic Defense':'魔防','Magic Point':'MP','Sanctity':'神圣（Sanctity）','Speed':'速度','Strength':'力量','Stamina':'体力','Magic':'魔力','Spirit':'精神','Intelligence':'魔力','Agility':'速度','Equip Cost':'AP容量','Hit Point':'HP','Attack':'物攻','Defense':'物防','Active':'主动','Passive':'被动','Master':'精通之魂','Ability':'能力','Black Magic':'黑魔法','White Magic':'白魔法','Support Magic':'辅助魔法','Normal':'普通','Easy':'简单','Expert':'专家','Weakness':'弱点','Resistance':'耐性','Nullify':'无效','Absorb':'吸收'}
def tr(t):return names.get(t,t)
def fmtstats(x):return ' · '.join(f'{tr(k)} {v:+g}' if isinstance(v,(int,float)) else f'{tr(k)} {v}' for k,v in x.items())
def source(id,title,url,note='',kind='游戏数据表'):
 return {'id':id,'title':title,'url':url,'kind':kind,'checked':CHECKED,'note':note}
DATA_BUILD=str(load('equipment').get('build','未标注'))
sources=[source('atma-skills','ATMA Databook · 玩家技能/被动','https://atma.gg/final-fantasy-resonance/skills','仅列可玩角色/幻兵/召唤兽/道具相关技能；避免把全部内部技能当成玩家可学。'),source('atma-enemies','ATMA Databook · 596个敌人记录','https://atma.gg/final-fantasy-resonance/enemies','包含同名不同等级/战斗变体，596是记录数，不代表596种独立怪物。'),source('codex-data','FF Resonance Codex · 正式版数据记录','https://ffresonancecodex.com/research',f'页面标注Steam正式版build{DATA_BUILD}。数据记录存在不代表任意存档可获取；公式研究保留试玩版范围。'),source('codex-world','FF Resonance Codex · 地点与奖励记录','https://ffresonancecodex.com/world',f'正式版build{DATA_BUILD}。记录奖励来源和地图，不等同完整任务流程。'),source('atma-roster','ATMA Databook · 角色与幻兵','https://atma.gg/final-fantasy-resonance/characters','使用真实游戏角色立绘与分类。')]
entries=[]
def entry(id,cat,en,summary,fields=None,steps=None,tags=None,sourceIds=None,sourceUrl=None,image=None,chapter=0,spoiler=False,related=None):
 d={'id':id,'category':cat,'title':('雷光' if en=='Lightning' and cat in ('characters','visions') else tr(en)),'en':en,'summary':summary,'fields':fields or {},'steps':steps or [],'tags':tags or [],'sourceIds':sourceIds or ['codex-data'],'chapter':chapter,'spoiler':spoiler}
 if sourceUrl:d['sourceUrl']=sourceUrl
 if image:d['image']=image
 if related:d['related']=related
 entries.append(d);return d
S=load('skills'); skills={x['id']:x for x in S['skills']}; chars=load('characters')['characters']; vis=load('visions')['visions']; passives={x['id']:x for x in load('passives')['passives']};eq=load('equipment')['equipment'];items=load('items')['items']
# Extract the world payload without executing remote scripts.
world={}
def walk(x):
 global world
 if isinstance(x,dict):
  if 'world' in x and isinstance(x['world'],dict):world=x['world']
  for v in x.values():walk(v)
 elif isinstance(x,list):
  for v in x:walk(v)
for c in re.findall(r'rsc\.push\(("(?:[^"\\]|\\.)*")\)',(RAW/'codex-world.html').read_text()):
 try:walk(json.loads(json.loads(c).split(':',1)[1]))
 except (ValueError,IndexError):pass
maps={x['id']:x for x in world.get('maps',[])}
grants=collections.defaultdict(list)
for g in world.get('grants',[]):
 if g.get('name','').startswith('Item '):continue
 loc=maps.get(g.get('mapId'),{}).get('name') or g.get('label','')
 label=f"{ {'Shop':'商店记录','Treasure':'宝箱','Event reward':'事件奖励'}.get(g.get('kind'),g.get('kind','奖励')) } · {loc}"
 if g.get('quantity') is not None:label+=f" ×{g['quantity']}"
 if g.get('condition'):label+=' · 条件：'+g['condition']
 if label not in grants[g['id']]:grants[g['id']].append(label)
# Resolve genuine atlas images and roles by exact English names.
images={};roles={};elements={};urls={}
for n in ['atma-characters','atma-visions','atma-espers']:
 b=soup(n)
 for a in b.select('main a[href]'):
  h=a.find('h2')
  if not h:continue
  name=txt(h); pic=a.find('img',alt=name)
  if pic:images[name]=full(pic.get('src'))
  urls[name]=full(a['href'])
  if a.get('data-role'):roles[name]=tr(a['data-role'])
  if a.get('data-elements'):elements[name]=[tr(e) for e in a['data-elements'].split()]
  elif n=='atma-characters':
   p=a.find('p');roles[name]=tr(txt(p))
# Skills: source card table includes playable actives, passives and mastery spirits.
bs=soup('atma-skills'); player_ids=set(); skillrelated=collections.defaultdict(list)
for card in bs.select('[data-catalog-card]'):
 a=card.select_one('summary a[href]')
 if not a:continue
 sid=int(a['href'].rsplit('/',1)[-1]); player_ids.add(sid); en=txt(a);typ=card.get('data-type','');st=skills.get(sid,{})
 f={'类型':tr(typ),'技能分类':tr(card.get('data-category',''))}
 summ=card.select_one('summary p');desc=txt(summ)
 if desc:
  f['原文效果']=desc
  if '[TEMP]' in desc:f['文本状态']='源游戏记录仍为占位描述；仅参数可查，不据此推断完整效果'
 for dl in card.select('dl'):
  for row in dl.find_all('div',recursive=False):
   dt=row.find('dt');dd=row.find('dd')
   if dt and dd:f[{'Modifier':'威力系数','Break':'破韧值','MP':'消耗MP','DMG':'伤害类型','Target':'目标','AP':'装备AP'}.get(txt(dt),txt(dt))]=tr(txt(dd))
 if st.get('element') and st['element']!='None':f['属性']=tr(st['element'])
 if st.get('hits'):f['命中段数']=st['hits']
 if st.get('internal'):f['记录范围']='ATMA列为玩家关联；Codex标记为内部记录，实际可用性依游戏为准'
 steps=[];rel=[]
 for h in card.find_all('h3'):
  if txt(h)!='Sources':continue
  ul=h.find_next_sibling('ul')
  if not ul:continue
  for li in ul.find_all('li',recursive=False):
   spans=li.find_all('span');pname=txt(spans[0]) if spans else txt(li);rule=' '.join(txt(v) for v in spans[1:]);steps.append(f"{tr(pname)}（{pname}） · {rule}" if tr(pname)!=pname else f'{pname} · {rule}');rel.append(pname);skillrelated[pname].append(sid)
 summary=' · '.join([tr(typ),tr(card.get('data-category',''))]+([f"MP {f['消耗MP']}"] if '消耗MP' in f else []))
 e=entry(f'skill-{sid}','skills',en,summary,f,steps,['游戏数据',tr(typ)],['atma-skills'],full(a['href']),related=rel)
# Character facts and learning levels, excluding author-written lore.
for c in chars:
 name=c['name'];srecord=next((r for r in S['characters'] if r['id']==c['id']),{})
 f={'定位':' / '.join(tr(x) for x in c.get('roles',[])),'武器':tr(c.get('weapon','')),'固有技能记录数':len(c.get('skills',[]))}
 steps=[]
 for g in srecord.get('growth',[]):
  nameset=[tr(skills[k]['name']) for k in g.get('skills',[]) if k in skills]
  if nameset:steps.append(f"Lv.{g['level']} · "+' / '.join(nameset))
 if not steps:steps=[skills[k]['name'] for k in c.get('skills',[]) if k in skills]
 entry(f"character-{c['id']}",'characters',name,f"{f['定位']} · {f['武器']} · 固有技能与学习等级",f,steps,['角色','主角队伍'],['codex-data','atma-roster'],urls.get(name,'https://ffresonancecodex.com/characters/'+str(c['id'])),images.get(name),spoiler=name=='Archwitch Fina',related=[f'skill-{k}' for k in c.get('skills',[]) if k in player_ids])
for c in vis:
 name=c['name'];srecord=next((r for r in S['visions'] if r['id']==c['id']),{})
 f={'定位':roles.get(name,' / '.join(tr(x) for x in c.get('roles',[]))),'关联技能数':len(c.get('skills',[]))}
 if name in elements:f['属性']=' / '.join(elements[name])
 resonance=skills.get(srecord.get('resonance'))
 if resonance:f['共鸣技能']=resonance['name'];f['共鸣效果原文']=resonance['description']
 steps=[]
 for mode,key in [('觉醒','awakening'),('精通 MR','mastery')]:
  for rank in srecord.get(key,[]):
   bn=[tr(v.get('name','')) for v in rank.get('benefits',[]) if v.get('name')]
   if bn:steps.append((f"觉醒 {rank['rank']-1} 星"+('（初始）' if rank['rank']==1 else '') if key=='awakening' else f"{mode} {rank['rank']}")+' · '+' / '.join(bn))
 entry(f"vision-{c['id']}",'visions',name,f"{f['定位']} · "+f.get('属性','幻兵'),f,steps,['幻兵',f['定位']],['codex-data','atma-roster'],urls.get(name,'https://ffresonancecodex.com/visions/'+str(c['id'])),images.get(name),spoiler=name=='Sephiroth',related=[f'skill-{k}' for k in c.get('skills',[]) if k in player_ids])
for c in load('espers')['espers']:
 f={'基础参数':fmtstats(c.get('base',{})),'参数版本':c.get('evidence',{}).get('build','未标注'),'版本说明':'基础成长记录源自试玩版；获取条件请查看正式版收集攻略，数值尚未游戏内独立复测'}
 sig=skills.get(c.get('signatureId'))
 if sig:f['招牌技能']=sig['name'];f['技能效果原文']=sig['description']
 entry(f"esper-{c['id']}",'espers',c['name'],'召唤兽 · 基础参数与技能',f,[skills[k]['name'] for k in c.get('skillIds',[]) if k in skills],['召唤兽','版本注明'],['codex-data','atma-roster'],urls.get(c['name'],'https://ffresonancecodex.com/espers/'+str(c['id'])),images.get(c['name']),related=[f'skill-{k}' for k in c.get('skillIds',[]) if k in player_ids])
# Equipment stats are game record facts; free passive descriptions come from the game tables.
for q in eq:
 f={'类型':tr(q['type']),'类别':tr(q['subtype']) if q.get('subtype')!='None' else tr(q['type']),'属性加成':fmtstats(q.get('stats',{})) or '无基础属性加成'}
 pd=[passives[p] for p in q.get('passives',[]) if p in passives]
 if pd:f['装备被动']='；'.join(p['name']+' — '+p['description'] for p in pd)
 acq=grants[q['id']]
 if acq:f['已记录获取来源']='；'.join(acq)
 entry('equipment-'+str(q['id']),'equipment',q['name'],f['类别']+' · '+f['属性加成'],f,tags=['装备',f['类别']],sourceIds=['codex-data']+(['codex-world'] if acq else []),sourceUrl='https://ffresonancecodex.com/equipment/'+str(q['id']),related=[f"skill-{p['id']}" for p in pd if p['id'] in player_ids])
for q in items:
 if q.get('unfinished') or q.get('name','').startswith('Item '):continue
 f={'分类':q.get('category','物品'),'效果原文':q.get('description',''),'购买价':q['buyingPrice'] if q.get('buyingPrice') else '未记录可购买价格','售价':q.get('sellingPrice',0),'可出售':'是' if q.get('sellable') else '否'}
 if grants[q['id']]:f['已记录获取来源']='；'.join(grants[q['id']])
 entry('item-'+str(q['id']),'items',q['name'],q.get('category','物品'),f,tags=['物品'],sourceIds=['codex-data']+(['codex-world'] if grants[q['id']] else []),sourceUrl='https://ffresonancecodex.com/item/'+str(q['id']))
for m in maps.values():
 if not m.get('name') or m['name'].startswith('Map '):continue
 f={'地图记录ID':m['id']}
 if m.get('dangerLevel'):f['危险等级']=m['dangerLevel']
 rewards=[g['name']+f" ×{g.get('quantity',1)}" for g in world.get('grants',[]) if g.get('mapId')==m['id'] and not g.get('name','').startswith('Item ')]
 if rewards:f['奖励记录']='；'.join(dict.fromkeys(rewards))
 entry('location-'+str(m['id']),'locations',m['name'],'地图记录'+(f" · 危险等级{m['dangerLevel']}" if m.get('dangerLevel') else ''),f,tags=['地图','数据记录'],sourceIds=['codex-world'],sourceUrl='https://ffresonancecodex.com/world')
# Enemy rows include variants. Where fetched, parse all displayed difficulty stats, affinities and loot.
statlabels={'ATK':'物攻','DEF':'物防','MATK':'魔攻','MDEF':'魔防','SANC':'神圣（SANC）','SPD':'速度','EXP':'经验','Gil':'吉尔'}
enemy_details=0
for c in soup('atma-enemies').select('[data-enemy-card]'):
 a=c.find('a');eid=a['href'].rsplit('/',1)[-1];en=txt(c.find('h2'));lv=txt(c.find('span'));f={'等级':lv.replace('Lv. ',''),'类型':'BOSS' if c.get('data-type')=='boss' else '普通敌人','记录口径':'包含剧情/斗技场等同名不同变体，以记录ID区分'};steps=[];path=RAW/('enemy-'+eid+'.html');pic=c.find('img');image=full(pic.get('src')) if pic else None
 if path.exists():
  b=BeautifulSoup(path.read_text(),'html.parser');main=b.find('main');enemy_details+=1
  for dl in main.select('dl'):
   if not dl.find_parent('header') and not dl.select('[data-difficulty-values]'):continue
   for row in dl.find_all('div',recursive=False):
    dt=row.find('dt',recursive=False);dd=row.find('dd',recursive=False)
    if not(dt and dd):continue
    key=txt(dt)
    if key not in ['HP','MP','BP','ATK','DEF','MATK','MDEF','SANC','SPD','EXP','Gil']:continue
    vals=dd.get('data-difficulty-values')
    if vals:
     v=json.loads(vals)
     for dk,dv in v.items():f[tr(dk)+'·'+statlabels.get(key,key)]=dv
    else:f[statlabels.get(key,key)]=txt(dd)
  for sec,key in [('affinities','属性相性'),('resistances','异常耐性')]:
   h=main.find(id=sec)
   if not h:continue
   nxt=h.find_next_sibling();vals=[r.get('title','') for r in nxt.select('[title]') if r.get('title')]
   if vals:f[key]=' / '.join(':'.join(tr(z.strip()) for z in v.split(':')) for v in vals)
   elif txt(nxt):f[key]=txt(nxt)
  h=main.find(id='loot')
  if h:
   dl=h.find_next_sibling('dl')
   if dl:
    for row in dl.find_all('div',recursive=False):
     dt=row.find('dt',recursive=False);dd=row.find('dd',recursive=False)
     if dt and dd:
      for pop in dd.select('[popover],script'):pop.decompose()
      f[{'Drop':'掉落','Rare drop':'稀有掉落','Steal':'偷窃','Rare steal':'稀有偷窃'}.get(txt(dt),txt(dt))]=txt(dd)
  skill_header=main.find(id='skills')
  enemy_skills=[]
  if skill_header:
   for article in skill_header.find_next_siblings('article'):
    icon=article.find('img')
    if icon and icon.get('alt'):enemy_skills.append(icon['alt'])
  enemy_skills=list(dict.fromkeys(enemy_skills))
  if enemy_skills:f['敌方技能']=' / '.join(enemy_skills)
  h=main.find(id='traits')
  if h:steps.extend(txt(r) for r in h.find_next_sibling().find_all('li',recursive=False))
 else:f['详情范围']='索引已核验，详细参数未下载'
 entry('enemy-'+eid,'enemies',en,f"{f['类型']} · Lv.{f['等级']}"+(' · 弱点/掉落/三难度参数' if path.exists() else ''),f,steps,['敌人',f['类型']],['atma-enemies'],full(a['href']),image,spoiler=c.get('data-type')=='boss')
# Quest index facts: chapter, named region and recorded rewards. No invented walkthrough steps.
if (RAW/'atma-quests.html').exists():
 sources.append(source('atma-quests','ATMA Databook · 支线任务索引','https://atma.gg/final-fantasy-resonance/quests','章节为该站任务表记录；存在攻略来源章数差异时应回游戏确认。'))
 for row in soup('atma-quests').select('tbody tr'):
  a=row.select_one('th a[href]');tds=row.find_all('td',recursive=False)
  if not a or len(tds)<2:continue
  chapter=int(txt(tds[0])) if txt(tds[0]).isdigit() else 0
  region=txt(tds[1]);reward=[]
  for td in tds[2:]:
   for pop in td.select('[popover],script'):pop.decompose()
   for li in td.select('li'):reward.append(txt(li))
  f={'章节记录':chapter,'地区':region,'奖励':' / '.join(reward),'范围':'索引事实；未据此推断NPC位置或完整触发前置'}
  entry('quest-'+a['href'].rsplit('/',1)[-1],'quests',txt(a),f'第{chapter}章 · {region} · 支线任务',f,tags=['支线任务',region],sourceIds=['atma-quests'],sourceUrl=full(a['href']),chapter=chapter)
meta={'retrievedAt':CHECKED,'version':'full-release-reference-'+CHECKED,'counts':dict(collections.Counter(e['category'] for e in entries)),'enemyDetails':enemy_details,'scope':'真实公开游戏记录快照；英文原名保留便于检索；中文名称为常见译名对照，游戏内译名优先。敌人含同名变体。所有未核验的故事门槛/公式不生成推断。召唤兽基础成长保留试玩版来源。'}
output={'sources':sources,'entries':entries,'meta':meta};tmp=ROOT/'database.json.tmp';tmp.write_text(json.dumps(output,ensure_ascii=False,indent=2));os.replace(tmp,ROOT/'database.json');print(json.dumps(meta,ensure_ascii=False))
