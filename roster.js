'use strict';

// Spreadsheet processing stays inside the teacher's browser.
function detectRosterHeader(rows) {
  const headers = new Set(['이름','성명','학생명','학생이름','학생성명','한글성명','성명한글','name','studentname']);
  for (let row = 0; row < Math.min(rows.length, 50); row++) {
    const column = rows[row].findIndex(value => headers.has(String(value).replace(/[\s\u200B()（）]/g, '').toLowerCase()));
    if (column !== -1) return {column, start:row + 2, header:row};
  }
  return null;
}

function rosterRows(sheet, limit = 10000) {
  if (!sheet['!ref']) return [];
  const used = XLSX.utils.decode_range(sheet['!ref']);
  const range = XLSX.utils.encode_range({s:{r:0,c:0}, e:{r:Math.min(used.e.r,limit - 1),c:Math.min(used.e.c,99)}});
  return XLSX.utils.sheet_to_json(sheet, {header:1, defval:'', raw:false, blankrows:true, range});
}

function rosterColumnNames(rows, headerRow) {
  const count = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return Array.from({length:count}, (_, column) => {
    const letter = XLSX.utils.encode_col(column);
    const title = headerRow === null ? '' : String(rows[headerRow]?.[column] || '').trim();
    return {column, label:letter + '열' + (title ? ' · ' + title : '')};
  });
}

function extractRoster(rows, column, start) {
  const names = rows.slice(start - 1).map(row => String(row[column] ?? '').trim()).filter(Boolean);
  if (!names.length) throw Error('선택한 열에 학생 이름이 없어요. 이름 열과 시작 행을 확인해 주세요.');
  if (names.length > 40) throw Error('명단은 최대 40명까지 입력할 수 있어요. 학생이 있는 시트와 범위를 확인해 주세요.');
  if (names.some(name => name.length > 40)) throw Error('이름은 한 명당 40자까지 입력할 수 있어요. 학생 이름 열을 확인해 주세요.');
  return names;
}

function initRosterImport(form) {
  const fileInput = document.querySelector('#roster-file');
  const sheetInput = document.querySelector('#roster-sheet');
  const columnInput = document.querySelector('#roster-column');
  const startInput = document.querySelector('#roster-start');
  const mapping = document.querySelector('#roster-mapping');
  const status = document.querySelector('#roster-status');
  const textarea = form.elements.names;
  let workbook, rows = [], revision = 0;

  function storeNames(names, message) {
    const stored = save('last-roster', names);
    status.textContent = stored ? message : '명단을 입력했지만 기기에 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.';
  }
  function updateCount() {
    document.querySelector('#count').textContent = lines(textarea.value).length + '명 입력됨 · 동명이인은 번호로 구분해요';
  }
  const stored = load('last-roster', []);
  if (Array.isArray(stored) && stored.length && stored.length <= 40 && stored.every(name => typeof name === 'string' && name.length <= 40)) {
    textarea.value = stored.join('\n');
    status.textContent = '이 브라우저에 저장된 학생 명단 ' + stored.length + '명을 불러왔어요.';
    updateCount();
  }
  textarea.addEventListener('input', () => {
    revision++;
    const names = lines(textarea.value);
    if (names.length > 40 || names.some(name => name.length > 40)) {
      status.textContent = '최대 40명, 이름당 40자까지 저장할 수 있어요. 명단을 확인해 주세요.';
      return;
    }
    storeNames(names, names.length ? names.length + '명 명단을 이 브라우저에 저장했어요.' : '저장된 명단을 비웠어요.');
  });

  function applySelection() {
    if (!form.isConnected) return;
    if (columnInput.value === '') {
      status.textContent = '학생 이름이 있는 열을 선택해 주세요.';
      return;
    }
    try {
      const start = Number(startInput.value);
      if (!Number.isInteger(start) || start < 1 || start > rows.length) throw Error('첫 학생이 있는 행 번호를 확인해 주세요.');
      const names = extractRoster(rows, Number(columnInput.value), start);
      textarea.value = names.join('\n');
      updateCount();
      storeNames(names, names.length + '명을 불러와 저장했어요. 아래 명단을 확인하고 수정할 수 있어요.');
    } catch (error) {
      status.textContent = error.message;
    }
  }

  function selectSheet() {
    const sheet = workbook.Sheets[sheetInput.value];
    // A1 preserves worksheet row numbers when a title or empty rows precede the table.
    rows = rosterRows(sheet);
    const header = detectRosterHeader(rows);
    const columns = rosterColumnNames(rows, header?.header ?? null);
    columnInput.replaceChildren(new Option('이름 열을 선택해 주세요', ''), ...columns.map(item => new Option(item.label, String(item.column))));
    startInput.value = String(header?.start || 1);
    const occupied = columns.filter(item => rows.some(row => String(row[item.column] ?? '').trim()));
    columnInput.value = header ? String(header.column) : occupied.length === 1 ? String(occupied[0].column) : '';
    mapping.hidden = false;
    applySelection();
  }
  sheetInput.addEventListener('change', selectSheet);
  columnInput.addEventListener('change', applySelection);
  startInput.addEventListener('change', applySelection);
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const current = ++revision;
    try {
      if (!/\.(xlsx|xls)$/i.test(file.name)) throw Error('.xlsx 또는 .xls 엑셀 파일을 선택해 주세요.');
      if (file.size > 10 * 1024 * 1024) throw Error('10MB 이하의 학생 명렬표 파일을 선택해 주세요.');
      if (typeof XLSX === 'undefined') throw Error('엑셀 읽기 도구를 불러오지 못했어요. 인터넷 연결을 확인하고 페이지를 새로 열어 주세요.');
      status.textContent = '학생 명렬표를 읽는 중이에요…';
      const data = await file.arrayBuffer();
      if (!form.isConnected || current !== revision) return;
      const imported = XLSX.read(data, {type:'array', sheetRows:10000, cellFormula:false, cellHTML:false});
      if (!imported.SheetNames.length) throw Error('읽을 수 있는 시트가 없어요. 엑셀 파일을 확인해 주세요.');
      workbook = imported;
      const preferred = workbook.SheetNames.find(name => {
        const preview = rosterRows(workbook.Sheets[name], 50);
        return detectRosterHeader(preview);
      });
      sheetInput.replaceChildren(...workbook.SheetNames.map(name => new Option(name, name)));
      sheetInput.value = preferred || workbook.SheetNames[0];
      selectSheet();
    } catch (error) {
      if (!form.isConnected || current !== revision) return;
      status.textContent = error.message?.includes('주세요') || error.message?.includes('없어요') ? error.message : '파일을 읽을 수 없어요. 암호를 해제한 엑셀 명렬표를 선택해 주세요.';
      fileInput.value = '';
    }
  });
}
