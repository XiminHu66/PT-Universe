// Pure input/presentation helpers shared by the account controller and tests.
export function chapterIndices(value){
 const result=new Set();
 for(const token of String(value).trim().split(/[,，\s]+/)){
  const match=/^(\d+)(?:[-–~至](\d+))?$/.exec(token);
  if(!match)throw Error('章节填写示例：1-10,15,20-25；最多 100 章。');
  const first=Number(match[1]),last=Number(match[2]||match[1]);
  if(first<1||last<first||last>100001||last-first>99)throw Error('章节范围无效，最多选择 100 章。');
  for(let i=first;i<=last;i++){result.add(i-1);if(result.size>100)throw Error('每项任务最多选择 100 章。');}
 }
 return [...result].sort((a,b)=>a-b);
}
export const layouts={compact:{fontScale:100,lineHeight:1.4,paragraphGap:0,indent:2,pageMargin:.5},standard:{fontScale:100,lineHeight:1.6,paragraphGap:.5,indent:0,pageMargin:.7},large:{fontScale:120,lineHeight:1.7,paragraphGap:.5,indent:0,pageMargin:.8}};
export function formSpec(values){
 const kind=values.kind,spec={kind};
 if(kind==='manga'){
  spec.title=values.title.trim();
  if(values.mangaProvider==='mangadex'){
   spec.provider='mangadex';spec.url=String(values.mangaChapter||'').trim();
   if(!spec.title||spec.title.length>199||!/^https:\/\/mangadex\.org\/chapter\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(spec.url))throw Error('请填写标题和完整的 MangaDex 章节链接；后台仅接受简中／繁中章节。');
   return spec;
  }
  spec.files=values.pages.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!spec.title||spec.title.length>199||spec.files.length<1||spec.files.length>20||new Set(spec.files).size!==spec.files.length||spec.files.some(x=>!/^File:[^<>#\r\n]{2,190}\.(png|jpe?g|gif|webp)$/i.test(x)))throw Error('请填写标题与 1–20 个不重复的 Commons 图片文件名。');
 }else{
  spec.url=values.url.trim();
  if(!spec.url)throw Error('请填写来源链接。');
  if(kind==='novel'){spec.indices=chapterIndices(values.indices);spec.text_only=Boolean(values.textOnly);spec.layout={...(layouts[values.layout]||layouts.compact)};}
 }
 return spec;
}
export function progressText(job){
 const done=Number(job.completed||0),total=Number(job.total||0);
 if(job.progress_unit==='items'||(['novel','manga'].includes(job.kind)&&job.status!=='complete'))return total?done+' / '+total+(job.kind==='novel'?' 章':' 页'):'等待开始处理';
 return (done/1048576).toFixed(1)+' / '+(total/1048576).toFixed(1)+' MiB';
}
export function recoveryText(job){
 if(job.status==='expired')return '临时源文件已过期，可重建任务；不会自动重新抓取。';
 if(job.status==='error')return /403|429|access|rate.limit|登录|限流/i.test(job.error||'')?'来源要求登录或限制访问，请稍后处理；此页面登录不会代替来源网站登录。':'任务未完成，可检查来源后手动重建。';
 if(job.status==='cancelled')return '已取消后台处理；重建会使用一项新任务额度。';
 return '';
}
