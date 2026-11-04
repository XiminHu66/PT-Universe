import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('./public/app.js',import.meta.url),'utf8');
function fixture(){
 const elements=new Map(),calls=[];let active=0,overlap=false;
 const $=id=>{if(!elements.has(id))elements.set(id,{open:false,hidden:false,value:'',disabled:false,replaceChildren(){},close(){this.open=false}});return elements.get(id)};
 const context=vm.createContext({$,document:{hidden:false,createElement:()=>({classList:{toggle(){}}})},text:(e,v)=>e.textContent=v,dialog:id=>$('#'+id).open=true,toast:message=>calls.push('toast:'+message),setBusy(){},present:async v=>calls.push('present:'+v.kind),setTimeout:()=>1,clearTimeout(){},api:async route=>{calls.push(route);if(active++)overlap=true;await new Promise(r=>setTimeout(r,10));active--;return route==='screen'?{tabs:[]}:route==='resume'?{kind:'chapter'}:{}}});
 vm.runInContext(`let busy=false,screenTimer,screenBusy=false,manualImage=null,manualPaused=false,manualSerial=Promise.resolve(),manualPending=0,manualEpoch=0,manualClosing=false;\n${source.slice(source.indexOf('function stopScreens()'),source.indexOf("$('#open-form').onsubmit"))}`,context);
 return{context,$,calls,overlap:()=>overlap};
}
test('closing while original-site startup is pending releases it without a busy error or late screen',async()=>{
 const f=fixture();await vm.runInContext('(async()=>{const starting=openManual(true);await leaveManual();await starting})()',f.context);
 assert.deepEqual(f.calls,['manual','leave-manual','toast:原站连接已释放']);assert.equal(f.$('#manual-dialog').open,false);assert.equal(f.overlap(),false);
});
test('clicks during a screenshot are queued and remain accepted in order',async()=>{
 const f=fixture();await vm.runInContext('openManual()',f.context);f.calls.length=0;
 await vm.runInContext('Promise.all([refreshScreen(),manualAction({type:"key",key:"Tab"}),manualAction({type:"key",key:"Enter"})])',f.context);
 assert.deepEqual(f.calls.filter(x=>x==='action'),['action','action']);assert.equal(f.overlap(),false);assert.ok(!f.calls.some(x=>x.startsWith('toast:')));
});
test('double resume sends one request and closes before presenting the chapter',async()=>{
 const f=fixture();await vm.runInContext('openManual()',f.context);f.calls.length=0;
 await vm.runInContext('Promise.all([leaveManual(true),leaveManual(true)])',f.context);
 assert.deepEqual(f.calls,['resume','present:chapter']);assert.equal(f.$('#manual-dialog').open,false);assert.equal(f.overlap(),false);
});
