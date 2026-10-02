/* Small, deterministic teaching models. No prices, forecasts, or external services. */
(() => {
 'use strict';
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=(n,d=0)=>n.toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d});
 const field=(id,label,value,min,max,step=1)=>({id,label,value,min,max,step});
 const models={
  'power-budget':{
   title:'动手算：更新频率如何影响理想续航？',
   task:'先复现每60秒活跃2秒的例子，再改为30秒。比较数据新鲜度与耗电；数字均为教学假设。',
   fields:[field('active','活跃电流（mA）',100,0,1000),field('sleep','休眠电流（mA）',1,0,100,0.1),field('activeTime','每周期活跃时间（秒）',2,0,120,0.5),field('period','更新周期（秒）',60,1,3600),field('capacity','可用电池容量（mAh）',1000,100,10000,100)],
   calculate:({active:a,sleep:s,activeTime:t,period:p,capacity:c})=>{
    if(t>p)return {error:'活跃时间不能超过整个更新周期。'};
    const average=(a*t+s*(p-t))/p;
    if(average<=0)return {error:'零平均电流无法用这个预算模型计算有限续航；请检查教学参数。'};
    const hours=c/average;
    return {values:[['平均电流',number(average,2)+' mA'],['理想续航',number(hours,1)+' 小时'],['理想天数',number(hours/24,2)+' 天']],steps:[`活跃占比 = ${t} ÷ ${p} = ${number(t/p*100,2)}%`,`平均电流 = (${a} × ${t} + ${s} × ${p-t}) ÷ ${p} = ${number(average,4)} mA`,`理想续航 = ${c} ÷ ${number(average,4)} = ${number(hours,4)} 小时`],explanation:'增大周期通常减少活跃占比，但数据更新更慢；重连时间、屏幕与板载器件也可能改变实际电流。'};
   },
   limit:'电流和容量在同一电压侧；状态电流恒定，容量为假定可用值。忽略转换损耗、温度、老化与无线变化，不能当作真实续航保证。'
  },
  'product-margin':{
   title:'动手算：把自己的支持时间算进去',
   task:'先预测100名客户的现金与经济结果，再把每客户支持时间从10改到20分钟；观察盈亏平衡变化。',
   fields:[field('price','月收费（元／客户）',15,0,300),field('variable','变动现金成本（元／客户／月）',4,0,300),field('support','支持时间（分钟／客户／月）',10,0,120),field('hourly','工时估值（元／小时）',30,0,300),field('fixed','固定月成本（元）',1000,0,100000,100),field('customers','客户数（名）',100,0,10000,10),field('cac','每名新客户获客费用（元）',30,0,1000)],
   calculate:({price:p,variable:v,support:s,hourly:h,fixed:f,customers:n,cac:a})=>{
    const time=s/60*h,cash=p-v,economic=cash-time;
    return {values:[['现金月结果',number(n*cash-f,2)+' 元'],['计支持时间的月结果',number(n*economic-f,2)+' 元'],['经济单位贡献',number(economic,2)+' 元']],steps:[`时间估值 = ${s} ÷ 60 × ${h} = ${number(time,2)} 元／客户／月`,`现金贡献 = ${p} − ${v} = ${number(cash,2)} 元；经济贡献 = ${number(cash,2)} − ${number(time,2)} = ${number(economic,2)} 元`,`计时间的结果 = ${n} × ${number(economic,2)} − ${f} = ${number(n*economic-f,2)} 元`],explanation:economic>0?`同类客户与成本不变时，经济盈亏平衡至少 ${number(Math.ceil(f/economic))} 名；静态获客回收 ${number(a/economic,2)} 个月，要求持续付费且贡献不变。`:'经济单位贡献不为正，扩大同类客户无法按此模型覆盖正的固定成本。先审查价格、支持量与交付形式。'};
   },
   limit:'统一按月；工时估值为机会成本，不必是现金支出。获客费用仅用于静态回收计算，未从月结果重复扣除；忽略税、退款、扩容与实际留存。'
  },
  'audio-alias':{
   title:'动手算与听：采样后落在哪个频率？',audible:true,
   task:'以8kHz采样，先预测6kHz纯音的折叠结果，再改7kHz。试听是浏览器生成两种纯音，不是完整录音设备模拟；先降低设备音量。',
   fields:[field('frequency','原频率（Hz）',6000,20,20000,10),field('sampleRate','模型采样率（样本／秒）',8000,1000,96000,1000)],
   calculate:({frequency:f,sampleRate:s})=>{
    const remainder=((f%s)+s)%s,alias=Math.min(remainder,s-remainder);
    return {values:[['奈奎斯特频率',number(s/2)+' Hz'],['折叠频率',number(alias)+' Hz']],steps:[`原频率对采样率取余：${f} mod ${s} = ${remainder} Hz`,`折入0至半采样率：min(${remainder}, ${s-remainder}) = ${alias} Hz`],explanation:alias===0?'这是零频率折叠关系，特定相位样本可为常数或零；工具不播放直流。':f>=s/2?'原频率处于或超过半采样率；边界与相位也有歧义。均匀理想样本不足以确定原来的连续信号。':'这一纯音在半采样率以内；真实录音仍需检查其他高频、滤波与设备条件。'};
   },
   limit:'只算均匀理想采样的单一正弦频率关系，相位可能反转。试听使用浏览器实际采样率，数字振幅0.025、限时3秒，不模拟ADC滤波、噪声和量化，也不校准耳边声压。'
  },
  'exposure':{
   title:'动手算：等亮照片收到了同样多的光吗？',
   task:'基准f/4、1/125秒、ISO100。把快门改1/250，再把ISO改200，分别看入光、增益和简化亮度。',
   fields:[field('aperture','光圈f值',4,1,22,0.1),field('shutter','快门分母（1／秒）',125,1,8000),field('iso','ISO',100,50,12800,50)],
   calculate:({aperture:n,shutter:t,iso:i})=>{
    const light=(4/n)**2*(125/t),gain=i/100,brightness=light*gain;
    return {values:[['相对入光',number(light,3)+' 倍'],['简化ISO增益',number(gain,2)+' 倍'],['相对显示亮度',number(brightness,3)+' 倍']],steps:[`入光 = (4 ÷ ${n})² × (125 ÷ ${t}) = ${number(light,6)}`,`入光档位变化 = log₂(${number(light,6)}) = ${number(Math.log2(light),2)} 档`,`显示亮度近似 = 入光 × (${i} ÷ 100) = ${number(brightness,6)}`],explanation:'ISO增益不会增加已经到达的光。两组亮度因子相同，也可能在运动、景深、噪声与高光余量上不同。'};
   },
   limit:'同一场景、镜头与条件；参考f/4、1/125秒、ISO100。忽略透过率、噪声、饱和、色调和多帧；这是关系模型，不是具体相机画质预测。'
  },
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
 let activeAudio=null,playGeneration=0;
 function stopAudio(message='已停止。'){
  playGeneration++;const active=activeAudio;activeAudio=null;if(!active)return;
  if(active.oscillator&&active.gain&&active.context.state==='running'){
   const now=active.context.currentTime;active.gain.gain.cancelScheduledValues(now);active.gain.gain.setTargetAtTime(0,now,0.005);try{active.oscillator.stop(now+0.03);}catch{}
   setTimeout(()=>{if(active.context.state!=='closed')active.context.close().catch(()=>{});},40);
  }else if(active.context?.state!=='closed')active.context.close().catch(()=>{});
  if(active.status?.isConnected)active.status.textContent=message;
 }
 async function playTone(el,kind){
  stopAudio();const status=el.querySelector('.audio-status'),inputs=[...el.querySelectorAll('[data-field]')];
  if(inputs.some(i=>!i.checkValidity()||i.value==='')){status.textContent='先填写有效参数。';return;}
  const values=Object.fromEntries(inputs.map(i=>[i.dataset.field,Number(i.value)])),r=models['audio-alias'].calculate(values);
  const remainder=values.frequency%values.sampleRate,alias=Math.min(remainder,values.sampleRate-remainder),frequency=kind==='source'?values.frequency:alias;
  if(r.error||frequency===0){status.textContent='零频率不播放直流，请换一组参数。';return;}
  const Context=window.AudioContext||window.webkitAudioContext;if(!Context){status.textContent='此浏览器没有可用的Web Audio，仍可完成数值实验。';return;}
  let context;const token=playGeneration;
  try{
   context=new Context();activeAudio={context,status};await context.resume();
   if(token!==playGeneration){if(context.state!=='closed')await context.close();return;}
   if(context.state!=='running'){stopAudio('浏览器尚未允许播放，请重新点击试听。');return;}
   if(frequency>=context.sampleRate/2){stopAudio('原频率超过此浏览器实际半采样率，停止播放；数值模型仍可用。');return;}
   const oscillator=context.createOscillator(),gain=context.createGain(),time=context.currentTime;activeAudio.oscillator=oscillator;activeAudio.gain=gain;
   oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(0.025,time+0.03);gain.gain.setValueAtTime(0.025,time+2.94);gain.gain.linearRampToValueAtTime(0,time+2.99);
   oscillator.connect(gain);gain.connect(context.destination);oscillator.start(time);oscillator.stop(time+3);
   status.textContent=`正在播放${kind==='source'?'原频率':'折叠频率'} ${frequency}Hz；浏览器实际采样率 ${context.sampleRate}，3秒自动停止。`;
   oscillator.onended=()=>{if(activeAudio?.context===context)stopAudio('已在3秒后停止。');};
  }catch{if(activeAudio?.context===context)stopAudio('未能播放；数值实验仍可继续。');else if(context?.state!=='closed')context?.close().catch(()=>{});}
 }
 window.LearningExplorers={
  models,
  stopAll:stopAudio,
  isPlaying:()=>activeAudio?.context?.state==='running',
  render(id){const m=models[id];if(!m)return '';return `<section class="explorer" data-explorer="${id}"><h3>${esc(m.title)}</h3><p>${esc(m.task)}</p><div class="explorer-inputs">${m.fields.map(f=>`<label>${esc(f.label)}<input data-field="${f.id}" aria-label="${esc(f.label)}" type="${f.type||'number'}" ${f.type==='checkbox'?(f.value?'checked':''):`value="${f.value}"`} ${!f.type?`min="${f.min}" max="${f.max}" step="${f.step}"`:''}></label>`).join('')}</div><div class="explorer-output" aria-live="polite" aria-atomic="true"></div>${m.audible?'<div class="audio-controls"><button type="button" data-tone="source">试听原频率</button><button type="button" data-tone="alias">试听折叠频率</button><button type="button" data-audio-stop>停止声音</button></div><p class="audio-status" role="status">尚未播放；先降低设备音量，再主动点击试听。</p>':''}<button class="explorer-reset" type="button">恢复示例参数</button><p class="model-limit">模型边界：${esc(m.limit)}</p></section>`;},
  bind(root){root.querySelectorAll('[data-explorer]').forEach(el=>{
   const m=models[el.dataset.explorer],inputs=[...el.querySelectorAll('[data-field]')];
   function update(){if(m.audible)stopAudio('参数已改变，声音已停止。');const values={};for(const input of inputs){if(!input.checkValidity()||input.value===''){el.querySelector('.explorer-output').innerHTML='<p class="model-error">请填写范围内的有效参数。</p>';return;}values[input.dataset.field]=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;}
    const r=m.calculate(values);el.querySelector('.explorer-output').innerHTML=r.error?`<p class="model-error">${esc(r.error)}</p>`:`<div class="model-values">${r.values.map(([k,v])=>`<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>${r.sample?`<p class="contrast-sample" style="color:${r.sample.foreground};background:${r.sample.background}">这一段是使用当前颜色的正文示例。</p>`:''}<ol class="model-calculation">${r.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol><p>${esc(r.explanation)}</p>`;
   }
   inputs.forEach(i=>i.addEventListener('input',update));el.querySelector('.explorer-reset').onclick=()=>{inputs.forEach((i,n)=>{if(i.type==='checkbox')i.checked=m.fields[n].value;else i.value=m.fields[n].value;});update();};el.querySelectorAll('[data-tone]').forEach(b=>b.onclick=()=>playTone(el,b.dataset.tone));const stop=el.querySelector('[data-audio-stop]');if(stop)stop.onclick=()=>stopAudio();update();
  });}
 };
})();
