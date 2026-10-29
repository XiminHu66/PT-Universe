import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
export async function loadLab(){const result=await build({entryPoints:['src/deal-lab.ts'],bundle:true,format:'esm',platform:'node',write:false});return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));}
export function makeEnv(){
 const sqlite=new DatabaseSync(':memory:'),kv=new Map();
 const DB={prepare(sql){return {bind(...args){const stmt=sqlite.prepare(sql);return {run:async()=>({meta:{changes:Number(stmt.run(...args).changes)}}),all:async()=>({results:stmt.all(...args)}),first:async()=>stmt.get(...args)||null};},run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run().changes)}}),all:async()=>({results:sqlite.prepare(sql).all()}),first:async()=>sqlite.prepare(sql).get()||null};},batch:async statements=>Promise.all(statements.map(x=>x.run()))};
 return {DB,PT_UNIVERSE_DATA:{get:async k=>kv.get(k)??null,put:async(k,v)=>kv.set(k,v),delete:async k=>kv.delete(k)},sqlite,kv};
}
export async function makeAuth(){const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const publicKey=await crypto.subtle.exportKey('jwk',keys.publicKey),issued=Math.floor(Date.now()/1000),enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const a=enc({alg:'ES256',typ:'JWT'}),b=enc({iss:'https://pt-vps-tools.h1nano.chatgpt.site',aud:'pt-universe-monitor',sub:'pt-backend-owner',scope:'monitor:manage',iat:issued,exp:issued+3600,nonce:'d'.repeat(48)});const token=a+'.'+b+'.'+Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,Buffer.from(a+'.'+b))).toString('base64url');return {publicKey,token};}
export function req(token,body,path='query',origin='https://ximinhu66.github.io'){return new Request('https://api.example/api/deal-lab/'+path,{method:body?'POST':'GET',headers:{origin,authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined});}
