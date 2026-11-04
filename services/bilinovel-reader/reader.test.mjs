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
test('legacy route redirects, disables all remote operations and closes only its own target',async()=>{
 let connected=0,closed=0,disconnected=0;
 const control={async connect(){connected++},async closePages(){closed++},disconnect(){disconnected++}};
 const handler=createReader({control});const res={writeHead(s,h){this.status=s;this.headers=h},end(v){this.value=v}};
 assert.equal(await handler({method:'GET'},res,new URL('https://local/other')),false);
 await handler({method:'GET'},res,new URL('https://local/reader/'));assert.equal(res.status,302);assert.equal(res.headers.location,'https://ximinhu66.github.io/PT-Universe/apps/bilinovel-reader/');
 for(const path of ['state','open','manual','screen','action']){await handler({method:'POST'},res,new URL('https://local/reader/api/'+path));assert.equal(res.status,410);assert.equal(JSON.parse(res.value).mode,'local');assert.ok(!('token'in JSON.parse(res.value)));}
 await handler.close();assert.deepEqual([connected,closed,disconnected],[1,1,1]);
});

test('closing the manual panel restores filtering without consuming pending chapter pages',async()=>{
 const r=new Reader({data:'/tmp',control:{}});try{const pending={start:page().url,paragraphs:['已读取'],pages:1};r.pending=pending;r.manual=true;r.ensure=async()=>{};let filtered=false;r.filters=async()=>{filtered=!r.manual};await r.leaveManual();assert.equal(r.pending,pending);assert.ok(filtered)}finally{clearInterval(r.timer)}
});

test('rendered extraction excludes source scale-zero bait while keeping legitimate repeated text',async()=>{
 const {snapshot}=await import('./reader.mjs');
 const prior={};for(const k of ['document','location','getComputedStyle','DOMMatrixReadOnly'])prior[k]=globalThis[k];
 const style={display:'block',visibility:'visible',opacity:'1',transform:'none'};
 const body={nodeType:1,parentElement:null,innerText:'source'};
 const root={nodeType:1,parentElement:body};
 const p=(v,transform='none')=>({nodeType:1,parentElement:root,attributes:[],tagName:'P',style:{...style,transform},childNodes:[{nodeType:3,textContent:v}],matches:()=>false});
 const paragraphs=[p('诱饵','matrix(0, 0, 0, 0, 0, 0)'),p('正文第一段'),p('同一句'),p('同一句')];
 root.querySelectorAll=()=>paragraphs;
 const heading={innerText:'章节'};
 globalThis.document={body,title:'章节',readyState:'complete',querySelector:s=>s==='#acontent,.bcontent'?root:s==='#atitle,h1,.book-title'?heading:null,querySelectorAll:()=>[]};
 globalThis.location={href:'https://www.bilinovel.net/novel/1/2.html',pathname:'/novel/1/2.html'};
 globalThis.getComputedStyle=e=>e.style||style;
 globalThis.DOMMatrixReadOnly=class{constructor(v){const zero=v.includes('matrix(0,');this.m11=zero?0:1;this.m12=0;this.m21=0;this.m22=zero?0:1}};
 try{assert.deepEqual(snapshot().paragraphs,['正文第一段','同一句','同一句'])}finally{for(const [k,v]of Object.entries(prior)){if(v===undefined)delete globalThis[k];else globalThis[k]=v}}
});
