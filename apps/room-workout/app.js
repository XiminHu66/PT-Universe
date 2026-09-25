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
    const s=segments[index],e=exercise[s.key];$('#phase').textContent=s.stage;$('#position').textContent=`${String(index+1).padStart(2,'0')} / ${segments.length}`;$('#exercise').textContent=e.label;$('#hint').textContent=e.hint;$('#clock').textContent=format(remaining);$('#totalRemaining').textContent=`全程还剩 ${format(duration()*1000-elapsed())}`;$('#progress').style.width=`${Math.min(100,elapsed()/(duration()*1000)*100)}%`;$('#next').textContent=upcoming();$('#guideTitle').textContent=`${e.label} · 动作要点`;$('#cues').replaceChildren(...e.cues.map(c=>{const li=document.createElement('li');li.textContent=c;return li}));$('#reference').href=e.link;$('#demo').setAttribute('aria-label',`${e.label}循环动作示意图`);renderDemo(s.key);$('#start').textContent=running?'Ⅱ 暂停':'▶ '+(index===0&&remaining===s.sec*1000?'开始跟练':'继续跟练');
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
  $('#start').onclick=()=>running?pause():start();$('#skip').onclick=()=>{if(done)return;advance();if(!running&&!done)setNotice('已跳过，点继续跟练。')};$('#reset').onclick=reset;document.querySelectorAll('.mode').forEach(b=>b.onclick=()=>selectMode(b.dataset.mode));$('#demoPause').onclick=()=>{demoPaused=!demoPaused;$('#demo').classList.toggle('paused',demoPaused);$('#demoPause').textContent=demoPaused?'▶':'Ⅱ';$('#demoPause').setAttribute('aria-label',demoPaused?'播放动作示意':'暂停动作示意')};document.addEventListener('visibilitychange',()=>{if(document.hidden)pause(true)});

  // Licensed illustrated frames for strength moves; directional diagrams for compact cardio.
  const artwork={
    squat:{slug:'bodyweight-squat',order:[3,2,1],note:'站稳 → 向后坐 → 起身；只蹲到舒服的深度'},
    push:{slug:'wall-push-up',order:[1,2,3],note:'双手撑墙 → 屈肘靠近 → 推回；身体保持直线'},
    lunge:{slug:'forward-lunge',order:[3,2,1],note:'前后分腿 → 缓慢屈膝 → 站直；可扶墙'},
    shoulder:{slug:'arm-circles',order:[2,1,3],note:'小幅绕肩，别甩手；动作保持轻柔'},
    legstretch:{slug:'standing-quad-stretch',order:[3,2,1],note:'图示为大腿前侧；本段也轻柔拉伸腿后侧和小腿'}
  };
  const feet='<svg viewBox="0 0 60 120" aria-hidden="true"><path d="M19 44C15 58 13 70 15 83c2 13 7 24 18 25 12 1 17-11 17-23 0-9-5-23-8-38-2-10-4-17-12-17-6 0-9 5-11 14Z"/><circle cx="12" cy="26" r="5"/><circle cx="21" cy="17" r="6"/><circle cx="32" cy="13" r="6"/><circle cx="43" cy="17" r="5"/><circle cx="51" cy="27" r="4"/></svg>';
  const fist='<svg viewBox="0 0 76 70" aria-hidden="true"><rect x="12" y="17" width="51" height="40" rx="15"/><path d="M17 30h43M27 19v14m12-14v14m11-14v14" fill="none" stroke="#0e3340" stroke-width="3"/></svg>';
  const designs={
    walk:{title:'左右交替踏步',caption:'左脚抬起 → 落地 → 右脚抬起',kind:'feet'},
    fast:{title:'轻快交替 · 不跺脚',caption:'左脚 → 右脚，手臂自然反向摆动',kind:'feet'},
    step:{title:'横向迈步、并脚',caption:'向左一步 → 并脚 → 向右一步',kind:'side'},
    jack:{title:'单脚侧点 · 无跳跃',caption:'右脚侧点 → 收回 → 左脚侧点',kind:'jack'},
    box:{title:'直拳交替 · 肩膀放松',caption:'左拳伸出 → 收回 → 右拳伸出',kind:'boxing'},
    quickbox:{title:'直拳交替 · 稍加快',caption:'左拳 → 回位 → 右拳；脚小幅踏步',kind:'boxing'},
    calf:{title:'脚跟缓慢抬起',caption:'脚掌踩稳 → 双脚跟抬起 → 控制落下',kind:'heels'},
    chest:{title:'胸肩轻柔打开',caption:'手臂自然向外打开，缓慢呼吸',kind:'open'}
  };
  let renderedKey='';
  function renderDemo(key){
    if(renderedKey===key)return;
    renderedKey=key;
    const root=$('#demo'),illustration=artwork[key];
    root.className='demo-visual'+(demoPaused?' paused':'');
    if(illustration){
      root.innerHTML=`<div class="pose-cycle">${illustration.order.map((number,i)=>`<img class="pose pose-${i+1}" src="./art/${illustration.slug}/frame-${number}.svg" alt="" draggable="false">`).join('')}</div><div class="motion-text">${illustration.note}</div>`;
      $('#demoLabel').textContent='真人比例线稿 · 动作分帧';
      return;
    }
    const d=designs[key]||designs.walk;
    const graphic=d.kind==='boxing'
      ? `<div class="fist-pair"><span class="fist left">${fist}<b>左拳</b></span><span class="centerline">前方 <i>→</i></span><span class="fist right">${fist}<b>右拳</b></span></div>`
      : d.kind==='open'
      ? '<div class="open-arms"><span>↖</span><b>胸口打开</b><span>↗</span></div>'
      : `<div class="foot-pair"><span class="foot left">${feet}<b>左脚</b></span><span class="track-line"></span><span class="foot right">${feet}<b>右脚</b></span></div>`;
    root.innerHTML=`<div class="motion-guide ${d.kind}"><strong class="motion-heading">${d.title}</strong>${graphic}<div class="motion-text">${d.caption}</div></div>`;
    $('#demoLabel').textContent='动作方向 · 循环演示';
  }
  selectMode('standard');
})();
