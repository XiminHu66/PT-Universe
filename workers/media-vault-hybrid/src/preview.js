import assets from './preview-assets.js';
const root='/acceptance/app/';
const settings=`<dialog id="settings" aria-labelledby="scopedSettingsTitle"><div class="dialog-head"><h2 id="scopedSettingsTitle">临时浏览器配对</h2><button data-close="settings" aria-label="关闭配对设置">×</button></div><p>仅用于本轮暂存验收：Owner 在服务端批准后，可查看和保存三个指定文件。15 分钟到期，最多签发六张票据，无需输入长期密钥。</p><p>配对编号：<strong id="scopedPairCode">尚未生成</strong></p><p id="scopedExpiry"></p><div class="actions"><button id="scopedPair" class="primary">申请临时配对</button><button id="scopedLogout">退出并撤销会话</button></div><p id="settingsStatus" role="status" aria-live="polite"></p><p class="caption">退出会撤销当前会话与尚未使用的票据。已交给浏览器的下载请在浏览器下载列表中取消。</p><div hidden><input id="engineURL" disabled><input id="engineToken" disabled><button id="engineSave" disabled></button><button id="engineDisconnect" disabled></button></div></dialog>`;
export function previewRoute(request,env){
 const u=new URL(request.url);if(!u.pathname.startsWith(root))return null;
 if(request.method!=='GET')return new Response('GET required',{status:405});
 if(env.ENABLE_ACCEPTANCE_UI!=='true'||!Number.isSafeInteger(Number(env.MEDIA_ACCEPTANCE_UNTIL))||Number(env.MEDIA_ACCEPTANCE_UNTIL)<=Date.now())return new Response('Preview unavailable',{status:404});
 const name=u.pathname.slice(root.length)||'index.html';
 if(!Object.hasOwn(assets,name))return new Response('Asset unavailable',{status:404});
 const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex'};
 if(name!=='index.html')return new Response(assets[name],{headers:{...headers,'Content-Type':name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'}});
 const nonce=crypto.randomUUID().replaceAll('-','');
 let html=assets[name].replace('<html lang="zh-CN"','<html data-hybrid-preview="true" lang="zh-CN"')
  .replace(/<dialog id="settings">[\s\S]*?<\/dialog>/,settings)
  .replace('<header class="topbar">','<section class="staging-scope" role="region" aria-label="暂存联调范围" style="padding:16px;border:1px solid var(--border);border-radius:12px;margin:16px 0"><strong>暂存联调 · 完整页面 / 三文件只读会话</strong><p>本轮只开放指定文件的查看与原生保存，其他来源搜索、打包和任务提交未开放。生产页面未发布。</p><p><span id="scopedSessionLabel" role="status">尚未授权</span> <button id="scopedOpen">临时配对 / 会话</button></p></section><header class="topbar">')
  .replace('<title>Media Vault · 小说阅读与下载</title>','<title>Media Vault · 完整页面暂存联调</title>')
  .replace('<link rel="stylesheet" href="../../pt-bridge.css">','')
  .replace('<script src="../../pt-sync.js"></script>','').replace('<script src="../../pt-bridge.js"></script>','')
  .replace('src="vendor/jszip.min.js"','src="https://ximinhu66.github.io/PT-Universe/apps/media-vault/vendor/jszip.min.js"')
  .replace('src="vendor/opencc-full.js"','src="https://ximinhu66.github.io/PT-Universe/apps/media-vault/vendor/opencc-full.js"')
  .replaceAll('<script','<script nonce="'+nonce+'"');
 headers['Content-Type']='text/html; charset=utf-8';
 headers['Content-Security-Policy']="default-src 'none'; script-src 'nonce-"+nonce+"' 'self' https://ximinhu66.github.io; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; frame-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
 return new Response(html,{headers});
}
