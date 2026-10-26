// Respect the completion marker instead of waiting for a provider to close SSE.
export async function readCompletion(response){
  let content='',model='',terminal=false;
  const text=value=>typeof value==='string'?value:Array.isArray(value)?value.map(p=>p.text||'').join(''):'';
  function accept(data){
    if(data.error)throw Error(data.error.message||String(data.error));
    model=data.model||model;
    const choice=data.choices?.[0],delta=choice?.delta||choice?.message;
    content+=text(delta?.content);
    if(content.length>2000000)throw Error('模型响应过大，请缩小问题范围。');
    if(choice?.finish_reason){
      if(choice.finish_reason==='error')throw Error('模型在生成过程中报错。');
      terminal=true;
    }
  }
  if(!(response.headers.get('content-type')||'').includes('text/event-stream'))accept(await response.json());
  else{
    if(!response.body)throw Error('模型没有返回数据流。');
    const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',event=[];
    function dispatch(){
      const payload=event.join('\n').trim();event=[];
      if(!payload)return;
      if(payload==='[DONE]'){terminal=true;return;}
      let data;try{data=JSON.parse(payload)}catch{throw Error('模型返回了无法解析的数据流。');}
      accept(data);
    }
    function line(raw){
      const value=raw.replace(/\r$/,'');
      if(!value){dispatch();return;}
      if(!value.startsWith('data:'))return;
      const data=value.slice(5).trimStart();
      if(data.trim()==='[DONE]'){dispatch();terminal=true;}else event.push(data);
    }
    try{
      while(!terminal){
        const {done,value}=await reader.read();pending+=decoder.decode(value||new Uint8Array(),{stream:!done});
        let at;while(!terminal&&(at=pending.indexOf('\n'))>=0){line(pending.slice(0,at));pending=pending.slice(at+1);}
        if(done){if(pending)line(pending);dispatch();break;}
      }
    }finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
  }
  if(!content.trim())throw Error('模型没有返回正文，请切换免费文字模型后重试。');
  return {content,model};
}
