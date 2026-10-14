// Test-only Durable Object metadata storage; values are cloned like the platform.
export function relayContext(agent,values=new Map()){
 const ctx={values,alarmAt:null,storage:{async get(k){return structuredClone(values.get(k))},async put(k,v){values.set(k,structuredClone(v))},async delete(k){return values.delete(k)},async setAlarm(t){ctx.alarmAt=t},async deleteAlarm(){ctx.alarmAt=null}},getWebSockets(){return agent?[agent]:[]},blockConcurrencyWhile(fn){return fn()}};
 return ctx;
}

// Node-only behavioral stand-in; production uses the Workers native fixed stream.
globalThis.FixedLengthStream=class extends TransformStream {
 constructor(length){let bytes=0;super({transform(chunk,controller){bytes+=chunk.byteLength;if(bytes>length)throw Error('Fixed stream overflow');controller.enqueue(chunk)},flush(){if(bytes!==length)throw Error('Fixed stream truncated')}})}
};
