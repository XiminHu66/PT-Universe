/* A small chapter action; the existing curriculum and learning state stay authoritative. */
(()=>{
  function update(){
    const match=location.hash.match(/^#\/course\/([a-z]+)\/(\d{2})$/),host=document.querySelector('.reader-utilities');if(!match||!host)return;
    if(host.querySelector('#chapter-focus'))return;const button=document.createElement('button');button.id='chapter-focus';button.textContent='专注 25 分钟';
    button.onclick=()=>{const current=location.hash.match(/^#\/course\/([a-z]+)\/(\d{2})$/);if(!current)return;const courseId=current[1],number=Number(current[2]);if(parent!==window)parent.postMessage({type:'pt-learning-focus',courseId,number},location.origin);else location.href=`../daily-nexus/?tab=focus&course=${encodeURIComponent(courseId)}&lesson=${number}`};host.append(button);
  }
  new MutationObserver(update).observe(document.getElementById('content'),{childList:true,subtree:true});update();
  if(new URL(location.href).searchParams.get('embedded')==='nexus'){const style=document.createElement('style');style.textContent='.topbar .universe,.topbar .actions #theme{display:none}.topbar{padding:10px 16px}.footer{padding:12px}';document.head.append(style)}
})();
