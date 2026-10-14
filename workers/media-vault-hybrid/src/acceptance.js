// Temporary test UI on the dedicated service. No production frontend deployment.
// Credentials stay in page memory; no cookies/storage, credential echo or uploads.
export function acceptancePage(env){
 if(env.ENABLE_ACCEPTANCE_UI!=='true'||Number(env.MEDIA_ACCEPTANCE_UNTIL)<=Date.now()||!Number.isSafeInteger(Number(env.MEDIA_ACCEPTANCE_UNTIL)))return new Response('Test page unavailable',{status:404});
 const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
 return new Response(page.replaceAll('__NONCE__',nonce),{headers:{
  'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex','X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'unsafe-inline'; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
 }});
}
const page=String.raw`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Media Vault 浏览器保存验收</title>
<style>body{max-width:960px;margin:40px auto;padding:0 24px;font:17px/1.7 system-ui;color:#172033;background:#f5f7fa}section{padding:24px;margin:20px 0;border:1px solid #ccd5df;border-radius:12px;background:white}button{font:inherit;padding:10px 16px;border:1px solid #99aabb;border-radius:6px;cursor:pointer}table{width:100%;text-align:left}td,th{padding:12px;border-bottom:1px solid #ddd}#status{white-space:pre-wrap}code{font-size:22px}small{color:#556}td:first-child{max-width:480px;word-break:break-all}</style>
<h1>Media Vault 浏览器保存验收</h1><p>独立测试服务 · EPUB / CBZ / MP4 · 原生文件保存</p>
<section id="pairing"><h2>短期测试配对</h2><button id="start">生成配对请求</button><p>配对请求编号：<code id="pairCode">尚未生成</code></p><p><small>由已有 Owner 配置批准此浏览器请求。批准后只允许访问三个指定测试文件，15 分钟到期，最多签发六张一次性票据；不提供任务管理或长期密钥。</small></p></section>
<section id="tests" hidden><h2>已批准的测试文件</h2><table><thead><tr><th>文件</th><th>字节</th><th>保存</th></tr></thead><tbody id="files"></tbody></table><p><button id="refresh">核对传输额度</button> <button id="replay" disabled>验证上次票据不能复用</button></p><p id="quota"></p></section>
<section><strong>验收状态</strong><p id="status">等待生成临时配对请求。</p><p>保存完成以浏览器下载结果与本地 SHA-256 核对为准。流式 ACK 不代表磁盘保存完成。</p></section>
<iframe name="acceptance-download" title="下载通道" hidden></iframe>
<script nonce="__NONCE__">
'use strict';let lastTicket='',before=null,totalExpected=0,rendered=false,pollTimer;
const $=s=>document.querySelector(s),status=s=>$('#status').textContent=s;
async function api(path,body){const r=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(20000)});const d=await r.json();if(!r.ok)throw Error('HTTP '+r.status+': '+(d.error||'请求失败'));return d;}
function quota(d){if(!before)before=d.quota;$('#quota').textContent='文件流 '+d.streaming+' · 已传输 '+d.quota.transferred_bytes+' 字节 · 预留 '+d.quota.reserved_bytes+' 字节 · 本轮新增 '+(d.quota.transferred_bytes-before.transferred_bytes)+' 字节 · 已请求保存 '+totalExpected+' 字节';}
async function load(){const d=await api('/acceptance/session');if(d.status!=='approved'){status('等待 Owner 批准当前浏览器的配对请求。');return}$('#pairing').hidden=true;$('#tests').hidden=false;quota(d);if(rendered)return;rendered=true;clearInterval(pollTimer);$('#files').replaceChildren();if(d.files.length!==3)throw Error('需要三个测试文件');for(const f of d.files){if(!/\.(epub|cbz|mp4)$/i.test(f.name)||f.size>10*1024*1024)throw Error('测试文件不合格');const tr=document.createElement('tr');for(const value of [f.name,String(f.size)]){const td=document.createElement('td');td.textContent=value;tr.append(td)}const td=document.createElement('td'),button=document.createElement('button');button.textContent='保存 '+f.name.split('.').at(-1).toUpperCase();button.onclick=async()=>{button.disabled=true;try{const d=await api('/acceptance/ticket',{id:f.id,path:f.path});lastTicket=d.ticket;const a=document.createElement('a');a.href='/download?ticket='+encodeURIComponent(d.ticket);a.target='acceptance-download';a.download=f.name;a.rel='noreferrer';document.body.append(a);a.click();a.remove();totalExpected+=f.size;$('#replay').disabled=false;status('已交给浏览器保存 '+f.name+'。下载完成后请核对额度与本地哈希。')}catch(e){status(e.message)}finally{button.disabled=false}};td.append(button);tr.append(td);$('#files').append(tr)}status('临时配对已批准 · 仅限三个测试文件 · 文件流 '+d.streaming+'。');}
$('#start').onclick=async()=>{try{const d=await api('/acceptance/pair',{});$('#pairCode').textContent=d.pair_code;$('#start').disabled=true;status('配对请求已生成，等待 Owner 批准。');pollTimer=setInterval(()=>load().catch(e=>{clearInterval(pollTimer);status(e.message)}),3000)}catch(e){status(e.message)}};
$('#refresh').onclick=async()=>{try{const d=await api('/acceptance/session');quota(d);status('额度已核对：本轮新增 '+(d.quota.transferred_bytes-before.transferred_bytes)+' 字节，预留 '+d.quota.reserved_bytes+' 字节。')}catch(e){status(e.message)}};
$('#replay').onclick=async()=>{try{const r=await fetch('/download?ticket='+encodeURIComponent(lastTicket),{cache:'no-store',signal:AbortSignal.timeout(10000)});if(r.status!==403){await r.body?.cancel();throw Error('票据复用检查失败：HTTP '+r.status)}status('PASS 一次性票据复用返回 HTTP 403。');await load()}catch(e){status(e.message)}};
</script></html>`;
