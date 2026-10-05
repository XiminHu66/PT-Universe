import {parseReport, checkReportSize, REPORT_LIMITS} from './report-schema.mjs';
const API='https://pt-universe-api.summer07-nanjolno.workers.dev';
const params=new URLSearchParams(location.hash.slice(1)),owner=params.get('owner'),token=params.get('token');
const form=document.querySelector('#deliver-form'),receipt=document.querySelector('#receipt'),input=document.querySelector('#report-json'),preflight=document.querySelector('#preflight'),button=form.querySelector('[type=submit]');
const valid=/^[a-f0-9-]{36}$/i.test(owner||'')&&/^[a-f0-9]{64}$/i.test(token||'');let busy=false;
document.querySelector('#channel-status').textContent=valid?'已载入专用投递凭据。发送后请检查回执。':'缺少投递凭据，请使用收件箱生成的完整投递链接。';
document.querySelector('#limits').textContent=`整份 JSON 最多 150 KB（UTF-8 字节）；总览 summary 最多 ${REPORT_LIMITS.summary} 字符；每项 summary 最多 ${REPORT_LIMITS.itemSummary} 字符；before / after / action 各最多 ${REPORT_LIMITS.detail} 字符。`;
function validate(){
 button.disabled=busy||!valid;
 if(!input.value.trim()){preflight.textContent='必填：reportId、date、summary、items；每项需 id、title、status、summary、observedAt、urls。';delete preflight.dataset.valid;button.disabled=true;return null}
 try{const body=parseReport(input.value);checkReportSize(JSON.stringify(body));preflight.textContent=`校验通过 · ${body.items.length} 个监视项 · ${checkReportSize(input.value)} / ${REPORT_LIMITS.bytes} 字节`;preflight.dataset.valid='true';return body}
 catch(e){preflight.textContent='校验失败：'+e.message;preflight.dataset.valid='false';button.disabled=true;return null}
}
input.addEventListener('input',()=>{receipt.textContent='';delete receipt.dataset.success;validate()});
document.querySelector('#validate-report').onclick=validate;
form.onsubmit=async e=>{
 e.preventDefault();if(busy||!valid)return;
 const body=validate();if(!body){receipt.textContent='发送前请修复上方字段错误，报告尚未提交。';receipt.dataset.success='false';return}
 busy=true;button.disabled=true;receipt.textContent='正在发送…';delete receipt.dataset.success;
 try{
  const r=await fetch(API+'/api/muse/'+owner+'/deliver',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  let d;try{d=await r.json()}catch{throw Error(`HTTP ${r.status}：未收到有效 JSON 回执，请保留报告`)}
  if(!r.ok||!d.ok){
   const message=d.error?.message||d.error||d.message||'未接收';
   const policy=r.status===403&&/policy_denied|awaiting approval/.test(JSON.stringify(d));
   throw Error(policy?'HTTP 403：后台动作等待 Muse 审批。请在 Muse 批准投递动作；请勿切换通道绕过审批。':`HTTP ${r.status}：${message}${d.field&&!String(message).includes(d.field)?'（字段 '+d.field+'）':''}`);
  }
  if(d.reportId!==body.reportId||!d.receivedAt)throw Error('回执缺少匹配的 reportId 或 receivedAt，尚不能确认送达');
  receipt.textContent='已接收 · reportId: '+d.reportId+' · receivedAt: '+d.receivedAt+(d.duplicate?' · 重试已去重':'');receipt.dataset.success='true';
 }catch(e){receipt.textContent='发送失败：'+e.message;receipt.dataset.success='false'}finally{busy=false;validate()}
};
validate();
