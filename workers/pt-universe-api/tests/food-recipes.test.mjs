import assert from 'node:assert/strict';
import {build} from 'esbuild';
const b=await build({entryPoints:['src/food-recipes.ts'],bundle:true,format:'esm',platform:'node',write:false});
const {parseRecipe,recipeUrl,validateRecognition,validImage,foodRecipesRoute}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const html='<h1>蒜蓉西兰花</h1><div class="ings"><table><tr><td class="name">西兰花</td><td class="unit">1 个</td></tr><tr><td>蒜</td><td>3 瓣</td></tr></table></div><div class="steps"><ol><li><p class="text">洗净切块</p></li><li><p class="text">炒香蒜末</p></li></ol></div>';
assert.deepEqual(parseRecipe(html).ingredients,['西兰花 · 1 个','蒜 · 3 瓣']);assert.deepEqual(parseRecipe(html).steps,['洗净切块','炒香蒜末']);
assert.deepEqual(parseRecipe('<script type="application/ld+json">'+JSON.stringify({'@type':'Recipe',name:'测试',recipeIngredient:['鸡蛋'],recipeInstructions:'0.鸡蛋加盐打匀,1.番茄切块,2.锅内放适量油,待油热,倒入鸡蛋液'})+'</script>').steps,['鸡蛋加盐打匀','番茄切块','锅内放适量油,待油热,倒入鸡蛋液']);
const json=JSON.stringify({'@graph':[{'@type':['Recipe'],name:'测试菜',recipeIngredient:['鸡蛋 · 2 个'],recipeInstructions:[{'@type':'HowToSection',itemListElement:[{text:'打散'},{text:'炒熟'}]}]}]});assert.deepEqual(parseRecipe('<script type="application/ld+json">'+json+'</script>').steps,['打散','炒熟']);
for(const url of ['http://www.xiachufang.com/recipe/1/','https://www.xiachufang.com.evil.com/recipe/1/','https://127.0.0.1/recipe/1/','https://www.xiachufang.com:444/recipe/1/','https://user:pass@www.xiachufang.com/recipe/1/','https://www.xiachufang.com/auth'])assert.throws(()=>recipeUrl(url));
assert.equal(recipeUrl('https://m.xiachufang.com/recipe/1/?a=1').href,'https://m.xiachufang.com/recipe/1/');assert.throws(()=>validateRecognition({name:'',ingredients:[],steps:[],warnings:[]}));
const image={mimeType:'image/png',data:Buffer.from('\x89PNG\r\n\x1a\n000000000000000000000000','latin1').toString('base64')};assert.ok(validImage(image));assert.ok(!validImage({mimeType:'image/png',data:'AAAA'.repeat(8)}));
const req=(action,body)=>new Request('https://worker/api/food/11111111-1111-4111-8111-111111111111/'+action,{method:'POST',body:JSON.stringify(body)});
const env={GEMINI_API_KEY:'placeholder-test-key',DB:{prepare(){return {bind(){return this},async run(){return {meta:{changes:1}}}}}},PT_UNIVERSE_DATA:{async get(){return {meal:'gemini-3.5-flash-lite'}}}};
assert.equal((await foodRecipesRoute(req('read-recipe',{url:'https://www.xiachufang.com/recipe/1/'}),env,async()=>false)).status,401);assert.equal((await foodRecipesRoute(req('read-recipe',{url:'https://localhost/recipe/1/'}),env,async()=>true)).status,400);assert.equal((await foodRecipesRoute(req('recognize-recipe',{images:[image]}),{...env,GEMINI_API_KEY:undefined},async()=>true)).status,503);
const old=fetch;let calls=0;
try{
 globalThis.fetch=async()=>new Response(html);const read=await foodRecipesRoute(req('read-recipe',{url:'https://www.xiachufang.com/recipe/1/'}),env,async()=>true);assert.equal(read.status,200);assert.equal(read.body.source,'xiachufang');
 globalThis.fetch=async()=>new Response('<title>滑动验证</title>');assert.equal((await foodRecipesRoute(req('read-recipe',{url:'https://www.xiachufang.com/recipe/1/'}),env,async()=>true)).status,422);
 globalThis.fetch=async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}})};assert.equal((await foodRecipesRoute(req('read-recipe',{url:'https://www.xiachufang.com/recipe/1/'}),env,async()=>true)).status,422);assert.equal(calls,1);
 globalThis.fetch=async(url,init)=>{calls++;assert.ok(String(url).includes('generativelanguage.googleapis.com'));const payload=JSON.parse(init.body);assert.equal(payload.contents[0].parts.length,3);assert.equal(payload.contents[0].parts[1].inlineData.mimeType,'image/png');return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({name:'蛋羹',ingredients:['鸡蛋 · 2 个'],steps:['搅拌','蒸熟'],warnings:['温度未提及']})}]}}]})};
 const recognized=await foodRecipesRoute(req('recognize-recipe',{images:[image,image]}),env,async()=>true);assert.equal(recognized.status,200);assert.equal(recognized.body.steps.length,2);assert.ok(!JSON.stringify(recognized).includes(env.GEMINI_API_KEY));
 globalThis.fetch=async()=>Response.json({error:{status:'RESOURCE_EXHAUSTED'}},{status:429});assert.equal((await foodRecipesRoute(req('recognize-recipe',{images:[image]}),env,async()=>true)).status,429);
 globalThis.fetch=async()=>Response.json({candidates:[{content:{parts:[{text:'{"name":"bad","ingredients":[],"steps":[],"warnings":[]}'}]}}]});assert.equal((await foodRecipesRoute(req('recognize-recipe',{images:[image]}),env,async()=>true)).status,422);
 const denied={...env,DB:{prepare(){return {bind(){return this},async run(){return {meta:{changes:0}}}}}}};globalThis.fetch=async()=>{throw Error('unexpected request')};assert.equal((await foodRecipesRoute(req('recognize-recipe',{images:[image]}),denied,async()=>true)).status,429);
}finally{globalThis.fetch=old}
console.log('Food recipes: source extraction, captcha fallback, redirect constraints, authenticated opt-in images, schema validation, quota and redaction passed');
