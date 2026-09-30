const families={
 '番茄':['西红柿','西紅柿','蕃茄','tomato'], '土豆':['马铃薯','馬鈴薯','洋芋','potato'],
 '鸡蛋':['蛋','雞蛋','鸡子','egg','eggs'], '鸡肉':['鸡','雞','鸡腿','鸡腿肉','鸡胸','鸡胸肉','雞肉','鸡翅','鸡丁','鸡丝','整鸡','三黄鸡','chicken'],
 '牛肉':['牛肉片','牛肉薄片','肥牛','牛腩','牛腱','牛柳','牛里脊','beef'], '猪肉':['猪肉片','猪肉末','肉末','豬肉','五花肉','猪里脊','猪瘦肉','里脊肉','排骨','pork'],
 '三文鱼':['三文魚','鲑鱼','鮭魚','salmon'], '金枪鱼':['金槍魚','吞拿鱼','即食金枪鱼','金枪鱼罐头','tuna'],
 '虾':['虾仁','蝦','蝦仁','大虾','虾皮','虾米','海虾','shrimp'], '西兰花':['西蘭花','青花菜','绿花椰菜','broccoli'],
 '青椒':['甜椒','彩椒','bell pepper'], '洋葱':['洋蔥','onion'], '青菜':['小白菜','上海青','油菜','菠菜','bok choy'],
 '白菜':['大白菜','娃娃菜','chinese cabbage'], '胡萝卜':['胡蘿蔔','红萝卜','carrot'],
 '豆腐':['tofu'], '蘑菇':['白蘑菇','口蘑','mushroom'], '香菇':['shiitake'],
 '茄子':['eggplant'], '黄瓜':['黃瓜','小黄瓜','cucumber'], '玉米':['玉米粒','即食玉米粒','粟米','corn'],
 '豌豆':['青豆','peas'], '米饭':['熟米饭','已煮熟米饭','可直接加热米饭','米飯','大米','米','rice'],
 '面条':['面條','面','挂面','麵條','noodles'], '燕麦':['燕麦片','燕麥','燕麥片','oats'],
 '牛奶':['milk'], '香蕉':['banana'], '食用油':['油','橄榄油','菜籽油'], '盐':['鹽','salt'],
 '肉类':['肉','荤菜','葷菜'], '鱼类':['鱼','魚','fish'], '海鲜':['海鮮','seafood'],
 '菌菇':['菇','蘑菇类','菌类','菇类'], '豆类':['豆','大豆','豆制品','豆製品'],
 '乳制品':['奶','乳','奶制品','乳製品'], '小麦':['小麥','麸质','麩質','wheat'],
 '甲壳类':['甲殼類'], '辣椒':['辣','辣的','chili','小米辣','小米椒','剁椒','干辣椒','辣椒粉','辣椒油','郫县豆瓣酱'], '香菜':['芫荽'], '葱':['葱花','蔥'], '蒜':['大蒜','蒜头'], '姜':['生姜','薑'], '坚果':['堅果','nuts'], '花生':['peanut'], '芝麻':['sesame'],
};
const normalize=x=>String(x??'').normalize('NFKC').trim().toLowerCase();
const aliases=new Map(Object.entries(families).flatMap(([key,list])=>[key,...list].map(x=>[normalize(x),key])));
const groups={鸡肉:['肉类'],牛肉:['肉类'],猪肉:['肉类'],三文鱼:['鱼类','海鲜'],金枪鱼:['鱼类','海鲜'],虾:['海鲜','甲壳类'],豆腐:['豆类'],豌豆:['豆类'],牛奶:['乳制品'],面条:['小麦'],蘑菇:['菌菇'],香菇:['菌菇']};
export function parseIngredients(value){
 let text=normalize(value);
 // Preserve common multi-word names before splitting ordinary whitespace.
 for(const [alias,key]of aliases)if(alias.includes(' '))text=text.replaceAll(alias,key);
 return [...new Set(text.split(/[,，、;；\n\t +/|]+|以及|还有|和|与|及/).map(x=>x.replace(/^(?:我有|有|不吃|不要|忌口)\s*/, '').replace(/\d+(?:\.\d+)?\s*(?:克|千克|公斤|g|kg|个|根|颗|袋|斤)$/,'').trim()).filter(Boolean).map(x=>aliases.get(x)||x))];
}
const canonical=name=>aliases.get(normalize(name))||normalize(name);
const categoryNames={meat_dish:'荤菜',vegetable_dish:'素菜',aquatic:'水产',staple:'主食',soup:'汤',breakfast:'早餐',dessert:'甜点',drink:'饮品','semi-finished':'半成品',condiment:'酱料'};
const dinnerCategories=new Set(['meat_dish','vegetable_dish','aquatic','staple','soup','breakfast']);
function section(md,heading){const parts=md.split(/^##\s+/m);return (parts.slice(1).find(x=>heading.test(x.split('\n')[0]))||'').split('\n').slice(1).join('\n').trim()}
function number(text){if(/^[\d.]+$/.test(text))return Number(text);const digits={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};if(text.includes('十')){const [a,b]=text.split('十');return (digits[a]||1)*10+(digits[b]||0)}return digits[text]||0}
function duration(intro){
 const phrases=intro.match(/[^。！？\n]*(?:分钟|小时|刻钟)[^。！？\n]*/g)||[];
 const text=phrases.at(-1)||'';
 let numeric=text.replace(/([一二两三四五六七八九十零]+)(?=\s*(?:个)?(?:半)?(?:小时|分钟))/g,x=>number(x));
 numeric=numeric.replace(/(?<![\d个])半(?:个)?小时/g,'0.5小时').replace(/一刻钟/g,'15分钟');
 const matches=[...numeric.matchAll(/(\d+(?:\.\d+)?)\s*(?:个)?(半)?\s*(小时|分钟)/g)];
 const minutes=matches.length?matches.reduce((sum,m)=>sum+(Number(m[1])+(m[2]?0.5:0))*(m[3]==='小时'?60:1),0):null;
 return {minutes:minutes&&minutes<=1440?minutes:null,timeText:text};
}
function recipeEquipment(title,ingredients,steps){
 const body=ingredients+'\n'+steps,tools=[];
 for(const [name,re]of [['空气炸锅',/空气炸锅/],['微波炉',/微波炉|微波加热/],['烤箱',/烤箱/],['高压锅',/高压锅|压力锅/],['电饭煲',/电饭煲|电饭锅|电炖锅/],['蒸锅',/蒸锅|蒸笼|蒸箱/]])if(re.test(body)||re.test(title))tools.push(name);
 if(/炒锅|平底锅|热锅|起锅|锅中|锅内|锅里|煎锅|烧一锅/.test(body)||(!tools.length&&/[炒煎煮炖炸蒸焯]/.test(steps)))tools.push('锅');
 return [...new Set(tools)];
}
export function prepareRecipes(snapshot){
 if(snapshot?.version!==1||!Array.isArray(snapshot.recipes)||snapshot.recipes.length<300)throw Error('完整菜谱库不可用，请重新加载');
 return snapshot.recipes.map(r=>{
  const ingredients=section(r.md,/原料|食材/),quantities=section(r.md,/计算|用量/),steps=section(r.md,/操作|做法|步骤/);
  const intro=r.md.split(/^##\s/m)[0],category=r.path.split('/')[1];
  const serving=quantities.match(/一份正好够\s*(\d+)\s*个?人/)||quantities.match(/(?:适合|供|为|以|按)?\s*(\d+)\s*人(?:份|食用|食|的)/);
  const baseServings=serving?Number(serving[1]):null;
  return {...r,id:r.path,category,categoryName:categoryNames[category]||category,ingredientsText:ingredients,quantitiesText:quantities,stepsText:steps,baseServings,
   ...duration(intro),equipment:recipeEquipment(r.name,ingredients,steps),advance:/提前[^\n。]*(?:一晚|一天|过夜)|(?:腌制|冷藏|浸泡|静置)[^\n。]*(?:一晚|一夜|过夜)/.test(steps),
   source:snapshot.source+'/blob/'+snapshot.sourceCommit+'/'+r.path.split('/').map(encodeURIComponent).join('/')};
 });
}
export function mealPreferences(value){const p=value&&typeof value==='object'?value:{};return {
 minutes:['20','30','45','60','90','120','any'].includes(String(p.minutes))?String(p.minutes):'30',people:['1','2','3','4'].includes(String(p.people))?String(p.people):'2',
 equipment:['all','pot','microwave','airfryer','any'].includes(p.equipment)?p.equipment:'all',category:['dinner','all',...Object.keys(categoryNames)].includes(p.category)?p.category:'dinner',
 exclude:typeof p.exclude==='string'?p.exclude:'',pantry:typeof p.pantry==='string'?p.pantry:''};}
function variants(term){
 const memberKeys=Object.entries(groups).filter(([,g])=>g.includes(term)).map(([key])=>key);
 if(term==='蘑菇')memberKeys.push('香菇');
 const keys=[term,...memberKeys];return [...new Set(keys.flatMap(k=>[k,...(families[k]||[])]))].filter(v=>v.length>1||!['鸡','牛','猪','鱼','肉','蛋','奶','米','面','油','豆','菇'].includes(v));
}
const groupPatterns={'海鲜':/虾|蝦|蟹|蚝|牡蛎|蛤|贝|鲍|鱿|章鱼|墨鱼|鱼|魚/,'鱼类':/鱼|魚/,'肉类':/鸡肉|鸡腿|鸡翅|鸡胸|鸭|鹅|牛肉|牛腩|猪|羊肉|兔肉|五花肉|里脊|排骨|腊肠|火腿|香肠|培根/,'豆类':/豆|酱油|生抽|老抽/,'乳制品':/牛奶|酸奶|奶油|奶酪|黄油|乳酪|炼乳/,'坚果':/花生|核桃|腰果|杏仁|榛子|碧根果|开心果|松仁|松子/,'小麦':/小麦|面粉|面条|挂面|面包|吐司|馒头|饺子皮|生抽|老抽|酱油/,'甲壳类':/虾|蝦|蟹|龙虾/,'菌菇':/菇|木耳|菌/};
export function ingredientMatch(text,term){const t=normalize(text);return groupPatterns[term]?groupPatterns[term].test(t):variants(term).some(v=>t.includes(normalize(v)))}
export function scaleQuantities(recipe,people){
 if(!recipe.baseServings)return {text:recipe.quantitiesText||recipe.ingredientsText,note:`计划 ${people} 人；原文未明确基准人数，以下保留原用量。`};
 const factor=Number(people)/recipe.baseServings;
 const text=recipe.quantitiesText.split('\n').map(line=>{
  if(!/^\s*[-*]\s/.test(line))return line;
  const clean=line.replace(/\*\s*份数/g,'');
  if(/[*÷/]|每.*(?:个|只).*\d/.test(clean.replace(/^\s*[-*]\s/,'')))return line+'（原公式）';
  return clean.replace(/(\d+(?:\.\d+)?)(?:\s*[-~至]\s*(\d+(?:\.\d+)?))?\s*(kg|ml|g|克|千克|毫升|升|个|只|颗|根|片|瓣|勺|斤|两)(?!\w)/gi,(_,a,b,u)=>`${Math.round(Number(a)*factor*100)/100}${b?'-'+Math.round(Number(b)*factor*100)/100:''}${u}`);
 }).filter(line=>!(/一份正好够|计划做几份/.test(line))).join('\n');
 return {text,note:`按原文 ${recipe.baseServings} 人基准折算至 ${people} 人；复杂公式保留，烹饪时间不随人数等比缩放。`};
}
export function planMeals(recipes,value,{offset=0,recent=[]}={}){
 const p=mealPreferences(value),pantry=parseIngredients(p.pantry),exclude=parseIngredients(p.exclude);
 const equipment={all:['锅','微波炉','空气炸锅'],pot:['锅'],microwave:['微波炉'],airfryer:['空气炸锅'],any:null}[p.equipment];
 const has=(m,t)=>{let text=(groupPatterns[t]?'':m.name)+'\n'+(m.ingredientsText+'\n'+m.quantitiesText).split('\n').filter(l=>!l.includes('可选')).join('\n');if(t==='番茄')text=text.replace(/番茄酱|番茄膏|西红柿酱/g,'');return ingredientMatch(text,t)};
 const candidatesByCategory=recipes.filter(m=>p.category==='all'||(p.category==='dinner'?dinnerCategories.has(m.category):m.category===p.category));
 const eligible=candidatesByCategory.filter(m=>(p.minutes==='any'||(m.minutes!==null&&m.minutes<=Number(p.minutes)&&!m.advance))&&(!equipment||m.equipment.every(x=>equipment.includes(x)))&&!exclude.some(t=>ingredientMatch(m.ingredientsText+'\n'+m.quantitiesText+'\n'+m.stepsText,t)));
 const unavailable=pantry.filter(t=>!eligible.some(m=>has(m,t)));
 const unknownExclusions=exclude.filter(t=>!aliases.has(normalize(t))&&!recipes.some(m=>has(m,t)));
 const candidates=eligible.map(m=>({...m,matched:pantry.filter(t=>has(m,t)),titleMatches:pantry.filter(t=>ingredientMatch(m.name,t)).length})).filter(m=>!pantry.length||m.matched.length>0)
  .sort((a,b)=>b.matched.length-a.matched.length||b.titleMatches-a.titleMatches||Number(recent.includes(a.name))-Number(recent.includes(b.name))||(p.minutes==='any'?0:Math.abs(Number(p.minutes)-(a.minutes||0))-Math.abs(Number(p.minutes)-(b.minutes||0)))||a.id.localeCompare(b.id,'zh-CN'));
 if(unknownExclusions.length)return {options:[],total:0,offset:0,pantry,exclude,unavailable,unknownExclusions,preferences:p};
 const start=candidates.length?Math.max(0,offset)%candidates.length:0;
 const selected=Array.from({length:Math.min(3,candidates.length)},(_,i)=>candidates[(start+i)%candidates.length]);
 return {options:selected.map(m=>({...m,people:Number(p.people),amounts:scaleQuantities(m,Number(p.people))})),total:candidates.length,offset:start,pantry,exclude,unavailable,unknownExclusions,preferences:p};
}
