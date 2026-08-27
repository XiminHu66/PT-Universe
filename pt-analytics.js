(function(){
  'use strict';
  if(!location.hostname.endsWith('github.io'))return;
  fetch('https://pt-universe-api.summer07-nanjolno.workers.dev/api/analytics',{method:'POST',body:JSON.stringify({path:location.pathname}),headers:{'content-type':'text/plain;charset=UTF-8'},keepalive:true}).catch(()=>{});
})();
