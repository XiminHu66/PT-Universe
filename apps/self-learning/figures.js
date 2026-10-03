(() => {
 'use strict';
 const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const specs=new Map(), observers=new Set();let dialog,lastTrigger;
 const colors=['var(--figure-blue)','var(--figure-orange)','var(--figure-green)','var(--figure-purple)'];
 const num=x=>Math.abs(x)<1e-8?'0':Math.abs(x)>=1000?String(Math.round(x)):String(Number(x.toFixed(2)));
 function wrap(text,maxWidth,size=16){let lines=[],line='',width=0;for(const char of String(text)){const cw=/[\u0000-\u00ff]/.test(char)?size*.58:size;if(width+cw>maxWidth&&line){lines.push(line);line='';width=0;}line+=char;width+=cw;}if(line)lines.push(line);return lines;}
 function textBlock(x,y,text,width,size=16,anchor='start',fill='currentColor',weight=400){return wrap(text,width,size).map((s,i)=>`<text x="${x}" y="${y+i*(size+6)}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}">${E(s)}</text>`).join('');}
 function svg(body,w,h,f){return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${E(f.alt||f.title+'。'+f.caption)}"><defs><marker id="${E(f.id)}-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="var(--figure-line)"/></marker></defs>${body}</svg>`;}
 function flow(f,w){
  const compare=f.kind==='compare',cols=w>=580?2:1,gap=30,pad=10,boxW=(w-2*pad-gap*(cols-1))/cols;
  const heights=f.nodes.map(n=>26+wrap(n.label,boxW-32,16).length*22+wrap(n.detail,boxW-32,14).length*20);
  const rowHeights=Array.from({length:Math.ceil(f.nodes.length/cols)},(_,r)=>Math.max(...heights.slice(r*cols,r*cols+cols)));
  const positions=[];let y=12;
  rowHeights.forEach((h,r)=>{for(let j=0;j<cols&&r*cols+j<f.nodes.length;j++){const index=r*cols+j,slot=!compare&&r%2===1?cols-1-j:j;positions[index]={x:pad+slot*(boxW+gap),y,h,w:boxW};}y+=h+gap;});
  let body='';
  if(!compare){for(let i=0;i<positions.length-1;i++){const a=positions[i],b=positions[i+1];let path;if(a.y===b.y){const forward=b.x>a.x,ax=forward?a.x+a.w:a.x,bx=forward?b.x:b.x+b.w;path=`M${ax},${a.y+a.h/2} L${bx},${b.y+b.h/2}`;}else{const x=a.x+a.w/2;path=`M${x},${a.y+a.h} L${b.x+b.w/2},${b.y-2}`;}body+=`<path d="${path}" fill="none" stroke="var(--figure-line)" stroke-width="2" marker-end="url(#${E(f.id)}-arrow)"/>`;}}
  f.nodes.forEach((n,i)=>{const p=positions[i],lines=wrap(n.label,boxW-32,16).length;body+=`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="10" fill="var(--figure-surface)" stroke="var(--figure-border)"/><rect x="${p.x}" y="${p.y+10}" width="4" height="${p.h-20}" rx="2" fill="${colors[i%4]}"/>`+textBlock(p.x+16,p.y+26,n.label,p.w-32,16,'start','currentColor',600)+textBlock(p.x+16,p.y+26+lines*22,n.detail,p.w-32,14,'start','var(--muted)');});
  return svg(body,w,y-gap+12,f);
 }
 function matrix(f,w){
  const columns=f.headers.length,cellW=(w-12)/columns,size=w<500?14:16;let body='',y=8;
  const rows=[f.headers,...f.rows];
  rows.forEach((row,ri)=>{const h=Math.max(...row.map(t=>wrap(t,cellW-14,size).length))*(size+6)+20;row.forEach((cell,ci)=>{const x=6+ci*cellW;body+=`<rect x="${x}" y="${y}" width="${cellW}" height="${h}" fill="${ri===0?'var(--figure-header)':ri%2?'var(--figure-surface)':'var(--panel)'}" stroke="var(--figure-border)"/>`+textBlock(x+7,y+size+9,cell,cellW-14,size,'start','currentColor',ri===0?600:400);});y+=h;});
  return svg(body,w,y+8,f);
 }
 function chart(f,w){
  const h=324,left=w<450?54:64,right=18,top=22,bottom=65,plotW=w-left-right,plotH=h-top-bottom;
  const values=f.series.flatMap(s=>s.values);let ymin=Math.min(0,...values),ymax=Math.max(0,...values);
  if(ymin===ymax)ymax=ymin+1;
  if(ymax>0)ymax*=1.08;if(ymin<0)ymin*=1.08;
  const xmin=Math.min(...f.x),xmax=Math.max(...f.x),bar=f.kind==='bar';
  const X=(x,i)=>bar?left+(i+.5)*plotW/f.x.length:left+(x-xmin)/(xmax-xmin||1)*plotW;
  const Y=y=>top+(ymax-y)/(ymax-ymin)*plotH;
  let body='';
  for(let t=0;t<=4;t++){const value=ymin+(ymax-ymin)*t/4,yy=Y(value);body+=`<path d="M${left},${yy}H${w-right}" stroke="var(--figure-border)" stroke-dasharray="3 4"/>`+textBlock(left-7,yy+5,num(value),left-8,14,'end','var(--muted)');}
  body+=`<path d="M${left},${top}V${h-bottom}H${w-right}" fill="none" stroke="var(--figure-line)"/>`;
  if(ymin<0&&ymax>0)body+=`<path d="M${left},${Y(0)}H${w-right}" stroke="var(--figure-line)"/>`;
  const indexes=new Set([0,f.x.length-1]);const maxTicks=w<450?4:6;for(let i=1;i<maxTicks-1;i++)indexes.add(Math.round(i*(f.x.length-1)/(maxTicks-1)));
  f.x.forEach((x,i)=>{if(!indexes.has(i))return;const xx=X(x,i),label=f.xNames?.[i]??num(x),space=bar?plotW/f.x.length-6:Math.min(95,plotW/(Math.min(maxTicks,f.x.length)-1||1));body+=`<path d="M${xx},${h-bottom}v5" stroke="var(--figure-line)"/>`+textBlock(xx,h-bottom+23,label,space,14,'middle','var(--muted)');});
  f.series.forEach((s,si)=>{const color=colors[si%4];if(bar){const slot=plotW/f.x.length,bw=Math.max(8,Math.min(58,slot*.65/f.series.length));s.values.forEach((v,i)=>{const xx=X(f.x[i],i)-f.series.length*bw/2+si*bw,yy=Math.min(Y(v),Y(0));body+=`<rect x="${xx}" y="${yy}" width="${bw-2}" height="${Math.max(1,Math.abs(Y(v)-Y(0)))}" fill="${color}" opacity=".86"/>`;});}else{let d='';s.values.forEach((v,i)=>{const xx=X(f.x[i],i),yy=Y(v);d+=i?(f.kind==='step'?` H${xx} V${yy}`:` L${xx},${yy}`):`M${xx},${yy}`;});body+=`<path d="${d}" fill="none" stroke="${color}" stroke-width="3" ${si?'stroke-dasharray="7 4"':''}/>`;s.values.forEach((v,i)=>{body+=`<circle cx="${X(f.x[i],i)}" cy="${Y(v)}" r="3" fill="${color}"/>`;});}});
  return svg(body,w,h,f);
 }
 function wave(f,w){
  const mode=f.waveMode,pad=w<450?45:58,right=14,plotW=w-pad-right;
  let rows;
  if(mode==='parameters')rows=[['参考：A=0.1，f=440Hz，φ=0',t=>.1*Math.sin(2*Math.PI*440*t)],['只改振幅：A=0.05',t=>.05*Math.sin(2*Math.PI*440*t)],['只改频率：f=880Hz',t=>.1*Math.sin(2*Math.PI*880*t)],['只改相位：φ=π',t=>.1*Math.sin(2*Math.PI*440*t+Math.PI)]];
  else if(mode==='harmonics')rows=[['纯音：只有440Hz',t=>.1*Math.sin(2*Math.PI*440*t)],['复合音：440Hz加880Hz',t=>.1*Math.sin(2*Math.PI*440*t)+.04*Math.sin(2*Math.PI*880*t)]];
  else if(mode==='phase')rows=[['A：参考正弦',t=>.1*Math.sin(2*Math.PI*440*t)],['B：相位加π',t=>.1*Math.sin(2*Math.PI*440*t+Math.PI)],['A+B：理想相消',t=>.1*(Math.sin(2*Math.PI*440*t)+Math.sin(2*Math.PI*440*t+Math.PI))]];
  else rows=[['6000Hz 与 -2000Hz 的连续解释',t=>Math.sin(2*Math.PI*6000*t),t=>Math.sin(-2*Math.PI*2000*t)]];
  const end=mode==='alias'?.001:.005,amplitude=mode==='alias'?1.1:mode==='harmonics'?.15:.12,rowH=150;
  let body='';
  rows.forEach(([label,fn,second],ri)=>{const offset=ri*rowH,cy=offset+86,scale=40/amplitude;
   body+=textBlock(10,offset+20,label,w-20,14,'start','currentColor',600);
   for(const v of [-amplitude,0,amplitude]){const yy=cy-v*scale;body+=`<path d="M${pad},${yy}H${w-right}" stroke="var(--figure-border)"/>`+textBlock(pad-7,yy+4,num(v),pad-9,13,'end','var(--muted)');}
   for(let tick=0;tick<=4;tick++){const xx=pad+plotW*tick/4;body+=textBlock(xx,offset+143,num(end*1000*tick/4),45,13,'middle','var(--muted)');}
   [fn,second].filter(Boolean).forEach((fun,fi)=>{let d='';for(let i=0;i<=400;i++){const t=end*i/400;d+=`${i?'L':'M'}${pad+plotW*i/400},${cy-fun(t)*scale}`;}body+=`<path d="${d}" fill="none" stroke="${colors[fi?1:ri%4]}" stroke-width="2.3" ${fi?'stroke-dasharray="6 3"':''}/>`;});
   if(mode==='alias'){for(let n=0;n<=8;n++){const t=n/8000;body+=`<circle cx="${pad+plotW*t/end}" cy="${cy-fn(t)*scale}" r="4.5" fill="var(--figure-green)" stroke="var(--panel)" stroke-width="1"/>`;}}
  });
  let h=rows.length*rowH;
  if(mode==='harmonics'){body+=textBlock(10,h+22,'理想分量：纯音只有440；复合音含440与880Hz',w-20,14);const base=h+126,xx=[pad+plotW*.3,pad+plotW*.75];body+=`<path d="M${pad},${base}H${w-right}" stroke="var(--figure-line)"/>`;[.1,.04].forEach((v,i)=>{body+=`<rect x="${xx[i]-14}" y="${base-v*700}" width="28" height="${v*700}" fill="${colors[i]}"/>`+textBlock(xx[i],base+22,i?'880Hz':'440Hz',90,14,'middle')+textBlock(xx[i],base-v*700-7,num(v),60,14,'middle');});h+=163;}
  return svg(body,w,h,f);
 }
 function dataTable(f){
  if(f.kind==='matrix')return `<table><thead><tr>${f.headers.map(x=>`<th scope="col">${E(x)}</th>`).join('')}</tr></thead><tbody>${f.rows.map(row=>`<tr>${row.map(x=>`<td>${E(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  if(f.series)return `<table><thead><tr><th scope="col">${E(f.xLabel)}</th>${f.series.map(s=>`<th scope="col">${E(s.name)} · ${E(f.yLabel)}</th>`).join('')}</tr></thead><tbody>${f.x.map((x,i)=>`<tr><th scope="row">${E(f.xNames?.[i]??num(x))}</th>${f.series.map(s=>`<td>${num(s.values[i])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  if(f.nodes)return `<ol>${f.nodes.map(n=>`<li><strong>${E(n.label)}</strong>：${E(n.detail)}</li>`).join('')}</ol>`;
  return `<p>${E(f.caption)}</p>`;
 }
 function render(f){specs.set(f.id,f);const legend=f.series?`<ul class="figure-legend">${f.series.map((s,i)=>`<li><i style="background:${colors[i%4]}"></i>${E(s.name)}${i&&f.kind!=='bar'?'（虚线）':''}</li>`).join('')}</ul>`:f.waveMode==='alias'?'<p class="figure-units">蓝实线：6000Hz；橙虚线：-2000Hz；绿点：采样值。</p>':'';return `<figure class="lesson-figure" data-figure="${E(f.id)}"><div class="figure-top"><h3>${E(f.title)}</h3><button class="figure-expand" aria-label="放大：${E(f.title)}">放大图示</button></div>${f.series?`<p class="figure-units">横轴：${E(f.xLabel)} · 纵轴：${E(f.yLabel)}</p>`:f.kind==='wave'?'<p class="figure-units">横轴：时间（ms） · 纵轴：归一化数字振幅</p>':''}${legend}<div class="figure-canvas"></div><figcaption><strong>读图：</strong>${E(f.caption)}</figcaption><details class="figure-data"><summary>${f.series?'查看数值与模型条件':'查看图示的文字说明'}</summary><div class="figure-data-scroll">${dataTable(f)}</div><p>${E(f.model)}</p></details></figure>`;}
 function draw(el){const f=specs.get(el.dataset.figure),box=el.querySelector('.figure-canvas'),w=Math.floor(box?.getBoundingClientRect().width||0);if(!f||w<160)return;box.innerHTML=(f.kind==='matrix'?matrix:f.kind==='wave'?wave:f.series?chart:flow)(f,w);}
 function ensureDialog(){if(dialog)return;dialog=document.createElement('dialog');dialog.className='figure-dialog';dialog.setAttribute('aria-label','放大课程图示');dialog.innerHTML='<div class="figure-dialog-tools"><button class="figure-close">关闭图示</button></div><div class="figure-dialog-content"></div>';document.body.append(dialog);dialog.querySelector('.figure-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>lastTrigger?.focus({preventScroll:true}));dialog.onclick=e=>{if(e.target===dialog)dialog.close();};}
 function bind(root){root.querySelectorAll('[data-figure]').forEach(el=>{const observer=new ResizeObserver(()=>draw(el));observer.observe(el.querySelector('.figure-canvas'));observers.add(observer);draw(el);el.querySelector('.figure-expand').onclick=e=>{ensureDialog();lastTrigger=e.currentTarget;const f=specs.get(el.dataset.figure);dialog.querySelector('.figure-dialog-content').innerHTML=render(f);dialog.querySelector('.figure-expand').remove();dialog.showModal();const enlarged=dialog.querySelector('[data-figure]');draw(enlarged);};});}
 function clear(){for(const o of observers)o.disconnect();observers.clear();specs.clear();dialog?.remove();dialog=null;lastTrigger=null;}
 function redraw(){document.querySelectorAll('[data-figure]').forEach(draw);}
 window.LearningFigures={render,bind,clear,redraw};
 addEventListener('resize',()=>{if(dialog?.open)draw(dialog.querySelector('[data-figure]'));});
})();
