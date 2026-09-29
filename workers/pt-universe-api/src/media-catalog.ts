import type { Load } from './media-sources';
import { decodeText } from './novel-reader';

const clean=(s:string)=>decodeText(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
export function parseAnimeCatalog(text:string){
 const rows=JSON.parse(text);if(!Array.isArray(rows))throw new Error('动漫目录格式已变化');
 return rows.filter((x:any)=>Array.isArray(x)&&Number.isInteger(x[0])&&x[0]>0&&typeof x[1]==='string').map((x:any)=>({id:x[0],title:x[1],episodes:String(x[2]||''),year:String(x[3]||''),season:String(x[4]||''),group:clean(String(x[5]||'')),url:'https://anime1.me/?cat='+x[0]}));
}
export async function animeCatalog(load:Load){
 const items=parseAnimeCatalog(await load('https://anime1.me/animelist.json','anime'));
 if(!items.length)throw new Error('Anime1 完整目录暂不可用');
 return {items,total:items.length,source:'Anime1 · 完整番剧目录',fetchedAt:new Date().toISOString()};
}
export async function animeEpisodes(id:string,page:string,load:Load){
 if(!/^\d{1,7}$/.test(id)||!/^\d{1,3}$/.test(page)||Number(page)<1)throw new Error('番剧或页码无效');
 const url='https://anime1.me/'+(page==='1'?'':`page/${page}/`)+'?cat='+id;
 const markup=await load(url,'anime');const items:{title:string;url:string}[]=[];
 await new HTMLRewriter().on('.entry-title a',{element(e){const href=e.getAttribute('href')||'';if(/^https:\/\/anime1\.me\/\d+\/?$/.test(href))items.push({url:href,title:''});},text(t){if(items.length)items[items.length-1].title+=t.text;}}).transform(new Response(markup)).text();
 let hasNext=false;await new HTMLRewriter().on('a.next.page-numbers, .nav-previous a',{element(){hasNext=true;}}).transform(new Response(markup)).text();
 return {items:items.map(x=>({...x,title:clean(x.title)})),page:Number(page),hasNext,url,fetchedAt:new Date().toISOString()};
}
// Published title index; reading stays on the selected Wenku8 book, not on a
// guessed chapter URL or an automatically mixed translation.
export async function novelCatalog(load:Load){
 const markup=await load('https://wenku.mojimoon.top/epub.html');
 const items=[...markup.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap(m=>{
  const a=m[1].match(/<a[^>]*href=["'](https:\/\/www\.wenku8\.net\/book\/\d+\.htm)["'][^>]*>([\s\S]*?)<\/a>/i);
  return a?[{url:a[1],title:clean(a[2]),alias:clean(m[1].match(/<span[^>]*class=['"]at['"][^>]*>([\s\S]*?)<\/span>/i)?.[1]||''),author:clean(m[1].match(/<td[^>]*class=['"]au['"][^>]*>([\s\S]*?)<\/td>/i)?.[1]||''),source:'轻小说文库'}]:[];
 });
 if(!items.length)throw new Error('书名索引暂不可用，仍可直接粘贴小说链接');
 return {items,source:'文库公开书目索引',fetchedAt:new Date().toISOString()};
}
