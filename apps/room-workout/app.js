(() => {
  'use strict';
  const FAME='https://fameexercise.com/fame-exercise-videos/';
  const media=name=>`https://fameexercise.com/wp-content/uploads/${name}.mp4`;
  const exercise={
    walk:{label:'原地踏步',clip:'Fast-Marching',pace:.76,hint:'站直，左右脚交替抬起，手臂自然摆动。',cues:['身体站直，肩颈放松','左右交替踏步，手臂自然反向摆动','轻轻落脚；可扶稳椅背减小幅度']},
    fast:{label:'原地快踏',clip:'Fast-Marching',pace:1,hint:'保持站直，按自己的节奏加快踏步。',cues:['脚轻轻落地，不用跺脚','手臂自然摆动，膝盖抬到舒服高度','呼吸变快但仍能说短句']},
    side:{label:'扶椅侧向移重心',clip:'Slow-weight-shift-side-1',pace:1,hint:'在椅背旁慢慢向侧方移重心，再回到中间。',cues:['把稳固椅子放在前方，双手轻扶椅背','缓慢向一侧转移体重，再回到中央','始终保持支撑脚稳固；按视频换边']},
    shift:{label:'交替小步移重心',clip:'Quick-Weight-Shift',pace:.85,hint:'交替迈出小步，把重心平稳移到踩实的脚。',cues:['步幅小，脚掌踩稳再移重心','膝盖保持柔软，躯干保持直立','先做慢些，确认平衡后再跟上节奏']},
    low:{label:'屈膝小步快踏',clip:'Fast-Low-Steps',pace:.8,hint:'稍稍屈膝、髋部后移，连续做轻快小步。',cues:['脚与髋同宽，轻微屈膝','髋部稍向后，上身从髋部前倾','幅度以膝盖舒适为准，不必追上视频速度']},
    squat:{label:'椅子坐站',clip:'Sit-to-Stand',pace:.86,hint:'坐到稳固椅子上，再慢慢站起。',cues:['选不滑动的稳固椅子，脚踩实地面','臀部向后，慢慢坐下；再踩地站起','膝盖顺着脚尖方向，必要时扶稳椅子']},
    push:{label:'墙壁俯卧撑',clip:'Wall-Push-Ups',pace:.86,hint:'双手撑墙，身体成一直线，慢慢靠近再推回。',cues:['双手略宽于肩，放在稳固墙面','屈肘靠近时，头、躯干和腿尽量成直线','推回时呼气；脚距墙近些可降低强度']},
    calf:{label:'扶椅踮脚',clip:'Toe-Raises',pace:.9,hint:'扶稳椅背，双脚跟缓慢抬起再放下。',cues:['双脚约与髋同宽，轻扶稳固椅背','脚跟缓慢离地，身体向上延伸','控制脚跟落下，不弹震']},
    ankle:{label:'扶椅活动脚踝',clip:'Ankle-Rotations',pace:.84,hint:'扶稳椅背，抬起一只脚，轻轻绕动脚踝。',cues:['先扶稳椅背，身体保持直立','脚尖在空中缓慢画小圈','中途换另一只脚；幅度舒适即可']},
    seated:{label:'坐姿轻踏步',clip:'Slow-Marching-with-High-Knees',pace:.8,hint:'坐在稳固椅子上，左右交替轻抬膝。',cues:['坐稳，背部自然挺直，双脚落地','左右交替轻抬膝，缓慢落脚','用轻松速度整理呼吸']}
  };
  const make=(key,sec,stage)=>({key,sec,stage});
  function build(mode){
    if(mode==='easy')return [make('walk',60,'热身'),make('side',60,'热身'),...Array.from({length:2},()=>['fast','side','shift','fast'].flatMap(k=>[make(k,40,'轻松有氧'),make('walk',20,'慢走恢复')])).flat(),make('walk',60,'整理活动'),make('ankle',60,'整理活动'),make('seated',60,'整理活动')];
    const segments=[make('walk',60,'热身'),make('side',60,'热身'),make('ankle',60,'热身')];
    for(let round=1;round<=(mode==='long'?3:2);round++){
      for(const key of ['fast','low','side','shift','fast'])segments.push(make(key,40,`有氧 ${round}`),make('walk',20,'慢走恢复'));
    }
    for(const key of ['squat','push','calf','squat','push','calf'])segments.push(make(key,40,'力量'),make('walk',20,'休息'));
    segments.push(make('walk',60,'整理活动'),make('ankle',60,'整理活动'),make('seated',60,'整理活动'));
    return segments;
  }
  const $=s=>document.querySelector(s);
  let mode='standard',segments=build(mode),index=0,remaining=segments[0].sec*1000,running=false,deadline=0,ticker=null,done=false,wake=null,audio=null,demoPaused=false,slowVideo=false,halfCuePlayed=false;
  const duration=()=>segments.reduce((n,s)=>n+s.sec,0);
  const format=ms=>{const secs=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`};
  function elapsed(){return segments.slice(0,index).reduce((n,s)=>n+s.sec,0)*1000+(index<segments.length?segments[index].sec*1000-remaining:0)}
  function upcoming(){for(let j=index+1;j<segments.length;j++)if(segments[j].stage!=='休息'&&segments[j].stage!=='慢走恢复')return exercise[segments[j].key].label;return '完成训练'}
  function beep(freq=690,dur=.12){if(!$('#sound').checked)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume();const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type='sine';oscillator.frequency.value=freq;gain.gain.setValueAtTime(.065,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+dur);oscillator.connect(gain).connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+dur)}catch{}}
  function speak(phrase){if(!$('#voice').checked||!('speechSynthesis'in window))return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(phrase);u.lang='zh-CN';u.rate=1.07;speechSynthesis.speak(u)}catch{}}
  function announce(){const s=segments[index];beep(s.stage==='休息'||s.stage==='慢走恢复'?520:760);speak(s.stage==='休息'?'休息，原地慢踏二十秒':s.stage==='慢走恢复'?'原地慢踏恢复，二十秒':exercise[s.key].label)}
  function render(){
    if(done){$('#phase').textContent='完成';$('#position').textContent=`${segments.length} / ${segments.length}`;$('#exercise').textContent='今天训练完成';$('#hint').textContent='慢慢调整呼吸，喝水休息。';$('#clock').textContent='0:00';$('#totalRemaining').textContent='全程完成';$('#next').textContent='—';$('#progress').style.width='100%';$('#start').textContent='再练一次';$('#start').disabled=false;$('#notice').textContent='训练完成。今天做得够了。';return}
    const s=segments[index],e=exercise[s.key];$('#phase').textContent=s.stage;$('#position').textContent=`${String(index+1).padStart(2,'0')} / ${segments.length}`;$('#exercise').textContent=e.label;$('#hint').textContent=e.hint;$('#clock').textContent=format(remaining);$('#totalRemaining').textContent=`全程还剩 ${format(duration()*1000-elapsed())}`;$('#progress').style.width=`${Math.min(100,elapsed()/(duration()*1000)*100)}%`;$('#next').textContent=upcoming();$('#guideTitle').textContent=`${e.label} · 动作要点`;$('#cues').replaceChildren(...e.cues.map(c=>{const li=document.createElement('li');li.textContent=c;return li}));$('#reference').href=FAME;$('#demo').setAttribute('aria-label',`${e.label}真人动作视频`);renderDemo(s.key);$('#start').textContent=running?'Ⅱ 暂停':'▶ '+(index===0&&remaining===s.sec*1000?'开始跟练':'继续跟练');
  }
  function setNotice(s){$('#notice').textContent=s}
  async function acquireWake(){try{if('wakeLock'in navigator)wake=await navigator.wakeLock.request('screen')}catch{setNotice('无法保持屏幕常亮；请在设备设置里延长锁屏时间。')}}
  function releaseWake(){try{wake?.release()}catch{}wake=null}
  function pause(background=false){if(!running)return;remaining=Math.max(0,deadline-performance.now());running=false;clearInterval(ticker);ticker=null;releaseWake();if('speechSynthesis'in window)speechSynthesis.cancel();render();setNotice(background?'页面切换后已自动暂停，回来点继续即可。':'已暂停，准备好后继续。')}
  function finish(){running=false;done=true;remaining=0;clearInterval(ticker);ticker=null;releaseWake();render();beep(920,.32);speak('今天训练完成')}
  function advance(keepRunning=running){if(index+1>=segments.length){finish();return}index++;remaining=segments[index].sec*1000;halfCuePlayed=false;if(keepRunning){deadline=performance.now()+remaining;announce()}render()}
  function tick(){if(!running)return;const previous=Math.ceil(remaining/1000);remaining=Math.max(0,deadline-performance.now());const current=Math.ceil(remaining/1000);if(segments[index].key==='ankle'&&!halfCuePlayed&&previous>30&&current<=30){halfCuePlayed=true;beep(800,.18);speak('换脚')}if(current<previous&&current<=3&&current>=1)beep(600,.07);if(remaining<=0)advance();else{ $('#clock').textContent=format(remaining);$('#totalRemaining').textContent=`全程还剩 ${format(duration()*1000-elapsed())}`;$('#progress').style.width=`${Math.min(100,elapsed()/(duration()*1000)*100)}%`}}
  function start(){if(done)reset();running=true;deadline=performance.now()+remaining;acquireWake();announce();ticker=setInterval(tick,100);render();setNotice('先看完整动作与要点，再按自己的舒服幅度跟练。')}
  function reset(){pause();done=false;index=0;remaining=segments[0].sec*1000;halfCuePlayed=false;render();setNotice('准备好了就开始，自动切换动作和语音提示。')}
  function selectMode(value){pause();mode=value;segments=build(mode);document.querySelectorAll('.mode').forEach(b=>{const chosen=b.dataset.mode===value;b.classList.toggle('active',chosen);b.setAttribute('aria-pressed',String(chosen))});reset();$('#routineCount').textContent=`${segments.length} 段`;$('#routineList').replaceChildren(...segments.map(s=>{const li=document.createElement('li');li.textContent=exercise[s.key].label;const small=document.createElement('small');small.textContent=`${s.stage} · ${s.sec}秒`;li.append(small);return li}));const desc=value==='easy'?'热身 2 分钟 · 低冲击有氧 8 分钟 · 整理活动 3 分钟。':`热身 3 分钟 · 低冲击有氧 ${value==='long'?15:10} 分钟 · 力量 6 分钟 · 整理活动 3 分钟。`;document.querySelector('footer').firstChild.textContent=desc+'强度以微喘、仍能说话为宜。';render()}
  $('#start').onclick=()=>running?pause():start();$('#skip').onclick=()=>{if(done)return;advance();if(!running&&!done)setNotice('已跳过，点继续跟练。')};$('#reset').onclick=reset;document.querySelectorAll('.mode').forEach(b=>b.onclick=()=>selectMode(b.dataset.mode));
  $('#demoPause').onclick=()=>{demoPaused=!demoPaused;updatePlayback()};$('#demoSpeed').onclick=()=>{slowVideo=!slowVideo;updatePlayback()};$('#demoFullscreen').onclick=()=>{const v=$('#demo video');if(v?.requestFullscreen)v.requestFullscreen().catch(()=>{});else if(v?.webkitEnterFullscreen)v.webkitEnterFullscreen()};document.addEventListener('visibilitychange',()=>{if(document.hidden)pause(true)});

  let renderedKey='';
  function updatePlayback(){
    const v=$('#demo video');if(!v)return;
    v.playbackRate=(exercise[renderedKey].pace||1)*(slowVideo?.75:1);
    $('#demoSpeed').textContent=slowVideo?'慢速 · 0.75×':'常速 · 1×';
    $('#demoSpeed').setAttribute('aria-pressed',String(slowVideo));
    $('#demoPause').textContent=demoPaused?'▶':'Ⅱ';
    $('#demoPause').setAttribute('aria-label',demoPaused?'播放动作视频':'暂停动作视频');
    if(demoPaused)v.pause();else v.play().catch(()=>{$('#demo').classList.add('play-required');$('#demoPause').textContent='▶';$('#demoPause').setAttribute('aria-label','播放动作视频')});
  }
  function renderDemo(key){
    if(renderedKey===key)return;
    renderedKey=key;const e=exercise[key],root=$('#demo');root.className='demo-visual';root.replaceChildren();
    const v=document.createElement('video');v.src=media(e.clip);v.autoplay=true;v.muted=true;v.loop=true;v.playsInline=true;v.preload='metadata';v.setAttribute('aria-label',`${e.label}真人动作循环视频`);
    v.addEventListener('error',()=>root.classList.add('asset-error'));
    v.addEventListener('playing',()=>root.classList.remove('play-required'));
    root.append(v);
    const fallback=document.createElement('div');fallback.className='demo-fallback';fallback.innerHTML=`视频未能加载。<br><a href="${FAME}" target="_blank" rel="noopener">打开原始示范 ↗</a>`;root.append(fallback);
    $('#demoLabel').textContent='真人完整动作 · 循环播放';updatePlayback();
  }
  selectMode('standard');
})();
