import {prepareStudy} from './experiments.mjs';
import {batch} from './engine.mjs';
import {simulateIncremental} from './incremental-engine.mjs';
import {simulateRpg} from './rpg-engine.mjs';
import {fingerprint} from './model.mjs';
export function runStudy(raw,progress=()=>{}){const spec=prepareStudy({config:raw.baseConfig,source:raw.source,title:raw.title,parameter:raw.parameter,values:raw.variants.filter(v=>v.id!=='base').map(v=>v.value),metric:raw.metric,min:raw.min,max:raw.max,runs:raw.runs??1000,seed:raw.seed??42});const rows=[],start=performance.now();for(const [i,v]of spec.variants.entries()){progress(i/spec.variants.length,v.value);const before=performance.now(),result=spec.type==='cards'?batch(v.config,spec.runs,spec.seed):spec.type==='incremental'?simulateIncremental(v.config):simulateRpg(v.config);rows.push({id:v.id,value:v.value,hash:fingerprint(v.config),result:{...result,elapsedMs:performance.now()-before}});progress((i+1)/spec.variants.length,v.value)}const{variants,...study}=spec;return{...study,id:raw.id,at:raw.at,inputHash:raw.inputHash,rows,elapsedMs:performance.now()-start}}
if(typeof self!=='undefined')self.onmessage=e=>{const{id,spec}=e.data;try{self.postMessage({id,type:'result',study:runStudy(spec,(fraction,value)=>self.postMessage({id,type:'progress',fraction,value}))})}catch(error){self.postMessage({id,type:'error',message:error.message})}};
