import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const {orderedTasks,taskView,videoInput}=vm.runInNewContext(readFileSync(new URL('../../apps/media-vault/download-tasks.js',import.meta.url),'utf8')+'\n;({orderedTasks,taskView,videoInput})',{URL});
const old={id:'old',kind:'video',status:'complete',created:10,phase:'extracting'},now={id:'new',kind:'torrent',status:'running',created:2,updated:Date.now(),phase:'metadata',completed:0,total:0};
assert.equal(orderedTasks([old,now])[0].id,'new');assert.equal(taskView(now).progress,null);assert.equal(taskView(now).label,'正在获取 BT 元数据');assert.equal(taskView(old).label,'文件已就绪');assert.equal(taskView({...now,status:'cancelled'}).retry,true);assert.equal(taskView({...now,updated:Date.now()-91000}).stale,true);assert.equal(taskView({...now,phase:'peers'}).label,'等待可用做种者');
console.log('PASS task states: active-first ordering, unknown totals, metadata/peers, terminal labels, retry and delayed status');
for(const link of ['https://youtu.be/abcdefghijk?si=tracking','https://www.youtube.com/watch?v=abcdefghijk&list=playlist&index=8','https://m.youtube.com/shorts/abcdefghijk','https://www.youtube.com/live/abcdefghijk','https://www.youtube-nocookie.com/embed/abcdefghijk'])assert.equal(videoInput(link),'https://www.youtube.com/watch?v=abcdefghijk');
for(const link of ['https://www.youtube.com/playlist?list=abc','https://www.youtube.com/@channel','https://www.youtube.com/results?search_query=abc','https://www.youtube.com/watch?v=short','https://name:secret@example.org/x','https://example.org:444/x','http://example.org/x'])assert.throws(()=>videoInput(link));
assert.equal(videoInput('https://example.org/video.mp4?expires=1'),'https://example.org/video.mp4?expires=1');
for(const error of ['[VIDEO_BOT_CHECK] source rejected','来源要求登录或验证，请使用可直接访问的链接，或在来源网站完成授权。','[VIDEO_EXTRACT] unavailable','[VIDEO_RUNTIME] missing','[VIDEO_RATE_LIMIT] wait']){const v=taskView({kind:'video',status:'error',error});assert.equal(v.retry,false);assert.ok(v.failure.message);}
assert.equal(taskView({kind:'video',status:'cancelled',error:'[VIDEO_BOT_CHECK] old error'}).retry,true);
assert.equal(taskView({kind:'video',status:'error',error:'Temporary connection failure'}).retry,true);
console.log('PASS video input: canonical single-video links, playlist/channel rejection, source auth diagnosis and bounded retry UI');
