'use strict';

let presentationIndex = 0;
let tutorialRole = 'teacher';
let tutorialStep = 0;
const soundSettings = {music:false, effects:true};
let audioContext, musicTimer;

function setPageContext(page) {
  document.body.dataset.page = page;
}

function lessonState() {
  return room.lesson ||= {deadline:null,open:true,allowEdits:true};
}

function drawingSubmissionAllowed(state,id) {
  const lesson=state.lesson || {open:true,allowEdits:true};
  const own=Array.isArray(state.works)?state.works.find(w=>w.id===id):state.works[id];
  return !state.quiz && !own?.revealed && lesson.open && (!lesson.deadline || lesson.deadline>Date.now()) && (!own || lesson.allowEdits);
}

function drawingTimeText(lesson) {
  if (!lesson?.open) return '제출 마감';
  if (!lesson.deadline) return '자유 시간';
  const seconds=Math.max(0,Math.ceil((lesson.deadline-Date.now())/1000));
  return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
}

function lessonControls() {
  const lesson=lessonState();
  return '<details class="lesson-controls"><summary>그리기 시간 <strong data-lesson-clock>'+drawingTimeText(lesson)+'</strong><span class="status-pill" data-lesson-status>'+(lesson.open?'제출 중':'제출 마감')+'</span></summary><div class="lesson-options"><div class="row">'+[3,5,10].map(n=>btn('lesson-start-'+n,n+'분 시작')).join('')+btn('lesson-free','자유 시간')+'</div>'+btn(lesson.open?'lesson-close':'lesson-reopen',lesson.open?'그림 제출 마감하기':'그림 제출 다시 열기')+'<label><input id="allow-edits" type="checkbox" '+(lesson.allowEdits?'checked':'')+'> 수정한 그림도 다시 받기</label><p>퀴즈에 사용한 작품은 수정할 수 없어요. 타이머를 시작하면 제출도 다시 열려요.</p></div></details>';
}

function studentLessonStatus() {
  return '<div class="student-lesson"><strong data-lesson-clock>'+drawingTimeText(room.lesson)+'</strong><span data-lesson-status>'+(room.lesson?.open===false?'그림 제출이 마감되었어요.':'완성하면 전시회로 보내주세요.')+'</span></div>';
}

function updateLessonClock() {
  if (!room || !role) return;
  const lesson=room.lesson;
  if (role==='teacher' && lesson?.open && lesson.deadline && lesson.deadline<=Date.now()) {
    lesson.open=false; soundEffect(); broadcast();
  }
  document.querySelectorAll('[data-lesson-clock]').forEach(element=>element.textContent=drawingTimeText(lesson));
  document.querySelectorAll('[data-lesson-status]').forEach(element=>element.textContent=role==='teacher'?(lesson?.open===false?'제출 마감':'제출 중'):(lesson?.open===false?'그림 제출이 마감되었어요.':'완성하면 전시회로 보내주세요.'));
  if (role==='student' && $('#send')) $('#send').disabled=!drawingSubmissionAllowed(room,studentId);
}

function artworkCards(list,teacher=false) {
  if (!list.length) return '<section class="card"><p>아직 도착한 그림이 없어요.</p></section>';
  return '<div class="artwork-grid">'+list.map((w,i)=>{
    const hearts=teacher?Object.keys(room.hearts[w.id]||{}).length:w.hearts;
    const author=teacher?room.roster.find(p=>p.id===w.id)?.name:w.author;
    return '<article class="artwork-card"><button class="art-mat mat-'+i%3+'" data-act="work" data-i="'+i+'" aria-label="작품 '+(i+1)+' 크게 보기"><img src="'+escape(w.img)+'" alt="그림 작품"><span aria-hidden="true">↗</span></button><div class="artwork-caption"><div><strong>'+escape(w.revealed?w.answer:artwork(i))+'</strong><small>'+(w.revealed?escape(author)+'의 작품':'누구를 그렸을까요?')+'</small></div><button '+(!w.revealed||teacher?'disabled ':'')+'data-act="heart-'+i+'" aria-label="작품 '+(i+1)+' 하트 보내기" title="'+(w.revealed?'하트 보내기':'정답 공개 후 하트를 보낼 수 있어요')+'">'+(w.liked?'♥ ':'♡ ')+hearts+'</button></div></article>';
  }).join('')+'</div>';
}

function teacherRail(tabs) {
  return '<aside class="teacher-rail" aria-label="교사 메뉴"><button class="rail-mark" data-act="tab-float" aria-label="전시 공간">✦</button><nav>' +
    tabs.map(([id,label],i) => '<button data-act="tab-'+id+'" class="'+(view===id?'selected':'')+'" aria-current="'+(view===id?'page':'false')+'"><span aria-hidden="true">'+['◌','▧','♧','☆'][i]+'</span>'+label+'</button>').join('')+
    '</nav><div>'+btn('backup','수업 백업')+btn('go-home','처음으로')+'</div></aside>';
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function loadDrawingImage(source) {
  return new Promise((resolve,reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(Error('그림을 불러오지 못했어요.'));
    img.src = source;
  });
}

async function saveDrawing(index) {
  const list = role==='teacher' ? works() : room.works;
  const work = list[index];
  if (!work) return;
  try {
    const image = await loadDrawingImage(work.img);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fffdf7';
    ctx.fillRect(0,0,1024,1024);
    ctx.drawImage(image,0,0,1024,1024);
    canvas.toBlob(blob => { if (blob) downloadBlob(blob,'작품-'+String(index+1).padStart(2,'0')+'.png'); }, 'image/png');
  } catch (error) { show('<p>'+escape(error.message)+'</p>'); }
}

async function saveClassPoster() {
  const list = works();
  if (!list.length) return;
  try {
    const images = await Promise.all(list.map(w => loadDrawingImage(w.img)));
    const columns = Math.min(4, list.length);
    const cell = 360, margin = 30, heading = 100;
    const canvas = document.createElement('canvas');
    canvas.width = columns*cell + margin*2;
    canvas.height = Math.ceil(list.length/columns)*(cell+65)+heading+margin;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f7f5ed'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#243c36'; ctx.textAlign = 'center'; ctx.font = 'bold 30px sans-serif';
    ctx.fillText(room.title, canvas.width/2, 59, canvas.width-margin*2);
    images.forEach((image,i) => {
      const x = margin + (i%columns)*cell, y = heading + Math.floor(i/columns)*(cell+65);
      ctx.fillStyle = '#fffef9'; ctx.fillRect(x+8,y,cell-16,cell);
      ctx.drawImage(image,x+16,y+8,cell-32,cell-16);
      ctx.fillStyle = '#243c36'; ctx.font = '20px sans-serif';
      ctx.fillText(list[i].revealed ? list[i].answer : artwork(i),x+cell/2,y+cell+31,cell-20);
    });
    canvas.toBlob(blob => { if (blob) downloadBlob(blob,'우리-반-그림-전시회.png'); }, 'image/png');
  } catch (error) { show('<p>'+escape(error.message)+'</p>'); }
}

function openDrawingDownloads() {
  const list=works();
  show('<h2>그림을 PNG로 간직해요</h2><p>작품을 이미지로 저장해 인쇄하거나 함께 감상해요. 아직 공개하지 않은 작품의 이름과 그린 친구는 표시하지 않아요.</p><section class="export-option"><h3>우리 반 작품 모음</h3><p>작품 '+list.length+'점을 한 장의 포스터로 저장해요.</p>'+btn('save-poster','우리 반 포스터 PNG','primary')+'</section><section class="export-option"><h3>작품 한 장</h3><p>원하는 작품을 크게 저장해요.</p><label>저장할 작품<select id="export-choice">'+list.map((w,i)=>'<option value="'+i+'">'+String(i+1).padStart(2,'0')+' · '+escape(w.revealed?w.answer:artwork(i))+'</option>').join('')+'</select></label>'+btn('save-selected','선택 작품 PNG')+'</section><p class="export-note">공개 여부와 그림은 현재 상태 그대로 저장돼요.</p>');
  if(!list.length)body.querySelectorAll('button,select').forEach(el=>el.disabled=true);
}

function showPresentation(index) {
  const items = works();
  if (!items.length) { show('<h2>작품 발표</h2><p>학생의 그림이 도착하면 시작할 수 있어요.</p>'); return; }
  presentationIndex = Math.max(0,Math.min(index,items.length-1));
  const w = items[presentationIndex];
  const author = room.roster.find(p=>p.id===w.id)?.name;
  modal.classList.add('presentation-dialog');
  show('<div class="presentation"><h2>작품 크게 감상하기</h2><p class="eyebrow">OUR LITTLE GALLERY · '+escape(room.title)+'</p><img src="'+escape(w.img)+'" alt="발표할 그림 작품"><h3>'+escape(w.revealed?w.answer:artwork(presentationIndex))+'</h3>'+
    (w.revealed?'<p>'+escape(author)+'의 작품</p>':'<p>아직 비밀인 작품</p>')+
    '<div class="row"><button data-act="present-prev"'+(presentationIndex===0?' disabled':'')+'>← 이전 작품</button><span>'+(presentationIndex+1)+' / '+items.length+'</span><button data-act="present-next"'+(presentationIndex===items.length-1?' disabled':'')+'>다음 작품 →</button></div><div class="presentation-footer"><small>← → 작품 이동 · Esc 닫기</small>'+btn('save-work-'+presentationIndex,'이 작품 PNG')+'</div></div>');
}

const tutorial = {
  teacher:[
    ['명단과 주제','오늘의 전시회를 준비해요','학생 이름을 한 줄에 한 명씩 넣거나 엑셀 명렬표를 불러오세요. 친구 얼굴이나 자유 주제를 정하고 비밀 랜덤 배정·자유 선택을 고릅니다.'],
    ['QR로 초대','하나의 링크로 함께 시작해요','전시회를 만들면 QR과 방 코드가 나와요. 학생에게 공유하고, 수업이 끝날 때까지 교사 화면을 열어두세요.'],
    ['그림과 전시','아이들의 그림이 도착해요','학생이 보낸 작품은 전시 공간에 나타나요. 둥둥·우주 여행·그림 기차·회전목마를 바꿔 감상하세요.'],
    ['퀴즈 열기','누구를 그렸을까요?','오른쪽 퀴즈 작품 선택에서 그림을 고르고 객관식 퀴즈를 시작하세요. 학생은 작품 감상에서 답을 제출해요.'],
    ['공개와 다음 작품','정답을 함께 확인해요','응답을 확인하고 정답 공개를 누르세요. 점수 모으기에서는 정답자에게 점수가 더해져요. 다음 작품으로 계속할 수 있어요.'],
    ['그림과 수업 보관','오늘의 이야기를 간직해요','그림 저장으로 작품 이미지를 내려받고 수업 백업으로 명단과 그림을 보관하세요. 수업 보관함에서 다시 열 수 있어요.']
  ],
  student:[
    ['교실 입장','내 작업실에 들어가요','선생님이 공유한 QR이나 링크를 열고 내 이름을 골라요. 홈 화면에 방 코드를 넣어 입장할 수도 있어요.'],
    ['비밀 주제','무엇을 그릴지 확인해요','비밀 배정이면 나에게만 보이는 주제를 확인해요. 자유 선택이면 그리고 싶은 대상을 골라요.'],
    ['그림 그리기','나만의 그림을 그려요','색깔과 굵기를 고르고 손가락이나 마우스로 그리세요. 지우개, 되돌리기, 다시 실행을 사용할 수 있어요.'],
    ['전시회로 보내기','내 그림도 전시회에!','다 그렸다면 전시회로 그림 보내기를 눌러요. 퀴즈가 시작되기 전에는 수정해 보낼 수 있어요.'],
    ['퀴즈 참여','친구들의 그림을 맞혀요','작품 감상에서 퀴즈 그림을 보고 답을 골라요. 답은 한 번 제출하고 선생님의 정답 공개를 기다려요.'],
    ['작품 감상','마음을 담아 하트를 보내요','정답이 공개된 작품의 이름을 확인하고 마음에 드는 그림에 하트를 보내세요.']
  ]
};

function showTutorial() {
  const steps = tutorial[tutorialRole];
  const [label,title,description] = steps[tutorialStep];
  show('<h2>처음 만나는 그림 전시회</h2><div class="row">'+btn('tutorial-teacher','선생님',tutorialRole==='teacher'?'primary':'')+btn('tutorial-student','학생',tutorialRole==='student'?'primary':'')+'</div>'+ 
    '<div class="tutorial-layout"><nav aria-label="튜토리얼 단계">'+steps.map((s,i)=>'<button data-act="tutorial-step-'+i+'" class="'+(i===tutorialStep?'primary':'')+'">'+String(i+1).padStart(2,'0')+' '+s[0]+'</button>').join('')+'</nav><section><p class="eyebrow">STEP '+String(tutorialStep+1).padStart(2,'0')+'</p><h3>'+title+'</h3><p>'+description+'</p></section></div><div class="row tutorial-pages">'+
    '<button data-act="tutorial-prev"'+(tutorialStep===0?' disabled':'')+'>← 이전</button><span>'+(tutorialStep+1)+' / '+steps.length+'</span><button data-act="tutorial-next"'+(tutorialStep===steps.length-1?' disabled':'')+'>다음 →</button></div>');
}

function ensureAudio() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state==='suspended') audioContext.resume();
  return audioContext;
}

function playNote(frequency,duration,volume) {
  const ctx=ensureAudio(), oscillator=ctx.createOscillator(), gain=ctx.createGain();
  oscillator.type='sine'; oscillator.frequency.value=frequency;
  gain.gain.setValueAtTime(0,ctx.currentTime);
  gain.gain.linearRampToValueAtTime(volume,ctx.currentTime+.03);
  gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+duration);
  oscillator.connect(gain); gain.connect(ctx.destination);
  oscillator.start(); oscillator.stop(ctx.currentTime+duration);
}

function soundEffect() {
  if (!soundSettings.effects) return;
  try { playNote(659.25,.35,.05); } catch { /* Audio can be unavailable in restricted browsers. */ }
}

function setMusic(enabled) {
  soundSettings.music=enabled;
  clearInterval(musicTimer);
  if (!enabled) return;
  let step=0;
  const notes=[261.63,329.63,392,523.25,392,329.63,293.66,349.23];
  try {
    const play=()=>{if (!document.hidden) playNote(notes[step++%notes.length],1.8,.035);};
    play(); musicTimer=setInterval(play,1500);
  } catch { soundSettings.music=false; }
}

function openSoundSettings() {
  show('<h2>음악과 효과음 설정</h2><div class="audio-options"><label><input type="checkbox" id="music-on" '+(soundSettings.music?'checked':'')+'> 배경 음악</label><label><input type="checkbox" id="effects-on" '+(soundSettings.effects?'checked':'')+'> 효과음</label></div><p>수업 분위기에 맞게 소리를 켜거나 끌 수 있어요.</p>');
  $('#music-on').onchange=event=>setMusic(event.target.checked);
  $('#effects-on').onchange=event=>{soundSettings.effects=event.target.checked; soundEffect();};
}

async function handleExhibitionAction(action) {
  if (action.startsWith('lesson-') && role==='teacher') {
    const lesson=lessonState();
    if(action.startsWith('lesson-start-')) {lesson.deadline=Date.now()+Number(action.slice(13))*60000;lesson.open=true;}
    if(action==='lesson-free') {lesson.deadline=null;lesson.open=true;}
    if(action==='lesson-close') lesson.open=false;
    if(action==='lesson-reopen') {lesson.deadline=null;lesson.open=true;}
    broadcast(); return true;
  }
  if (action.startsWith('reenter-') && role==='teacher') {
    const id=action.slice(8);
    if (!confirm('이 학생의 접속을 해제하고 다른 기기에서 다시 입장할 수 있게 할까요?')) return true;
    delete room.tokens[id]; links.get(id)?.close(); links.delete(id); broadcast(); return true;
  }
  if (action==='reveal-all' && role==='teacher') {
    if (!confirm('퀴즈 없이 모든 작품의 정답을 공개할까요?')) return true;
    works().forEach(w=>w.revealed=true); room.quiz=null; broadcast(); return true;
  }
  if (action==='delete-work' && role==='teacher') {
    const active=works().filter(w=>!w.revealed)[selected];
    if (active && !room.quiz && confirm('선택한 작품을 삭제할까요? 학생이 다시 제출할 수 있어요.')) {
      delete room.works[active.id]; delete room.hearts[active.id]; broadcast();
    }
    return true;
  }
  if (action==='go-home') { $('#home').click(); return true; }
  if (action==='save-drawings') { openDrawingDownloads(); return true; }
  if (action==='save-poster') { await saveClassPoster(); return true; }
  if (action==='save-selected') { await saveDrawing(Number($('#export-choice').value)); return true; }
  if (action.startsWith('save-work-')) { await saveDrawing(Number(action.slice(10))); return true; }
  if (action==='present-open') { showPresentation(0); return true; }
  if (action==='present-prev'||action==='present-next') { showPresentation(presentationIndex+(action==='present-next'?1:-1)); return true; }
  if (action==='sound') { openSoundSettings(); return true; }
  if (action==='quiz-close-votes' && role==='teacher' && room.quiz && !room.quiz.revealed) {room.quiz.accepting=false;broadcast();return true;}
  if (action==='demo-fill-votes' && role==='teacher' && demo && room.quiz && !room.quiz.revealed && room.quiz.accepting!==false) {
    room.roster.filter(p=>p.id!==room.quiz.id).forEach((p,i)=>{room.quiz.votes[p.id] ||= room.quiz.options[i%room.quiz.options.length];});
    broadcast();return true;
  }
  if (action==='drawing-fullscreen') {
    try { const panel=$('.draw>.card'); if (document.fullscreenElement) await document.exitFullscreen(); else await panel.requestFullscreen(); }
    catch { show('<p>이 브라우저에서는 전체 화면을 열 수 없어요.</p>'); }
    return true;
  }
  if (action.startsWith('tutorial-')) {
    if (action==='tutorial-teacher'||action==='tutorial-student') { tutorialRole=action.slice(9); tutorialStep=0; }
    if (action==='tutorial-next') tutorialStep=Math.min(5,tutorialStep+1);
    if (action==='tutorial-prev') tutorialStep=Math.max(0,tutorialStep-1);
    if (action.startsWith('tutorial-step-')) tutorialStep=Number(action.slice(14));
    showTutorial(); return true;
  }
  if (action==='share-site') {
    const url=new URL(location.href); url.search=''; url.hash='';
    try { if (navigator.share) await navigator.share({title:'둥둥 그림 전시회',url:url.href}); else { await navigator.clipboard.writeText(url.href); show('<p>사이트 주소를 복사했어요.</p>'); } }
    catch (error) { if(error.name!=='AbortError') show('<h2>공유하기</h2><input readonly value="'+escape(url.href)+'">'); }
    return true;
  }
  if (action==='install-site') {
    show('<h2>홈 화면에 추가</h2><p>휴대전화 브라우저의 메뉴에서 “홈 화면에 추가”를 선택해 주세요. iPhone에서는 Safari의 공유 메뉴를 열면 찾을 수 있어요.</p>');
    return true;
  }
  return false;
}

document.addEventListener('keydown',event=>{
  if (!modal.open || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if (modal.classList.contains('presentation-dialog')) {
    if (event.key==='ArrowRight') { event.preventDefault(); showPresentation(presentationIndex+1); }
    if (event.key==='ArrowLeft') { event.preventDefault(); showPresentation(presentationIndex-1); }
  } else if ($('#modal-body .tutorial-layout')) {
    if (event.key==='ArrowRight') { tutorialStep=Math.min(5,tutorialStep+1); showTutorial(); }
    if (event.key==='ArrowLeft') { tutorialStep=Math.max(0,tutorialStep-1); showTutorial(); }
  }
});

document.addEventListener('change',event=>{
  if(event.target.id==='allow-edits' && role==='teacher') {lessonState().allowEdits=event.target.checked;broadcast();}
});
