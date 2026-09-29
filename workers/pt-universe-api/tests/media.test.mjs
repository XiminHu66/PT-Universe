import assert from 'node:assert/strict';
import {build} from 'esbuild';
async function module(path){const r=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));}
const n=await module('src/novel-reader.ts'),s=await module('src/media-sources.ts');
assert.equal(n.arithmetic('(0x10+2)*3-4'),50);
assert.throws(()=>n.arithmetic('fetch("https://example.com")'));
assert.throws(()=>n.assertComplete('正文……（內容加載失敗！請刷新或更換瀏覽器）'));
n.assertComplete('这是完整的测试文本。');
const original=Array.from({length:35},(_,i)=>i),params={fixed:20,seed:87,a:13,c:5,mod:101};
const indices=original.slice(20);let seed=params.seed;
for(let i=indices.length-1;i>0;i--){seed=(seed*params.a+params.c)%params.mod;const j=Math.floor(seed/params.mod*(i+1));[indices[i],indices[j]]=[indices[j],indices[i]];}
const encoded=[...original.slice(0,20),...indices.map(i=>original[i])];
assert.deepEqual(n.restoreParagraphs(encoded,params),original);
assert.equal(s.isAnimeMedia('https://cdn.anime1.me/test.mp4'),true);
assert.equal(s.isAnimeMedia('https://anime1.me.evil.example/test.mp4'),false);
assert.equal(s.isAnimeMedia('http://cdn.anime1.me/test.mp4'),false);
const feed='<rss><item><title><![CDATA[Test &amp; title]]></title><enclosure url="magnet:?xt=urn:btih:123&amp;dn=Test"/></item></rss>';
assert.equal(s.parseTorrentFeed(feed,'fixture')[0].title,'Test & title');
assert.equal(s.parseTorrentFeed(feed,'fixture')[0].magnet,'magnet:?xt=urn:btih:123&dn=Test');
const result=await s.torrentSearch('test',async url=>{
 if(url.includes('nyaa.si'))throw new Error('HTTP 429');
 if(url.includes('dmhy.org'))return feed;
 if(url.includes('advancedsearch'))return JSON.stringify({response:{docs:[{identifier:'fixture',title:'Archive fixture'}]}});
 return JSON.stringify({files:[{name:'fixture_archive.torrent'}]});
});
assert.equal(result.sources.filter(x=>x.ok).length,2);
assert.equal(result.items.length,2);
assert.ok(result.items.some(x=>x.torrent.endsWith('/fixture_archive.torrent')));
console.log('Media regressions passed: arithmetic, paragraph order, truncated text, media host validation, RSS, partial-source failure.');
// A slow body must remain readable after the header timeout has elapsed.
const realFetch=globalThis.fetch;
let streamSignal;
try {
 globalThis.fetch=async (_url,init)=>{streamSignal=init.signal;return new Response(new ReadableStream({start(controller){setTimeout(()=>{if(init.signal.aborted)controller.error(new Error('body aborted'));else{controller.enqueue(new TextEncoder().encode('complete file'));controller.close();}},40);}}));};
 const response=await s.fetchStream('https://archive.org/test',{},10);
 assert.equal(await response.text(),'complete file');
 assert.equal(streamSignal.aborted,false);
 globalThis.fetch=(_url,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('header timeout'))));
 await assert.rejects(s.fetchStream('https://archive.org/test',{},10),/header timeout/);
} finally {globalThis.fetch=realFetch;}
console.log('Streaming regression passed: headers time out; long bodies do not.');

const media=await module('src/media.ts');
try {
 globalThis.fetch=async url=>String(url).includes('itunes.apple.com')?new Response('',{status:403}):Response.json({feed:{updated:'2026-09-29',results:[{id:'one',name:'Song',artistName:'Artist',genres:[{genreId:'21',name:'Rock'}]}]}});
 const fallback=await media.charts('jp','21');
 assert.match(fallback.source,/Apple Music.*曲风筛选/);
 assert.equal(fallback.items[0].title,'Song');
 assert.equal(fallback.items[0].preview,null);
} finally {globalThis.fetch=realFetch;}
console.log('Chart fallback regression passed: unavailable iTunes -> accurately labelled Apple Music.');
