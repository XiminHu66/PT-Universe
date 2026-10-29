import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import reader from '../src/index.js';
import entry from '../src/hot-topics-entry.js';
import {hotTopicsRoute,sanitizeSnapshot,readVpsNews} from '../src/hot-topics.js';

const fixture=()=>({revision:'rss-hot-topics-v1',generated_at:new Date().toISOString(),sources:[{id:'hot:zhihu',name:'知乎',kind:'hotlist',status:'ok'}],items:[{id:'one',title:'<b>News</b>',url:'https://example.com/story',source_id:'hot:zhihu',collected_at:new Date().toISOString(),rank:2,rank_change:1}],secret:'must never leak'});
test('new entry preserves the original scheduled collector and health contract',async()=>{
 assert.equal(entry.scheduled,reader.scheduled);
 const response=await entry.fetch(new Request('https://rss.test/health'),{});
 const d=await response.json();assert.equal(d.service,'rss-orbit-proxy');assert.equal(d.feeds,12);
});
test('public news is allowlisted and excludes transport/configuration fields',()=>{
 const raw=fixture();raw.items.push({...raw.items[0],id:'unsafe',url:'javascript:alert(1)'});
 const d=sanitizeSnapshot(raw);assert.equal(d.items.length,1);assert.equal(d.items[0].title,'News');assert.ok(!JSON.stringify(d).includes('must never leak'));
});
test('news endpoints reject writes, unrelated origins and arbitrary upstream parameters before reading any configuration',async()=>{
 const env={PT_UNIVERSE_DATA:{get(){throw Error('must not read credentials');}}};
 for(const [url,options,status] of [['/hot-topics',{method:'POST'},405],['/hot-topics',{headers:{origin:'https://evil.test'}},403],['/hot-topics?url=https://evil.test',{},400]]){
  assert.equal((await hotTopicsRoute(new Request('https://rss.test'+url,options),env)).status,status);
 }
});
test('last-good news is retained during a VPS failure without rewriting its timestamp',async()=>{
 const value=fixture();value.generated_at='2026-01-01T00:00:00Z';
 const env={RSS_CACHE:{async get(){return {cachedAt:0,value};}},PT_UNIVERSE_DATA:{async get(){return null;}}};
 const r=await hotTopicsRoute(new Request('https://rss.test/hot-topics'),env);const d=await r.json();
 assert.equal(r.status,200);assert.equal(d.stale,true);assert.equal(d.generated_at,value.generated_at);
});
test('source-only route never includes articles or server configuration',async()=>{
 const value=fixture();const r=await hotTopicsRoute(new Request('https://rss.test/hot-topics/sources'),{RSS_CACHE:{async get(){return {cachedAt:Date.now(),value:sanitizeSnapshot(value)};}}});
 const d=await r.json();assert.equal(d.sources.length,1);assert.equal(d.items,undefined);assert.equal(d.secret,undefined);
});
test('VPS reader signs one fixed GET path and never accepts a client-supplied destination',async()=>{
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),jwk=await crypto.subtle.exportKey('jwk',pair.privateKey);
 const env={PT_UNIVERSE_DATA:{async get(){return JSON.stringify({origin:'https://fixed-news.trycloudflare.com',siteOrigin:'https://pt-vps-tools.h1nano.chatgpt.site',jwk});}}};
 let observed;
 const d=await readVpsNews(env,async(url,options)=>{observed={url,options};return Response.json(fixture());});
 assert.equal(observed.url,'https://fixed-news.trycloudflare.com/hub/api/hot-topics');assert.equal(observed.options.method,'GET');assert.equal(observed.options.redirect,'manual');assert.equal(observed.options.headers['x-pt-role'],'hub');assert.ok(observed.options.headers['x-pt-signature']);assert.equal(d.items.length,1);
});
test('RSS navigation replacement preserves the saved-record counter and loads an isolated addon',()=>{
 const html=readFileSync(new URL('../../../apps/rss-dashboard/index.html',import.meta.url),'utf8');
 assert.match(html,/data-view="saved"[^>]*><span>◉<\/span><b>今日热点<\/b>/);assert.match(html,/id="savedCount"[^>]*hidden/);assert.match(html,/src="hot-topics.js/);
 const addon=readFileSync(new URL('../../../apps/rss-dashboard/hot-topics.js',import.meta.url),'utf8');assert.ok(!addon.includes("localStorage.setItem('pt.rss.read'"));assert.ok(!addon.includes("localStorage.setItem('pt.rss.saved'"));
});
