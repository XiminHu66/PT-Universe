"""Build read-only inventory from audited API responses and workflow source.

No scheduler or external mutation. Private input requires an output OUTSIDE the
public repository. JSON inputs are local audit records, not credentials.
"""
import argparse,json,re,datetime
from pathlib import Path
import yaml

ROOT=Path(__file__).resolve().parents[2]
def workflow(source,meta=None,repo=''):
    meta=meta or {};d=yaml.safe_load(source) or {};on=d.get('on',d.get(True,{}))
    if isinstance(on,str):on={on:None}
    if isinstance(on,list):on=dict.fromkeys(on)
    if not isinstance(on,dict):on={}
    jobs=list((d.get('jobs') or {}).values());runners=[];retention=[];timeouts=[]
    for j in jobs:
        rs=j.get('runs-on',[]);runners+=rs if isinstance(rs,list) else [str(rs)]
        if j.get('timeout-minutes'):timeouts.append(str(j['timeout-minutes'])+' 分钟')
        for s in j.get('steps',[]):
            if 'upload-artifact@' in s.get('uses','') or 'upload-pages-artifact@' in s.get('uses',''):
                retention.append(str(s.get('with',{}).get('retention-days','未指定'))+' 天')
    schedules=on.get('schedule',[]) or []
    return {'name':d.get('name',meta.get('name','未命名')),'path':meta.get('path',''),'state':meta.get('state','source_verified'),'events':list(on),'crons':[s.get('cron','')+' · '+s.get('timezone','UTC') for s in schedules],'runners':sorted(set(runners)),'timeout':' / '.join(sorted(set(timeouts))) or '未取得','retention':' / '.join(sorted(set(retention))) or '无上传','url':meta.get('html_url') or f'https://github.com/XiminHu66/{repo}/blob/main/{meta.get("path","")}'}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--audit',type=Path,required=True);ap.add_argument('--private-input',type=Path);ap.add_argument('--output',type=Path,required=True);args=ap.parse_args()
    if args.private_input and args.output.resolve().is_relative_to(ROOT):raise SystemExit('Private inventory must never be written inside the public repository')
    repos=[]
    for f in sorted(args.audit.glob('*.json')):
        if f.name=='repos.json':continue
        d=json.loads(f.read_text());ws=[]
        for w in d.get('workflows',{}).get('workflows',[]):
            p=args.audit/'source'/d['name']/w['path']
            if d['name']=='PT-Universe':p=ROOT/w['path']
            ws.append(workflow(p.read_text(),w,d['name']) if p.exists() else {**{k:w.get(k) for k in ['name','path','state']},'events':[],'crons':[],'runners':[],'note':'未取得 YAML，触发方式待核实','url':w.get('html_url')})
        aa=d.get('artifacts',{});arts=[x for x in aa.get('artifacts',[]) if not x.get('expired')]
        r={'name':d['name'],'visibility':'public','url':'https://github.com/XiminHu66/'+d['name'],'workflows':ws,'artifacts':None if 'error' in aa else {'bytes':sum(x.get('size_in_bytes',0) for x in arts),'count':len(arts),'partial':aa.get('total_count',0)>len(aa.get('artifacts',[]))},'note':'公开仓库 · '+str(len(ws))+' 个工作流'}
        repos.append(r)
    if args.private_input:repos+=json.loads(args.private_input.read_text())
    workers=[]
    for p in (ROOT/'workers').glob('*/wrangler.jsonc'):
        # Current audited manifests are JSON; don't evaluate JSONC as code.
        c=json.loads(p.read_text());bindings=[]
        for key in ['d1_databases','kv_namespaces','durable_objects','browser','queues','services']:
            if c.get(key):bindings.append(key)
        workers.append({'name':c.get('name',p.parent.name),'platform':'Cloudflare','note':'仓库配置 · '+', '.join(bindings),'detail':'Cron: '+(' / '.join(c.get('triggers',{}).get('crons',[])) or '无')+'；线上账户列表与实际用量未连接。','url':'https://github.com/XiminHu66/PT-Universe/blob/main/'+str(p.relative_to(ROOT))})
    for p in sorted((ROOT/'apps').glob('*/index.html')):
        source=p.read_text();title=re.search(r'<title>(.*?)</title>',source,re.S|re.I)
        workers.append({'name':title.group(1).strip() if title else p.parent.name,'platform':'Pages','note':'PT Universe 子页面 · '+p.parent.name,'detail':'随现有 Pages 分发，不单独新增后端。部分入口为整合后的兼容跳转。','url':'https://ximinhu66.github.io/PT-Universe/apps/'+p.parent.name+'/'})
    reference=ROOT/'apps/resource-center/public.json'
    prior=json.loads(args.output.read_text()) if args.output.exists() else json.loads(reference.read_text()) if reference.exists() else {}
    # Preserve measurement timestamps; inventory refresh is not a billing refresh.
    extras=[p for p in prior.get('projects',[]) if p.get('platform') in ['VPS','Sites']] if args.private_input else []
    out={'schemaVersion':1,'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'repositories':repos,'projects':workers+extras,'quotas':prior.get('quotas',[]),'providerNotes':prior.get('providerNotes',{})}
    if args.private_input and prior.get('githubBudget'):out['githubBudget']=prior['githubBudget']
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(f'Inventory: {len(repos)} repositories, {sum(len(r["workflows"]) for r in repos)} workflows, {len(workers)} configured resources/pages')
if __name__=='__main__':main()
