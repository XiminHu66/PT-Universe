import {ownUsageIdentities} from '../../pt-usage.mjs?v=1';

const number=new Intl.NumberFormat('zh-CN');
const dayString=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?value:'';
const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;

export function usageHTML(data,key,marked){
  const value=data[key]||{};
  const fmt=n=>number.format(count(n));
  const other=(total,own)=>Math.max(0,count(total)-count(own));
  const sharedOther=other(value.sharedAiAccounts,value.ownSharedAiAccounts);
  const card=(label,total,own)=>`<div class="usage-stat"><span>${label}</span><strong>${fmt(total)}</strong>${own===undefined?'':`<small>自用 ${fmt(own)} · 待核对 ${fmt(other(total,own))}</small>`}</div>`;
  return `<header class="usage-head"><h2>访问与使用</h2><div class="actions"><button data-period="today" aria-pressed="${key==='today'}">今天</button><button data-period="week" aria-pressed="${key==='week'}">近 7 天</button><button data-mark>${marked?'更新自用标记':'标记本浏览器为自用'}</button></div></header>
  <div class="usage-grid">
  ${card('访问浏览器',value.browsers,value.ownBrowsers)}
  ${card('其中访问 Daily Nexus',value.nexusBrowsers)}
  ${card('活跃同步账户',value.accounts,value.ownAccounts)}
  ${card('请求共享 Gemini 的账户',value.sharedAiAccounts,value.ownSharedAiAccounts)}
  </div>
  ${sharedOther?`<p class="usage-watch" role="status">有 ${fmt(sharedOther)} 个待核对账户请求共享 Gemini。</p>`:''}
  <p class="usage-note">${dayString(data.since)?`采样自 ${dayString(data.since)} · `:'暂无使用记录 · '}按美西日期统计。浏览器按独立配置去重，共用配对码按一个账户计。共享 Gemini 统计已通过同步认证的配餐、找地点、截图识别和 Check Desk 请求，包含直接调用 API；待核对也可能是自己的其他设备。</p>`;
}

export function createUsageView({panel,url,active,session}){
  let data=null,key='today',updated=0,marked=false,controller,error='';
  function render(){
    const show=active();
    panel.hidden=!show;
    if(!show){controller?.abort();return;}
    panel.innerHTML=data?usageHTML(data,key,marked):'<h2>访问与使用</h2><p class="usage-note" role="status"></p>';
    if(error&&data)panel.insertAdjacentHTML('beforeend','<p class="usage-note" role="status"></p>');
    const status=panel.querySelector('[role="status"].usage-note');
    if(status)status.textContent=error||'正在读取使用概况…';
    for(const button of panel.querySelectorAll('[data-period]'))button.onclick=()=>{key=button.dataset.period;render();};
    const mark=panel.querySelector('[data-mark]');
    if(mark){mark.disabled=!!controller;mark.onclick=()=>void load(true,true);}
  }
  async function load(force=false,mark=false){
    if(!active()||controller||(!force&&Date.now()-updated<300000))return;
    const current=new AbortController();controller=current;error='';
    if(mark)render();
    try{
      const body=mark?JSON.stringify(await ownUsageIdentities()):undefined;
      const response=await fetch(url,{method:mark?'POST':'GET',cache:'no-store',credentials:'omit',headers:{authorization:'Bearer '+session(),...(mark?{'content-type':'application/json'}:{})},body,signal:AbortSignal.any([current.signal,AbortSignal.timeout(12000)])});
      if(!response.ok)throw Error('load_failed');
      const next=await response.json();
      if(!next.today||!next.week)throw Error('invalid_usage');
      if(current.signal.aborted||!active())return;
      data=next;updated=Date.now();if(mark)marked=true;
    }catch{
      if(!current.signal.aborted)error=mark?'自用标记暂未保存，可稍后重试。':'使用概况暂不可用，可用「检查更新」重试。';
    }finally{controller=undefined;render();}
  }
  return {render,load};
}
