import assert from 'node:assert/strict';
import {mergeFallback} from './snapshot-merge.mjs';
const time='2026-10-13T15:01:00Z',current={generated_at:time,refresh_source:'scheduled:08:00',sources:{linovelib:{ok:true,checked_at:time,verifiedChapterCount:60}},items:[{source:'linovelib',latest:'第60章'}]};
assert.equal(mergeFallback(current,{generated_at:'2026-10-12T15:00:00Z'},new Date(time)).skip,true);
const weak={generated_at:'2026-10-13T15:31:00Z',sources:{linovelib:{ok:true,degraded:true,checked_at:'2026-10-13T15:30:00Z',verifiedChapterCount:15}},items:[{source:'linovelib',latest:'旧章节'}]};
const result=mergeFallback(current,weak,new Date('2026-10-13T15:32:00Z'));
assert.equal(result.snapshot.items[0].latest,'第60章');assert.equal(result.snapshot.sources.linovelib.verifiedChapterCount,60);
assert.equal(mergeFallback(current,weak,new Date('2026-10-14T15:32:00Z')).snapshot.items[0].latest,'旧章节');
console.log('Older or weaker fallback cannot replace today’s verified Cloudflare chapters');
