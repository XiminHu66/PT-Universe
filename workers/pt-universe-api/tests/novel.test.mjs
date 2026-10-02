import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const result=await build({stdin:{contents:`import {readBiliChapter,readWenkuContent,novelImageURL} from './src/novel-reader';import {mediaRoute} from './src/media';export default {async fetch(r){const u=new URL(r.url);try{if(u.pathname==='/fixture'){const d=await r.json();return Response.json(d.kind==='bili'?await readBiliChapter(d.url,async url=>d.pages[url]):await readWenkuContent(d.html,d.url));}const v=await mediaRoute(r);return v instanceof Response?v:Response.json(v);}catch(e){return Response.json({error:String(e)},{status:400});}}}`,resolveDir:process.cwd()},bundle:true,format:'esm',write:false});
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0]);let imageCalls=0;
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:"novel-test",modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-08-28',outboundService:async r=>{
 const u=new URL(r.url);
 if(u.hostname==='cloudflare-dns.com')return Response.json({Answer:[{type:1,data:'93.184.216.34'}]});
 if(u.hostname==='www.wenku8.net')return new Response('<div id="title">Images</div><div id="content">Before<img src="https://images.example.org/page.png">After<img src="https://images.example.org/bad.jpg"></div>');
 if(u.hostname==='images.example.org'){imageCalls++;assert.equal(r.headers.get('referer'),'https://www.wenku8.net/');if(u.pathname.includes('bad'))return new Response('<html>blocked</html>',{headers:{'content-type':'image/jpeg'}});return new Response(png,{headers:{'content-type':'application/octet-stream'}});}
 throw Error('Unexpected upstream '+u);
}}]}));
try{
 const fixture=async data=>{const r=await mf.dispatchFetch('https://local/fixture',{method:'POST',body:JSON.stringify(data)});const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));return d;};
 const wenku=await fixture({url:'https://www.wenku8.net/novel/0/1/2.htm',html:'<div id="content">A<br>B<img src="//images.example.org/1.png">C<img data-src="https://images.example.org/2.png" src="data:image/gif;base64,AAAA"><div id="contentdp">advert</div>D</div>'});
 assert.deepEqual(wenku.blocks.map(b=>b.type),['text','image','text','image','text']);assert.equal(wenku.blocks[0].text,'A\nB');assert.equal(wenku.blocks.at(-1).text,'D');
 const url='https://www.bilinovel.com/novel/1/2.html';
 const bili=await fixture({kind:'bili',url,pages:{[url]:'<div id="atitle">Chapter</div><div id="acontent"><p>Before<img src="placeholder" data-src="https://https://images.example.org/𝘣.png">After</p><img src="//images.example.org/two.jpg"></div><div id="footlink"><a class="nextlink">下一页</a></div><script>url_next:"/novel/1/2_2.html"</script>',[url.replace('.html','_2.html')]:'<div id="acontent"><p><img src="/three.jpg"></p></div>'}});
 assert.deepEqual(bili.blocks.map(b=>b.type),['text','image','text','image','image']);assert.equal(bili.blocks[1].url,'https://images.example.org/b.png');assert.equal(bili.pages,2);
 const image=path=>'https://local/api/media/novel/image?'+new URLSearchParams({page:'https://www.wenku8.net/novel/0/1/2.htm',url:path});
 const good=await mf.dispatchFetch(image('https://images.example.org/page.png'));assert.equal(good.status,200);assert.equal(good.headers.get('content-type'),'image/png');assert.equal(good.headers.get('access-control-allow-origin'),'*');assert.deepEqual(new Uint8Array(await good.arrayBuffer()),png);
 const count=imageCalls;assert.equal((await mf.dispatchFetch(image('https://images.example.org/page.png'))).status,200);assert.equal(imageCalls,count);
 assert.equal((await mf.dispatchFetch(image('https://images.example.org/unlisted.png'))).status,400);assert.equal(imageCalls,count);
 assert.equal((await mf.dispatchFetch(image('https://images.example.org/bad.jpg'))).status,400);
 console.log('Novel worker passed: ordered inline/lazy images, paginated image-only chapter, verified image proxy/cache, unlisted URL and fake image rejection.');
}finally{await mf.dispose();}
