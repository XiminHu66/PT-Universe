// Fixed next-stage UX scope. No media tickets or arbitrary source jobs.
export const NOVEL_UX_SOURCE='https://www.wenku8.net/book/3551.htm';
export const NOVEL_UX_JOBS=4;
export const NOVEL_UX_LAYOUTS={compact:{fontScale:100,lineHeight:1.4,paragraphGap:0,indent:2,pageMargin:.5},standard:{fontScale:100,lineHeight:1.6,paragraphGap:.5,indent:0,pageMargin:.7},large:{fontScale:120,lineHeight:1.7,paragraphGap:.5,indent:0,pageMargin:.8}};
export const appNovelUx=env=>env?.MEDIA_APP_TEST_MODE==='novel-ux';
export function novelUxWindowValid(env,now=Date.now()){
 const start=Number(env.MEDIA_APP_NOVEL_TEST_START),until=Number(env.MEDIA_APP_NOVEL_TEST_UNTIL);
 return /^\d+$/.test(String(env.MEDIA_APP_NOVEL_TEST_START))&&/^\d+$/.test(String(env.MEDIA_APP_NOVEL_TEST_UNTIL))&&Number.isSafeInteger(start)&&Number.isSafeInteger(until)&&start>0&&start<=now&&until>now&&until-start<=30*60000&&/^novel-test-[a-f0-9]{32}$/.test(env.MEDIA_APP_ACCOUNT_ID||'')&&env.ENABLE_APP_SUBMISSION==='true'&&env.ENABLE_DIRECT_STREAM==='false'&&env.MEDIA_APP_LOGIN_TEST_UNTIL==='0'&&env.MEDIA_APP_SUBMISSION_TEST_UNTIL==='0'&&env.MEDIA_STREAM_TEST_UNTIL==='0'&&env.MEDIA_APP_FILE_TEST_START==='0'&&env.MEDIA_APP_FILE_TEST_UNTIL==='0'&&env.MEDIA_APP_FILE_TEST_FILES==='';
}
export function novelUxPermits(spec){
 if(!spec||Object.keys(spec).some(k=>!['kind','url','indices','text_only','layout'].includes(k))||spec.kind!=='novel'||spec.url!==NOVEL_UX_SOURCE||spec.text_only!==true||!Array.isArray(spec.indices)||!spec.indices.length||spec.indices.length>2||spec.indices.some((i,n)=>![0,1].includes(i)||n>0&&i<=spec.indices[n-1]))return false;
 return Object.values(NOVEL_UX_LAYOUTS).some(layout=>spec.layout&&Object.keys(spec.layout).length===5&&Object.entries(layout).every(([k,v])=>spec.layout[k]===v));
}
