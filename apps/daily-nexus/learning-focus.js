/* Link focus sessions to existing learning chapters without changing completion records. */
(()=>{
  const courseSelect=document.getElementById('focusCourse'),lessonSelect=document.getElementById('focusLesson'),status=document.getElementById('focusLearningStatus');
  let manifest=null,cache=new Map(),generation=0;
  function reading(){try{return JSON.parse(localStorage.getItem('pt-learning.v1')||'null')?.last}catch{return null}}
  async function getManifest(){if(!manifest){const r=await fetch('../self-learning/data/manifest.json');if(!r.ok)throw Error('课程列表暂不可用');manifest=await r.json();courseSelect.innerHTML=manifest.courses.map(c=>`<option value="${escapeAttr(c.id)}">${escapeHtml(c.title)}</option>`).join('')}return manifest}
  async function getCourse(id){await getManifest();const c=manifest.courses.find(c=>c.id===id);if(!c)throw Error('未找到课程');if(!cache.has(id)){const r=await fetch('../self-learning/data/'+c.file);if(!r.ok)throw Error('章节列表暂不可用');cache.set(id,await r.json())}return cache.get(id)}
  function setTarget(c,l){
    window.nexusLearningTask={courseId:c.id,lessonId:l.id,number:l.number,title:`${c.title} · ${String(l.number).padStart(2,'0')} ${l.title}`,value:`learning:${l.id}`};
    store.set('focusLearning',{courseId:c.id,number:l.number});renderFocusTasks();document.getElementById('focusTaskSelect').value=window.nexusLearningTask.value;document.getElementById('focusCustomTask').value='';updateStatus();
  }
  function updateStatus(){const target=window.nexusLearningTask;if(!target)return;const today=new Date().toDateString(),mins=(state.focus.logs||[]).filter(x=>x.learning?.lessonId===target.lessonId&&new Date(x.time).toDateString()===today).reduce((sum,x)=>sum+x.minutes,0);status.textContent=`${target.title} · 今日专注 ${mins} 分钟`}
  async function choose(courseId,number,{selectTask=true}={}){
    const ticket=++generation;status.textContent='载入章节…';
    try{const c=await getCourse(courseId);if(ticket!==generation)return;const l=c.lessons.find(l=>l.number===Number(number))||c.lessons[0];courseSelect.value=c.id;lessonSelect.innerHTML=c.lessons.map(l=>`<option value="${l.number}">${String(l.number).padStart(2,'0')} · ${escapeHtml(l.title)}</option>`).join('');lessonSelect.value=String(l.number);if(selectTask)setTarget(c,l);else{window.nexusLearningTask={courseId:c.id,lessonId:l.id,number:l.number,title:`${c.title} · ${String(l.number).padStart(2,'0')} ${l.title}`,value:`learning:${l.id}`};renderFocusTasks();updateStatus()}document.getElementById('focusOpenLesson').disabled=false}
    catch(e){if(ticket===generation)status.textContent=e.message}
  }
  courseSelect.onchange=()=>choose(courseSelect.value,1);lessonSelect.onchange=()=>choose(courseSelect.value,+lessonSelect.value);
  document.getElementById('focusResumeLesson').onclick=async()=>{const last=reading();if(!last){status.textContent='还没有学习记录，请先选择课程和章节。';return}await choose(last.courseId,Number(last.lessonId.split('-').pop()))};
  document.getElementById('focusOpenLesson').onclick=()=>{
    const target=window.nexusLearningTask;if(!target)return;const hash=`#/course/${target.courseId}/${String(target.number).padStart(2,'0')}`,frame=document.getElementById('learningFrame');
    if(embeddedSiteState.learning)frame.contentWindow.location.hash=hash;else frame.dataset.src='../self-learning/?embedded=nexus&v=20261007-focus'+hash;
    switchNexusView('learning');
  };
  window.nexusSelectLearningTarget=async(courseId,number)=>{if(focusRunning){switchNexusView('focus');nexusNotify('当前专注仍在进行，请先完成或重置这一轮。');return}await choose(courseId,number);if(window.nexusLearningTask?.courseId!==courseId||window.nexusLearningTask?.number!==Number(number))return;switchNexusView('focus');setFocusMinutes(25);document.getElementById('focusToggle').click()};
  addEventListener('message',event=>{const frame=document.getElementById('learningFrame');if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!=='pt-learning-focus')return;const d=event.data;if(/^[a-z]+$/.test(d.courseId)&&Number.isInteger(d.number)&&d.number>0&&d.number<=100)window.nexusSelectLearningTarget(d.courseId,d.number)});
  addEventListener('nexus-view-change',event=>{if(event.detail.view==='focus')updateStatus()});
  document.getElementById('learningFocusBadge').onclick=()=>switchNexusView('focus');
  setInterval(()=>{const badge=document.getElementById('learningFocusBadge');badge.hidden=!focusRunning;badge.textContent=`专注中 · ${Math.floor(focusSecs/60)}:${String(focusSecs%60).padStart(2,'0')} · 返回计时`},1000);
  (async()=>{try{await getManifest();const last=reading(),saved=store.get('focusLearning',null),initial=new URL(location.href).searchParams;const course=initial.get('course')||saved?.courseId||last?.courseId||manifest.courses[0].id,number=Number(initial.get('lesson')||saved?.number||(last?.lessonId.split('-').pop())||1);await choose(course,number,{selectTask:!!initial.get('course')});if(initial.get('course')&&initial.get('tab')==='focus')switchNexusView('focus')}catch(e){status.textContent=e.message}})();
})();
