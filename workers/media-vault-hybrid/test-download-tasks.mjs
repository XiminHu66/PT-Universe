import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const {orderedTasks,taskView}=vm.runInNewContext(readFileSync(new URL('../../apps/media-vault/download-tasks.js',import.meta.url),'utf8')+'\n;({orderedTasks,taskView})');
const old={id:'old',kind:'video',status:'complete',created:10,phase:'extracting'},now={id:'new',kind:'torrent',status:'running',created:2,updated:Date.now(),phase:'metadata',completed:0,total:0};
assert.equal(orderedTasks([old,now])[0].id,'new');assert.equal(taskView(now).progress,null);assert.equal(taskView(now).label,'正在获取 BT 元数据');assert.equal(taskView(old).label,'文件已就绪');assert.equal(taskView({...now,status:'cancelled'}).retry,true);assert.equal(taskView({...now,updated:Date.now()-91000}).stale,true);assert.equal(taskView({...now,phase:'peers'}).label,'等待可用做种者');
console.log('PASS task states: active-first ordering, unknown totals, metadata/peers, terminal labels, retry and delayed status');
