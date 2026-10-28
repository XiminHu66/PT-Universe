import {Store} from './store.mjs';
import {Engine} from './engine.mjs';
import {MonitorError} from './model.mjs';
const ORIGIN='https://pt-vps-tools.h1nano.chatgpt.site',PREFIX='/__pt_monitor/api';
const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'private,no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
export function createCollector({dir='/monitor-data',engine}={}){
 let running=engine;const get=()=>{if(!running){running=new Engine(new Store(dir));running.start();}return running};
 get();return async(req,res,url)=>{
  if(!url.pathname.startsWith(PREFIX+'/'))return false;
  try{
   if(!['GET','POST','PATCH','DELETE'].includes(req.method))return json(res,405,{error:'不支持此操作'}),true;
   if(req.headers.origin!==ORIGIN)return json(res,403,{error:'仅支持私有工具中心请求'}),true;
   let body={};if(!['GET','HEAD'].includes(req.method)){if(!String(req.headers['content-type']||'').startsWith('application/json'))return json(res,415,{error:'JSON required'}),true;let raw='';for await(const b of req){raw+=b;if(Buffer.byteLength(raw)>32768)return json(res,413,{error:'请求过大'}),true;}try{body=JSON.parse(raw||'{}')}catch{return json(res,400,{error:'JSON无效'}),true;}}
   const path=url.pathname.slice(PREFIX.length),e=get();let value,status=200;
   if(path==='/state'&&req.method==='GET')value=e.overview();
   else if(path==='/objects'&&req.method==='POST'){value=await e.create(body);status=201;void e.tick();}
   else if(/^\/objects\/[\w-]{36}$/.test(path)){const id=path.split('/')[2];if(req.method==='GET')value=e.detail(id);else if(req.method==='PATCH')value=await e.update(id,body);else if(req.method==='DELETE'){await e.remove(id);value={ok:true}}else return json(res,405,{error:'不支持此操作'}),true;}
   else if(/^\/objects\/[\w-]{36}\/sources$/.test(path)&&req.method==='POST'){value=await e.addSource(path.split('/')[2],body);void e.tick();}
   else if(/^\/sources\/[\w-]{36}(?:\/(?:check|confirm))?$/.test(path)){const [,_,id,action]=path.split('/');if(action==='check'&&req.method==='POST'){const s=e.store.get(id,'source');if(!s)return json(res,404,{error:'来源不存在'}),true;if(s.lastAttempt&&Date.now()-Date.parse(s.lastAttempt)<45000)return json(res,429,{error:'刚刚检查过，请等待一分钟再试'}),true;if(e.running.size>=2)return json(res,429,{error:'采集队列正在运行，请稍后重试'}),true;if(e.running.has(id))value={queued:true};else{void e.check(id).catch(()=>{});value={queued:true};status=202;}}else if(action==='confirm'&&req.method==='POST')value=await e.confirm(id,body);else if(!action&&req.method==='PATCH')value=await e.updateSource(id,body);else return json(res,405,{error:'不支持此操作'}),true;}
   else if(/^\/events\/[\w-]{36}$/.test(path)&&req.method==='PATCH')value=e.markEvent(path.split('/')[2],body);
   else if(path==='/settings'&&req.method==='POST')value=await e.saveSettings(body);
   else if(/^\/evidence\/[\w-]{36}$/.test(path)&&req.method==='GET'){value=e.store.get(path.split('/')[2],'evidence');if(!value)return json(res,404,{error:'记录不存在'}),true;}
   else if(path==='/export'&&req.method==='GET')value={version:1,exportedAt:new Date().toISOString(),...e.overview()};
   else return json(res,404,{error:'接口不存在'}),true;
   json(res,status,value);return true;
  }catch(error){json(res,error instanceof MonitorError?400:503,{error:error instanceof MonitorError?error.message:'监控后台暂不可用，请稍后重试',code:error instanceof MonitorError?error.code:'unavailable'});return true;}
 };
}
