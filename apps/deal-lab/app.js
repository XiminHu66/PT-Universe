import {connected,connect} from '../monitor-center/connection.mjs';
import {safeURL,money,productMatches,productDetails,productOffers,sourceLinks,variantKind,mergeVariants,toCNY,steamOffer,cheapOffers,itadOffers,retainedGiveaways,giveawayPlatforms,trendItems} from './data.mjs';
const BASE='https://pt-universe-api.summer07-nanjolno.workers.dev/api/deal-lab/';
const $=s=>document.querySelector(s),el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;},add=(p,...nodes)=>{for(const n of nodes)if(n)p.append(n);return p;};
const store={read(k,f){try{return JSON.parse(localStorage.getItem('ptu.deal-lab.poc.'+k))??f}catch{return f}},write(k,v){try{localStorage.setItem('ptu.deal-lab.poc.'+k,JSON.stringify(v))}catch{}}};
const TITLES={products:'商品比价',games:'游戏低价 · 含国区',free:'Steam / Epic 免费领',steam:'热门愿望单与近期趋势'};
const COUNTRIES={CN:'中国大陆',US:'美国',HK:'香港',JP:'日本',GB:'英国',DE:'德国',BR:'巴西',CA:'加拿大',AU:'澳洲',KR:'韩国',TR:'土耳其',IN:'印度'};
const state={page:'products',status:null,busy:false,controller:null,cooldowns:{},cacheKnown:new Set(),variants:[],selected:null,variantData:new Map(),variantFilter:'all',productQuery:'',offset:0,gameItems:[],game:null,offers:[],gameErrors:[],fx:null,stores:{},countries:store.read('countries',['CN','US']),giveaways:[],freePacket:null,rankItems:[],rankPages:new Map(),rankCatalogDay:null,rankPacket:null,rankPage:0,rankSearch:'',rankMode:'current',rankProgress:'',trends:null,trendPage:0,trendSearch:''};
function note(text,error=false){$('#notice').textContent=text;$('#notice').classList.toggle('error',error);}
function button(text,action,primary=false){const b=el('button',primary?'primary':'',text);b.type='button';b.onclick=action;return b;}
function link(url,label){const href=safeURL(url);if(!href)return null;const a=el('a','',label);a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;}
function input(label,id,value='',placeholder=''){const l=el('label'),i=el('input');i.id=id;i.value=value;i.type='search';i.placeholder=placeholder;i.maxLength=180;return add(l,el('span','',label),i);}
function select(label,id,options,value){const l=el('label'),s=el('select');s.id=id;for(const [k,title] of options){const o=el('option','',title);o.value=k;o.selected=k===value;s.append(o);}return add(l,el('span','',label),s);}
function when(v){if(!v||v==='N/A')return '未提供';const d=new Date(v);return isNaN(d)?String(v):d.toLocaleString('zh-CN',{timeZone:'America/Los_Angeles'});}
function badge(text,cls=''){return el('span','badge '+cls,text);}
function empty(text){return el('div','empty',text);}
function initConnect(){sessionStorage.setItem('pt.deal-lab.return.v1',JSON.stringify({path:location.pathname,expiresAt:Date.now()+600000}));connect();}
async function status(){try{const r=await fetch(BASE+'status',{headers:{authorization:'Bearer '+(sessionStorage.getItem('pt.monitor.session.v1')||'')},credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('状态 HTTP '+r.status);state.status=await r.json();for(const [p,s] of Object.entries(state.status.sources||{})){const t=Date.parse(s.usage?.lastCall||'')+1000*(s.budget?.cooldown||0);if(Number.isFinite(t))state.cooldowns[p]=Math.max(state.cooldowns[p]||0,t);}$('#sessionStatus').textContent=state.status.authorized?'私有后台已连接':'尚未连接';$('#connect').textContent=state.status.authorized?'重新连接':'连接私有后台';}catch(e){$('#sessionStatus').textContent='后台暂时不可用';note(e.message,true);}}
function setPage(page){state.controller?.abort();state.busy=false;state.page=Object.hasOwn(TITLES,page)?page:'products';history.replaceState(null,'','#'+state.page);note('');document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===state.page));$('#heading').textContent=TITLES[state.page];render();}
function render(){const root=$('#view');root.replaceChildren();if(state.page==='products')products(root);else if(state.page==='games')games(root);else if(state.page==='free')free(root);else wishlist(root);}
function jobButtons(){document.querySelectorAll('[data-work]').forEach(b=>b.disabled=state.busy||b.dataset.boundDisabled==='true');}
function workButton(label,action,primary=false){const b=button(label,action,primary);b.dataset.work='true';b.disabled=state.busy;return b;}
async function work(fn){if(state.busy)return;if(!connected())return note('请先连接现有 PT 私有后台。',true);const controller=new AbortController();state.controller=controller;state.busy=true;jobButtons();try{await fn(controller.signal);}catch(e){if(!controller.signal.aborted)note(e.message,true);}finally{if(state.controller===controller){state.controller=null;state.busy=false;jobButtons();void status();}}}
function pause(ms,signal){return new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();});}
async function query(provider,operation,args,signal,force=false){
 const request={provider,operation,args},key=JSON.stringify(request),known=!force&&(state.cacheKnown.has(key)||(provider==='steam'&&operation==='trends'));
 const until=state.cooldowns[provider]||0;
 if(!known&&until>Date.now()){
  if(until-Date.now()>31000)throw Error('来源冷却中，请 '+Math.ceil((until-Date.now())/1000)+' 秒后再试。');
  while(until>Date.now()){note('正在整理结果 · 来源额度保护，'+Math.ceil((until-Date.now())/1000)+' 秒后继续。切换页面可取消。');await pause(Math.min(1000,until-Date.now()),signal);}
 }
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 const started=Date.now(),response=await fetch(BASE+'query',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+(sessionStorage.getItem('pt.monitor.session.v1')||'')},body:JSON.stringify({...request,...(force?{force:true}:{})}),credentials:'omit',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(70000)]):AbortSignal.timeout(70000)});
 const data=await response.json();
 if(!response.ok){if(data.retryAfter)state.cooldowns[provider]=Date.now()+data.retryAfter*1000;if(data.lastGood){return {...data.lastGood,args,cache:'stale',warning:data.error};}throw Error(data.error||'查询失败 HTTP '+response.status);}
 if(data.cache==='miss'){const gap=Math.max(provider==='steam'?2:0,state.status?.sources?.[provider]?.budget?.cooldown||0);state.cooldowns[provider]=started+gap*1000;}
 state.cacheKnown.add(key);return {...data,args};
}
function freshness(packet){return packet?`${packet.cache==='stale'?'旧数据 · 上游失败':packet.cache==='hit'?'缓存':'已获取'} · ${when(packet.fetchedAt)}`:'';}
function products(root){
 const form=el('form','toolbar');form.onsubmit=e=>{e.preventDefault();void searchProducts();};form.append(input('商品名称','productTerm',store.read('productTerm',''),'例如 HD 490 Pro、Superlight 2'),workButton('搜索并比价',()=>searchProducts(),true));root.append(form);
 if(!state.variants.length){root.append(empty('输入商品名，自动读取最佳匹配的商品详情和跨商家报价。不同规格与套装分开查看。'));return;}
 const counts=state.variants.reduce((o,x)=>(o[variantKind(x)]=(o[variantKind(x)]||0)+1,o),{}),groups=el('div','segments');
 for(const [k,title] of [['all','全部匹配'],['product','单品 / 其他规格'],['package','Plus / 套装'],['accessory','配件']])if(k==='all'||counts[k]){const b=button(title+(k==='all'?' '+state.variants.length:' '+counts[k]),()=>{state.variantFilter=k;render();});b.classList.toggle('active',state.variantFilter===k);groups.append(b);}root.append(groups);
 const tabs=el('div','variant-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','不同商品规格与套装');
 for(const item of state.variants.filter(x=>state.variantFilter==='all'||variantKind(x)===state.variantFilter)){
  const b=button(item.title,()=>selectVariant(item));b.title=item.title;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(state.selected?.identifier===item.identifier));b.classList.toggle('active',state.selected?.identifier===item.identifier);tabs.append(b);
 }root.append(tabs);
 if(state.offset<200)root.append(workButton('更多匹配项',()=>searchProducts(true)));
 const data=state.selected&&state.variantData.get(state.selected.identifier),panel=el('section','product-panel');panel.setAttribute('role','tabpanel');
 if(!state.selected){panel.append(empty('选择一个规格或套装。'));root.append(panel);return;}
 const detail=data?.detail||state.selected;panel.append(el('h3','',detail.title||state.selected.title));
 const specs=el('div','specs');for(const [k,v] of [['品牌',detail.brand],['型号',detail.model],['颜色',detail.color],['MPN',detail.mpn],['条码',detail.barcode],['ASIN',detail.asin]])if(v&&v!=='N/A')specs.append(add(el('div'),el('span','muted',k),el('strong','',v)));panel.append(specs);
 if(data?.detailError)panel.append(el('p','warning','详情：'+data.detailError));
 if(!data||data.loading)panel.append(el('p','loading','正在读取这个规格的详情与报价…'));
 if(data?.offers){
  const offers=[...data.offers].sort((a,b)=>(a.amount??Infinity)-(b.amount??Infinity));
  const available=offers.filter(x=>x.availability.toLowerCase()==='in'&&x.condition.toLowerCase()==='new'&&x.checkedAt&&Date.now()-Date.parse(x.checkedAt)<7*86400000);
  panel.append(add(el('div','section-title'),el('h3','','跨商家报价'),badge(offers.length+' 条 · 此规格独立比较')));
  if(available.length)panel.append(el('p','best','近期有货新品最低：'+available[0].price));
  panel.append(el('p','muted',freshness(data.offerPacket)+' · '+(/US dollars/i.test(data.offerPacket?.data?.toolDescription||'')?'报价币种 USD':'币种以来源标注为准')));
  const table=el('table');table.append(row(['商家 / 卖家','报价','成色 / 库存（源报）','上游检查时间','链接'],true));
  for(const o of offers){const tr=el('tr');tr.append(cell(o.merchant+(o.seller?' · '+o.seller:'')),cell(o.price,'price-cell'),cell(({new:'全新',used:'二手',refurbished:'翻新'}[o.condition.toLowerCase()]||o.condition||'未标注')+' / '+({in:'有货',out:'无货'}[o.availability.toLowerCase()]||o.availability||'未标注')));const time=cell(when(o.checkedAt));if(!o.checkedAt||Date.now()-Date.parse(o.checkedAt)>7*86400000)time.append(badge('请核实当前价','warn'));tr.append(time,add(el('td'),link(o.url,'查看商家 ↗')));table.append(tr);}panel.append(table);
  if(!offers.length)panel.append(empty('来源成功返回，但这个商品标识没有可用报价。'));
 }
 if(data?.offerError)panel.append(el('p','error-panel','报价暂不可用：'+data.offerError));
 const sources=new Set([...(data?.detailPacket?sourceLinks(data.detailPacket):[]),...(data?.offerPacket?sourceLinks(data.offerPacket):[])]);for(const u of sources)panel.append(link(u,'ShopSavvy 原始商品来源 ↗'));
 panel.append(workButton('刷新此规格报价',()=>work(signal=>loadVariant(state.selected,signal,true))));
 panel.append(el('p','fine','每个页签对应来源返回的独立商品标识；规格、套装及兼容配件以原始标题和详情为准。'));
 root.append(panel);
}
async function searchProducts(more=false){return work(async signal=>{const term=more?state.productQuery:$('#productTerm').value.trim();if(!term)throw Error('请输入商品名称');store.write('productTerm',term);if(!more){state.productQuery=term;state.offset=0;state.variants=[];state.selected=null;state.variantFilter='all';}else state.offset+=20;note('正在查找商品及不同规格…');const p=await query('shopsavvy','product_search',{query:term,limit:20,offset:state.offset},signal);state.variants=mergeVariants(state.variants,productMatches(p));if(!state.variants.length){render();return note('没有找到商品匹配项。');}render();if(!more){const first=state.variants.find(x=>variantKind(x)==='product')||state.variants[0];await loadVariant(first,signal);}else note('已加入更多匹配项，选择页签读取报价。');});}
async function selectVariant(item){if(state.busy){state.controller?.abort();state.busy=false;}state.selected=item;const cached=state.variantData.get(item.identifier);if(cached&&!cached.loading&&!cached.offerError&&cached.offerPacket?.freshUntil>Date.now()){render();return;}return work(signal=>loadVariant(item,signal));}
async function loadVariant(item,signal,force=false){state.selected=item;const data={loading:true,offers:null};state.variantData.set(item.identifier,data);render();
 try{data.detailPacket=await query('shopsavvy','product_lookup',{identifier:item.identifier},signal);data.detail=productDetails(data.detailPacket,item);}catch(e){if(signal.aborted)throw e;data.detailError=e.message;}if(signal.aborted)return;render();
 try{data.offerPacket=await query('shopsavvy','product_offers',{identifier:item.identifier},signal,force);data.offers=productOffers(data.offerPacket);if(data.offerPacket.warning)data.offerError=data.offerPacket.warning;}catch(e){if(signal.aborted)throw e;data.offerError=e.message;}finally{data.loading=false;}if(!signal.aborted){render();note('详情与报价已整理完成。');}}
function cell(text,cls=''){return el('td',cls,text);}
function row(values,header=false){const r=el('tr');for(const v of values)r.append(el(header?'th':'td','',v));return r;}
function games(root){
 const form=el('form','toolbar');form.onsubmit=e=>{e.preventDefault();void searchGames();};form.append(input('游戏名 / Steam AppID','gameTerm',store.read('gameTerm',''),'中文或英文名称'),workButton('搜索最低价',searchGames,true));root.append(form);
 const regions=el('details','regions');regions.append(el('summary','','比价地区：'+state.countries.map(x=>COUNTRIES[x]).join('、')+' · 点击调整'));
 for(const [id,name] of Object.entries(COUNTRIES)){const l=el('label'),i=el('input');i.type='checkbox';i.value=id;i.checked=state.countries.includes(id);i.onchange=()=>{const countries=[...regions.querySelectorAll('input:checked')].map(x=>x.value);if(countries.length>6){i.checked=false;return note('一次最多对照6个地区。',true);}state.countries=countries;store.write('countries',countries);};regions.append(add(l,i,el('span','',name)));}root.append(regions);
 if(state.gameItems.length){const tabs=el('div','game-tabs');for(const g of state.gameItems)tabs.append(button(g.name,()=>selectGame(g)));root.append(tabs);}
 if(!state.game){root.append(empty('默认对照国区与美国。搜索后自动读取 Steam 地区价及 CheapShark 商店报价；ITAD 配置后补充所选地区商店。'));return;}
 root.append(el('h3','',state.game.name));const compared=state.offers.map(x=>({...x,cny:toCNY(x,state.fx)})).sort((a,b)=>(a.cny??Infinity)-(b.cny??Infinity));const best=compared.find(x=>x.cny!==null);
 if(best)root.append(add(el('div','best-strip'),el('span','','已接入来源最低参考价'),el('strong','',money(best.cny,'CNY')),el('span','',best.merchant+' · '+(COUNTRIES[best.country]||best.country)+' · 原价 '+money(best.amount,best.currency))));
 if(state.busy)root.append(el('p','loading','正在逐项对照地区和商店，结果会陆续显示…'));
 const t=el('table');t.append(row(['地区','商店','原币报价','人民币参考','折扣','获取时间','购买链接'],true));for(const o of compared){const tr=el('tr');tr.append(cell(COUNTRIES[o.country]||o.country),add(el('td'),el('strong','',o.merchant),el('div','muted',o.source)),cell(o.free?'免费':money(o.amount,o.currency),'price-cell'),cell(o.cny===null?'无法换算':money(o.cny,'CNY')),cell(o.discount?Math.round(o.discount)+'%':'—'),cell(when(o.fetchedAt)),add(el('td'),link(o.url,'查看 ↗')));tr.title=o.availability+' · '+o.source;t.append(tr);}root.append(t);
 for(const e of state.gameErrors)root.append(el('p','warning',e));
 if(!state.status?.sources?.itad?.configured)root.append(el('p','fine','跨商店补充源 ITAD 尚未配置 Key；当前仍可读取国区等 Steam 地区价和 CheapShark。'));
 root.append(el('p','fine','仅比较已接入来源、所选地区及当前游戏标识的报价，不能保证覆盖全网所有商店。'+(state.fx?'ECB 参考汇率日期 '+state.fx.date+'，不含手续费/结算汇差。':'汇率未取得时保留原币，不强行排序。')+' 跨区购买资格、版本及激活限制以账号和商店为准。'));
 root.append(workButton('刷新此游戏报价',()=>selectGame(state.game,true)));
}
async function searchGames(){return work(async signal=>{const term=$('#gameTerm').value.trim();if(!term)throw Error('请输入游戏名');if(!state.countries.length)throw Error('至少选择一个地区');store.write('gameTerm',term);state.game=null;state.offers=[];state.gameErrors=[];note('正在匹配游戏…');if(/^\d{1,9}$/.test(term))state.gameItems=[{id:Number(term),name:'Steam App '+term}];else{const p=await query('steamstore','search',{term},signal);const normalized=x=>String(x||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');state.gameItems=(p.data.items||[]).filter(x=>(!x.type||x.type==='app')&&Number.isInteger(x.id)&&x.id>0).sort((a,b)=>Number(normalized(b.name)===normalized(term))-Number(normalized(a.name)===normalized(term))).slice(0,12);}if(!state.gameItems.length){render();return note('没有找到 Steam 游戏匹配项。');}await loadGame(state.gameItems[0],signal);});}
async function selectGame(game,force=false){if(state.busy){state.controller?.abort();state.busy=false;}return work(signal=>loadGame(game,signal,force));}
async function loadGame(game,signal,force=false){state.game=game;state.offers=[];state.gameErrors=[];render();
 const attempt=async(label,fn)=>{try{await fn();}catch(e){if(signal.aborted)throw e;state.gameErrors.push(label+'：'+e.message);}if(!signal.aborted)render();};
 await attempt('汇率',async()=>{state.fx=(await query('fx','latest',{},signal)).data;});
 for(const country of state.countries)await attempt(COUNTRIES[country]+' Steam',async()=>{const p=await query('steamstore','price',{appid:String(game.id),country},signal,force);const offer=steamOffer(p);if(offer)state.offers.push(offer);else state.gameErrors.push(COUNTRIES[country]+'：该地区未提供可购买报价。');if(p.data.game?.name&&String(game.name).startsWith('Steam App'))state.game.name=p.data.game.name;if(p.warning)state.gameErrors.push(COUNTRIES[country]+'：显示旧报价，'+p.warning);});
 await attempt('商店名称',async()=>{if(!Object.keys(state.stores).length){const p=await query('cheapshark','stores',{},signal);state.stores=Object.fromEntries((p.data||[]).map(x=>[x.storeID,x.storeName]));}});
 await attempt('CheapShark',async()=>{const p=await query('cheapshark','deals',{steamAppID:String(game.id),pageSize:40},signal,force);const offers=cheapOffers(p,state.stores).filter(x=>String(x.appid)===String(game.id));state.offers.push(...offers);if(!offers.length&&p.data?.length)state.gameErrors.push('CheapShark 条目无法确认相同 Steam AppID，未计入最低价。');if(p.warning)state.gameErrors.push('CheapShark：显示旧报价，'+p.warning);});
 if(state.status?.sources?.itad?.configured){let id;await attempt('ITAD 游戏匹配',async()=>{const p=await query('itad','lookup',{appid:String(game.id)},signal);id=p.data.game?.id;});if(id)for(const country of state.countries)await attempt('ITAD '+COUNTRIES[country],async()=>{const p=await query('itad','prices',{ids:[id],country},signal,force);state.offers.push(...itadOffers(p,country,game.name));});}
 if(!signal.aborted){render();note('已完成当前来源与地区的比价。');}}
function free(root){
 const form=el('div','toolbar');form.append(select('平台','freePlatform',[['','Steam + Epic'],['Steam','Steam'],['Epic','Epic']],store.read('freePlatform','')),select('排序','freeSort',[['date','最新发布'],['end','即将截止']],store.read('freeSort','date')),workButton('查看免费游戏',loadFree,true));root.append(form);
 if(!state.freePacket){root.append(empty('只显示 Steam 与 Epic 的完整游戏领取活动。'));return;}
 let items=retainedGiveaways(state.giveaways,$('#freePlatform').value);if($('#freeSort').value==='end')items.sort((a,b)=>(Date.parse(a.end_date)||Infinity)-(Date.parse(b.end_date)||Infinity));
 root.append(el('p','muted',freshness(state.freePacket)+' · GamerPower · '+items.length+'项'));
 const grid=el('div','giveaway-grid');for(const x of items){const card=el('article','giveaway');const image=safeURL(x.thumbnail||x.image);if(image){const img=el('img');img.src=image;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';card.append(img);}card.append(add(el('div','badges'),...giveawayPlatforms(x).map(p=>badge(p))),el('h3','',x.title),el('p','muted',x.end_date&&x.end_date!=='N/A'?'截止 '+x.end_date:'未提供明确截止时间'),el('p','',x.description||''));const details=el('details');details.append(el('summary','','领取条件与步骤'),el('p','detail-text',x.instructions||'请查看原文领取条件。'));card.append(details,link(x.open_giveaway_url||x.gamerpower_url,'查看领取活动 ↗'));grid.append(card);}root.append(grid);if(!items.length)root.append(empty('当前筛选没有完整游戏活动。'));
 root.append(el('p','fine','免费领取活动由 GamerPower 提供。永久入库、账户、积分或额外任务要求以活动原文为准。'));
 $('#freePlatform').onchange=()=>{store.write('freePlatform',$('#freePlatform').value);render();};$('#freeSort').onchange=()=>{store.write('freeSort',$('#freeSort').value);render();};
}
async function loadFree(){return work(async signal=>{const platform=$('#freePlatform').value;store.write('freePlatform',platform);store.write('freeSort',$('#freeSort').value);note('正在读取 Steam / Epic 完整游戏活动…');const p=await query('gamerpower','filter',{platform:platform==='Steam'?'steam':platform==='Epic'?'epic-games-store':'steam+epic-games-store',type:'game','sort-by':'date'},signal);state.giveaways=p.data;state.freePacket=p;render();note(p.warning||'活动已更新。',!!p.warning);});}
function wishlist(root){
 const modes=el('div','segments');for(const [k,label] of [['current','当前全部'],['month','近30天平均排名'],['risers','近30天上升'],['new','近30天新上榜']]){const b=button(label,()=>{state.controller?.abort();state.busy=false;state.rankMode=k;state.trendPage=0;render();if(k!=='current')void loadTrends();});b.classList.toggle('active',state.rankMode===k);modes.append(b);}root.append(modes);
 if(state.rankMode!=='current'){renderTrends(root);return;}
 const toolbar=el('div','toolbar');toolbar.append(workButton('读取榜单',()=>loadRank(0),true),workButton('采集完整榜单快照',collectRanks),input('搜索已读取的榜单','rankTerm',state.rankSearch,'名称 / AppID'));if(state.busy)toolbar.append(button('取消读取',()=>state.controller?.abort()));root.append(toolbar);
 root.append(el('p','fine','官方公开搜索顺序，每页100项，可浏览全部页面。完整采集按需逐页读取，可取消；不在后台定时抓取。'));
 if(state.rankProgress)root.append(el('p','loading',state.rankProgress));
 if(!state.rankPacket){root.append(empty('点击读取，查看完整榜单入口。'));return;}
 const p=state.rankPacket.data;root.append(el('p','muted',freshness(state.rankPacket)+` · 上游共 ${p.total} 项 · 当前第 ${state.rankPage+1} / ${p.totalPages} 页`));
 const controls=el('div','pager');const prev=workButton('上一页',()=>loadRank(state.rankPage-1));prev.dataset.boundDisabled=String(state.rankPage===0);prev.disabled=state.busy||state.rankPage===0;const next=workButton('下一页',()=>loadRank(state.rankPage+1));next.dataset.boundDisabled=String(state.rankPage+1>=p.totalPages);next.disabled=state.busy||state.rankPage+1>=p.totalPages;
 const jump=el('input');jump.type='number';jump.id='rankPage';jump.min='1';jump.max=String(p.totalPages);jump.value=String(state.rankPage+1);jump.setAttribute('aria-label','跳转到榜单页码');controls.append(prev,el('span','',`第 ${state.rankPage+1} / ${p.totalPages} 页`),jump,workButton('跳转',()=>{const page=Number(jump.value)-1;if(!Number.isInteger(page)||page<0||page>=p.totalPages)return note('页码超出范围',true);return loadRank(page);}),next);root.append(controls);
 const term=state.rankSearch.trim().toLowerCase(),catalog=term?[...state.rankPages.values()].flat():state.rankItems,items=catalog.filter(x=>!term||x.title.toLowerCase().includes(term)||String(x.appid).includes(term));rankTable(root,items);
 $('#rankTerm').oninput=()=>{const i=$('#rankTerm'),start=i.selectionStart;state.rankSearch=i.value;render();$('#rankTerm')?.focus();$('#rankTerm')?.setSelectionRange(start,start);};
 root.append(link('https://store.steampowered.com/search/?filter=popularwishlist&ignore_preferences=1','Steam 官方榜单 ↗'));
}
function rankTable(root,items){const t=el('table');t.append(row(['名次','游戏','发售','与前一观测日对照','商店'],true));for(const x of items)t.append(add(el('tr'),cell('#'+x.rank,'rank'),cell(x.title),cell(x.release||'未提供'),cell(x.change===null||x.change===undefined?'暂无对照':x.change>0?'↑ '+x.change:x.change<0?'↓ '+Math.abs(x.change):'持平'),add(el('td'),link(x.url,'Steam ↗'))));root.append(t);if(!items.length)root.append(empty('当前页面没有匹配项；可翻页查看其他排名。'));}
async function loadRank(page){return work(async signal=>{note('正在读取第 '+(page+1)+' 页…');const p=await query('steam','leaderboard',{page},signal);if(state.rankCatalogDay!==p.data.day){state.rankPages.clear();state.rankCatalogDay=p.data.day;}state.rankPacket=p;state.rankItems=p.data.items;state.rankPages.set(page,p.data.items);state.rankPage=page;state.rankProgress='';render();note(p.warning||'榜单已读取。',!!p.warning);});}
async function collectRanks(){return work(async signal=>{
 note('开始读取完整榜单，进度将逐页更新。');let totalPages=1,received=0;const snapshotDay=new Date().toISOString().slice(0,10);state.rankProgress='正在读取第1页…';render();
 for(let page=0;page<totalPages;page++){
  const p=await query('steam','leaderboard',{page},signal);if(!p.data.snapshotStored)throw Error('榜单可读取，但本次快照保存失败，已停止完整采集。');if(p.data.day!==snapshotDay)throw Error('采集跨越了日期边界，已停止，避免把不同日期拼成同一快照。');if(p.cache==='stale')throw Error('完整采集停止：第'+(page+1)+'页仅有旧缓存，不能算作成功新快照。');
  totalPages=p.data.totalPages;if(totalPages>150)throw Error('榜单超过单次150页安全上限，已停止。');received+=p.data.items.length;if(state.rankCatalogDay!==p.data.day){state.rankPages.clear();state.rankCatalogDay=p.data.day;}state.rankPacket=p;state.rankItems=p.data.items;state.rankPages.set(page,p.data.items);state.rankPage=page;state.rankProgress=`正在采集 ${page+1} / ${totalPages} 页 · 已读取 ${received} 个游戏条目`;render();
 }
 state.rankProgress=`已读完上游 ${totalPages} 页，共 ${received} 个游戏条目。`;state.trends=null;render();note('完整榜单读取完成。月份趋势按实际观测日期逐步积累。');
});}
function renderTrends(root){
 const d=state.trends;root.append(workButton('更新趋势视图',loadTrends,true));
 root.append(el('p','fine','这里是实际观测快照的30天窗口：平均名次、名次上升与新进入全榜。Steam 不公开任意游戏的真实月新增愿望单人数，本工具不以 Followers 或排名变化替代。'));
 if(!d){root.append(empty('尚未读取历史快照。'));return;}
 root.append(add(el('div','coverage'),badge('已观测 '+d.observedDays+' / '+d.windowDays+' 天'),badge('完整全榜 '+d.completeDays+' 天'),el('span','',d.firstObserved?d.firstObserved+' 至 '+d.lastObserved:'尚无历史')));
 if(d.historyWarning)root.append(el('p','warning',d.historyWarning));
 const search=input('搜索趋势榜','trendTerm',state.trendSearch,'游戏名称 / AppID');root.append(search);
 const term=state.trendSearch.trim().toLowerCase(),items=trendItems(d,state.rankMode).filter(x=>!term||x.title.toLowerCase().includes(term)||String(x.appid).includes(term));
 if(state.rankMode==='new'&&!d.newEntryBaseline)root.append(empty('还没有完整全榜基准，无法可靠判定新上榜。先在「当前全部」采集完整榜单。'));
 const pages=Math.max(1,Math.ceil(items.length/100));state.trendPage=Math.min(state.trendPage,pages-1);
 const controls=el('div','pager'),prev=button('上一页',()=>{state.trendPage--;render();}),next=button('下一页',()=>{state.trendPage++;render();});prev.disabled=state.trendPage===0;next.disabled=state.trendPage+1>=pages;controls.append(prev,el('span','',`${items.length} 项 · 第 ${state.trendPage+1} / ${pages} 页`),next);root.append(controls);
 const t=el('table');t.append(row(['游戏','观测平均名次','最佳名次','最新观测名次','观测天数','名次涨幅','首次观测'],true));for(const x of items.slice(state.trendPage*100,(state.trendPage+1)*100))t.append(add(el('tr'),add(el('td'),link(x.url,x.title)),cell(x.averageRank),cell('#'+x.bestRank),cell('#'+x.currentRank),cell(x.observedDays),cell(x.change===null?'不足2个日期':x.change>0?'↑ '+x.change:String(x.change)),cell(x.firstSeen)));root.append(t);
 if(!items.length)root.append(empty('当前观测窗口没有可展示的条目。历史不足时不会填入模拟排行。'));
 $('#trendTerm').oninput=()=>{const i=$('#trendTerm'),pos=i.selectionStart;state.trendSearch=i.value;state.trendPage=0;render();$('#trendTerm')?.focus();$('#trendTerm')?.setSelectionRange(pos,pos);};

}
async function loadTrends(){return work(async signal=>{state.trends=(await query('steam','trends',{days:30},signal)).data;render();note('已读取实际历史，不消耗外部查询额度。');});}
$('#connect').onclick=initConnect;$('#theme').onclick=()=>{document.body.classList.toggle('dark');store.write('dark',document.body.classList.contains('dark'));};document.body.classList.toggle('dark',store.read('dark',false));for(const b of document.querySelectorAll('[data-page]'))b.onclick=()=>setPage(b.dataset.page);window.addEventListener('hashchange',()=>setPage(location.hash.slice(1)));
setPage(location.hash.slice(1));void status();if(!connected()&&location.origin==='https://ximinhu66.github.io'){sessionStorage.setItem('pt.deal-lab.return.v1',JSON.stringify({path:location.pathname,expiresAt:Date.now()+600000}));connect({automatic:true});}
