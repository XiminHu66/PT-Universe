import nativeDownloadSource from './native-download-source.js';
export function nativeDownloadModule(env){
 if(env.ENABLE_ACCEPTANCE_UI!=='true'||!Number.isSafeInteger(Number(env.MEDIA_ACCEPTANCE_UNTIL))||Number(env.MEDIA_ACCEPTANCE_UNTIL)<=Date.now())return new Response('Test module unavailable',{status:404});
 return new Response(nativeDownloadSource,{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
// Only explicit native navigations receive this bridge. API callers keep JSON.
// It reports a bounded status/delay and attempt ID, never a ticket or raw error.
export function nativeDownloadFailure(request,response){
 const u=new URL(request.url),attempt=u.searchParams.get('attempt');
 if(response.status<400||u.pathname!=='/download'||!request.headers.get('Accept')?.includes('text/html')||!/^[a-f0-9]{32}$/.test(attempt||''))return response;
 const nonce=crypto.randomUUID().replaceAll('-',''),delay=Number(response.headers.get('Retry-After'));
 const data={type:'mv-native-download-error',attempt,status:response.status,retry_after:Number.isFinite(delay)&&delay>0?Math.min(3600,Math.ceil(delay)):null};
 const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('Content-Disposition');
 headers.set('Content-Type','text/html; charset=utf-8');headers.set('Cache-Control','no-store');headers.set('Referrer-Policy','no-referrer');
 headers.set('Content-Security-Policy',"default-src 'none'; script-src 'nonce-"+nonce+"'; base-uri 'none'; form-action 'none'; frame-ancestors 'self' https://ximinhu66.github.io");
 response.body?.cancel().catch(()=>{});
 return new Response('<!doctype html><meta charset="utf-8"><title>下载请求未开始</title><p>下载请求未开始，请返回文件列表重新请求保存。</p><script nonce="'+nonce+'">parent.postMessage('+JSON.stringify(data)+', "https://ximinhu66.github.io");parent.postMessage('+JSON.stringify(data)+', location.origin);</script>',{status:response.status,headers});
}
