import assert from 'node:assert/strict';
import {canonicalJob,permittedJob,mangaDexUrl} from './src/job-contract.js';
import {formSpec} from '../../apps/media-vault/account-form.js';
const url='https://mangadex.org/chapter/bd38fb72-e77f-40e9-abbf-21f53571f0be';
const raw={kind:'manga',provider:'mangadex',url,title:'中文章节'};
assert.deepEqual(canonicalJob({...raw,headers:{evil:'drop'},request_id:'f'.repeat(24),account_id:'drop'}),{kind:'manga',provider:'mangadex',url,title:'中文章节'});
assert.deepEqual(formSpec({kind:'manga',mangaProvider:'mangadex',mangaChapter:url,title:'中文章节'}),{kind:'manga',title:'中文章节',provider:'mangadex',url});
for(const bad of [url+'/1',url+'?x=1',url+'#x',url.replace('https:','http:'),url.replace('mangadex.org','mangadex.org.evil')]){assert.equal(mangaDexUrl(bad),false);assert.equal(permittedJob({...raw,url:bad}),false);}
for(const bad of [{...raw,files:['File:One.png']},{...raw,provider:'unknown'},{...raw,title:''}])assert.equal(permittedJob(bad),false);
assert.ok(permittedJob({kind:'manga',title:'Commons',files:['File:One.png']}));
assert.deepEqual(canonicalJob({kind:'manga',provider:'commons',title:'Commons',files:['File:One.png']}),{kind:'manga',title:'Commons',files:['File:One.png']});
console.log('PASS Chinese manga contract: exact chapter URL, provider/type isolation, canonical fields, shared form and legacy Commons');
