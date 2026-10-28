import {randomUUID} from 'node:crypto';
import {validateObject,normalizeSource,parseProduct,detectChange,hotelDecision,HOTEL_FIELDS,fingerprint,text,money,MonitorError} from './model.mjs';
import {fetchPublic,safeURL} from './network.mjs';
import {browse} from './browser.mjs';
const nowISO=()=>new Date().toISOString();
export class Engine{
 constructor(store,{fetcher=fetchPublic,browser=browse,clock=Date.now,validateURL=safeURL}={}){this.store=store;this.fetcher=fetcher;this.browser=browser;this.clock=clock;this.validateURL=validateURL;this.running=new Set();this.timer=null;}
 start(){for(const s of this.store.list('source'))if(s.checking)this.store.put('source',{...s,checking:false,error:'上次检查被中断，已安排重试',nextDue:0},s.objectId);this.timer=setInterval(()=>void this.tick(),60000);this.timer.unref();void this.tick();}
 stop(){clearInterval(this.timer);}
 overview(){const objects=this.store.list('object'),sources=this.store.list('source');return {objects:objects.map(o=>({...o,sources:sources.filter(s=>s.objectId===o.id)})),events:this.store.list('event',null,200),settings:this.settings(),serverTime:nowISO(),backend:'VPS',browserConfigured:true};}
 settings(){const s=this.store.get('settings','settings')||{};return {notificationURL:s.notificationURL||'',enabled:s.enabled===true};}
 async create(input){const object=validateObject(input);if(this.store.list('object').length>=100)throw new MonitorError('limit','最多支持100个监控对象');const o=this.store.put('object',{...object,paused:false});try{if(o.type==='uscis')await this.addSource(o.id,{url:'https://egov.uscis.gov/casestatus/landing.do',browser:true,label:'USCIS官方'});else if(input.source?.url)await this.addSource(o.id,input.source);return this.store.get(o.id,'object')}catch(e){this.store.deleteObject(o.id);throw e;}}
 async addSource(id,input){const o=this.store.get(id,'object');if(!o)throw new MonitorError('missing','监控对象不存在');if(this.store.list('source',id).length>=8)throw new MonitorError('limit','每个对象最多8个来源');const config=normalizeSource(input,o.type);await this.validateURL(config.url);if(o.type==='uscis'&&config.url!=='https://egov.uscis.gov/casestatus/landing.do')throw new MonitorError('invalid','案件仅支持USCIS官方查询');const source=this.store.put('source',{...config,objectId:id,createdAt:nowISO(),nextDue:0,checking:false,error:'',lastAttempt:null,lastSuccess:null,last:null,baselineConfirmed:false,paused:false},id);return source;}
 async update(id,input){const o=this.store.get(id,'object');if(!o)throw new MonitorError('missing','对象不存在');const updated=validateObject({...o,...input,type:o.type,config:{...o.config,...input.config}});if(o.type==='uscis'&&updated.config.receipt!==o.config.receipt)throw new MonitorError('invalid','不同案件请新建监控，避免混合历史');if(fingerprint(updated.config)!==fingerprint(o.config))for(const s of this.store.list('source',id))this.store.put('source',{...s,baselineConfirmed:false,contextVerified:false},id);return this.store.put('object',{...o,...updated,createdAt:o.createdAt,paused:input.paused===undefined?o.paused:input.paused===true});}
 async remove(id){if(this.running.has(id))throw new MonitorError('busy','检查进行中，请稍后删除');const sources=this.store.list('source',id);if(sources.some(s=>this.running.has(s.id)))throw new MonitorError('busy','检查进行中，请稍后删除');this.store.deleteObject(id);}
 detail(id){const object=this.store.get(id,'object');if(!object)throw new MonitorError('missing','对象不存在');const sources=this.store.list('source',id);return {object,sources,observations:this.store.list('observation',id,250),checks:this.store.list('check',id,30),events:this.store.list('event',id,100)};}
 async observe(o,s){
  let page;if(s.browser||o.type==='uscis'||o.type==='hotel')page=await this.browser(s.url,{source:s,receipt:o.type==='uscis'?o.config.receipt:'',screenshot:o.type==='hotel'});else page=await this.fetcher(s.url);
  if(o.type==='uscis'){
   const status=text(page.status),body=text(page.statusBody);if(!status||!body||!/(case|card|request|interview|application|petition|notice|document|oath|fingerprint|biometric|certificate|naturalization|name|birth|decision)/i.test(status)||/check case status|case status online/i.test(status))throw new MonitorError('parse','未取得案件结果，请核对编号或稍后重试');
   const date=body.match(/\bOn\s+([A-Z][a-z]+ \d{1,2}, \d{4})/);return {status,body:body.replaceAll(o.config.receipt,'[receipt]'),officialDate:date&&Number.isFinite(Date.parse(date[1]))?new Date(date[1]).toISOString().slice(0,10):null,evidence:{url:'https://egov.uscis.gov/casestatus/landing.do',text:body.replaceAll(o.config.receipt,'[receipt]')}};
  }
  if(o.type==='shopping'){
   const explicit=page.priceText?{...page,currency:page.currency||s.currency}:null;const quote=parseProduct(page.html,explicit);if(quote.currency!==o.config.currency)throw new MonitorError('currency','页面币种与监控条件不一致');if(o.config.seller&&(!quote.identity?.seller||!quote.identity.seller.toLowerCase().includes(o.config.seller.toLowerCase())))throw new MonitorError('context','未能核对指定卖家，暂不比较价格');quote.identity={...quote.identity,title:quote.title};return {...quote,evidence:{url:page.url||s.url,text:page.priceText||JSON.stringify(quote)}};
  }
  const price=money(page.priceText);if(price===null)throw new MonitorError('ambiguous','未取得唯一酒店报价，请在来源设置中指定对应房型的价格区域');
  const landed=new URL(page.url||s.url);if(landed.hostname.endsWith('booking.com')){for(const [key,value] of [['checkin',o.config.checkIn],['checkout',o.config.checkOut],['group_adults',String(o.config.adults)],['no_rooms',String(o.config.rooms)]])if(landed.searchParams.get(key)!==value)throw new MonitorError('context','Booking查询日期或人数未与订单一致，请调整来源链接');}
  return {priceMinor:price,currency:page.currency||s.currency,termsText:text(page.termsText).replaceAll(text(page.priceText),'[报价]'),totalConfirmed:s.quotedTotal===true,evidence:{url:page.url||s.url,text:text(page.termsText),screenshot:page.screenshot||null}};
 }
 async check(sourceId){
  const s=this.store.get(sourceId,'source');if(!s)throw new MonitorError('missing','来源不存在');const o=this.store.get(s.objectId,'object');if(!o)throw new MonitorError('missing','对象不存在');
  if(this.running.has(sourceId))return {queued:true};if(this.running.size>=2)throw new MonitorError('busy','采集队列正在运行，请稍后重试');
  if(s.lastAttempt&&this.clock()-Date.parse(s.lastAttempt)<45000)throw new MonitorError('busy','刚刚检查过，请等待一分钟再试');
  this.running.add(sourceId);const at=nowISO(),nextDue=this.clock()+o.hours*3600000;this.store.put('source',{...s,checking:true,lastAttempt:at,nextDue},o.id);
  try{
   const current=await this.observe(o,s),evidence=current.evidence;delete current.evidence;const observation=this.store.put('observation',{sourceId,createdAt:at,...current,evidenceId:null},o.id);
   const e=this.store.put('evidence',{sourceId,observationId:observation.id,createdAt:at,...evidence,quote:current,objectTitle:o.title,objectType:o.type,...(o.type==='hotel'?{orderBaseline:o.config,policySnapshot:{url:o.config.policyURL,notes:o.config.policyNotes,verified:o.config.policyVerified,recordedAt:at}}:{}),sha256:fingerprint(evidence)},o.id);observation.evidenceId=e.id;this.store.put('observation',observation,o.id);
   const source={...s,checking:false,lastAttempt:at,lastSuccess:at,nextDue,error:'',errorCode:null,failures:0,last:observation};
   if(o.type==='shopping'&&s.last&&fingerprint(s.last.identity)!==fingerprint(current.identity))source.baselineConfirmed=false;
   if(o.type==='hotel'&&s.termsHash!==fingerprint(current.termsText)){source.contextVerified=false;source.baselineConfirmed=false;}
   this.store.put('source',source,o.id);this.store.put('check',{sourceId,createdAt:at,ok:true},o.id);
   const change=s.baselineConfirmed?detectChange(o,s,s.last,current,this.clock()):null;if(change)await this.event(o,s,change,observation.id);
   if(o.type==='uscis'&&!s.baselineConfirmed)this.store.put('source',{...source,baselineConfirmed:true},o.id);
   return {ok:true,observationId:observation.id};
  }catch(error){
   const code=error instanceof MonitorError?error.code:'network',message=error instanceof MonitorError?error.message:'本次连接失败，请稍后重试';const failures=(s.failures||0)+1;
   this.store.put('source',{...s,checking:false,lastAttempt:at,nextDue:this.clock()+(code==='challenge'?Math.max(o.hours*3600000,24*3600000):Math.min(o.hours*3600000,Math.max(15*60000,failures*15*60000))),error:message,errorCode:code,failures},o.id);this.store.put('check',{sourceId,createdAt:at,ok:false,error:message,code},o.id);
   if(s.lastSuccess&&this.clock()-Date.parse(s.lastSuccess)>86400000||!s.lastSuccess&&failures>=3)await this.event(o,s,{kind:'check_failed',title:'监控需要处理',detail:message});return {ok:false,error:message,code};
  }finally{this.running.delete(sourceId);}
 }
 async confirm(sourceId,input){const s=this.store.get(sourceId,'source');if(!s?.last||s.error||s.checking)throw new MonitorError('invalid','请先完成一次成功检查');if(input.observationId!==s.last.id||this.clock()-Date.parse(s.lastSuccess)>1800000)throw new MonitorError('stale','报价已更新或超过30分钟，请重新检查并核对');const o=this.store.get(s.objectId,'object');let extra={};
  if(o.type==='hotel'){if(!s.last.termsText||!s.termsSelector||!s.priceSelector||!s.quotedTotal)throw new MonitorError('invalid','请指定唯一房型的价格与条件区域，并确认含税总价');if(input.conditionsMatch!==true)throw new MonitorError('invalid','请核对所有订单条件');for(const field of HOTEL_FIELDS)if(o.config[field]===undefined||o.config[field]==='')throw new MonitorError('invalid','订单条件不完整，请先补充');extra={contextVerified:true,termsHash:fingerprint(s.last.termsText),confirmedContext:Object.fromEntries(HOTEL_FIELDS.map(k=>[k,o.config[k]]))};}
  this.store.put('source',{...s,...extra,baselineConfirmed:true},o.id);
  if(o.type==='hotel'){const d=hotelDecision(o,{...s,...extra},s.last,this.clock());if(d.matchCandidate||d.rebookCandidate)await this.event(o,s,{kind:'hotel_opportunity',title:'酒店出现低价机会',detail:'已核对报价低于原订单，请复核当前可订状态',decision:d},s.last.id);}
  return {ok:true};
 }
 async updateSource(id,input){const s=this.store.get(id,'source');if(!s)throw new MonitorError('missing','来源不存在');if(this.running.has(id))throw new MonitorError('busy','检查进行中');const o=this.store.get(s.objectId,'object'),n=normalizeSource({...s,...input},o.type);await this.validateURL(n.url);return this.store.put('source',{...s,...n,baselineConfirmed:false,nextDue:0},s.objectId);}
 async event(o,s,value,observationId=null){
  const observed=observationId?this.store.get(observationId,'observation'):null;const dedup=fingerprint([o.id,s.id,value.kind,value.detail,value.decision?.saving??observed?.priceMinor??null]),recent=this.store.list('event',o.id,100).find(e=>e.dedup===dedup&&this.clock()-Date.parse(e.createdAt)<24*3600000);if(recent)return recent;
  const event=this.store.put('event',{...value,objectId:o.id,objectTitle:o.title,sourceId:s.id,observationId,dedup,createdAt:nowISO(),read:false,delivery:'pending',attempts:0},o.id);return event;
 }
 async tick(){if(this.running.size)return;try{
  const objects=new Map(this.store.list('object').map(o=>[o.id,o]));
  for(const s of this.store.list('source').filter(s=>!s.paused&&!objects.get(s.objectId)?.paused&&s.nextDue<=this.clock()).slice(0,4)){
   const o=objects.get(s.objectId);if(!o)continue;if(o.type==='hotel'&&Date.parse(o.config.checkOut)<this.clock()){this.store.put('object',{...o,paused:true},o.id);continue;}await this.check(s.id);
  }
  for(const o of objects.values()){if(o.paused||o.type!=='hotel')continue;for(const key of ['cancelBy','claimBy']){const due=Date.parse(o.config[key]);if(due>this.clock()&&due-this.clock()<=24*3600000){const s=this.store.list('source',o.id)[0];if(s)await this.event(o,s,{kind:'deadline',title:key==='cancelBy'?'酒店取消期限临近':'价格匹配申请期限临近',detail:new Date(due).toISOString()});}}}
  await this.deliver();this.store.prune();
 }catch{/* Individual check records preserve sanitized failure details. */}}
 async deliver(){const settings=this.settings();for(const event of this.store.list('event',null,100).filter(e=>e.delivery==='pending'&&e.attempts<3)){
  if(!settings.enabled||!settings.notificationURL){this.store.put('event',{...event,delivery:'inbox'},event.objectId);continue;}
  const attempt=(event.attempts||0)+1;try{const r=await fetch(settings.notificationURL,{method:'POST',headers:{'content-type':'text/plain; charset=utf-8'},body:'PT Universe · '+event.title+'\n请打开监控中心查看详情。',redirect:'error',signal:AbortSignal.timeout(10000)});await r.body?.cancel();if(!r.ok)throw Error();this.store.put('event',{...event,delivery:'sent',attempts:attempt},event.objectId);}catch{this.store.put('event',{...event,attempts:attempt,delivery:attempt>=3?'failed':'pending'},event.objectId);}
 }}
 async saveSettings(input){let notificationURL=String(input.notificationURL||'').trim();if(notificationURL){const u=new URL(notificationURL);if(u.origin!=='https://ntfy.sh'||!/^\/[a-zA-Z0-9_-]{8,120}$/.test(u.pathname)||u.search||u.hash)throw new MonitorError('invalid','首版推送支持 https://ntfy.sh/你的随机主题，至少8个字符');notificationURL=u.href;}this.store.put('settings',{id:'settings',notificationURL,enabled:input.enabled===true});return this.settings();}
 markEvent(id,input){const e=this.store.get(id,'event');if(!e)throw new MonitorError('missing','事件不存在');const allowed=['discovered','applied','approved','rejected','expired'];return this.store.put('event',{...e,read:input.read===undefined?e.read:input.read===true,claimState:allowed.includes(input.claimState)?input.claimState:e.claimState},e.objectId);}
}
