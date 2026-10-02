/* Small, deterministic teaching models. No prices, forecasts, or external services. */
(() => {
 'use strict';
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=(n,d=0)=>n.toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d});
 const field=(id,label,value,min,max,step=1)=>({id,label,value,min,max,step});
 const models={
  'unit-economics':{
   title:'动手算：客户增多，利润会怎样变化？',
   task:'先预测1000名与2000名客户的结果，再改变客户数。最后试着提高服务成本，观察盈亏平衡点。',
   fields:[field('customers','付费客户数（名）',1000,0,5000,100),field('price','每客户月收费（元）',100,1,300),field('cost','每客户月变动成本（元）',30,0,300),field('fixed','月固定成本（元）',70000,0,200000,1000)],
   calculate:({customers:n,price:p,cost:c,fixed:f})=>{
    const contribution=p-c,profit=n*contribution-f;
    return {values:[['月收入',number(n*p)+' 元'],['单位贡献',number(contribution)+' 元／名／月'],['简化月经营利润',number(profit)+' 元']],steps:[`收入：${number(n)} × ${number(p)} = ${number(n*p)} 元`,`贡献：${number(n)} × (${number(p)} − ${number(c)}) = ${number(n*contribution)} 元`,`利润：${number(n*contribution)} − ${number(f)} = ${number(profit)} 元`],explanation:contribution>0?`在固定成本不变的假设下，需要至少 ${number(Math.ceil(f/contribution))} 名客户达到非负经营利润。客户数增加会增加贡献，但实际固定成本可能扩容。`:'单位贡献不为正时，增加客户无法用这种方式覆盖正的固定成本。先检查定价和变动成本。'};
   },
   limit:'假设所有金额按月、客户成本相同且固定成本不变；忽略税、利息、获客投入与资本支出。'
  },
  'dcf':{
   title:'动手算：估值对哪个假设更敏感？',
   task:'保持三年FCFF为10、11、12。先提高折现率，再提高永续增长率，比较经营价值和终值占比。金额使用同一教学单位。',
   fields:[field('rate','折现率（%）',10,4,20,0.5),field('growth','永续增长率（%）',2,0,5,0.5)],
   calculate:({rate,growth})=>{
    const r=rate/100,g=growth/100;if(r<=g)return {error:'永续增长模型要求折现率大于增长率。请降低增长率或提高折现率。'};
    const pv=[10,11,12].reduce((a,v,i)=>a+v/(1+r)**(i+1),0),tv=12*(1+g)/(r-g),terminalPV=tv/(1+r)**3,ev=pv+terminalPV,equity=ev-30+10;
    return {values:[['经营价值 EV',number(ev,2)],['每股教学估值',number(equity/10,2)],['终值占EV',number(terminalPV/ev*100,1)+'%']],steps:[`三年现金现值 = ${number(pv,4)}`,`第三年末终值 = 12 × (1 + ${g}) ÷ (${r} − ${g}) = ${number(tv,4)}`,`今天的终值 = ${number(tv,4)} ÷ (1 + ${r})³ = ${number(terminalPV,4)}`,`股权价值 = EV − 债务30 + 现金10；每股 = 股权价值 ÷ 10股`],explanation:'终值占比越大，明确预测期以外的假设越影响结果。比较多个合理情景，比保留更多小数点更有帮助。'};
   },
   limit:'固定三年FCFF、债务30、现金10、10股，假设稳定永续增长。全部为假设数字，不是个股目标价。'
  },
  'draw-probability':{
   title:'动手算：加厚卡组会改变什么？',
   task:'保持2张关键牌、抽5张。先从20张卡组改到25张，再增加关键牌数；比较至少抽到一张的概率。',
   fields:[field('deck','卡组总张数',20,5,60),field('keys','关键牌张数',2,1,20),field('draw','抽牌张数',5,1,20)],
   calculate:({deck:n,keys:k,draw:d})=>{
    if(k>n||d>n)return {error:'关键牌数和抽牌数都不能超过卡组总张数。'};
    let miss=1;for(let i=0;i<d;i++)miss*=Math.max(0,n-k-i)/(n-i);const hit=1-miss;
    return {values:[['至少一张关键牌',number(hit*100,2)+'%'],['完全没抽到',number(miss*100,2)+'%']],steps:[`完全没抽到的概率 = C(${n-k}, ${d}) ÷ C(${n}, ${d})`,`至少一张 = 1 − ${number(miss,6)} = ${number(hit,6)}`],explanation:'这描述至少一张，不等于找到整个组合，也不保证一次抽牌成功。删牌、搜索与复制组件会以不同方式改变稳定性。'};
   },
   limit:'无放回、随机等概率抽牌；不包含洗回、定向检索、保底或其他特殊规则。'
  },
  'queue':{
   title:'动手看：任务到达比处理快，会发生什么？',
   task:'先令每秒到达8个任务、处理10个。再把到达改成12，观察60秒后的队列。注意：限制并发不等于限制等待数量。',
   fields:[field('arrival','每秒到达任务数',8,0,30),field('capacity','每秒处理能力',10,1,30),field('seconds','观察时间（秒）',60,1,120)],
   calculate:({arrival:a,capacity:c,seconds:t})=>{
    const backlog=Math.max(0,(a-c)*t),processed=Math.min(a,c)*t;
    return {values:[['累计完成',number(processed)+' 个'],['时间末排队',number(backlog)+' 个'],['尾部等待近似',number(backlog/c,1)+' 秒']],steps:[`净积累速度 = max(0, ${a} − ${c}) = ${Math.max(0,a-c)} 个／秒`,`时间末队列 = ${Math.max(0,a-c)} × ${t} = ${number(backlog)} 个`,`已有尾部任务前的工作量近似 = ${number(backlog)} ÷ ${c} 秒`],explanation:a>c?'生产持续快于消费时，无界队列会增长。背压需要让生产等待、减少入口速率或按规则拒绝工作。':'这个确定性模型没有积压。真实任务耗时和到达有波动，即使平均到达小于能力，也可能出现短暂排队。'};
   },
   limit:'连续流量近似，初始队列为空、能力恒定；尾部等待是队列工作量估算，不是随机队列的P99预测。'
  },
  'contrast':{
   title:'动手检验：这组正文颜色够清楚吗？',
   task:'输入文字与背景的十六进制颜色，观察普通正文4.5:1门槛。再交换明暗颜色，检查比值是否改变。',
   fields:[{id:'foreground',label:'文字颜色',value:'#53657c',type:'color'},{id:'background',label:'背景颜色',value:'#ffffff',type:'color'}],
   calculate:({foreground:f,background:b})=>{
    const lum=h=>{const rgb=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;};
    const x=lum(f),y=lum(b),ratio=(Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
    return {values:[['对比度',number(ratio,2)+':1'],['普通正文 AA',ratio>=4.5?'达到4.5:1':'未达到4.5:1']],steps:[`文字相对亮度 = ${number(x,4)}；背景相对亮度 = ${number(y,4)}`,`比值 = (较亮亮度 + 0.05) ÷ (较暗亮度 + 0.05)`],explanation:'这里只检验这对颜色。字号、行长、焦点、图标和状态仍需单独检查；整个页面不能凭一个颜色对宣称无障碍合格。',sample:{foreground:f,background:b}};
   },
   limit:'按不透明sRGB颜色计算。WCAG大文本适用不同门槛，这里固定使用普通正文门槛。'
  },
  'authorization':{
   title:'动手判断：这个用户可以读这条记录吗？',
   task:'保持用户已登录。分别改变租户、对象归属与租户管理员权限，先预测允许或拒绝，再看规则。',
   fields:[{id:'sameTenant',label:'记录属于用户所在租户',type:'checkbox',value:true},{id:'owner',label:'用户是这条记录的所有者',type:'checkbox',value:false},{id:'admin',label:'用户是自己租户的管理员',type:'checkbox',value:false}],
   calculate:({sameTenant:s,owner:o,admin:a})=>({values:[['读取结果',s&&(o||a)?'允许':'拒绝']],steps:[`同租户 = ${s?'是':'否'}`,`所有者或本租户管理员 = ${o||a?'是':'否'}`,`允许 = 同租户 AND（所有者 OR 本租户管理员）`],explanation:s?'登录之外还要检查具体对象和操作权限。':'本示例的租户管理员也不能读取其他租户记录；管理员身份没有绕过租户边界。'}),
   limit:'此处是一套明确的示例策略。真实业务可能有分享或跨租户委托，必须单独建模并由服务端执行。'
  }
 };
 window.LearningExplorers={
  models,
  render(id){const m=models[id];if(!m)return '';return `<section class="explorer" data-explorer="${id}"><h3>${esc(m.title)}</h3><p>${esc(m.task)}</p><div class="explorer-inputs">${m.fields.map(f=>`<label>${esc(f.label)}<input data-field="${f.id}" aria-label="${esc(f.label)}" type="${f.type||'number'}" ${f.type==='checkbox'?(f.value?'checked':''):`value="${f.value}"`} ${!f.type?`min="${f.min}" max="${f.max}" step="${f.step}"`:''}></label>`).join('')}</div><div class="explorer-output" aria-live="polite" aria-atomic="true"></div><button class="explorer-reset" type="button">恢复示例参数</button><p class="model-limit">模型边界：${esc(m.limit)}</p></section>`;},
  bind(root){root.querySelectorAll('[data-explorer]').forEach(el=>{
   const m=models[el.dataset.explorer],inputs=[...el.querySelectorAll('[data-field]')];
   function update(){const values={};for(const input of inputs){if(!input.checkValidity()||input.value===''){el.querySelector('.explorer-output').innerHTML='<p class="model-error">请填写范围内的有效参数。</p>';return;}values[input.dataset.field]=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;}
    const r=m.calculate(values);el.querySelector('.explorer-output').innerHTML=r.error?`<p class="model-error">${esc(r.error)}</p>`:`<div class="model-values">${r.values.map(([k,v])=>`<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>${r.sample?`<p class="contrast-sample" style="color:${r.sample.foreground};background:${r.sample.background}">这一段是使用当前颜色的正文示例。</p>`:''}<ol class="model-calculation">${r.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol><p>${esc(r.explanation)}</p>`;
   }
   inputs.forEach(i=>i.addEventListener('input',update));el.querySelector('.explorer-reset').onclick=()=>{inputs.forEach((i,n)=>{if(i.type==='checkbox')i.checked=m.fields[n].value;else i.value=m.fields[n].value;});update();};update();
  });}
 };
})();
