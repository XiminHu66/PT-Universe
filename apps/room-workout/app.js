(() => {
  'use strict';
  const FAME='https://fameexercise.com/fame-exercise-videos/';
  const media=name=>`https://fameexercise.com/wp-content/uploads/${name}.mp4`;
  const TRAINATION='https://www.traination.fit/exercises/';
  const DAREBEE='https://darebee.com/exercises/';
  const exercise={
    walk:{label:'原地慢走',clip:'Fast-Marching',pace:.72,source:FAME,hint:'轻缓踏步，手臂自然摆动。',cues:['站直，肩颈放松','左右交替踏步，脚掌轻落地','视频速度只是参考，以舒服的步频呼吸']},
    fast:{label:'原地快走',clip:'Fast-Marching',pace:1,source:FAME,hint:'加快踏步和自然摆臂，保持低冲击。',cues:['抬脚后轻轻落地，不跺脚','手臂自然反向摆动，不耸肩','保持微喘但仍能说话的速度']},
    step:{label:'左右并步 Step Touch',youtube:'wH9hsR7Ck_M',source:'https://www.fitmetrics.ch/en/exercise/68f3fc65b486c-step-touch/videos',hint:'向侧边迈一步，另一脚并拢轻点；再换方向。',cues:['向左迈一步，右脚并拢轻点','向右重复，膝盖自然微屈','步幅小些，不交叉脚，也不用跳']},
    box:{label:'影子拳击',youtube:'zT31Xii_LYg',source:DAREBEE+'punches.html',hint:'原地站稳，交替轻打直拳，拳头收回护脸。',cues:['两脚前后自然错开，膝盖微屈','一手向前轻打直拳，立即收回；再换手','出拳时呼气，不锁死手肘，不要用力甩肩']},
    boxFast:{label:'快节奏影子拳击',youtube:'zT31Xii_LYg',source:DAREBEE+'punches.html',hint:'保持同样的直拳动作，稍加快频率。',cues:['先保持稳定站姿，再逐渐加快','左右直拳交替，打出后及时收回','肩膀放松；动作变乱就放慢']},
    jack:{label:'低冲击开合步',youtube:'7LHP0d9wr5c',source:DAREBEE+'step-jacks.html',hint:'单脚向侧迈并抬臂，收回再换边；全程不跳。',cues:['一次只侧迈一只脚，另一脚踩稳','迈出时双臂抬到舒服高度，收脚时放下','落脚轻柔，全程没有双脚腾空']},
    shoulder:{label:'站姿扩胸活动',youtube:'MM5QXAV4P2c',source:DAREBEE+'chest-expansions.html',hint:'轻轻打开双臂，再回到身前。',cues:['双脚站稳，肩膀自然下沉','双臂向两侧缓慢打开，再轻轻回收','只活动到舒服范围，不憋气']},
    squat:{label:'徒手浅蹲',clip:'https://static.traination.fit/exercise-demo-videos/bodyweight-squat/video.mp4',pace:.78,source:TRAINATION+'bodyweight-squat',hint:'臀部向后坐一点，再踩地站起；不需要椅子。',cues:['双脚约与肩同宽，脚跟保持落地','髋部向后、膝盖顺脚尖方向慢慢弯曲','只下到能稳稳站起的深度，不必像视频一样蹲低']},
    push:{label:'墙壁俯卧撑',clip:'Wall-Push-Ups',pace:.86,source:FAME,hint:'双手撑稳固墙面，身体成一直线，缓慢靠近再推回。',cues:['双手略宽于肩，掌心放在墙上','屈肘时头、躯干与腿尽量成直线','推回时呼气；脚距墙近些更轻松']},
    lunge:{label:'后撤小弓步',clip:'https://static.traination.fit/exercise-demo-videos/reverse-lunge/video.mp4',pace:.78,source:TRAINATION+'reverse-lunge',hint:'一脚小步后撤，浅浅屈膝，再踩稳站回。',cues:['站在墙边，需要平衡时可轻触墙面','一脚向后迈小步，身体直立，两膝微屈','踩稳前脚站回；左右交替，后膝不需贴地']},
    calf:{label:'站姿提踵',youtube:'0sYtV54WZpc',source:DAREBEE+'calf-raises.html',hint:'双脚跟缓慢抬起，再控制着落下。',cues:['双脚约与髋同宽，站在墙边以备扶稳','双脚跟缓慢离地，身体向上延伸','控制脚跟落下，不弹震、不站在台阶边']}
  };
  const make=(key,sec,stage)=>({key,sec,stage});
  function build(mode){
    if(mode==='easy')return [make('walk',60,'热身'),make('step',60,'热身'),...Array.from({length:2},()=>['fast','step','box','jack'].flatMap(k=>[make(k,40,'轻松有氧'),make('walk',20,'慢走恢复')])).flat(),make('walk',60,'整理活动'),make('shoulder',60,'整理活动'),make('walk',60,'整理活动')];
    const segments=[make('walk',60,'热身'),make('step',60,'热身'),make('shoulder',60,'热身')];
    for(let round=1;round<=(mode==='long'?3:2);round++){
      for(const key of ['fast','box','step','jack','boxFast'])segments.push(make(key,40,`有氧 ${round}`),make('walk',20,'慢走恢复'));
    }
    for(const key of ['squat','push','lunge','calf','squat','push'])segments.push(make(key,40,'力量'),make('walk',20,'休息'));
    segments.push(make('walk',60,'整理活动'),make('shoulder',60,'整理活动'),make('walk',60,'整理活动'));
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
    const s=segments[index],e=exercise[s.key];$('#phase').textContent=s.stage;$('#position').textContent=`${String(index+1).padStart(2,'0')} / ${segments.length}`;$('#exercise').textContent=e.label;$('#hint').textContent=e.hint;$('#clock').textContent=format(remaining);$('#totalRemaining').textContent=`全程还剩 ${format(duration()*1000-elapsed())}`;$('#progress').style.width=`${Math.min(100,elapsed()/(duration()*1000)*100)}%`;$('#next').textContent=upcoming();$('#guideTitle').textContent=`${e.label} · 动作要点`;$('#cues').replaceChildren(...e.cues.map(c=>{const li=document.createElement('li');li.textContent=c;return li}));$('#reference').href=e.source;$('#demo').setAttribute('aria-label',`${e.label}真人动作视频`);renderDemo(s.key);$('#start').textContent=running?'Ⅱ 暂停':'▶ '+(index===0&&remaining===s.sec*1000?'开始跟练':'继续跟练');
  }
  function setNotice(s){$('#notice').textContent=s}
  async function acquireWake(){try{if('wakeLock'in navigator)wake=await navigator.wakeLock.request('screen')}catch{setNotice('无法保持屏幕常亮；请在设备设置里延长锁屏时间。')}}
  function releaseWake(){try{wake?.release()}catch{}wake=null}
  function pause(background=false){if(!running)return;remaining=Math.max(0,deadline-performance.now());running=false;clearInterval(ticker);ticker=null;releaseWake();if('speechSynthesis'in window)speechSynthesis.cancel();render();setNotice(background?'页面切换后已自动暂停，回来点继续即可。':'已暂停，准备好后继续。')}
  function finish(){running=false;done=true;remaining=0;clearInterval(ticker);ticker=null;releaseWake();render();beep(920,.32);speak('今天训练完成')}
  function advance(keepRunning=running){if(index+1>=segments.length){finish();return}index++;remaining=segments[index].sec*1000;halfCuePlayed=false;if(keepRunning){deadline=performance.now()+remaining;announce()}render()}
  function tick(){if(!running)return;const previous=Math.ceil(remaining/1000);remaining=Math.max(0,deadline-performance.now());const current=Math.ceil(remaining/1000);if(current<previous&&current<=3&&current>=1)beep(600,.07);if(remaining<=0)advance();else{ $('#clock').textContent=format(remaining);$('#totalRemaining').textContent=`全程还剩 ${format(duration()*1000-elapsed())}`;$('#progress').style.width=`${Math.min(100,elapsed()/(duration()*1000)*100)}%`}}
  function start(){if(done)reset();running=true;deadline=performance.now()+remaining;acquireWake();announce();ticker=setInterval(tick,100);render();setNotice('先看完整动作与要点，再按自己的舒服幅度跟练。')}
  function reset(){pause();done=false;index=0;remaining=segments[0].sec*1000;halfCuePlayed=false;render();setNotice('准备好了就开始，自动切换动作和语音提示。')}
  function selectMode(value){
    pause();mode=value;segments=build(mode);
    document.querySelectorAll('.mode').forEach(b=>{const chosen=b.dataset.mode===value;b.classList.toggle('active',chosen);b.setAttribute('aria-pressed',String(chosen))});reset();
    $('#routineCount').textContent=`${segments.length} 段`;
    $('#routineList').replaceChildren(...segments.map(s=>{const li=document.createElement('li');li.textContent=exercise[s.key].label;const small=document.createElement('small');small.textContent=`${s.stage} · ${s.sec}秒`;li.append(small);return li}));
    const names=stage=>segments.filter(s=>stage(s.stage)).map(s=>exercise[s.key].label);
    const cardio=names(s=>s==='轻松有氧'||s==='有氧 1').slice(0,value==='easy'?4:5);
    const strength=names(s=>s==='力量');
    $('#menuSummary').textContent=`热身：${names(s=>s==='热身').join(' → ')}\n有氧（${value==='long'?3:2} 轮）：${cardio.join(' → ')}\n${strength.length?'力量：'+strength.join(' → ')+'\n':''}整理：${names(s=>s==='整理活动').join(' → ')}`;
    const desc=value==='easy'?'热身 2 分钟 · 低冲击有氧 8 分钟 · 整理活动 3 分钟。':`热身 3 分钟 · 低冲击有氧 ${value==='long'?15:10} 分钟 · 力量 6 分钟 · 整理活动 3 分钟。`;
    document.querySelector('footer').firstChild.textContent=desc+'强度以微喘、仍能说话为宜。';render();
  }
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
    const external=Boolean(e.youtube);
    $('#demoSpeed').hidden=external;$('#demoPause').hidden=external;$('#demoFullscreen').hidden=external;
    if(external){
      const frame=document.createElement('iframe');frame.title=`${e.label}动作视频`;frame.src=`https://www.youtube-nocookie.com/embed/${e.youtube}?autoplay=1&mute=1&loop=1&playlist=${e.youtube}&playsinline=1&rel=0`;frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';root.append(frame);
      const label=$('#demoLabel');label.textContent='视频黑屏或未播放？ ';
      const link=document.createElement('a');link.href=e.source;link.target='_blank';link.rel='noopener';link.textContent='打开原始示范 ↗';label.append(link);return;
    }
    const v=document.createElement('video');v.src=e.clip.startsWith('https://')?e.clip:media(e.clip);v.autoplay=true;v.muted=true;v.loop=true;v.playsInline=true;v.preload='metadata';v.setAttribute('aria-label',`${e.label}真人动作循环视频`);
    v.addEventListener('error',()=>root.classList.add('asset-error'));
    v.addEventListener('playing',()=>root.classList.remove('play-required'));
    root.append(v);
    const fallback=document.createElement('div');fallback.className='demo-fallback';fallback.innerHTML=`视频未能加载。<br><a href="${e.source}" target="_blank" rel="noopener">打开原始示范 ↗</a>`;root.append(fallback);
    $('#demoLabel').textContent='真人完整动作 · 循环播放';updatePlayback();
  }
  selectMode('standard');
})();
