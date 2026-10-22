// The default page never reads source apps or changes the experimental document.
const message=document.querySelector('#export-status');
function exportRaw(key,label){
  try{
    const raw=localStorage.getItem(key);
    if(raw===null){message.textContent=`这个浏览器中没有${label}。请在原来使用 PoC 的浏览器和设备中导出。`;return}
    // Preserve original bytes, even if an old document cannot be parsed.
    const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
    const link=document.createElement('a');
    link.href=url;link.download=`pt-intelligence-${key.endsWith('.backup')?'backup-':''}${new Date().toISOString().slice(0,10)}.json`;
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    message.textContent=`已发起${label}下载；请检查浏览器下载列表。原记录仍保留。`;
  }catch{message.textContent='浏览器不允许读取本机存储。请在原来使用 PoC 的浏览器中打开旧实验并导出。'}
}
document.querySelector('#export').addEventListener('click',()=>exportRaw('pt.intelligence.v1','PoC 记录'));
document.querySelector('#export-backup').addEventListener('click',()=>exportRaw('pt.intelligence.v1.backup','导入前备份'));
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
