import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({entryPoints:['src/workbench.ts'],bundle:true,format:'esm',platform:'node',write:false});
const {parseArxiv,parseFulltext,parseFeed,workbenchRoute}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const atom='<feed><entry><id>http://arxiv.org/abs/2404.16130v2</id><title>Graph &amp; Retrieval</title><summary>We propose a method.</summary><author><name>Alice</name></author><published>2024-04-01</published><link title="pdf" href="http://arxiv.org/pdf/2404.16130v2"/></entry></feed>';
const a=parseArxiv(atom)[0];assert.equal(a.arxivId,'2404.16130');assert.equal(a.title,'Graph & Retrieval');assert.equal(a.authors[0],'Alice');assert.ok(a.pdf.startsWith('https:'));
const ps=parseFulltext('<article><h2>4.2 Evaluation</h2><p>We evaluate on HotpotQA with the exact match metric.</p><table><tr><td>Method A</td><td>65.5 EM</td></tr><tr><td>Baseline</td><td>60.9 EM</td></tr></table><script>Injected content</script></article>');assert.equal(ps.length,2);assert.equal(ps[0].section,'4.2 Evaluation');assert.ok(ps[1].text.includes('65.5'));assert.ok(!ps.some(p=>p.text.includes('Injected')));
assert.equal(parseFeed('<rss><item><title>A</title><link>https://example.com/a</link><description><![CDATA[A useful description]]></description></item></rss>')[0].abstract,'A useful description');
await assert.rejects(()=>workbenchRoute(new Request('https://test/api/workbench/import?q='+encodeURIComponent('https://127.0.0.1/'))),/不支持/);
await assert.rejects(()=>workbenchRoute(new Request('https://test/api/workbench/import?q='+encodeURIComponent('https://github.com:9000/a/b'))),/不支持/);
const original=globalThis.fetch;try{globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'http://169.254.169.254/'}});await assert.rejects(()=>workbenchRoute(new Request('https://test/api/workbench/import?q='+encodeURIComponent('https://arxiv.org/abs/2404.16130'))),/不支持/)}finally{globalThis.fetch=original}
console.log('Research upstreams passed: Atom/RSS metadata, arXiv HTML sections and tables, fixed hosts, redirects');
