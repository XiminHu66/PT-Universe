import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';
import {createPublicGameFeed} from './public-game-feed.mjs';
test('fixed public feed capability protects origin, method, path and missing data',async()=>{
 const root=await mkdtemp(tmpdir()+'/pt-feed-'),origin='https://owner.example';
 try{
  const handle=createPublicGameFeed({siteOrigin:origin,root});let result;
  const call=async(path,method='GET',o=origin)=>{const res={writeHead(status){result={status};},end(body){result.body=JSON.parse(body)}};const handled=await handle({method,headers:{origin:o}},res,new URL(path,origin));return {handled,...result};};
  assert.equal((await call('/other')).handled,false);
  assert.equal((await call('/hub/api/public-feeds/games','GET','https://evil.example')).status,403);
  assert.equal((await call('/hub/api/public-feeds/games','POST')).status,405);
  assert.equal((await call('/hub/api/public-feeds/games')).status,503);
  await writeFile(root+'/game-releases.json',JSON.stringify({generated_at:'2026-10-29T04:00:00Z',items:{pc:[{id:'game'}]},sources:{steam:{ok:true}}}));
  assert.equal((await call('/hub/api/public-feeds/games')).body.items.pc[0].id,'game');
 }finally{await rm(root,{recursive:true,force:true});}
});
