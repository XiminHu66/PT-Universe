import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'../..');
const worker=path.join(root,'workers/pt-universe-api');
for(const name of ['site-updates.json','music.json']){
 const file=path.join(root,'apps/tsugi-checker/data',name),snapshot=JSON.parse(fs.readFileSync(file,'utf8'));
 if(!snapshot.generated_at||!snapshot.refresh_source?.startsWith('github:'))throw Error(name+': unmarked snapshot');
 const child=spawnSync(path.join(worker,'node_modules/.bin/wrangler'),['kv','key','put','data/'+name,'--binding','PT_UNIVERSE_DATA','--path',file,'--metadata',JSON.stringify({updatedAt:snapshot.generated_at}),'--remote'],{cwd:worker,stdio:'inherit',env:process.env});
 if(child.status!==0)throw Error(name+': Cloudflare snapshot import failed');
 console.log('Published '+name+' '+snapshot.generated_at+' '+snapshot.refresh_source);
}
