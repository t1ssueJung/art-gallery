'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const app = $('#app'), modal = $('#modal'), body = $('#modal-body');
const sampleNames = ['민서','지우','하준','서연','도윤','수아'];
const prefix = 'float-gallery-v1-';
const colors = ['#263b35','#e67765','#e3ab32','#47866a','#426dad','#7657a0','#d56591','#ffffff'];
let room, peer, upstream, role, screen, studentId, demo = false, view, motion = 'bob', speed = 1, paused = false;
let links = new Map(), selected = 0, session = 0, awaiting = false;
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
const lines = value => String(value || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
const imageOK = value => typeof value === 'string' && value.length <= 1600000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value);
const btn = (action, label, cls = '') => '<button class="' + cls + '" data-act="' + action + '">' + label + '</button>';
function load(key, fallback) { try { return JSON.parse(localStorage.getItem(prefix + key)) ?? fallback; } catch { return fallback; } }
function save(key, value) { try { localStorage.setItem(prefix + key, JSON.stringify(value)); return true; } catch { return false; } }
function show(html) { body.innerHTML = html; if (!modal.open) modal.showModal(); }
function template(id) { app.replaceChildren($('#' + id).content.cloneNode(true)); }
function portrait(i) {
  const hair = ['M20 46Q22 15 51 17Q70 18 78 47M34 25l3 16m6-18 2 16m5-16 3 17','M19 55Q17 33 38 21L48 17Q77 20 80 56M48 19Q43 33 24 45','M21 45Q27 21 49 16l8 10 6-6 15 26'][i % 3];
  const eyes = i % 3 === 2 ? '<circle cx="36" cy="58" r="8"/><circle cx="63" cy="58" r="8"/><path d="M44 57h11"/>' : '<path d="M32 56q4-5 8 0m19 0q4-5 8 0"/>';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 122"><g fill="none" stroke="' + ['#4d5f54','#8e6250','#405f56'][i%3] + '" stroke-width="2" stroke-linecap="round"><ellipse cx="50" cy="60" rx="29" ry="43" opacity=".53"/><path d="' + hair + '"/>' + eyes + '<path d="M41 72q9 12 18 0"/></g><g fill="#e8a49a" opacity=".55"><ellipse cx="29" cy="67" rx="6" ry="3"/><ellipse cx="70" cy="67" rx="6" ry="3"/></g></svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
function egg(label, img, i, action) {
  return '<button class="egg" data-act="' + action + '" data-i="' + i + '"><span class="shell" style="--delay:-' + (i * .29) + 's"><img alt="" src="' + escape(img) + '"></span><span class="tag">' + escape(label) + '</span></button>';
}
function artwork(index) { return '작품 ' + String(index + 1).padStart(2,'0'); }
function clearConnection() {
  session++; if (peer) peer.destroy(); peer = upstream = null; links.clear(); awaiting = false;
}
function home() {
  clearConnection(); room = view = role = studentId = null; demo = false; screen = 'home';
  template('landing');
  $('#samples').innerHTML = sampleNames.map((name,i) => egg(name,portrait(i),i,'sample')).join('');
}
function setup() {
  screen = 'setup'; template('setup');
  $('#setup-eggs').innerHTML = sampleNames.slice(0,3).map((n,i) => egg(n,portrait(i),i,'sample')).join('');
  const f = $('#create');
  f.addEventListener('input', () => {
    $('#count').textContent = lines(f.elements.names.value).length + '명 입력됨 · 동명이인은 번호로 구분해요';
    $('#topics').hidden = f.elements.theme.value !== 'free';
  });
}
function makeRoom(title, names, topics, mode, scoring) {
  const roster = names.map((name,i) => ({id:String(i),name:names.filter(n => n === name).length > 1 ? (i+1) + '번 ' + name : name}));
  const pool = topics.length ? topics : roster.map(person => person.name);
  const order = roster.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i],order[j]] = [order[j],order[i]];
  }
  const assignments = {};
  order.forEach((id,i) => {
    assignments[id] = topics.length ? pool[i % pool.length] : pool[order[(i+1) % order.length]];
  });
  return {title, roster, pool, assignments, mode, scoring, code:crypto.randomUUID().replaceAll('-','').slice(0,8).toUpperCase(), works:{}, tokens:{}, scores:{}, hearts:{}, quiz:null, created:Date.now()};
}
function archiveRoom() {
  if (demo || role !== 'teacher') return;
  const rooms = load('archive',[]).filter(r => r.code !== room.code);
  const saved = save('archive',[room,...rooms].slice(0,4));
  const status = $('#save-status');
  if (status) status.textContent = saved ? '이 브라우저에 저장됨' : '저장 공간이 부족합니다. 수업 백업을 내려받으세요.';
}
function startHost() {
  if (typeof Peer === 'undefined') { hostStatus('연결 모듈을 불러오지 못했습니다. 인터넷 연결을 확인하세요.'); return; }
  const current = ++session;
  peer = new Peer('dung-gallery-' + room.code.toLowerCase());
  peer.on('open', () => { if (session === current) hostStatus('학생 입장 가능'); });
  peer.on('error', () => { if (session === current) hostStatus('연결 오류 · 교사 화면을 다시 열어 주세요.'); });
  peer.on('disconnected', () => { if (session === current) hostStatus('연결이 끊겼습니다. 교사 화면을 다시 열어 주세요.'); });
  peer.on('connection', link => {
    let id;
    link.on('open', () => { if (session === current) link.send({type:'lobby',title:room.title,roster:room.roster.filter(p => !room.tokens[p.id])}); });
    link.on('data', msg => {
      if (session !== current || !msg || typeof msg !== 'object') return;
      if (!id && msg.type === 'claim') {
        const found = room.roster.find(p => p.id === msg.id);
        if (!found || (room.tokens[found.id] && room.tokens[found.id] !== msg.token)) {
          link.send({type:'reject'}); return;
        }
        id = found.id;
        if (typeof msg.token !== 'string' || !/^[a-f0-9-]{36}$/.test(msg.token)) { id = undefined; return; }
        room.tokens[id] = msg.token;
        links.get(id)?.close(); links.set(id,link);
        broadcast();
      } else if (id && links.get(id) === link) {
        applyStudent(id,msg);
      }
    });
    link.on('close', () => {
      if (id && links.get(id) === link) { links.delete(id); if (session === current) renderTeacher(); }
    });
    link.on('error', () => {});
  });
}
let hostMessage = '';
function hostStatus(text) { hostMessage = text; if ($('#host-status')) $('#host-status').textContent = text; }
function startTeacher(nextRoom, practice = false) {
  clearConnection(); room = nextRoom; role = 'teacher'; demo = practice; view = 'float'; selected = 0;
  hostMessage = practice ? '체험 중' : '연결 준비 중…';
  renderTeacher(); if (!practice) { archiveRoom(); startHost(); }
}
function works() { return Object.values(room.works); }
function snapshot(id) {
  const q = room.quiz;
  return {title:room.title, mode:room.mode, scoring:room.scoring, code:room.code, pool:room.pool,
    mine:room.mode === 'random' ? room.assignments[id] : room.works[id]?.answer,
    sent:!!room.works[id], score:room.scores[id] || 0,
    works:Object.values(room.works).map(w => ({
      id:w.id,img:w.img,revealed:!!w.revealed,answer:w.revealed ? w.answer : null,
      author:w.revealed ? room.roster.find(p => p.id === w.id)?.name : null,
      hearts:Object.keys(room.hearts[w.id] || {}).length, liked:!!room.hearts[w.id]?.[id]
    })),
    quiz:q ? {id:q.id, options:q.options, answer:q.revealed ? room.works[q.id].answer : null, vote:q.votes[id]} : null};
}
function broadcast() {
  if (role === 'teacher') renderTeacher();
  archiveRoom();
  for (const [id,link] of links) if (link.open) link.send({type:'state',state:snapshot(id)});
}
function applyStudent(id,msg) {
  if (msg.type === 'work' && imageOK(msg.img) && !room.quiz && !room.works[id]?.revealed) {
    const answer = room.mode === 'random' ? room.assignments[id] : msg.target;
    if (!room.pool.includes(answer)) return;
    room.works[id] = {id,img:msg.img,answer,revealed:false};
  } else if (msg.type === 'vote' && room.quiz && room.quiz.id === msg.id && !room.quiz.revealed && !Object.hasOwn(room.quiz.votes,id) && room.quiz.options.includes(msg.answer)) {
    room.quiz.votes[id] = msg.answer;
  } else if (msg.type === 'heart' && room.works[msg.id]?.revealed) {
    const hearts = room.hearts[msg.id] ||= {};
    if (hearts[id]) delete hearts[id]; else hearts[id] = true;
  } else return;
  broadcast();
}
function renderTeacher() {
  screen = 'teacher';
  const items = works(), remaining = items.filter(w => !w.revealed);
  selected = Math.max(0,Math.min(selected,remaining.length - 1));
  const active = room.quiz ? room.works[room.quiz.id] : remaining[selected];
  const index = items.indexOf(active);
  const tabs = [['float','둥둥 전시'],['list','작품 감상'],['roster','우리 반'],['scores','퀴즈 점수']];
  app.innerHTML = '<div class="row tabs">' + tabs.map(([id,label]) => btn('tab-'+id,label,view===id?'primary':'')).join('') + btn('backup','수업 백업') + '</div>' +
    '<p class="eyebrow">TEACHER’S GALLERY · '+escape(room.title)+' · <span id="host-status">'+escape(hostMessage)+'</span></p>' +
    (demo ? '<div class="banner row">교사 체험 · 예시 작품과 응답은 실제 수업과 분리돼요. '+btn('demo-student','학생 화면도 보기')+'</div>' : '') +
    '<h1>우리 반이 둥둥 떠올라요.</h1><p>작품 '+items.length+' / '+room.roster.length+'개 · '+(room.mode==='random'?'비밀 랜덤 배정':'자유롭게 선택')+' · '+(room.scoring?'점수 모으기':'함께 맞히기')+'</p>' +
    '<div class="row">'+btn('invite','초대하기 · '+room.code,'primary')+btn('fullscreen','전체 화면')+' <small id="save-status"></small></div>';
  if (view === 'roster' || view === 'scores') {
    app.insertAdjacentHTML('beforeend','<section class="card"><h2>'+(view==='roster'?'우리 반':'퀴즈 점수')+'</h2><ul class="list">'+room.roster.map(p => '<li><strong>'+escape(p.name)+'</strong><span>'+(view==='roster'?(demo||links.has(p.id)?'입장 · ':'')+(room.works[p.id]?'제출 완료':'제출 대기'):(room.scoring?(room.scores[p.id]||0)+'점':'함께 맞히기 모드'))+'</span></li>').join('')+'</ul></section>');
    return;
  }
  const gallery = items.length ? items.map((w,i) => egg(w.revealed ? w.answer : artwork(i),w.img,i,'work')).join('') : '<p>학생이 그림을 보내면 여기에 떠올라요.</p>';
  const controls = view === 'float' ? '<div class="row tabs">'+[['bob','둥둥'],['orbit','우주 여행'],['train','그림 기차'],['carousel','회전목마']].map(([id,label])=>btn('motion-'+id,label,motion===id?'primary':'')).join('')+btn('pause',paused?'움직임 재생':'움직임 쉬기')+'<label>빠르기 <input id="speed" aria-label="전시 움직임 빠르기" type="range" min=".5" max="2" step=".1" value="'+speed+'"></label></div>' : '';
  let quiz = '<p>제출된 그림을 골라 퀴즈를 열 수 있어요.</p>';
  if (active) {
    quiz = '<img class="preview" src="'+escape(active.img)+'" alt="퀴즈 작품"><p><strong>'+artwork(index)+'</strong></p>';
    if (!room.quiz) quiz += '<div class="row">'+btn('prev','←')+' '+(selected+1)+' / '+remaining.length+' '+btn('next','→')+'</div>'+btn('quiz-start','객관식 퀴즈 시작','primary');
    else if (room.quiz.revealed) quiz += '<p>정답 <strong>'+escape(active.answer)+'</strong></p>'+btn('quiz-end','다음 작품으로','primary');
    else quiz += '<p>응답 '+Object.keys(room.quiz.votes).length+'명 / '+room.roster.length+'명</p>'+btn('quiz-reveal','정답 공개','primary');
  }
  app.insertAdjacentHTML('beforeend',controls+'<div class="board"><section class="gallery '+(paused||view==='list'?'paused':'')+'" data-motion="'+motion+'" style="--speed:'+3.8/speed+'s"><p class="eyebrow">우리 반 작품 '+items.length+'점 · DRAW. FLOAT. DISCOVER.</p><div class="eggs">'+gallery+'</div></section><aside class="card"><h2>퀴즈 작품 선택</h2>'+quiz+'</aside></div>');
}
function invite() {
  const url = new URL(location.href);
  url.search = ''; url.hash = ''; url.searchParams.set('room',room.code);
  if (demo) { show('<h2>학생 초대</h2><p>체험에서는 같은 화면에서 학생 작업실을 열 수 있어요.</p>'+btn('demo-student','학생 화면도 보기','primary')); return; }
  const link = escape(url.href);
  show('<h2>학생 초대하기</h2><div class="code">'+room.code+'</div><p>학생은 이 링크를 열거나 홈 화면에 방 코드를 입력해요.</p><div id="qr" class="qr"></div><label>초대 링크<input id="invite-url" readonly value="'+link+'"></label>'+btn('copy','링크 복사','primary')+' <span id="copy-status" role="status"></span>');
  if (window.QRCode) new QRCode($('#qr'),{text:url.href,width:200,height:200,colorDark:'#243c36',correctLevel:QRCode.CorrectLevel.M});
  else $('#qr').textContent = 'QR 모듈을 불러오지 못했습니다. 링크나 방 코드를 사용하세요.';
}
function connect(code) {
  code = code.trim().toUpperCase();
  const notice = $('#join-error');
  if (!/^[0-9A-F]{8}$/.test(code)) { notice.textContent = '8자리 방 코드를 확인해 주세요.'; return; }
  if (typeof Peer === 'undefined') { notice.textContent = '연결 모듈을 불러오지 못했습니다.'; return; }
  clearConnection(); const current = session; role = 'student';
  notice.textContent = '교사 화면에 연결하는 중…';
  const tokenKey = 'student-'+code;
  const previous = load(tokenKey,null);
  let claim;
  const timer = setTimeout(() => {
    if (session === current && !upstream?.open) fail('방에 연결할 수 없어요. 코드와 교사 화면을 확인해 주세요.');
  },12000);
  function fail(message) {
    if (session !== current) return;
    clearTimeout(timer); clearConnection();
    if (screen !== 'home') home();
    const field = $('#code');
    if (field) { field.value = code; $('#join-error').textContent = message; }
    if (modal.open) modal.close();
  }
  function sendClaim(id) {
    claim = {id,token:previous?.token || crypto.randomUUID()};
    upstream.send({type:'claim',...claim});
  }
  peer = new Peer();
  peer.on('error', () => fail('방에 연결하지 못했어요. 코드와 교사 화면을 확인해 주세요.'));
  peer.on('open', () => {
    if (session !== current) return;
    upstream = peer.connect('dung-gallery-'+code.toLowerCase(),{reliable:true});
    upstream.on('error', () => fail('연결에 실패했어요. 다시 입장해 주세요.'));
    upstream.on('close', () => fail('교사 화면과의 연결이 끊겼어요. 다시 입장해 주세요.'));
    upstream.on('data', msg => {
      if (session !== current) return;
      if (msg.type === 'lobby') {
        clearTimeout(timer); notice.textContent = '';
        if (previous) { sendClaim(previous.id); return; }
        if (!msg.roster.length) { fail('선택할 수 있는 학생이 없어요. 선생님께 알려주세요.'); return; }
        show('<h2>'+escape(msg.title)+'</h2><form id="claim"><label>내 이름 고르기<select name="student">'+msg.roster.map(p=>'<option value="'+escape(p.id)+'">'+escape(p.name)+'</option>').join('')+'</select></label><button class="primary">작업실 입장 →</button></form>');
        $('#claim').onsubmit = event => { event.preventDefault(); sendClaim(event.currentTarget.elements.student.value); };
      }
      if (msg.type === 'reject') fail('이미 사용 중인 이름이에요. 다시 입장해 주세요.');
      if (msg.type === 'state') {
        if (screen !== 'student') {
          if (!claim) return;
          studentId = claim.id; save(tokenKey,claim); if (modal.open) modal.close();
          view = 'draw'; screen = 'student';
        }
        receive(msg.state);
      }
    });
  });
}
function receive(state) {
  const drawing = screen === 'student' && view === 'draw' && $('#canvas');
  const wasAwaiting = awaiting; awaiting = false;
  room = state;
  if (drawing) {
    $('#gallery-tab').textContent = '작품 감상 '+room.works.length;
    $('#draw-score').textContent = room.scoring ? room.score+'점' : '';
    $('#send').disabled = !!room.quiz || !!room.works.find(w=>w.id===studentId)?.revealed;
    if (wasAwaiting && room.sent) { view = 'gallery'; renderStudent(); }
    return;
  }
  renderStudent();
}
let demoRoom;
function renderStudent() {
  screen = 'student';
  app.innerHTML = (demo ? '<div class="banner row">학생 체험 · 실제 교실에 전송되지 않아요. '+btn('demo-teacher','교사 화면으로')+'</div>' : '')+
    '<p class="eyebrow">'+escape(room.title)+' · <span id="draw-score">'+(room.scoring?room.score+'점':'')+'</span></p><h1>'+(view==='draw'?'친구를 떠올리며, 쓱쓱.':'친구들의 작은 전시회.')+'</h1>'+
    '<div class="row tabs">'+btn('student-draw','내 그림판',view==='draw'?'primary':'')+'<button id="gallery-tab" data-act="student-gallery" class="'+(view==='gallery'?'primary':'')+'">작품 감상 '+room.works.length+'</button></div><div id="student-content"></div>';
  if (view === 'draw') {
    $('#student-content').append($('#drawing').content.cloneNode(true));
    $('#target').innerHTML = room.mode === 'choose' ? '<label>그리고 싶은 대상<select id="chosen">'+room.pool.map(n=>'<option'+(n===room.mine?' selected':'')+'>'+escape(n)+'</option>').join('')+'</select></label>' : '<p><strong>'+escape(room.mine)+'</strong> 그림을 그려주세요.</p>';
    $('#send').disabled = !!room.quiz || !!room.works.find(w=>w.id===studentId)?.revealed;
    initCanvas(); return;
  }
  const q = room.quiz, quizWork = q && room.works.find(w=>w.id===q.id);
  const quiz = quizWork ? '<section class="card"><h2>누구를 그렸을까요?</h2><img class="preview" src="'+escape(quizWork.img)+'" alt="퀴즈 작품">'+
    (q.answer ? '<p>정답 <strong>'+escape(q.answer)+'</strong></p>' : q.vote ? '<p>내 답 '+escape(q.vote)+' · 정답을 기다려요.</p>' : '<div class="row">'+q.options.map((n,i)=>btn('vote-'+i,escape(n))).join('')+'</div>')+'</section>' : '';
  $('#student-content').innerHTML = quiz+'<section class="gallery"><div class="eggs">'+room.works.map((w,i)=>'<div>'+egg(w.answer||artwork(i),w.img,i,'work')+(w.revealed?btn('heart-'+i,(w.liked?'♥ ':'♡ ')+w.hearts):'')+'</div>').join('')+'</div>'+(room.works.length?'':'<p>아직 도착한 그림이 없어요.</p>')+'</section>';
}
function studentAction(msg) {
  if (demo) {
    room = demoRoom; applyStudent(studentId,msg); receive(snapshot(studentId)); return;
  }
  if (upstream?.open) upstream.send(msg);
  else { awaiting = false; show('<h2>연결이 끊겼어요</h2><p>교사 화면이 열려 있는지 확인해 주세요.</p>'); }
}

function initCanvas() {
  const canvas = $('#canvas'), ctx = canvas.getContext('2d',{willReadFrequently:true});
  const draftKey = 'draft-'+room.code+'-'+studentId;
  const source = (demo ? null : load(draftKey,null)) || room.works.find(w=>w.id===studentId)?.img;
  const undo = [], redo = [];
  let color = colors[0], erasing = false, pointer = null, changed = false;
  const capture = () => ctx.getImageData(0,0,512,512);
  function remember() { if (undo.length >= 20) undo.shift(); undo.push(capture()); redo.length = 0; }
  function persist() {
    if (!demo) save(draftKey,canvas.toDataURL('image/png'));
    for (const [tool,stack] of [['undo',undo],['redo',redo]]) $('[data-tool='+tool+']').disabled = !stack.length;
  }
  if (source) {
    const img = new Image();
    img.onload = () => { if (!changed) ctx.drawImage(img,0,0,512,512); };
    img.src = source;
  }
  const colorNames = ['먹색','코랄','노랑','초록','파랑','보라','분홍','흰색'];
  $('#palette').innerHTML = colors.map((c,i)=>'<button class="swatch" style="--color:'+c+'" aria-label="'+colorNames[i]+'" aria-pressed="'+(i===0)+'" data-color="'+i+'"></button>').join('');
  $('#palette').onclick = event => {
    const swatch = event.target.closest('[data-color]'); if (!swatch) return;
    erasing = false; color = colors[Number(swatch.dataset.color)];
    for (const b of $('#palette').children) b.setAttribute('aria-pressed',String(b===swatch));
  };
  $('[data-tool=undo]').disabled = $('[data-tool=redo]').disabled = true;
  $('.tools').onclick = event => {
    const tool = event.target.dataset.tool;
    if (tool==='pen' || tool==='erase') { erasing = tool==='erase'; return; }
    if (tool==='clear') { remember(); ctx.clearRect(0,0,512,512); }
    if (tool==='undo' && undo.length) { redo.push(capture()); ctx.putImageData(undo.pop(),0,0); }
    if (tool==='redo' && redo.length) { undo.push(capture()); ctx.putImageData(redo.pop(),0,0); }
    if (tool) { changed = true; persist(); }
  };
  function point(event) {
    const box = canvas.getBoundingClientRect();
    return [(event.clientX-box.left)*512/box.width,(event.clientY-box.top)*512/box.height];
  }
  let last;
  function stroke(at) {
    ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
    ctx.strokeStyle = color; ctx.lineWidth = Number($('#width').value)*(erasing?2:1);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(at[0]+.01,at[1]); ctx.stroke(); last = at;
  }
  canvas.onpointerdown = event => {
    if (pointer !== null || event.button !== 0) return;
    pointer = event.pointerId; changed = true; remember();
    canvas.setPointerCapture(pointer); last = point(event); stroke(last);
  };
  canvas.onpointermove = event => { if (event.pointerId === pointer) stroke(point(event)); };
  canvas.onpointerup = canvas.onpointercancel = canvas.onlostpointercapture = event => {
    if (event.pointerId === pointer) { pointer = null; persist(); }
  };
  $('#send').onclick = () => {
    if (!capture().data.some((value,i) => i%4===3 && value)) { $('#draw-status').textContent = '그림을 먼저 그려주세요.'; return; }
    awaiting = true;
    $('#draw-status').textContent = '그림을 보내는 중…';
    studentAction({type:'work',img:canvas.toDataURL('image/png'),target:$('#chosen')?.value});
  };
}
function download(content,filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(content)],{type:'application/json'}));
  const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function validateBackup(data) {
  if (data?.version !== 1) return null;
  const r=data.room;
  if (!r || typeof r.title!=='string' || !/^[A-F0-9]{8}$/.test(r.code) || !['choose','random'].includes(r.mode) ||
    !Array.isArray(r.roster) || !r.roster.length || r.roster.length>40 ||
    !r.roster.every((p,i)=>p?.id===String(i)&&typeof p.name==='string') ||
    !Array.isArray(r.pool) || !r.pool.length || !r.pool.every(n=>typeof n==='string') ||
    !r.roster.every(p=>r.pool.includes(r.assignments?.[p.id])) ||
    !r.works || !Object.values(r.works).every(w=>r.roster.some(p=>p.id===w?.id)&&imageOK(w.img)&&r.pool.includes(w.answer))) return null;
  const clean = {...r, works:Object.fromEntries(Object.values(r.works).map(w=>[w.id,w])), quiz:null,tokens:{},scores:{},hearts:{}};
  for (const p of r.roster) if (Number.isSafeInteger(r.scores?.[p.id])) clean.scores[p.id]=r.scores[p.id];
  return clean;
}
function importRoom() {
  show('<h2>수업 백업 불러오기</h2><label>JSON 파일 선택<input type="file" id="backup-file" accept=".json,application/json"></label><p id="import-status" role="status"></p>');
  $('#backup-file').onchange = async event => {
    const file = event.currentTarget.files[0]; if (!file) return;
    try {
      if (file.size>65e6) throw Error();
      const restored = validateBackup(JSON.parse(await file.text())); if (!restored) throw Error();
      restored.code=crypto.randomUUID().replaceAll('-','').slice(0,8).toUpperCase();
      modal.close(); startTeacher(restored); invite();
    } catch { if ($('#import-status')) $('#import-status').textContent='이 그림교실에서 저장한 백업 파일을 선택해 주세요.'; }
  };
}
function practice() {
  const r = makeRoom('우리 반 작은 전시회',sampleNames,[],'random',true);
  r.roster.forEach((person,i)=>{r.works[person.id]={id:person.id,img:portrait(i),answer:r.assignments[person.id],revealed:false};});
  demoRoom = r; startTeacher(r,true);
}
function openWork(i) {
  const w = role==='teacher'?works()[i]:room.works[i];
  if (!w) return;
  const author = w.revealed && role==='teacher' ? room.roster.find(p=>p.id===w.id)?.name : w.author;
  show('<h2>'+escape(artwork(i))+'</h2><img class="preview" src="'+escape(w.img)+'" alt="그림 작품">'+
    (w.revealed?'<p>그린 대상 <strong>'+escape(w.answer)+'</strong><br>그린 사람 '+escape(author)+'</p>':'<p>누구를 그렸을까요?</p>')+
    (role==='teacher'&&!room.quiz&&!w.revealed?'<button class="primary" data-act="pick-quiz" data-i="'+i+'">이 작품으로 퀴즈 열기</button>':''));
}
$('#close').onclick = () => modal.close();
$('#home').onclick = () => {
  if (role==='teacher'&&!demo&&links.size&&!confirm('처음으로 돌아가면 학생 연결이 끊겨요. 돌아갈까요?')) return;
  if (modal.open) modal.close(); home();
};
$('#help').onclick = () => show('<h2>처음 만나는 그림교실</h2><h3>선생님</h3><ol><li>학생 이름을 한 줄에 한 명씩 넣고 주제와 배정 방식을 정해요.</li><li>초대 QR 또는 링크를 공유하고 교사 화면을 열어두세요.</li><li>그림이 도착하면 작품을 골라 퀴즈를 열고 정답을 공개해요.</li><li>수업이 끝나면 수업 백업을 내려받을 수 있어요.</li></ol><h3>학생</h3><ol><li>초대 링크를 열거나 방 코드를 입력하고 내 이름을 골라요.</li><li>내 그림판에서 그림을 그려 전시회로 보내요.</li><li>작품 감상에서 답을 고르고 정답이 공개되면 하트를 보내요.</li></ol>');
$('#demo').onclick = () => {
  if (role==='teacher'&&!demo&&links.size&&!confirm('체험을 열면 학생 연결이 끊겨요. 열까요?')) return;
  practice();
};
document.addEventListener('submit',event=>{
  const f=event.target;
  if (f.id==='join') { event.preventDefault(); connect($('#code').value); }
  if (f.id!=='create') return;
  event.preventDefault();
  const values=new FormData(f), names=lines(values.get('names')), title=String(values.get('title')).trim();
  const topics=values.get('theme')==='free'?[...new Set(lines(values.get('topics')))]:[];
  if (!title||!names.length||names.length>40||names.some(n=>n.length>40)||topics.length>40||topics.some(n=>n.length>40)||(values.get('theme')==='free'&&!topics.length)) {
    $('#form-error').textContent='전시회 이름과 명단을 확인하세요. 자유 주제는 한 줄에 하나씩 입력하고, 이름·주제는 각각 최대 40개, 항목은 40자까지 사용할 수 있어요.'; return;
  }
  startTeacher(makeRoom(title,names,topics,values.get('assign'),values.get('scoring')==='yes')); invite();
});
document.addEventListener('input',event=>{
  if (event.target.id!=='speed') return;
  speed=Number(event.target.value); $('.gallery').style.setProperty('--speed',3.8/speed+'s');
});
document.addEventListener('click',async event=>{
  const control=event.target.closest('[data-act]');
  if (!control) return;
  const act=control.dataset.act, i=Number(control.dataset.i);
  if (act==='setup') setup();
  if (act==='help') $('#help').click();
  if (act==='sample') show('<h2>'+sampleNames[i]+'의 예시 작품</h2><img class="preview" alt="예시 그림" src="'+escape(portrait(i))+'">');
  if (act==='archive') {
    const records=load('archive',[]);
    show('<h2>수업 보관함</h2>'+(records.length?'<ul class="list">'+records.map((r,index)=>'<li><span>'+escape(r.title)+'</span>'+btn('resume-'+index,'다시 열기')+'</li>').join('')+'</ul>':'<p>이 브라우저에 보관된 수업이 없어요.</p>'));
  }
  if (act.startsWith('resume-')) { const r=load('archive',[])[Number(act.slice(7))]; if (r) { modal.close(); startTeacher(r); } }
  if (act==='import') importRoom();
  if (act==='invite') invite();
  if (act==='copy') {
    try { await navigator.clipboard.writeText($('#invite-url').value); $('#copy-status').textContent='복사했어요.'; }
    catch { $('#invite-url')?.select(); }
  }
  if (act==='backup'&&!demo) download({version:1,room:{...room,tokens:{},quiz:null}},'dung-gallery-'+room.code+'.json');
  if (act==='backup'&&demo) show('<h2>수업 백업</h2><p>실제 수업에서 사용해 주세요.</p>');
  if (act==='fullscreen') {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { show('<p>이 브라우저에서는 전체 화면을 열 수 없어요.</p>'); }
  }
  if (act.startsWith('tab-')) { view=act.slice(4); renderTeacher(); }
  if (act.startsWith('motion-')) { motion=act.slice(7); renderTeacher(); }
  if (act==='pause') { paused=!paused; renderTeacher(); }
  if (act==='prev'||act==='next') { selected+=act==='prev'?-1:1; renderTeacher(); }
  if (act==='work') openWork(i);
  if ((act==='quiz-start'||act==='pick-quiz')&&!room.quiz) {
    const w=act==='pick-quiz'?works()[i]:works().filter(w=>!w.revealed)[selected];
    if (!w || w.revealed) return;
    const wrong=[...new Set(room.pool)].filter(n=>n!==w.answer).map(n=>({n,rand:Math.random()})).sort((a,b)=>a.rand-b.rand).slice(0,3).map(x=>x.n);
    const options=[w.answer,...wrong];
    const offset=Math.floor(Math.random()*options.length);
    room.quiz={id:w.id,options:options.slice(offset).concat(options.slice(0,offset)),votes:{},revealed:false};
    if (modal.open) modal.close(); broadcast();
  }
  if (act==='quiz-reveal'&&room.quiz&&!room.quiz.revealed) {
    const q=room.quiz, w=room.works[q.id]; q.revealed=w.revealed=true;
    if (room.scoring) for (const [id,answer] of Object.entries(q.votes)) if (answer===w.answer) room.scores[id]=(room.scores[id]||0)+1;
    broadcast();
  }
  if (act==='quiz-end'&&room.quiz?.revealed) { room.quiz=null; broadcast(); }
  if (act==='demo-student') {
    if (!demo) return;
    if (modal.open) modal.close(); role='student'; studentId='1'; view='gallery'; room=snapshot(studentId); renderStudent();
  }
  if (act==='demo-teacher') startTeacher(demoRoom,true);
  if (act==='student-draw'||act==='student-gallery') { view=act==='student-draw'?'draw':'gallery'; renderStudent(); }
  if (act.startsWith('vote-')) studentAction({type:'vote',id:room.quiz.id,answer:room.quiz.options[Number(act.slice(5))]});
  if (act.startsWith('heart-')) studentAction({type:'heart',id:room.works[Number(act.slice(6))].id});
});
home();
const initialCode = new URLSearchParams(location.search).get('room');
if (initialCode) { $('#code').value=initialCode; connect(initialCode); }
