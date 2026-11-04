import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sourceURL,canJoin,Reader,createReader} from './reader.mjs';
test('restrict source routes, credentials, ports, and pagination boundaries',()=>{
 for(const u of ['https://evil.test/novel/1.html','http://www.bilinovel.net/','https://u:p@www.bilinovel.net/','https://www.bilinovel.net:444/','https://www.bilinovel.net/admin.php'])assert.throws(()=>sourceURL(u));
 for(const u of ['https://www.bilinovel.net/','https://www.bilinovel.net/login.php','https://www.bilinovel.net/novel/2059/catalog','https://www.bilinovel.net/novel/2059/73799_2.html'])assert.equal(sourceURL(u),u);
 assert.ok(canJoin('https://www.bilinovel.net/novel/2059/73799.html','https://www.bilinovel.net/novel/2059/73799_2.html'));
 assert.ok(!canJoin('https://www.bilinovel.net/novel/2059/73799.html','https://www.bilinovel.net/novel/2059/73800.html'));
});
const page=(suffix='',paragraphs=['第一段'])=>({url:'https://www.bilinovel.net/novel/2059/73799'+suffix+'.html',title:'本章',bookTitle:'本书',bookId:'2059',paragraphs,next:'https://www.bilinovel.net/novel/2059/73800.html',previous:null,catalog:'https://www.bilinovel.net/novel/2059/catalog',nextPage:false});
test('chapter pagination pauses for manual verification and resumes without losing or duplicating text',async()=>{
 const r=new Reader({data:'/tmp',control:{}});try{
  const one={...page(),nextPage:true,next:page('_2').url};r.navigate=async url=>({...page('_2'),paragraphs:[],reason:'source-verification'});
  const blocked=await r.collect(one);assert.equal(blocked.kind,'verification');assert.deepEqual(r.pending.paragraphs,['第一段']);
  const read=await r.collect(page('_2',['第二页第一段','第二页第二段']));assert.equal(read.kind,'chapter');assert.deepEqual(read.paragraphs,['第一段','第二页第一段','第二页第二段']);assert.equal(read.pages,2);assert.equal(read.next,page().next);assert.equal(r.pending,null);
 }finally{clearInterval(r.timer)}
});
test('does not return protected/failed contents or join a different chapter',async()=>{
 const r=new Reader({data:'/tmp',control:{}});try{
  const blocked=await r.collect({...page(),paragraphs:[],reason:'login'});assert.equal(blocked.kind,'verification');assert.ok(!('paragraphs'in blocked));
  await assert.rejects(r.collect({...page(),url:page().next}),/章节已切换/);
 }finally{clearInterval(r.timer)}
});
test('reader actions serialize, release busy state after errors, and expire on demand',async()=>{
 const r=new Reader({data:'/tmp',control:{closePages:async()=>{},disconnect(){}}});try{r.busy=true;await assert.rejects(r.serial(()=>{}),/上一项/);r.busy=false;await assert.rejects(r.serial(()=>{throw Error('failed')}));assert.equal(r.busy,false);await r.suspend();assert.equal(r.last,0)}finally{clearInterval(r.timer)}
});
test('only mounted routes are handled and foreign-origin writes are rejected',async()=>{
 const d=await mkdtemp(join(tmpdir(),'reader-test-')),r={close(){}};try{const handler=createReader({data:d,origin:'https://private.example',token:'fixture',reader:r});const res={writeHead(s,h){this.status=s;this.headers=h},end(v){this.value=v}};assert.equal(await handler({method:'GET',headers:{}},res,new URL('https://local/other')),false);await handler({method:'POST',headers:{origin:'https://evil.test'}},res,new URL('https://local/reader/api/open'));assert.equal(res.status,403);await handler({method:'GET',headers:{}},res,new URL('https://local/reader/api/state'));assert.equal(JSON.parse(res.value).token,'fixture')}finally{await rm(d,{recursive:true,force:true})}
});

test('closing the manual panel restores filtering without consuming pending chapter pages',async()=>{
 const r=new Reader({data:'/tmp',control:{}});try{const pending={start:page().url,paragraphs:['已读取'],pages:1};r.pending=pending;r.manual=true;r.ensure=async()=>{};let filtered=false;r.filters=async()=>{filtered=!r.manual};await r.leaveManual();assert.equal(r.pending,pending);assert.ok(filtered)}finally{clearInterval(r.timer)}
});
