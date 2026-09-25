(() => {
  'use strict';
  const NHS='https://www.nhs.uk/live-well/exercise/strength-exercises/';
  const exercise={
    walk:{label:'原地慢走',kind:'walk',hint:'自然摆臂，逐渐加快。',cues:['站直，目视前方，肩膀放松','左右交替踏步，脚掌轻落地','手臂自然前后摆动，正常呼吸'],link:'https://www.nhs.uk/live-well/exercise/how-to-warm-up-before-exercising/'},
    fast:{label:'原地快走',kind:'walk',hint:'手臂主动摆动，抬腿到舒服高度。',cues:['脚轻落地，避免跺脚','手臂主动摆动，逐步加快步频','呼吸加快但仍能说短句'],link:'https://www.nhs.uk/live-well/exercise/how-to-warm-up-before-exercising/'},
    step:{label:'左右踏步',kind:'step',hint:'左右各迈一步、并脚，始终站稳。',cues:['向左迈一步、并脚；再向右','膝盖保持柔软，不锁死','步幅以房间空间和稳定感为准'],link:'https://www.nhs.uk/live-well/exercise/balance-exercises/'},
    shoulder:{label:'原地踏步与绕肩',kind:'shoulder',hint:'保持轻缓踏步，肩膀先向前、再向后绕环。',cues:['站直、手臂自然垂在身侧','肩膀缓慢向前绕 5 次，再向后绕 5 次','颈部放松，不要用力甩手'],link:'https://www.nhs.uk/live-well/exercise/how-to-warm-up-before-exercising/'},
    side:{label:'交替侧点地',kind:'side',hint:'左右脚轮流向侧面轻点，另一脚稳稳踩地。',cues:['左脚向外侧轻点，再收回站稳','右脚向外侧轻点，再收回站稳','支撑腿膝盖微屈，上身保持直立'],link:'https://www.leedsth.nhs.uk/patients/resources/keeping-active-on-the-liver-transplant-list/'},
    knee:{label:'交替抬膝',kind:'knee',hint:'站直，左右膝轮流抬到舒服的高度。',cues:['先站稳，再抬起一侧膝盖','放下脚后再抬另一侧，不跳跃','上身保持直立；需要时扶稳墙面'],link:'https://www.nhs.uk/live-well/exercise/how-to-warm-up-before-exercising/'},
    jack:{label:'侧点步抬臂',kind:'jack',hint:'左右脚轮流侧点地，双臂轻轻抬起，全程不跳。',cues:['每次只侧点一只脚，另一脚踩稳','收回脚再换另一边，全程不跳','双臂抬到舒服高度，不耸肩'],link:'https://www.northerncarealliance.nhs.uk/patient-information/patient-leaflets/cardiology-home-exercises-cardiac-rehabilitation-programme'},
    squat:{label:'椅前深蹲',kind:'squat',hint:'椅子放在身后，臀部向后坐，慢慢起身。',cues:['稳固椅子置于身后，脚约与肩同宽','髋部向后坐，膝盖顺着脚尖方向','只下到舒服深度，必要时轻触椅面'],link:'https://www.nhs.uk/live-well/exercise/strength-exercises/'},
    push:{label:'墙壁俯卧撑',kind:'push',hint:'双手撑墙，身体成一直线，缓慢靠近再推回。',cues:['双手略宽于肩，掌心撑住墙','屈肘时头、躯干和腿保持一条直线','推回时呼气，别让腰部塌下去'],link:'https://www.nhs.uk/live-well/exercise/strength-and-flex-exercise-plan-how-to-videos/'},
    lunge:{label:'扶稳前跨弓步',kind:'lunge',hint:'扶稳身旁的稳固支撑，一脚向前跨、屈膝，再站起收回。',cues:['扶稳身旁的固定支撑，先站直，再单脚向前跨步','前脚踩稳、两膝缓慢弯曲；后膝不必贴地','站起收脚；20 秒后换腿，幅度以站稳为准'],link:'https://www.rnoh.nhs.uk/patients-and-visitors/patient-information-guides/functional-fitness-exercise-pack'},
    calf:{label:'扶椅提踵',kind:'calf',hint:'扶稳椅背保持平衡，缓慢踮起再放下。',cues:['双脚约与髋同宽，扶稳椅背','脚跟缓慢抬起，避免向外崴脚','控制着落下，不要弹震'],link:NHS},
    legstretch:{label:'大腿前侧拉伸',kind:'stretch',hint:'扶稳椅背，轻柔拉伸一侧大腿前方，30 秒后换腿。',cues:['扶稳椅背，缓慢弯曲一侧膝盖','仅到轻微牵拉感，不拉扯、不弹震','30 秒时换腿，正常呼吸'],link:'https://www.nhs.uk/live-well/exercise/strength-and-flex-exercise-plan-how-to-videos/'},
    chest:{label:'胸部轻柔拉伸',kind:'chest',hint:'站直，双手在身后轻握，缓慢打开胸口。',cues:['双脚站稳，肩膀自然下沉','双手在背后轻握，手臂向后下方伸','只到轻微牵拉感，别抬下巴或憋气'],link:NHS}
  };
  const make=(key,sec,stage)=>({key,sec,stage});
  function build(mode){
    if(mode==='easy')return [make('walk',60,'热身'),make('step',60,'热身'),...Array.from({length:2},()=>['fast','step','side','jack'].flatMap(k=>[make(k,40,'轻松有氧'),make('walk',20,'慢走恢复')])).flat(),make('walk',60,'放松'),make('legstretch',60,'放松'),make('chest',60,'放松')];
    const segments=[make('walk',60,'热身'),make('step',60,'热身'),make('shoulder',60,'热身')];
    for(let round=1;round<=(mode==='long'?3:2);round++){
      for(const key of ['fast','side','step','jack','knee'])segments.push(make(key,40,`有氧 ${round}`),make('walk',20,'慢走恢复'));
    }
    for(const key of ['squat','push','lunge','calf','squat','push'])segments.push(make(key,40,'力量'),make('walk',20,'休息'));
    segments.push(make('walk',60,'放松'),make('legstretch',60,'放松'),make('chest',60,'放松'));
    return segments;
  }
  const $=s=>document.querySelector(s);
  let mode='standard',segments=build(mode),index=0,remaining=segments[0].sec*1000,running=false,deadline=0,ticker=null,done=false,wake=null,audio=null,demoPaused=false,halfCuePlayed=false;
  const duration=()=>segments.reduce((n,s)=>n+s.sec,0);
  const format=ms=>{const secs=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`};
  function elapsed(){return segments.slice(0,index).reduce((n,s)=>n+s.sec,0)*1000+(index<segments.length?segments[index].sec*1000-remaining:0)}
  function upcoming(){for(let j=index+1;j<segments.length;j++)if(segments[j].stage!=='休息'&&segments[j].stage!=='慢走恢复')return exercise[segments[j].key].label;return '完成训练'}
  function beep(freq=690,dur=.12){if(!$('#sound').checked)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume();const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type='sine';oscillator.frequency.value=freq;gain.gain.setValueAtTime(.065,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+dur);oscillator.connect(gain).connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+dur)}catch{}}
  function speak(phrase){if(!$('#voice').checked||!('speechSynthesis'in window))return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(phrase);u.lang='zh-CN';u.rate=1.07;speechSynthesis.speak(u)}catch{}}
  function announce(){const s=segments[index];beep(s.stage==='休息'||s.stage==='慢走恢复'?520:760);speak(s.stage==='休息'?'休息，慢走二十秒':s.stage==='慢走恢复'?'慢走恢复，二十秒':exercise[s.key].label)}
  function render(){
    if(done){$('#phase').textContent='完成';$('#position').textContent=`${segments.length} / ${segments.length}`;$('#exercise').textContent='今天训练完成';$('#hint').textContent='慢慢调整呼吸，喝水休息。';$('#clock').textContent='0:00';$('#totalRemaining').textContent='全程完成';$('#next').textContent='—';$('#progress').style.width='100%';$('#start').textContent='再练一次';$('#start').disabled=false;$('#notice').textContent='训练完成。今天做得够了。';return}
    const s=segments[index],e=exercise[s.key];$('#phase').textContent=s.stage;$('#position').textContent=`${String(index+1).padStart(2,'0')} / ${segments.length}`;$('#exercise').textContent=e.label;$('#hint').textContent=e.hint;$('#clock').textContent=format(remaining);$('#totalRemaining').textContent=`全程还剩 ${format(duration()*1000-elapsed())}`;$('#progress').style.width=`${Math.min(100,elapsed()/(duration()*1000)*100)}%`;$('#next').textContent=upcoming();$('#guideTitle').textContent=`${e.label} · 动作要点`;$('#cues').replaceChildren(...e.cues.map(c=>{const li=document.createElement('li');li.textContent=c;return li}));$('#reference').href=e.link;$('#demo').setAttribute('aria-label',`${e.label}动作演示`);renderDemo(s.key);$('#start').textContent=running?'Ⅱ 暂停':'▶ '+(index===0&&remaining===s.sec*1000?'开始跟练':'继续跟练');
  }
  function setNotice(s){$('#notice').textContent=s}
  async function acquireWake(){try{if('wakeLock'in navigator)wake=await navigator.wakeLock.request('screen')}catch{setNotice('无法保持屏幕常亮；请在设备设置里延长锁屏时间。')}}
  function releaseWake(){try{wake?.release()}catch{}wake=null}
  function pause(background=false){if(!running)return;remaining=Math.max(0,deadline-performance.now());running=false;clearInterval(ticker);ticker=null;releaseWake();if('speechSynthesis'in window)speechSynthesis.cancel();render();setNotice(background?'页面切换后已自动暂停，回来点继续即可。':'已暂停，准备好后继续。')}
  function finish(){running=false;done=true;remaining=0;clearInterval(ticker);ticker=null;releaseWake();render();beep(920,.32);speak('今天训练完成')}
  function advance(keepRunning=running){if(index+1>=segments.length){finish();return}index++;remaining=segments[index].sec*1000;halfCuePlayed=false;if(keepRunning){deadline=performance.now()+remaining;announce()}render()}
  function tick(){if(!running)return;const previous=Math.ceil(remaining/1000);remaining=Math.max(0,deadline-performance.now());const current=Math.ceil(remaining/1000),key=segments[index].key,half=key==='lunge'?20:key==='legstretch'?30:0;if(half&&!halfCuePlayed&&previous>half&&current<=half){halfCuePlayed=true;beep(800,.18);speak('换腿')}if(current<previous&&current<=3&&current>=1)beep(600,.07);if(remaining<=0)advance();else{ $('#clock').textContent=format(remaining);$('#totalRemaining').textContent=`全程还剩 ${format(duration()*1000-elapsed())}`;$('#progress').style.width=`${Math.min(100,elapsed()/(duration()*1000)*100)}%`}}
  function start(){if(done)reset();running=true;deadline=performance.now()+remaining;acquireWake();announce();ticker=setInterval(tick,100);render();setNotice('先看完整动作与要点，再按自己的舒服幅度跟练。')}
  function reset(){pause();done=false;index=0;remaining=segments[0].sec*1000;halfCuePlayed=false;render();setNotice('准备好了就开始，自动切换动作和语音提示。')}
  function selectMode(value){pause();mode=value;segments=build(mode);document.querySelectorAll('.mode').forEach(b=>{const chosen=b.dataset.mode===value;b.classList.toggle('active',chosen);b.setAttribute('aria-pressed',String(chosen))});reset();$('#routineCount').textContent=`${segments.length} 段`;$('#routineList').replaceChildren(...segments.map(s=>{const li=document.createElement('li');li.textContent=exercise[s.key].label;const small=document.createElement('small');small.textContent=`${s.stage} · ${s.sec}秒`;li.append(small);return li}));const desc=value==='easy'?'热身 2 分钟 · 低冲击有氧 8 分钟 · 放松 3 分钟。':`热身 3 分钟 · 低冲击有氧 ${value==='long'?15:10} 分钟 · 力量 6 分钟 · 放松 3 分钟。`;document.querySelector('footer').firstChild.textContent=desc+'强度以微喘、仍能说话为宜。';render()}
  $('#start').onclick=()=>running?pause():start();$('#skip').onclick=()=>{if(done)return;advance();if(!running&&!done)setNotice('已跳过，点继续跟练。')};$('#reset').onclick=reset;document.querySelectorAll('.mode').forEach(b=>b.onclick=()=>selectMode(b.dataset.mode));$('#demoPause').onclick=()=>{demoPaused=!demoPaused;$('#demo').classList.toggle('paused',demoPaused);$('#demoPause').textContent=demoPaused?'▶':'Ⅱ';$('#demoPause').setAttribute('aria-label',demoPaused?'播放动作示意':'暂停动作示意')};document.addEventListener('visibilitychange',()=>{if(document.hidden)pause(true)});

  // The CDC motion studies show complete bodies; cardio diagrams use four fixed, labelled poses.
  const cdcNames={squat:'Squat',push:'Wallpushup',lunge:'Lunge',calf:'Toe stand',legstretch:'Quad stretch',chest:'Chest stretch'};
  const cdcPaths={squat:'a/a9',push:'7/7a',lunge:'a/af',calf:'1/10',legstretch:'8/81',chest:'4/41'};
  const motion={
    walk:{note:'左膝抬起 → 双脚落地 → 右膝抬起',steps:['左脚抬起','双脚落地','右脚抬起','双脚落地']},
    fast:{note:'交替抬脚，手臂自然反向摆动；加快步频',steps:['左脚抬起','双脚落地','右脚抬起','双脚落地']},
    step:{note:'左脚向侧迈 → 并脚 → 右脚向侧迈 → 并脚',steps:['向左迈步','并脚站稳','向右迈步','并脚站稳']},
    side:{note:'左脚侧点 → 收回 → 右脚侧点；支撑膝微屈',steps:['左脚侧点','收回站稳','右脚侧点','收回站稳']},
    knee:{note:'左膝抬起 → 落地 → 右膝抬起 → 落地',steps:['左膝抬起','双脚落地','右膝抬起','双脚落地']},
    jack:{note:'左脚侧点并抬臂 → 收回 → 换右脚；始终不跳',steps:['左脚侧点','收脚落臂','右脚侧点','收脚落臂']},
    shoulder:{note:'原地轻踏步，肩膀缓慢绕环；前后各 5 次',steps:['左脚抬起','双脚落地','右脚抬起','双脚落地']}
  };
  const cdcNotes={
    squat:'椅子置于身后 · 向后坐 · 慢慢站起',push:'双手撑墙 · 屈肘靠近 · 推回',
    lunge:'扶稳支撑 · 向前跨步屈膝 · 站起收回 · 20 秒换腿',calf:'扶稳椅背 · 提起双脚跟 · 慢慢落下',
    legstretch:'扶稳椅背 · 只到轻微牵拉 · 30 秒换腿',chest:'站直 · 双手在背后轻握 · 慢慢呼吸'
  };
  const C={left:'#5ed9ca',right:'#dff2f0',body:'#dff2f0'};
  // Coordinates are shared across all poses: the trunk never changes length and the planted foot stays on the floor.
  function fullBody(key,frame){
    const left=frame===0,right=frame===2,active=left||right,side=left?'left':'right';
    let lf=[144,202,144,248],rf=[176,202,176,248];
    let la=[113,119,114,149],ra=[207,119,206,149];
    if(['walk','fast','shoulder','knee'].includes(key)&&active){
      if(left){lf=key==='knee'?[117,169,144,187]:[125,185,145,207];la=[105,103,112,92];ra=[215,120,208,153]}
      else{rf=key==='knee'?[203,169,176,187]:[195,185,175,207];ra=[215,103,208,92];la=[105,120,112,153]}
    }
    if(key==='step'&&active){
      if(left){lf=[115,210,95,248];la=[111,119,104,150]}
      else{rf=[205,210,225,248];ra=[209,119,216,150]}
    }
    if(key==='side'&&active){
      if(left)lf=[112,210,87,248];else rf=[208,210,233,248];
    }
    if(key==='jack'&&active){
      if(left)lf=[114,210,87,248];else rf=[206,210,233,248];
      la=[111,57,96,27];ra=[209,57,224,27];
    }
    const limb=(start,joint,end,color)=>`<polyline points="${start[0]},${start[1]} ${joint[0]},${joint[1]} ${end[0]},${end[1]}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`;
    const foot=(x,y,color)=>`<path d="M${x-7} ${y}h21" stroke="${color}" stroke-width="9" stroke-linecap="round"/>`;
    const armL=limb([141,83],[la[0],la[1]],[la[2],la[3]],C.left),armR=limb([179,83],[ra[0],ra[1]],[ra[2],ra[3]],C.right);
    const legL=limb([150,148],[lf[0],lf[1]],[lf[2],lf[3]],C.left),legR=limb([170,148],[rf[0],rf[1]],[rf[2],rf[3]],C.right);
    const action=active?`<circle cx="${side==='left'?lf[2]:rf[2]}" cy="${side==='left'?lf[3]:rf[3]}" r="19" fill="none" stroke="#f5b96f" stroke-width="2" stroke-dasharray="4 5"/>`:'';
    return `<svg viewBox="0 0 320 280" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M55 258H265" stroke="#52808a" stroke-width="2"/>${legL}${legR}${foot(lf[2],lf[3],C.left)}${foot(rf[2],rf[3],C.right)}<path d="M160 70v78" stroke="${C.body}" stroke-width="24" stroke-linecap="round"/>${armL}${armR}<circle cx="160" cy="39" r="22" fill="${C.body}"/><circle cx="153" cy="37" r="2.5" fill="#173440"/><circle cx="168" cy="37" r="2.5" fill="#173440"/>${action}</svg>`;
  }
  let renderedKey='';
  function renderDemo(key){
    if(renderedKey===key)return;
    renderedKey=key;
    const root=$('#demo'),name=cdcNames[key];
    root.className='demo-visual'+(demoPaused?' paused':'');
    $('#demoPause').hidden=Boolean(name);
    if(name){
      const filename=`${name}-CDC_strength_training_for_older_adults.gif`.replaceAll(' ','_');
      root.innerHTML=`<div class="real-motion"><img src="https://upload.wikimedia.org/wikipedia/commons/${cdcPaths[key]}/${filename}" alt="${exercise[key].label}完整动作循环示范" referrerpolicy="no-referrer"><div class="demo-fallback">动图未载入。请打开下方动作说明，并按三条要点慢慢练习。</div></div><div class="motion-text">${cdcNotes[key]}</div>`;
      root.querySelector('img').addEventListener('error',()=>root.classList.add('asset-error'));
      $('#demoLabel').textContent='CDC 完整动作动图';
    }else{
      const data=motion[key]||motion.walk;
      root.innerHTML=`<div class="motion-frames">${data.steps.map((s,i)=>`<div class="motion-frame frame-${i+1}">${fullBody(key,i)}<span>${i+1} / 4 · ${s}</span></div>`).join('')}</div><div class="motion-text">${data.note}</div>`;
      $('#demoLabel').textContent='全身分步示意 · 左右以画面为准';
    }
  }
  selectMode('standard');
})();
