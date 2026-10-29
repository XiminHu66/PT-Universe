import {connected,connect} from '../monitor-center/connection.mjs';
import {NAMES,safeURL,normalize,giveawayKind} from './data.mjs';
const BASE='https://pt-universe-api.summer07-nanjolno.workers.dev/api/deal-lab/';
const $=s=>document.querySelector(s);
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
const add=(p,...nodes)=>{for(const n of nodes)if(n)p.append(n);return p;};
const store={read(k,f){try{return JSON.parse(localStorage.getItem('ptu.deal-lab.'+k))??f}catch{return f}},write(k,v){try{localStorage.setItem('ptu.deal-lab.'+k,JSON.stringify(v))}catch{notify('浏览器存储不可用；本次结果仍可查看，收藏暂时无法保存。')}}};
const TITLES={overview:'数据源总览',products:'商品探索',games:'游戏折扣',free:'免费领取',steam:'Steam 热门愿望单',playground:'API Playground',saved:'收藏与查询历史'};
const state={page:'overview',status:null,packets:[],errors:[],busy:false,provider:store.read('provider','cheapshark'),operation:'games',playArgs:{},lastQuery:null};
let saved=store.read('saved',[]),historyItems=store.read('history',[]),jsonValue=null;
function notify(text,error=false){$('#notice').textContent=text;$('#notice').classList.toggle('error',error);}
function button(text,fn,primary=false){const b=el('button',primary?'primary':'',text);b.type='button';b.onclick=fn;return b;}
function link(url,text){const href=safeURL(url);if(!href)return null;const a=el('a','',text);a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;}
function field(text,id,value='',type='text',placeholder=''){const l=el('label');const i=el('input');i.id=id;i.type=type;i.value=value;i.maxLength=type==='text'?2400:180;i.placeholder=placeholder;return add(l,el('span','',text),i);}
function choice(text,id,options,value){const l=el('label');const s=el('select');s.id=id;for(const [id,title] of options){const o=el('option','',title);o.value=id;o.selected=id===value;s.append(o);}return add(l,el('span','',text),s);}
function pill(text,kind=''){return el('span','status '+kind,text);}
function when(value){if(!value||value==='N/A')return '未提供';const date=new Date(value);return isNaN(date)?String(value):date.toLocaleString('zh-CN',{timeZone:'America/Los_Angeles'});}
async function request(path,body){const response=await fetch(BASE+path,{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json'}:{}),authorization:'Bearer '+(sessionStorage.getItem('pt.monitor.session.v1')||'')},body:body?JSON.stringify(body):undefined,credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(70000)});const data=await response.json().catch(()=>({error:'服务未返回有效 JSON'}));if(!response.ok){const e=new Error(data.error||'HTTP '+response.status);e.packet=data;e.httpStatus=response.status;throw e;}return data;}
function initConnect({automatic=false}={}){sessionStorage.setItem('pt.deal-lab.return.v1',JSON.stringify({path:location.pathname,expiresAt:Date.now()+600000}));connect({automatic});}
function setPage(page){state.page=Object.hasOwn(TITLES,page)?page:'overview';state.packets=[];state.errors=[];window.history.replaceState(null,'','#'+state.page);document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===state.page));$('#heading').textContent=TITLES[state.page];render();}
function render(){const root=$('#view');root.replaceChildren();if(state.page==='overview')overview(root);else if(['products','games','free'].includes(state.page))searchForm(root,state.page);else if(state.page==='steam')steam(root);else if(state.page==='playground')playground(root);else savedView(root);renderPackets();setBusy(state.busy);}
function setBusy(busy){state.busy=busy;$('#view').setAttribute('aria-busy',String(busy));document.querySelectorAll('#view button[data-query]').forEach(b=>b.disabled=busy);}
function queryButton(label,fn,primary=false){const b=button(label,fn,primary);b.dataset.query='true';b.disabled=state.busy;return b;}
function overview(root){
 root.append(el('p','lead','按需探索真实数据。所有外部查询需要现有私有后台授权；打开页面只读取本工具状态，不请求第三方 API。'));
 const grid=el('div','grid source-grid');
 for(const [id,name] of Object.entries(NAMES)){
  const source=state.status?.sources?.[id],b=source?.budget||{},u=source?.usage||{},health=source?.health;
  const title=!source?'状态未知':!source.configured?'待配置 Key':health?.state==='rate_limited'?'最近调用限流':health?.state==='failed'?'最近调用失败':health?.state==='success'?'最近调用成功':'已接入 · 尚未调用';
  const card=add(el('article','panel'),el('h3','',name),pill(title,health?.state==='success'?'good':!source?.configured||health?.state==='failed'?'warn':''));
  card.append(el('p','lead',source?.policy?.free||'正在读取服务端配置…'));
  for(const [name,value] of [['滚动31天 · 本工具调用',(u.month??'—')+' / '+(b.month??'—')],['今日 / 每小时',`${u.day??'—'} / ${u.hour??'—'}`],['最近调用',when(u.lastCall)],['最近成功',when(health?.lastSuccess)],['缓存 / 最短间隔',`${b.ttl?b.ttl/60:'—'} 分钟 / ${b.cooldown??'—'} 秒`]])card.append(add(el('div','stats'),el('span','',name),el('b','',value)));
  if(u.month>=b.month*.8)card.append(el('p','warning','已使用80%以上内部额度；达到上限将停止新请求。'));
  if(health?.error)card.append(el('p','warning',health.error));
  card.append(el('p','muted',source?.policy?.note||''),add(el('div','result-head'),link(source?.doc,'API 文档'),link(source?.policy?.terms,'条款 / 额度'),button('探索端点',()=>{state.provider=id;setPage('playground');})));
  grid.append(card);
 }
 root.append(grid,el('p','note','使用量为本工具记录的请求尝试（包含失败），不是账户官方剩余额度。SerpApi 采用滚动31天175次硬上限，覆盖不同账期；其他应用可能共用账户额度。缓存结果可随时回看。'));
 root.append(button('刷新接入状态',()=>status()));
}
function searchForm(root,mode){
 const prefs=store.read('form-'+mode,{}),toolbar=el('form','toolbar');
 toolbar.onsubmit=e=>{e.preventDefault();void search(mode);};
 if(mode!=='free')toolbar.append(field(mode==='products'?'关键词 / 商品标识':'游戏名 / Steam AppID','term',prefs.term||'','search',mode==='products'?'名称、ASIN、UPC、型号':'例如 Hades 或 1145360'));
 const sourceOptions=mode==='products'?[['shopsavvy','ShopSavvy MCP'],['serpapi','Google Shopping'],['compare','分别查询并对照']]:mode==='games'?[['cheapshark','CheapShark'],['itad','IsThereAnyDeal'],['compare','分别查询并对照']]:[['gamerpower','GamerPower']];
 toolbar.append(choice('数据源','source',sourceOptions,prefs.source||sourceOptions[0][0]));
 if(mode==='products'){
  toolbar.append(choice('查询方式','mode',[['search','关键词搜索'],['lookup','标识查询'],['offers','跨商家报价'],['history','价格历史'],['guide','购买指南'] ],prefs.mode||'search'));
  const extra=el('div','toolbar extra');
  const update=()=>{extra.replaceChildren();if($('#mode').value==='history')extra.append(field('开始日期','start_date',prefs.start_date||new Date(Date.now()-90*86400000).toISOString().slice(0,10),'date'),field('结束日期','end_date',prefs.end_date||new Date().toISOString().slice(0,10),'date'));};
  root.append(toolbar,extra);$('#mode').onchange=update;update();
  toolbar.append(choice('Google 排序','sort_by',[['','相关度'],['1','价格从低到高'],['2','价格从高到低']],prefs.sort_by||''));
 }else if(mode==='games'){
  toolbar.append(choice('输入类型','mode',[['title','游戏名称'],['appid','Steam AppID']],prefs.mode||'title'));
 }else{
  toolbar.append(choice('平台','platform',[['','所有平台'],['pc','PC'],['steam','Steam'],['epic-games-store','Epic'],['gog','GOG'],['ps5','PS5'],['ps4','PS4'],['xbox-series-xs','Xbox Series X/S'],['xbox-one','Xbox One'],['switch','Switch']],prefs.platform||''));
  toolbar.append(choice('类型','type',[['game','完整游戏'],['dlc','DLC（从 Loot 中筛选）'],['loot','Loot / 道具'],['beta','Beta / 测试']],prefs.type||'game'));
  toolbar.append(choice('排序','sort',[['date','最新发布'],['end','即将截止'],['popularity','热门']],prefs.sort||'date'));
 }
 if(mode!=='products')root.append(toolbar);
 toolbar.append(queryButton(mode==='free'?'读取免费活动':'搜索',()=>search(mode),true));
 if(mode==='games')root.append(el('p','lead','选择游戏后可手动读取跨商店报价、历史低价与详情。CheapShark 价格为 USD / 美国市场；ITAD 保留原始国家和币种。'));
 if(mode==='products')root.append(el('p','lead','ShopSavvy 支持商品标识、报价、历史与指南。Google 未配置 Key 时会单独报告，不影响其他来源。不同型号、成色和地区的报价需分别核实。'));
 if(mode==='free')root.append(el('p','lead','由 GamerPower 提供。完整游戏、道具/DLC 与 Beta 分别标注；永久入库、账户要求和额外任务以活动原文为准。'));
 root.append(el('p','empty','选择条件后点击查询；不会自动获取第三方数据。'));
}
async function search(mode){
 if(state.busy)return;
 const prefs={};for(const i of $('#view').querySelectorAll('input,select'))prefs[i.id]=i.value;store.write('form-'+mode,prefs);
 const term=prefs.term?.trim();if(mode!=='free'&&!term)return notify('请输入查询内容');
 const sources=prefs.source==='compare'?(mode==='products'?['shopsavvy','serpapi']:['cheapshark','itad']):[prefs.source];
 state.packets=[];state.errors=[];setBusy(true);
 for(const provider of sources){
  let operation,args;
  if(mode==='free'){operation='giveaways';args={type:prefs.type==='dlc'?'loot':prefs.type,'sort-by':prefs.sort==='end'?'date':prefs.sort};if(prefs.platform)args.platform=prefs.platform;}
  else if(mode==='products'){
   if(provider==='shopsavvy'){
    operation={search:'product_search',lookup:'product_lookup',offers:'product_offers',history:'product_price_history',guide:'content_buying_guide'}[prefs.mode];
    args=['search','guide'].includes(prefs.mode)?{query:term}:{identifier:term};
    if(prefs.mode==='search')args.limit=20;
    if(prefs.mode==='history'){args.start_date=prefs.start_date;args.end_date=prefs.end_date;}
   }else{if(prefs.mode!=='search'){state.errors.push({provider,message:'该方式使用 ShopSavvy。Google 商品详情请在搜索结果或实验台使用真实 page_token。'});continue;}operation='search';args={q:term};if(prefs.sort_by)args.sort_by=prefs.sort_by;}
  }else if(provider==='itad'){operation=prefs.mode==='appid'?'lookup':'search';args=prefs.mode==='appid'?{appid:term}:{title:term,results:20};}
  else{operation='games';args=prefs.mode==='appid'?{steamAppID:term,limit:20}:{title:term,limit:20};}
  await query(provider,operation,args,{append:true,keepBusy:true});
 }
 setBusy(false);renderPackets();
}
function steam(root){
 root.append(el('p','lead','来源为 Steam 官方公开商店搜索排序，按需读取并缓存24小时。无正式稳定排行榜 API；这里只显示公开排名，不是愿望单人数、每日新增或 Followers。'));
 const t=el('div','toolbar');t.append(queryButton('读取热门愿望单榜单',()=>query('steam','leaderboard',{}),true),field('筛选已读取榜单','rankSearch','','search','游戏名 / AppID'),choice('排名变化','rankFilter',[['all','全部'],['new','新进入当前榜单'],['up','上升'],['down','下降']],'all'));
 root.append(t,el('p','note','只有成功请求才保存一次快照。首次读取不显示变化；“新上榜”仅指新进入本工具已读取的前50项。自动快照默认关闭，也未新增定时任务。'));
 $('#rankSearch').oninput=renderPackets;$('#rankFilter').onchange=renderPackets;
}
function playground(root){
 root.append(el('p','lead','选择已批准的只读端点。参数恢复到上次使用的值；MCP 输入控件由真实 tools/list Schema 生成，可切换 JSON 输入。所有调用均经服务端验证。'));
 const toolbar=add(el('div','toolbar'),choice('数据源','provider',Object.entries(NAMES),state.provider));root.append(toolbar);
 const form=el('form','panel');form.onsubmit=e=>e.preventDefault();root.append(form);
 function rebuild(){
  const provider=$('#provider').value;state.provider=provider;store.write('provider',provider);form.replaceChildren();
  const tools=store.read('mcp-schema',[]),operations=state.status?.operations?.[provider]||{};
  const entries=provider==='shopsavvy'?[['tools','发现 / 刷新 MCP 工具目录'],...tools.map(t=>[t.name,t.name])]:Object.entries(operations).map(([k,v])=>[k,k+' · '+v.description]);
  form.append(choice('Endpoint / MCP Tool','endpoint',entries,state.operation));const desc=el('p','lead'),fields=el('div','form-fields');form.append(desc,fields);
  function refields(){
   const op=$('#endpoint').value;state.operation=op;fields.replaceChildren();
   const defaults=state.playArgs[provider+'/'+op]||store.read('args-'+provider+'-'+op,{});
   const def=provider==='shopsavvy'?tools.find(t=>t.name===op):operations[op];desc.textContent=def?.description||'发现真实 MCP 只读工具目录；不会执行调度或账户修改。';
   if(provider==='shopsavvy'&&op!=='tools'){
    const schema=def?.inputSchema||{};
    for(const [k,v] of Object.entries(schema.properties||{})){
     if(v.type==='boolean')fields.append(choice(k,'arg-'+k,[['','不传（默认）'],['true','true'],['false','false']],defaults[k]===undefined?'':String(defaults[k])));
     else if(v.enum)fields.append(choice(k,'arg-'+k,[['','不传（默认）'],...v.enum.map(x=>[String(x),String(x)])],String(defaults[k]??'')));
     else fields.append(field(k+(schema.required?.includes(k)?' *':''),'arg-'+k,defaults[k]??'',v.type==='number'||v.type==='integer'?'number':'text',v.description||k));
    }
    const detail=el('details','schema');detail.append(el('summary','','真实 Tool Schema'),el('pre','',JSON.stringify(schema,null,2)));fields.append(detail);
    const raw=el('details','schema');const area=el('textarea');area.id='mcpArgs';area.rows=6;area.value=JSON.stringify(defaults,null,2);raw.append(el('summary','','直接输入 JSON（展开后以此为准）'),area);fields.append(raw);
   }else if(provider!=='shopsavvy'){
    for(const k of Object.keys(def?.params||{}))fields.append(field(k,'arg-'+k,defaults[k]??'','text',k==='page_token'?'搜索结果中的 immersive_product_page_token':k));
    if(def?.body)fields.append(field('ids · ITAD UUID，最多5个','arg-ids',Array.isArray(defaults.ids)?defaults.ids.join(','):defaults.ids||''));
   }
  }
  $('#endpoint').onchange=refields;refields();
  form.append(queryButton('执行查询',async()=>{
   const op=$('#endpoint').value;let args={};
   if($('#mcpArgs')?.parentElement.open){try{args=JSON.parse($('#mcpArgs').value||'{}');}catch{return notify('参数 JSON 格式错误',true);}}
   else for(const i of fields.querySelectorAll('input,select'))if(i.id.startsWith('arg-')&&i.value.trim()){
    const k=i.id.slice(4),schema=tools.find(t=>t.name===op)?.inputSchema?.properties?.[k];
    args[k]=provider==='shopsavvy'&&['integer','number'].includes(schema?.type)?Number(i.value):schema?.type==='boolean'?i.value==='true':i.value.trim();
   }
   store.write('args-'+provider+'-'+op,args);await query(provider,op,args);
  },true));
  const doc=state.status?.sources?.[provider]?.doc;form.append(link(doc,'查看官方文档 ↗'));
 }
 $('#provider').onchange=rebuild;rebuild();
}
async function query(provider,operation,args={},options={}){
 if(!connected()){notify('请点击「连接 PT 私有后台」。将复用现有授权并返回本页。',true);return null;}
 if(state.busy&&!options.keepBusy)return null;
 if(!options.append){state.packets=[];state.errors=[];}
 setBusy(true);notify('正在查询 '+NAMES[provider]+'…');const query={provider,operation,args};state.lastQuery=query;
 try{
  const packet=await request('query',{...query,...(options.force?{force:true}:{})});packet.args=args;
  packet.contextTitle=options.label||'';state.packets.push(packet);
  if(provider==='shopsavvy'&&operation==='tools'){store.write('mcp-schema',packet.data?.tools||[]);if(state.page==='playground'){state.playArgs[provider+'/'+operation]=args;render();}}
  historyItems=[{...query,time:new Date().toISOString()},...historyItems.filter(h=>JSON.stringify([h.provider,h.operation,h.args])!==JSON.stringify([provider,operation,args]))].slice(0,40);store.write('history',historyItems);
  notify(`${NAMES[provider]} · ${packet.cache==='hit'?'命中缓存，不消耗新额度':'请求成功'} · ${when(packet.fetchedAt)}`);
  return packet;
 }catch(e){
  const error={provider,message:e.message,httpStatus:e.httpStatus||0,details:e.packet||{},operation,args};state.errors.push(error);
  if(e.packet?.lastGood)state.packets.push({...e.packet.lastGood,args,cache:'last-good'});
  notify(NAMES[provider]+'：'+e.message+(e.packet?.lastGood?'；保留最后成功数据。':''),true);return null;
 }finally{if(!options.keepBusy)setBusy(false);renderPackets();void status({render:false});}
}
function details(item,packet){
 const d=item.raw;const dialog=$('#detailModal');$('#detailTitle').textContent=item.title;const body=$('#detailBody');body.replaceChildren();
 if(item.image){const image=el('img','detail-image');image.src=item.image;image.alt='';image.referrerPolicy='no-referrer';body.append(image);}
 body.append(el('p','price',item.price),el('p','muted',NAMES[packet.provider]+' · '+when(packet.fetchedAt)));
 for(const [label,value] of [['类型',packet.provider==='gamerpower'?giveawayKind(d):''],['活动状态',d.status],['发布时间',d.published_date],['截止时间',d.end_date],['领取说明',d.instructions],['描述',item.text],['上游报价检查时间',item.checkedAt]])if(value)body.append(el('h4','',label),el('p','detail-text',value));
 body.append(link(item.url,'前往来源 / 领取说明 ↗'),button('原始 JSON',()=>jsonDialog(d)));
 const actions=el('div','toolbar');addActions(actions,item,packet,()=>dialog.close());body.append(actions);dialog.showModal();
}
function openEndpoint(provider,operation,args){state.provider=provider;state.operation=operation;state.playArgs[provider+'/'+operation]=args;setPage('playground');notify('参数已填好，点击「执行查询」才会请求。');}
function addActions(root,item,packet,before=()=>{}){
 const action=(label,provider,op,args)=>root.append(queryButton(label,()=>{before();return query(provider,op,args,{label:item.title});}));
 if(packet.provider==='shopsavvy'&&item.identifier){
  action('跨商家报价','shopsavvy','product_offers',{identifier:item.identifier});
  action('商品详情','shopsavvy','product_lookup',{identifier:item.identifier});
  root.append(button('价格历史',()=>{before();openEndpoint('shopsavvy','product_price_history',{identifier:item.identifier,start_date:new Date(Date.now()-90*86400000).toISOString().slice(0,10),end_date:new Date().toISOString().slice(0,10)});}));
 }
 if(packet.provider==='cheapshark'&&item.gameID)action('报价 / 历史低价','cheapshark','game',{id:String(item.gameID)});
 if(packet.provider==='itad'&&item.gameID){action('当前 / 历史最低','itad','overview',{ids:[item.gameID],country:'US'});action('所有商店报价','itad','prices',{ids:[item.gameID],country:'US'});action('价格历史','itad','history',{id:item.gameID,country:'US'});action('游戏详情','itad','info',{id:item.gameID});}
 if(packet.provider==='steam'&&item.appid){action('CheapShark 报价','cheapshark','games',{steamAppID:String(item.appid),limit:20});action('ITAD 匹配','itad','lookup',{appid:String(item.appid)});}
 const token=item.raw.immersive_product_page_token;if(packet.provider==='serpapi'&&token)root.append(button('Google 商品详情 / 商家',()=>{before();openEndpoint('serpapi','product',{page_token:token,more_stores:1});}));
}
function saveItem(item,packet){const id=packet.provider+':'+String(item.gameID||item.raw.id||item.appid||item.identifier||item.title);if(!saved.some(s=>s.id===id))saved.unshift({id,title:item.title,url:item.url,image:item.image,provider:packet.provider,kind:packet.operation,target:'',currency:item.currency,query:{provider:packet.provider,operation:packet.operation,args:packet.args},claimed:false});store.write('saved',saved);notify('已保存至本机观察列表');return saved.find(s=>s.id===id);}
function card(item,packet){
 const d=item.raw,p=el('article','item');if(item.image){const img=el('img','image');img.src=item.image;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>{img.remove();};p.append(img);}
 if(item.rank)p.append(el('div','rank','#'+item.rank+' '+(item.isNew?'新进入':item.change===null?'暂无对照':item.change>0?'↑ '+item.change:item.change<0?'↓ '+Math.abs(item.change):'持平')));
 p.append(el('h3','',item.title));if(item.price)p.append(el('p','price',item.price));
 for(const [label,value] of [['历史低价',item.historyLow],['折扣',item.discount],['商家',item.source],['型号',d.model],['品牌',d.brand],['评分',d.rating!==undefined?`${d.rating} · ${d.reviews??'—'} 条评论`:null],['成色',d.condition],['库存',d.availability],['上游检查',item.checkedAt],['平台',d.platforms],['福利',packet.provider==='gamerpower'?giveawayKind(d):null],['截止',d.end_date&&d.end_date!=='N/A'?d.end_date:null],['发售',item.release]])if(value!==undefined&&value!==null&&value!=='')p.append(el('p','muted',label+'：'+String(value)));
 if(item.checkedAt&&Date.now()-Date.parse(item.checkedAt)>7*86400000)p.append(el('p','warning','上游报价超过7天未检查，请核实商家当前价格。'));
 if(item.text)p.append(el('p','excerpt',item.text.slice(0,200)));
 const actions=el('footer');add(actions,link(item.url,packet.provider==='gamerpower'?'领取原文 ↗':'来源 / 购买 ↗'),button('详情',()=>details(item,packet)),button('JSON',()=>jsonDialog(d)),button('☆ 收藏',()=>saveItem(item,packet)));
 if(packet.provider==='gamerpower')actions.append(button('✓ 已领取',()=>{saveItem(item,packet).claimed=true;store.write('saved',saved);notify('已标记领取；可在收藏页修改。');}));
 addActions(actions,item,packet);p.append(actions);return p;
}
function renderPackets(){
 const root=$('#view');root.querySelector('#results')?.remove();const box=el('section');box.id='results';
 for(const error of state.errors){const note=el('div','error-panel');note.append(el('b','',NAMES[error.provider]+' · HTTP '+(error.httpStatus||'—')),el('p','',error.message),button('错误详情 JSON',()=>jsonDialog(error.details)));if(error.details?.retryAfter)note.append(el('p','','请在 '+error.details.retryAfter+' 秒后重试'));box.append(note);}
 for(const packet of state.packets){
  const section=el('section','source-results'),items=normalize(packet),head=el('div','result-head');
  add(head,el('h3','',NAMES[packet.provider]+' · '+items.length+' 条'),pill(packet.cache==='hit'?'缓存':packet.cache==='last-good'?'旧缓存 · 上游失败':packet.cache==='expired'?'缓存已失效':'真实请求',packet.cache==='last-good'?'warn':'good'),el('span','muted',`HTTP ${packet.httpStatus} · ${packet.durationMs}ms · ${when(packet.fetchedAt)}`));
  head.append(button('完整 JSON',()=>jsonDialog(packet)),queryButton('检查缓存',()=>query(packet.provider,packet.operation,packet.args)),queryButton('重新向上游查询',()=>query(packet.provider,packet.operation,packet.args,{force:true})));
  head.append(button('清除此查询缓存',async()=>{try{await request('clear',{provider:packet.provider,operation:packet.operation,args:packet.args});packet.cache='expired';renderPackets();notify('缓存已失效；保留最后成功数据。下次查询会消耗真实额度。');}catch(e){notify(e.message,true);}}));
  section.append(head,el('p','muted',`来源：${packet.source} · 地区：${packet.region||'上游未统一声明'} · 数据获取于 ${when(packet.fetchedAt)} · 上游报价时间以各项为准`));
  if(packet.provider==='shopsavvy'&&packet.operation!=='tools')section.append(el('p','note','ShopSavvy MCP 本次返回文本；卡片仅提取文本中明确提供的字段。币种或地区缺失时不进行跨来源最低价判定。'));
  if(packet.provider==='steam'&&packet.data.snapshotStored===false)section.append(el('p','warning','榜单已读取，但本次历史快照保存失败，不能作为下次变化对照。'));
  let shown=items;
  if(packet.provider==='steam'){const term=$('#rankSearch')?.value?.trim().toLowerCase()||'',filter=$('#rankFilter')?.value||'all';shown=items.filter(x=>(!term||x.title.toLowerCase().includes(term)||String(x.appid).includes(term))&&(filter==='all'||filter==='new'&&x.isNew||filter==='up'&&x.change>0||filter==='down'&&x.change<0));}
  if(packet.provider==='gamerpower'){const prefs=store.read('form-free',{});if(prefs.type==='dlc')shown=shown.filter(x=>/\bdlc\b/i.test(x.title));if(prefs.sort==='end')shown.sort((a,b)=>(Date.parse(a.raw.end_date)||Infinity)-(Date.parse(b.raw.end_date)||Infinity));}
  const controls=add(el('div','toolbar'),button(store.read('list',false)?'切换卡片视图':'切换列表视图',()=>{store.write('list',!store.read('list',false));renderPackets();}));section.append(controls);
  const grid=el('div',store.read('list',false)?'result-list':'grid');for(const item of shown.slice(0,100))grid.append(card(item,packet));section.append(grid);
  if(!shown.length)section.append(el('p','empty',items.length?'当前筛选下无条目。':'上游成功返回，但无可展示条目。请查看原始 JSON；这不代表接口失败。'));
  section.append(link(packet.source,'数据来源 / API 文档 ↗'));
  const history=historyPoints(packet);if(history.length)section.append(historyTable(history));
  box.append(section);
 }
 if(state.packets.length)root.querySelector('.empty')?.remove();root.append(box);setBusy(state.busy);
}
function historyPoints(packet){if(packet.provider==='itad'&&packet.operation==='history'&&Array.isArray(packet.data))return packet.data.filter(x=>x.deal?.price).map(x=>({time:x.timestamp,shop:x.shop?.name,amount:x.deal.price.amount,currency:x.deal.price.currency}));return [];}
function historyTable(points){
 const box=el('div','panel');box.append(el('h3','','历史价格 · 按商店和币种分别查看'));
 const groups=[...new Set(points.map(x=>(x.shop||'未提供商店')+' · '+x.currency))];
 const group=choice('曲线：商店 / 币种','history-group',groups.map(x=>[x,x]),groups[0]);box.append(group);const chart=el('div','history-chart');box.append(chart);
 function draw(){chart.replaceChildren();const data=points.filter(x=>(x.shop||'未提供商店')+' · '+x.currency===group.querySelector('select').value).filter(x=>Number.isFinite(Number(x.amount))&&Number.isFinite(Date.parse(x.time))).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));if(data.length<2){chart.append(el('p','muted','此商店/币种的有效点不足两个，保留明细，不绘制趋势。'));return;}
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 800 210');svg.setAttribute('role','img');svg.setAttribute('aria-label','历史价格；横轴时间、纵轴价格，币种以选项为准');
 const amounts=data.map(x=>Number(x.amount)),times=data.map(x=>Date.parse(x.time)),min=Math.min(...amounts),max=Math.max(...amounts),begin=times[0],end=times.at(-1);
 const path=document.createElementNS(ns,'polyline');path.setAttribute('points',data.map(x=>`${40+(Date.parse(x.time)-begin)/Math.max(1,end-begin)*730},${175-(Number(x.amount)-min)/Math.max(1,max-min)*150}`).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke','#2e83be');path.setAttribute('stroke-width','3');svg.append(path);
 for(const [x,y,text] of [[5,20,max.toFixed(2)],[5,178,min.toFixed(2)],[40,205,new Date(begin).toISOString().slice(0,10)],[665,205,new Date(end).toISOString().slice(0,10)]]){const t=document.createElementNS(ns,'text');t.setAttribute('x',x);t.setAttribute('y',y);t.setAttribute('fill','currentColor');t.setAttribute('font-size','12');t.textContent=text;svg.append(t);}chart.append(svg);
 }
 group.querySelector('select').onchange=draw;draw();
 const table=el('table');const h=el('tr');for(const k of ['时间','商店','价格','币种'])h.append(el('th','',k));table.append(h);for(const x of points.slice(0,100)){const tr=el('tr');for(const v of [when(x.time),x.shop,x.amount,x.currency])tr.append(el('td','',v));table.append(tr);}box.append(table);return box;
}
function savedView(root){
 const grid=el('div','grid');for(const item of saved){const panel=el('article','panel');panel.append(el('h3','',item.title),el('p','muted',NAMES[item.provider]+' · '+item.kind),link(item.url,'打开保存的来源 ↗'),field('目标价格','target-'+saved.indexOf(item),item.target||'','number'),field('币种','currency-'+saved.indexOf(item),item.currency||'','text','例如 USD'));
  panel.append(button('保存目标',()=>{const values=panel.querySelectorAll('input');item.target=values[0].value;item.currency=values[1].value.toUpperCase();store.write('saved',saved);notify('目标价已保存；未启用自动监控。');}),button(item.claimed?'✓ 已领取（取消）':'标记已领取',()=>{item.claimed=!item.claimed;store.write('saved',saved);render();}),button('移除',()=>{saved=saved.filter(x=>x.id!==item.id);store.write('saved',saved);render();}));
  if(item.query)panel.append(queryButton('重新查询',()=>query(item.query.provider,item.query.operation,item.query.args)));grid.append(panel);
 }
 root.append(grid);if(!saved.length)root.append(el('p','empty','还没有观察对象。搜索后点击收藏，可保存目标价和领取状态。'));
 root.append(el('h3','','最近查询（本机）'));const list=el('div','history-list');for(const q of historyItems)list.append(queryButton(`${when(q.time)} · ${NAMES[q.provider]} / ${q.operation} · ${JSON.stringify(q.args).slice(0,130)}`,()=>{openEndpoint(q.provider,q.operation,q.args);}));
 root.append(list,button('清空查询历史',()=>{historyItems=[];store.write('history',[]);render();}));
}
function tree(value,key='root',depth=0){if(value&&typeof value==='object'&&depth<9){const d=el('details');d.open=depth===0;const entries=Object.entries(value);d.append(el('summary','',`${key} ${Array.isArray(value)?'[':'{'}${entries.length}${Array.isArray(value)?']':'}'}`));for(const [k,v] of entries.slice(0,500))d.append(tree(v,k,depth+1));return d;}return el('div','json-leaf',key+': '+JSON.stringify(value));}
function jsonDialog(value){jsonValue=value;$('#jsonText').textContent=JSON.stringify(value,null,2);$('#jsonTree').replaceChildren(tree(value));$('#jsonModal').showModal();}
async function status(options={render:true}){try{state.status=await request('status');$('#sessionStatus').textContent=state.status.authorized?'私有后台已连接':'尚未授权';$('#connect').textContent=state.status.authorized?'重新连接':'连接 PT 私有后台';if(options.render)render();}catch(e){$('#sessionStatus').textContent='后台状态不可用';notify(e.message,true);}}
$('#connect').onclick=()=>initConnect();$('#theme').onclick=()=>{document.body.classList.toggle('dark');store.write('dark',document.body.classList.contains('dark'));};document.body.classList.toggle('dark',store.read('dark',false));
$('#closeJson').onclick=()=>$('#jsonModal').close();$('#closeDetail').onclick=()=>$('#detailModal').close();$('#copyJson').onclick=()=>navigator.clipboard.writeText(JSON.stringify(jsonValue,null,2)).then(()=>notify('JSON 已复制')).catch(()=>notify('浏览器不允许复制，请从格式化文本手动复制。'));
$('#toggleJson').onclick=()=>{const showing=$('#jsonTree').hidden;$('#jsonTree').hidden=!showing;$('#jsonText').hidden=showing;};
$('#expandJson').onclick=()=>$('#jsonTree').querySelectorAll('details').forEach(d=>d.open=true);$('#collapseJson').onclick=()=>$('#jsonTree').querySelectorAll('details').forEach(d=>d.open=false);
for(const b of document.querySelectorAll('[data-page]'))b.onclick=()=>setPage(b.dataset.page);
window.addEventListener('hashchange',()=>setPage(location.hash.slice(1)));
if(new URLSearchParams(location.search).get('embed')==='1')document.body.classList.add('embedded');
setPage(location.hash.slice(1));void status();if(!connected()&&location.origin==='https://ximinhu66.github.io')initConnect({automatic:true});
