// Fixed retained outputs only. No source acquisition or new account-job mapping.
export const FILE_TEST_JOBS=['dca57e024edd1a7f0b6b57ae','72c68c784e3df4c2e61dd101','97960aca7f892551c2d5d2f1'];
export const FILE_TEST_BYTES=10*1024*1024,FILE_TEST_TICKETS=3;
export const appFileTest=env=>env?.MEDIA_APP_TEST_MODE==='files';
export function fileTestManifest(env){
 try{
  const list=JSON.parse(env.MEDIA_APP_FILE_TEST_FILES||'null');
  if(!Array.isArray(list)||list.length!==3)return [];
  let total=0;
  for(let i=0;i<3;i++){
   const f=list[i];if(f?.id!==FILE_TEST_JOBS[i]||typeof f.path!=='string'||!new RegExp(i<2?'^generated/[a-zA-Z0-9._-]+\\.'+(i===0?'epub':'cbz')+'$':'^video/[a-zA-Z0-9._/ \\[\\]()\\u0080-\\uffff-]+\\.mp4$','u').test(f.path)||f.path.includes('..')||!Number.isSafeInteger(f.size)||f.size<=0)return [];
   total+=f.size;
  }
  return total<=FILE_TEST_BYTES?list:[];
 }catch{return [];}
}
export const fileTestPermits=(env,id,path,size)=>fileTestManifest(env).some(f=>f.id===id&&(path===undefined||f.path===path)&&(size===undefined||f.size===size));
export function fileTestWindowValid(env){
 const start=Number(env.MEDIA_APP_FILE_TEST_START),until=Number(env.MEDIA_APP_FILE_TEST_UNTIL);
 return /^\d+$/.test(env.MEDIA_APP_FILE_TEST_START||'')&&/^\d+$/.test(env.MEDIA_APP_FILE_TEST_UNTIL||'')&&Number.isSafeInteger(start)&&Number.isSafeInteger(until)&&start>0&&start<=Date.now()&&until>start&&until-start<=20*60000&&until>Date.now()&&fileTestManifest(env).length===3;
}
