(() => {
  'use strict';
  const AHA='https://www.heart.org/en/healthy-living/exercise-and-physical-activity';
  const NHS='https://www.nhs.uk/live-well/exercise/strength-exercises/';
  const exercise={
    walk:{label:'原地慢走',kind:'walk',hint:'自然摆臂，逐渐加快。',cues:['站直，目视前方，肩膀放松','左右交替踏步，脚掌轻落地','手臂自然前后摆动，正常呼吸'],link:AHA},
    fast:{label:'原地快走',kind:'walk',hint:'手臂主动摆动，抬腿到舒服高度。',cues:['脚轻落地，避免跺脚','手臂主动摆动，逐步加快步频','呼吸加快但仍能说短句'],link:AHA},
    step:{label:'左右踏步',kind:'step',hint:'左右各一步，配合摆臂。',cues:['向左迈一步、并脚；再向右','膝盖保持柔软，不锁死','步幅以房间空间和稳定感为准'],link:AHA},
    shoulder:{label:'肩部绕环与轻微转体',kind:'shoulder',hint:'动作柔和，活动肩背，不憋气。',cues:['肩膀缓慢绕环，不要猛甩','身体小幅转动，骨盆自然跟随','颈部保持放松'],link:AHA},
    box:{label:'空击拳',kind:'box',hint:'左右直拳，肩膀放松，手肘别锁死。',cues:['下巴微收，手从胸前直线打出','轻微转动躯干，不要扭住膝盖','回拳时放松肩膀，避免肘部锁死'],link:AHA},
    quickbox:{label:'快节奏拳击',kind:'box',hint:'直拳交替出，速度略快但动作可控。',cues:['保持小幅左右踏步，不跳跃','直拳交替，稳定地回拳','肩膀放松，呼吸不要憋住'],link:AHA},
    jack:{label:'低冲击开合步',kind:'jack',hint:'左右脚轮流向外点地，双手同步举起，不跳。',cues:['每次只迈出一只脚，不做开合跳','侧点地后收回，再换另一边','手举到舒服高度即可'],link:AHA},
    squat:{label:'深蹲',kind:'squat',hint:'臀部向后坐，脚掌踩稳，幅度以舒适为准。',cues:['双脚约与肩同宽，脚掌稳定','髋部向后坐，膝盖顺着脚尖方向','背部自然挺直；不舒服就改坐椅起立'],link:'https://www.acefitness.org/resources/everyone/exercise-library/135/bodyweight-squat/'},
    push:{label:'墙壁 / 稳固桌边俯卧撑',kind:'push',hint:'身体从头到脚保持直线，屈肘靠近墙或桌边。',cues:['双手略宽于肩，撑住墙或稳固桌面','屈肘时全身保持一条直线','推回时呼气，保留两三次余力'],link:NHS},
    lunge:{label:'原地分腿蹲 / 后撤弓步',kind:'lunge',hint:'左右交替，先站稳再缓慢下蹲；空间小就原地分腿蹲。',cues:['一步前后分腿，后脚脚跟可离地','两膝缓慢弯曲，前脚脚掌踩稳','扶墙也可以；只下到稳得住的幅度'],link:'https://www.rnoh.nhs.uk/patients-and-visitors/patient-information-guides/functional-fitness-exercise-pack'},
    calf:{label:'提踵',kind:'calf',hint:'扶墙保持平衡，缓慢踮起再放下。',cues:['双脚约与髋同宽，可以扶墙','脚跟缓慢抬起，避免向外崴脚','控制着落下，不要弹震'],link:NHS},
    legstretch:{label:'腿部轻柔拉伸',kind:'stretch',hint:'大腿前后侧和小腿各轻轻拉伸，不弹震。',cues:['只拉到轻微牵拉感，不追求疼痛','扶墙保持平衡，正常呼吸','两侧都照顾到，不用强压幅度'],link:NHS},
    chest:{label:'胸肩伸展与深呼吸',kind:'shoulder',hint:'放松胸肩，缓慢呼吸。',cues:['挺直站立，肩膀自然下沉','手臂向两侧轻轻打开','缓慢呼气，结束训练'],link:AHA}
  };
  const make=(key,sec,stage)=>({key,sec,stage});
  function build(mode){
    if(mode==='easy')return [make('walk',60,'热身'),make('step',60,'热身'),...Array.from({length:2},()=>['fast','step','box','jack'].flatMap(k=>[make(k,40,'轻松有氧'),make('walk',20,'慢走恢复')])).flat(),make('walk',60,'放松'),make('legstretch',60,'放松'),make('chest',60,'放松')];
    const segments=[make('walk',60,'热身'),make('step',60,'热身'),make('shoulder',60,'热身')];
    for(let round=1;round<=(mode==='long'?3:2);round++){
      for(const key of ['fast','box','step','jack','quickbox'])segments.push(make(key,40,`有氧 ${round}`),make('walk',20,'慢走恢复'));
    }
    for(const key of ['squat','push','lunge','calf','squat','push'])segments.push(make(key,40,'力量'),make('walk',20,'休息'));
    segments.push(make('walk',60,'放松'),make('legstretch',60,'放松'),make('chest',60,'放松'));
    return segments;
  }
  const $=s=>document.querySelector(s);
  let mode='standard',segments=build(mode),index=0,remaining=segments[0].sec*1000,running=false,deadline=0,ticker=null,done=false,wake=null,audio=null,demoPaused=false;
  const duration=()=>segments.reduce((n,s)=>n+s.sec,0);
  const format=ms=>{const secs=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`};
  function elapsed(){return segments.slice(0,index).reduce((n,s)=>n+s.sec,0)*1000+(index<segments.length?segments[index].sec*1000-remaining:0)}
  function upcoming(){for(let j=index+1;j<segments.length;j++)if(segments[j].stage!=='休息'&&segments[j].stage!=='慢走恢复')return exercise[segments[j].key].label;return '完成训练'}
  function beep(freq=690,dur=.12){if(!$('#sound').checked)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume();const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type='sine';oscillator.frequency.value=freq;gain.gain.setValueAtTime(.065,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+dur);oscillator.connect(gain).connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+dur)}catch{}}
  function speak(phrase){if(!$('#voice').checked||!('speechSynthesis'in window))return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(phrase);u.lang='zh-CN';u.rate=1.07;speechSynthesis.speak(u)}catch{}}
  function announce(){const s=segments[index];beep(s.stage==='休息'||s.stage==='慢走恢复'?520:760);speak(s.stage==='休息'?'休息，慢走二十秒':s.stage==='慢走恢复'?'慢走恢复，二十秒':exercise[s.key].label)}
  function render(){
    if(done){$('#phase').textContent='完成';$('#position').textContent=`${segments.length} / ${segments.length}`;$('#exercise').textContent='今天训练完成';$('#hint').textContent='慢慢调整呼吸，喝水休息。';$('#clock').textContent='0:00';$('#totalRemaining').textContent='全程完成';$('#next').textContent='—';$('#progress').style.width='100%';$('#start').textContent='再练一次';$('#start').disabled=false;$('#notice').textContent='训练完成。今天做得够了。';return}
    const s=segments[index],e=exercise[s.key];$('#phase').textContent=s.stage;$('#position').textContent=`${String(index+1).padStart(2,'0')} / ${segments.length}`;$('#exercise').textContent=e.label;$('#hint').textContent=e.hint;$('#clock').textContent=format(remaining);$('#totalRemaining').textContent=`全程还剩 ${format(duration()*1000-elapsed())}`;$('#progress').style.width=`${Math.min(100,elapsed()/(duration()*1000)*100)}%`;$('#next').textContent=upcoming();$('#guideTitle').textContent=`${e.label} · 动作要点`;$('#cues').replaceChildren(...e.cues.map(c=>{const li=document.createElement('li');li.textContent=c;return li}));$('#reference').href=e.link;$('#demo').setAttribute('aria-label',`${e.label}循环动作示意图`);$('#start').textContent=running?'Ⅱ 暂停':'▶ '+(index===0&&remaining===s.sec*1000?'开始跟练':'继续跟练');
  }
  function setNotice(s){$('#notice').textContent=s}
  async function acquireWake(){try{if('wakeLock'in navigator)wake=await navigator.wakeLock.request('screen')}catch{setNotice('无法保持屏幕常亮；请在设备设置里延长锁屏时间。')}}
  function releaseWake(){try{wake?.release()}catch{}wake=null}
  function pause(background=false){if(!running)return;remaining=Math.max(0,deadline-performance.now());running=false;clearInterval(ticker);ticker=null;releaseWake();if('speechSynthesis'in window)speechSynthesis.cancel();render();setNotice(background?'页面切换后已自动暂停，回来点继续即可。':'已暂停，准备好后继续。')}
  function finish(){running=false;done=true;remaining=0;clearInterval(ticker);ticker=null;releaseWake();render();beep(920,.32);speak('今天训练完成')}
  function advance(keepRunning=running){if(index+1>=segments.length){finish();return}index++;remaining=segments[index].sec*1000;if(keepRunning){deadline=performance.now()+remaining;announce()}render()}
  function tick(){if(!running)return;const previous=Math.ceil(remaining/1000);remaining=Math.max(0,deadline-performance.now());const current=Math.ceil(remaining/1000);if(current<previous&&current<=3&&current>=1)beep(600,.07);if(remaining<=0)advance();else{ $('#clock').textContent=format(remaining);$('#totalRemaining').textContent=`全程还剩 ${format(duration()*1000-elapsed())}`;$('#progress').style.width=`${Math.min(100,elapsed()/(duration()*1000)*100)}%`}}
  function start(){if(done)reset();running=true;deadline=performance.now()+remaining;acquireWake();announce();ticker=setInterval(tick,100);render();setNotice('跟随动画动作方向练习；呼吸加快但仍能说话。')}
  function reset(){pause();done=false;index=0;remaining=segments[0].sec*1000;render();setNotice('准备好了就开始，自动切换动作和语音提示。')}
  function selectMode(value){pause();mode=value;segments=build(mode);document.querySelectorAll('.mode').forEach(b=>{const chosen=b.dataset.mode===value;b.classList.toggle('active',chosen);b.setAttribute('aria-pressed',String(chosen))});reset();$('#routineCount').textContent=`${segments.length} 段`;$('#routineList').replaceChildren(...segments.map(s=>{const li=document.createElement('li');li.textContent=exercise[s.key].label;const small=document.createElement('small');small.textContent=`${s.stage} · ${s.sec}秒`;li.append(small);return li}));const desc=value==='easy'?'热身 2 分钟 · 低冲击有氧 8 分钟 · 放松 3 分钟。':`热身 3 分钟 · 低冲击有氧 ${value==='long'?15:10} 分钟 · 力量 6 分钟 · 放松 3 分钟。`;document.querySelector('footer').firstChild.textContent=desc+'强度以微喘、仍能说话为宜。';render()}
  $('#start').onclick=()=>running?pause():start();$('#skip').onclick=()=>{if(done)return;advance();if(!running&&!done)setNotice('已跳过，点继续跟练。')};$('#reset').onclick=reset;document.querySelectorAll('.mode').forEach(b=>b.onclick=()=>selectMode(b.dataset.mode));$('#demoPause').onclick=()=>{demoPaused=!demoPaused;$('#demoPause').textContent=demoPaused?'▶':'Ⅱ';$('#demoPause').setAttribute('aria-label',demoPaused?'播放动作示意':'暂停动作示意')};document.addEventListener('visibilitychange',()=>{if(document.hidden)pause(true)});

  // Two carefully simplified poses per move; interpolation communicates direction and rhythm.
  const base={head:[150,43],neck:[150,68],hip:[150,139],le:[122,88],lh:[108,125],re:[178,88],rh:[191,125],lk:[134,184],lf:[127,215],rk:[166,184],rf:[173,215]};
  const copy=(changes={})=>({...base,...changes});
  const pose={
    walk:[copy({lh:[113,91],rh:[192,152],lk:[126,173],lf:[129,209],rk:[173,184],rf:[178,215]}),copy({lh:[107,153],rh:[188,91],lk:[128,184],lf:[124,215],rk:[169,173],rf:[166,209]})],
    step:[copy({lf:[105,215],rf:[167,215],lh:[104,119],rh:[191,134]}),copy({lf:[133,215],rf:[195,215],lh:[112,134],rh:[198,119]})],
    jack:[copy({lf:[127,215],rf:[172,215],lh:[103,114],rh:[198,114]}),copy({lf:[92,215],rf:[173,215],le:[111,70],lh:[91,44],re:[189,70],rh:[210,44]})],
    box:[copy({le:[119,83],lh:[134,94],re:[178,84],rh:[177,100]}),copy({le:[117,87],lh:[85,92],re:[184,83],rh:[227,77]})],
    shoulder:[copy({le:[121,84],lh:[111,125],re:[179,84],rh:[189,125]}),copy({le:[113,66],lh:[102,49],re:[187,66],rh:[198,49]})],
    squat:[copy({head:[157,42],neck:[153,68],hip:[149,137],le:[126,89],lh:[122,127],re:[174,90],rh:[186,121],lk:[140,185],lf:[130,215],rk:[173,185],rf:[181,215]}),copy({head:[145,74],neck:[139,100],hip:[104,162],le:[120,121],lh:[159,125],re:[149,120],rh:[184,126],lk:[152,178],lf:[133,215],rk:[184,180],rf:[184,215]})],
    push:[copy({head:[169,80],neck:[153,93],hip:[125,148],le:[177,103],lh:[220,104],re:[181,116],rh:[220,118],lk:[111,184],lf:[91,214],rk:[129,190],rf:[110,214]}),copy({head:[186,88],neck:[167,99],hip:[128,155],le:[187,112],lh:[220,104],re:[191,126],rh:[220,118],lk:[113,187],lf:[91,214],rk:[130,192],rf:[110,214]})],
    lunge:[copy({head:[150,42],neck:[150,68],hip:[150,135],lk:[123,179],lf:[106,215],rk:[179,181],rf:[194,215]}),copy({head:[150,68],neck:[150,91],hip:[150,157],lk:[111,180],lf:[106,215],rk:[186,183],rf:[194,215]})],
    calf:[copy({lf:[129,215],rf:[174,215]}),copy({head:[150,33],neck:[150,58],hip:[150,129],le:[122,78],lh:[108,115],re:[178,78],rh:[191,115],lk:[134,174],lf:[135,204],rk:[166,174],rf:[180,204]})],
    stretch:[copy({lf:[112,215],rf:[180,215],lh:[108,126]}),copy({lf:[109,215],rf:[210,215],hip:[143,141],lh:[105,133],rh:[195,123]})]
  };
  const canvas=$('#demo'),ctx=canvas.getContext('2d');let frozen=0;
  function draw(now){requestAnimationFrame(draw);if(demoPaused){if(!frozen)frozen=now;now=frozen}else frozen=0;
    const type=exercise[segments[Math.min(index,segments.length-1)].key].kind, [a,b]=pose[type]||pose.walk;
    const t=(1-Math.cos(now/430))/2, p={};for(const k of Object.keys(a))p[k]=[a[k][0]+(b[k][0]-a[k][0])*t,a[k][1]+(b[k][1]-a[k][1])*t];
    const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.save();ctx.scale(w/300,h/240);
    ctx.strokeStyle='#345b64';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(50,220);ctx.lineTo(250,220);ctx.stroke();
    if(type==='push'){ctx.strokeStyle='#73bfc0';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(224,60);ctx.lineTo(224,221);ctx.stroke()}
    ctx.fillStyle='#37758044';ctx.beginPath();ctx.ellipse(151,218,65,5,0,0,Math.PI*2);ctx.fill();
    const line=(x,y)=>{ctx.beginPath();ctx.moveTo(...p[x]);ctx.lineTo(...p[y]);ctx.stroke()};
    ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=10;ctx.strokeStyle='#62cfc0';line('neck','hip');line('hip','lk');line('lk','lf');line('hip','rk');line('rk','rf');line('neck','le');line('le','lh');line('neck','re');line('re','rh');
    ctx.fillStyle='#dbf7e9';ctx.beginPath();ctx.arc(...p.head,14,0,Math.PI*2);ctx.fill();ctx.fillStyle='#142d36';ctx.beginPath();ctx.arc(p.head[0]+4,p.head[1]-2,1.6,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#d5f3e7';for(const k of ['lh','rh']){ctx.beginPath();ctx.arc(...p[k],5,0,Math.PI*2);ctx.fill()}
    ctx.fillStyle='#83b6b9';for(const k of ['lf','rf']){ctx.beginPath();ctx.ellipse(p[k][0],p[k][1],10,4,0,0,Math.PI*2);ctx.fill()}
    ctx.restore();
  }
  selectMode('standard');requestAnimationFrame(draw);
})();
