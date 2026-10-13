import fs from 'node:fs';
import path from 'node:path';
import {mergeFallback} from './snapshot-merge.mjs';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'../..');
const worker=path.join(root,'workers/pt-universe-api');
for(const name of ['site-updates.json','music.json']){
 const file=path.join(root,'apps/tsugi-checker/data',name);let snapshot=JSON.parse(fs.readFileSync(file,'utf8'));
 if(!snapshot.generated_at||!snapshot.refresh_source?.startsWith('github:'))throw Error(name+': unmarked snapshot');
 let current;
 try{const r=await fetch('https://pt-universe-api.summer07-nanjolno.workers.dev/api/data/'+name,{headers:{'user-agent':'Mozilla/5.0 PT-Universe fallback publisher'},signal:AbortSignal.timeout(20_000)});if(r.ok){current=await r.json();if(typeof current==='string')current=JSON.parse(current)}}catch{}
 const merged=mergeFallback(current,snapshot);
 if(merged.skip){console.log('Kept newer Cloudflare '+name);continue}
 snapshot=merged.snapshot;fs.writeFileSync(file,JSON.stringify(snapshot,null,2)+'\n');
 const child=spawnSync(path.join(worker,'node_modules/.bin/wrangler'),['kv','key','put','data/'+name,'--binding','PT_UNIVERSE_DATA','--path',file,'--metadata',JSON.stringify({updatedAt:snapshot.generated_at}),'--remote'],{cwd:worker,stdio:'inherit',env:process.env});
 if(child.status!==0)throw Error(name+': Cloudflare snapshot import failed');
 console.log('Published '+name+' '+snapshot.generated_at+' '+snapshot.refresh_source);
}
