(function(){
  'use strict';
  const API='https://pt-universe-api.summer07-nanjolno.workers.dev';
  const CONFIG_KEY='ptu.sync.config';
  const META_KEY='ptu.sync.meta';
  const enc=new TextEncoder(),dec=new TextDecoder();
  const scopes={
    ptu:k=>k.startsWith('ptu.')&&!k.startsWith('ptu.sync.'),
    daily:k=>(k.startsWith('dn_')||k.startsWith('daily_nexus_')||k.startsWith('nexus-')||k.startsWith('deskboard_'))&&!/(cache|token|photo|image|appearance|latitude|longitude|position)/i.test(k),
    tsugi:k=>/^tsugi[-_]/.test(k)||['theme','tsugi-read'].includes(k)
  };
  let busy=false,pushTimer=null,pollTimer=null,pullTimer=null,lastSnapshot='';
  const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  const unb64=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0));
  const json=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}};
  const config=()=>json(CONFIG_KEY,null);
  const saveConfig=v=>localStorage.setItem(CONFIG_KEY,JSON.stringify(v));
  async function digest(value){return new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value)))}
  async function keyFor(token){return crypto.subtle.importKey('raw',await digest(token),'AES-GCM',false,['encrypt','decrypt'])}
  function snapshot(){
    const data={};
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(key&&Object.values(scopes).some(match=>match(key)))data[key]=localStorage.getItem(key);
    }
    return JSON.stringify(data,Object.keys(data).sort());
  }
  async function seal(plain,token){
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const body=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await keyFor(token),enc.encode(plain)));
    return JSON.stringify({v:1,iv:b64(iv),body:b64(body)});
  }
  async function open(ciphertext,token){
    const data=JSON.parse(ciphertext),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(data.iv)},await keyFor(token),unb64(data.body));
    return dec.decode(plain);
  }
  async function request(path,options={}){
    const cfg=config();
    const headers={'content-type':'application/json',...(options.headers||{})};
    if(cfg?.token)headers.authorization=`Bearer ${cfg.token}`;
    const response=await fetch(API+path,{...options,headers});
    if(!response.ok)throw new Error((await response.json().catch(()=>({}))).error||`同步服务 ${response.status}`);
    return response.status===204?null:response.json();
  }
  async function create(){
    const id=crypto.randomUUID(),token=b64(crypto.getRandomValues(new Uint8Array(32)));
    await request('/api/sync/register',{method:'POST',body:JSON.stringify({id,token})});
    saveConfig({id,token});
    await push();start();return `${id}.${token}`;
  }
  async function connect(code){
    const split=String(code||'').trim().split('.');
    if(split.length!==2||!split[0]||!split[1])throw new Error('配对码格式不正确');
    saveConfig({id:split[0],token:split[1]});
    await pull(true);start();return true;
  }
  async function push(){
    const cfg=config();if(!cfg||busy)return false;busy=true;
    try{
      const plain=snapshot(),ciphertext=await seal(plain,cfg.token);
      const meta=json(META_KEY,{});
      const result=await request(`/api/sync/${encodeURIComponent(cfg.id)}/all`,{method:'PUT',body:JSON.stringify({ciphertext,baseRevision:meta.revision||0})});
      lastSnapshot=plain;localStorage.setItem(META_KEY,JSON.stringify({revision:result.revision,updatedAt:result.updatedAt}));
      dispatchEvent(new CustomEvent('pt-sync-status',{detail:{type:'push',...result}}));return true;
    }finally{busy=false}
  }
  async function pull(force=false){
    const cfg=config();if(!cfg||busy)return false;busy=true;
    try{
      const result=await request(`/api/sync/${encodeURIComponent(cfg.id)}/all`);
      const meta=json(META_KEY,{});
      if(!result.ciphertext||(!force&&result.revision<=Number(meta.revision||0)))return false;
      const incoming=JSON.parse(await open(result.ciphertext,cfg.token));
      Object.entries(incoming).forEach(([key,value])=>{if(Object.values(scopes).some(match=>match(key))&&typeof value==='string')localStorage.setItem(key,value)});
      lastSnapshot=snapshot();localStorage.setItem(META_KEY,JSON.stringify({revision:result.revision,updatedAt:result.updatedAt}));
      dispatchEvent(new CustomEvent('pt-sync-applied',{detail:result}));
      dispatchEvent(new CustomEvent('pt-sync-status',{detail:{type:'pull',...result}}));return true;
    }finally{busy=false}
  }
  function schedulePush(){clearTimeout(pushTimer);pushTimer=setTimeout(()=>push().catch(report),1400)}
  function report(error){dispatchEvent(new CustomEvent('pt-sync-status',{detail:{type:'error',error:error.message}}))}
  function start(){
    clearInterval(pollTimer);clearInterval(pullTimer);if(!config())return;
    lastSnapshot=snapshot();
    pollTimer=setInterval(()=>{const next=snapshot();if(next!==lastSnapshot){lastSnapshot=next;schedulePush()}},5000);
    pullTimer=setInterval(()=>pull().catch(report),60000);
  }
  function disconnect(){clearInterval(pollTimer);clearInterval(pullTimer);localStorage.removeItem(CONFIG_KEY);localStorage.removeItem(META_KEY)}
  addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pull().catch(report)});
  addEventListener('storage',e=>{if(e.key&&e.key!==CONFIG_KEY&&e.key!==META_KEY)schedulePush()});
  window.PTSync={API,config,create,connect,push,pull,disconnect,start};start();
})();
