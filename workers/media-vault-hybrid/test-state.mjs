// Test-only Durable Object metadata storage; values are cloned like the platform.
export function relayContext(agent,values=new Map()){
 const ctx={values,alarmAt:null,storage:{async get(k){return structuredClone(values.get(k))},async put(k,v){values.set(k,structuredClone(v))},async delete(k){return values.delete(k)},async setAlarm(t){ctx.alarmAt=t},async deleteAlarm(){ctx.alarmAt=null}},getWebSockets(){return agent?[agent]:[]},blockConcurrencyWhile(fn){return fn()}};
 return ctx;
}
