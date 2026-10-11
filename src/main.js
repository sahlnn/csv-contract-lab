import sampleCsv from './sample.csv?raw';
import { parseCsvText, readCsvFile, compareColumns } from './csv.js';
import { findKeyCandidates, checkKey } from './keys.js';
import { matchRecords } from './match.js';
import { findComparableColumns, compareCells } from './changes.js';
import './style.css';

const PREVIEW_ROWS = 20;
const CHANGE_ROWS = 50;
const SIDES = [
  { id: 'old', title: 'Eski CSV' },
  { id: 'new', title: 'Yeni CSV' },
];

// Her tarafın durumu birbirinden bağımsızdır:
// { status: 'empty' } | { status: 'loading' } | { status: 'ok', fileName, headers, records, columnCount } | { status: 'error', error }
const state = {
  old: { status: 'empty' },
  new: { status: 'empty' },
};

// Bir taraftaki eski bir okuma, yenisinden sonra bitip durumu ezmesin diye.
const runs = { old: 0, new: 0 };

// Kullanıcının seçtiği anahtar kolon adı; hiçbir zaman otomatik seçilmez.
let selectedKey = '';

// "Beklenen değişiklik" olarak işaretlenen kolonlar; başlangıçta hiçbiri seçili değildir.
const expectedColumns = new Set();
// Son kayıt eşleştirme sonucu (hücre karşılaştırması bunu kullanır); gizliyken null.
let currentMatch = null;

const panels = {};
const columnsEl = document.getElementById('columns');
const keyHintEl = document.getElementById('key-hint');
const keyPickerEl = document.getElementById('key-picker');
const keySelectEl = document.getElementById('key-select');
const keyResultsEl = document.getElementById('key-results');
const matchEl = document.getElementById('match');
const changesEl = document.getElementById('changes');
const changesScopeEl = document.getElementById('changes-scope');
const expectedListEl = document.getElementById('expected-list');
const changesResultsEl = document.getElementById('changes-results');

function cell(tag, text) {
  const el = document.createElement(tag);
  el.textContent = text; // metin olarak yazılır, HTML yorumlanmaz
  return el;
}

function createPanel(side) {
  const root = document.getElementById('panel-template').content.firstElementChild.cloneNode(true);
  const q = (selector) => root.querySelector(selector);
  q('.panel-title').textContent = side.title;
  const panel = {
    root,
    input: q('.file-input'),
    sampleBtn: q('.sample-btn'),
    message: q('.message'),
    result: q('.result'),
    name: q('.s-name'),
    rows: q('.s-rows'),
    cols: q('.s-cols'),
    note: q('.note'),
    table: q('.preview'),
  };

  panel.input.addEventListener('change', () => {
    const file = panel.input.files[0];
    if (file) loadFile(side.id, file);
    else setState(side.id, { status: 'empty' }); // seçim iptal edildi
  });
  panel.sampleBtn.addEventListener('click', () => {
    runs[side.id]++;
    panel.input.value = '';
    setState(side.id, toState('ornek.csv', parseCsvText(sampleCsv)));
  });

  document.getElementById('panels').append(root);
  return panel;
}

function toState(fileName, parsed) {
  return parsed.ok
    ? { status: 'ok', fileName, headers: parsed.headers, records: parsed.records, columnCount: parsed.columnCount }
    : { status: 'error', error: parsed.error };
}

async function loadFile(sideId, file) {
  const run = ++runs[sideId];
  // Önceki dosyanın sonuçları hemen temizlenir. 'loading' iken anahtar seçimi korunur;
  // yeni dosya okununca seçim hâlâ uygunsa kalır, değilse temizlenir.
  setState(sideId, { status: 'loading' });
  const parsed = await readCsvFile(file);
  if (run !== runs[sideId]) return;
  setState(sideId, toState(file.name, parsed));
}

function setState(sideId, next) {
  state[sideId] = next;
  renderPanel(sideId);
  renderColumns();
  renderKey();
}

function renderPanel(sideId) {
  const panel = panels[sideId];
  const s = state[sideId];

  panel.message.hidden = s.status !== 'error';
  panel.message.textContent = s.status === 'error' ? s.error : '';
  panel.result.hidden = s.status !== 'ok';
  panel.name.textContent = '';
  panel.rows.textContent = '';
  panel.cols.textContent = '';
  panel.note.textContent = '';
  panel.table.replaceChildren();
  if (s.status !== 'ok') return;

  const { fileName, headers, records, columnCount } = s;
  panel.name.textContent = fileName;
  panel.rows.textContent = String(records.length);
  panel.cols.textContent = String(columnCount);

  if (records.length === 0) {
    panel.note.textContent = 'Dosyada yalnızca başlık satırı var; veri kaydı yok.';
  } else if (records.length > PREVIEW_ROWS) {
    panel.note.textContent = `İlk ${PREVIEW_ROWS} veri kaydı gösteriliyor (toplam ${records.length}).`;
  } else {
    panel.note.textContent = `${records.length} veri kaydının tümü gösteriliyor.`;
  }

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (let i = 0; i < columnCount; i++) headRow.append(cell('th', headers[i] ?? ''));
  thead.append(headRow);

  const tbody = document.createElement('tbody');
  for (const record of records.slice(0, PREVIEW_ROWS)) {
    const tr = document.createElement('tr');
    for (let i = 0; i < columnCount; i++) tr.append(cell('td', record[i] ?? ''));
    tbody.append(tr);
  }
  panel.table.replaceChildren(thead, tbody);
}

function columnList(title, names) {
  const wrap = document.createElement('div');
  wrap.append(cell('h3', `${title} (${names.length})`));
  const ul = document.createElement('ul');
  for (const name of names) ul.append(cell('li', name === '' ? '(boş başlık)' : name));
  wrap.append(ul);
  return wrap;
}

function renderColumns() {
  columnsEl.replaceChildren();
  const a = state.old;
  const b = state.new;

  columnsEl.append(cell('h2', 'Kolon karşılaştırması'));
  if (a.status !== 'ok' || b.status !== 'ok') {
    columnsEl.append(cell('p', 'Karşılaştırma için iki dosyayı da başarıyla yükleyin.'));
    return;
  }

  const diff = compareColumns(a.headers, b.headers);
  const sameNames = diff.missing.length === 0 && diff.added.length === 0;

  if (sameNames) {
    columnsEl.append(
      cell('p', diff.orderChanged ? 'Kolon adları aynı; yalnızca sıraları farklı.' : 'Kolon adları aynı.'),
    );
  } else {
    if (diff.missing.length > 0) {
      columnsEl.append(columnList('Yeni dosyada eksik kolonlar', diff.missing));
    }
    if (diff.added.length > 0) {
      columnsEl.append(columnList('Yeni dosyada eklenen kolonlar', diff.added));
    }
  }

  if (diff.duplicatesOld.length > 0) {
    columnsEl.append(columnList('Eski dosyada birden fazla geçen kolon adları', diff.duplicatesOld));
  }
  if (diff.duplicatesNew.length > 0) {
    columnsEl.append(columnList('Yeni dosyada birden fazla geçen kolon adları', diff.duplicatesNew));
  }
}

const MAX_LISTED = 20;

function limited(items) {
  const shown = items.slice(0, MAX_LISTED).join(', ');
  return items.length > MAX_LISTED ? `${shown} … (+${items.length - MAX_LISTED} tane daha)` : shown;
}

function keyReport(title, headers, records) {
  const result = checkKey(headers, records, selectedKey);
  const box = document.createElement('div');
  box.append(cell('h3', `${title} (${result.totalRecords} kayıt)`));

  if (result.emptyRecords.length === 0 && result.duplicates.length === 0) {
    box.append(cell('p', 'Sorun bulunamadı: tüm anahtarlar dolu ve benzersiz.'));
    return box;
  }

  const ul = document.createElement('ul');
  if (result.emptyRecords.length > 0) {
    ul.append(
      cell(
        'li',
        `Boş veya yalnızca boşluk içeren anahtar: ${result.emptyRecords.length} kayıt. Kayıt no: ${limited(result.emptyRecords)}`,
      ),
    );
  }
  if (result.duplicates.length > 0) {
    ul.append(cell('li', `Tekrar eden anahtar: ${result.duplicates.length} değer`));
    for (const d of result.duplicates.slice(0, MAX_LISTED)) {
      const ids = limited(d.recordNumbers);
      ul.append(cell('li', `"${d.value}" → ${d.recordNumbers.length} kayıt. Kayıt no: ${ids}`));
    }
    if (result.duplicates.length > MAX_LISTED) {
      ul.append(cell('li', `… ve ${result.duplicates.length - MAX_LISTED} tekrar eden değer daha`));
    }
  }
  box.append(ul);
  return box;
}

function statCard(label, value) {
  const div = document.createElement('div');
  div.append(cell('dt', label), cell('dd', String(value)));
  return div;
}

// Eklenen/silinen kayıtların ilk 20'sini, kendi dosyasının başlıklarıyla gösterir.
function recordPreview(title, headers, items) {
  const wrap = document.createElement('div');
  wrap.append(cell('h3', `${title} (${items.length})`));
  if (items.length === 0) {
    wrap.append(cell('p', 'Kayıt yok.'));
    return wrap;
  }

  const shown = items.slice(0, PREVIEW_ROWS);
  const colCount = shown.reduce((max, it) => Math.max(max, it.record.length), headers.length);
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.append(cell('th', 'Kayıt no'));
  for (let i = 0; i < colCount; i++) headRow.append(cell('th', headers[i] ?? ''));
  thead.append(headRow);

  const tbody = document.createElement('tbody');
  for (const it of shown) {
    const tr = document.createElement('tr');
    tr.append(cell('td', String(it.recordNumber)));
    for (let i = 0; i < colCount; i++) tr.append(cell('td', it.record[i] ?? ''));
    tbody.append(tr);
  }

  const table = document.createElement('table');
  table.append(thead, tbody);
  const tableWrap = document.createElement('div');
  tableWrap.className = 'table-wrap';
  tableWrap.append(table);
  wrap.append(tableWrap);
  if (items.length > PREVIEW_ROWS) {
    wrap.append(cell('p', `İlk ${PREVIEW_ROWS} kayıt gösteriliyor; ${items.length - PREVIEW_ROWS} kayıt daha var.`));
  }
  return wrap;
}

// Seçilen anahtara göre kayıtları eşleştirip sayıları ve önizlemeleri çizer.
function renderMatch() {
  matchEl.replaceChildren();
  const ready = state.old.status === 'ok' && state.new.status === 'ok';
  matchEl.hidden = !(ready && selectedKey !== '');
  currentMatch = null;
  if (matchEl.hidden) return; // yükleme sırasında veya anahtar yokken eski sonuç gösterilmez

  const r = matchRecords(state.old, state.new, selectedKey);
  currentMatch = r;
  matchEl.append(cell('h2', 'Kayıt eşleştirme'));

  if (r.partial) {
    const invalidCount = r.invalidOld.length + r.invalidNew.length;
    matchEl.append(
      cell(
        'p',
        `Sonuçlar kısmidir: ${r.ambiguousRecordCount} belirsiz ve ${invalidCount} geçersiz anahtarlı kayıt aşağıdaki sayılara katılmadı.`,
      ),
    );
    matchEl.lastChild.className = 'partial';
  }

  const stats = document.createElement('dl');
  stats.className = 'summary';
  stats.append(
    statCard('Eşleşen kayıt', r.matched.length),
    statCard('Eklenen kayıt', r.added.length),
    statCard('Silinen kayıt', r.removed.length),
  );
  matchEl.append(stats);

  matchEl.append(
    cell('p', 'Kayıt no, başlık satırı hariç 1\'den başlar; dosyadaki fiziksel satır numarası değildir.'),
    recordPreview('Eklenen kayıtlar (yalnızca yeni dosyada)', state.new.headers, r.added),
    recordPreview('Silinen kayıtlar (yalnızca eski dosyada)', state.old.headers, r.removed),
  );

  if (r.ambiguous.length > 0) {
    const wrap = document.createElement('div');
    wrap.append(
      cell('h3', `Belirsiz kayıtlar: ${r.ambiguous.length} anahtar, ${r.ambiguousRecordCount} kayıt`),
      cell('p', 'Anahtar bir dosyada birden fazla kez geçtiği için, iki dosyadaki bütün kayıtları eşleştirmeye katılmadı.'),
    );
    const ul = document.createElement('ul');
    for (const g of r.ambiguous.slice(0, MAX_LISTED)) {
      const oldNos = g.oldRecordNumbers.length > 0 ? limited(g.oldRecordNumbers) : 'yok';
      const newNos = g.newRecordNumbers.length > 0 ? limited(g.newRecordNumbers) : 'yok';
      ul.append(cell('li', `"${g.key}" → eski kayıt no: ${oldNos}; yeni kayıt no: ${newNos}`));
    }
    if (r.ambiguous.length > MAX_LISTED) {
      ul.append(cell('li', `… ve ${r.ambiguous.length - MAX_LISTED} anahtar daha`));
    }
    wrap.append(ul);
    matchEl.append(wrap);
  }

  if (r.invalidOld.length + r.invalidNew.length > 0) {
    const wrap = document.createElement('div');
    wrap.append(cell('h3', 'Geçersiz (boş veya yalnızca boşluk) anahtarlı kayıtlar'));
    const ul = document.createElement('ul');
    if (r.invalidOld.length > 0) {
      ul.append(cell('li', `Eski CSV: ${r.invalidOld.length} kayıt. Kayıt no: ${limited(r.invalidOld)}`));
    }
    if (r.invalidNew.length > 0) {
      ul.append(cell('li', `Yeni CSV: ${r.invalidNew.length} kayıt. Kayıt no: ${limited(r.invalidNew)}`));
    }
    wrap.append(ul);
    matchEl.append(wrap);
  }
}

// Bir hücre değerini görünür biçimde yazar: eksik hücre, boş metin ve yalnızca boşluk ayrı görünür.
function valueCell(value) {
  const td = document.createElement('td');
  const span = document.createElement('span');
  span.className = 'val';
  if (value === undefined) {
    span.textContent = '(hücre yok)';
    span.classList.add('val-special');
  } else if (value === '') {
    span.textContent = '(boş metin)';
    span.classList.add('val-special');
  } else {
    span.textContent = `"${value}"`;
    if (value.trim() === '') {
      const tag = cell('span', ' (yalnızca boşluk)');
      tag.className = 'val-special';
      td.append(span, tag);
      return td;
    }
  }
  td.append(span);
  return td;
}

const KIND_LABELS = {
  changed: 'Değer değişti',
  'old-missing': 'Eski kayıtta hücre yok',
  'new-missing': 'Yeni kayıtta hücre yok',
};

function comparableColumns() {
  return findComparableColumns(state.old.headers, state.new.headers, selectedKey);
}

// Seçili beklenen kolonlara göre değişiklik sonucunu çizer (checkbox'lara dokunmaz).
function renderChangeResults() {
  changesResultsEl.replaceChildren();
  if (!currentMatch) return;
  const columns = comparableColumns();
  if (columns.length === 0) {
    changesResultsEl.append(cell('p', 'Karşılaştırılabilecek veri kolonu yok.'));
    return;
  }

  const r = compareCells(currentMatch.matched, state.old.headers, state.new.headers, columns, expectedColumns);
  const stats = document.createElement('dl');
  stats.className = 'summary';
  stats.append(
    statCard('Beklenen değişen hücre', r.expectedCount),
    statCard('Beklenmeyen değişen hücre', r.unexpectedCount),
    statCard('Değişen kayıt', `${r.changedRecordCount} / ${r.comparedPairCount}`),
  );
  changesResultsEl.append(
    stats,
    cell('p', 'Hücre sayısı ile kayıt sayısı farklıdır: bir kayıtta birden fazla hücre değişmiş olabilir.'),
  );

  if (r.changes.length === 0) {
    changesResultsEl.append(cell('p', 'Karşılaştırılan hücrelerde değişiklik yok.'));
    return;
  }

  const head = document.createElement('tr');
  for (const h of ['Durum', 'Anahtar', 'Kolon', 'Eski değer', 'Yeni değer', 'Değişiklik türü']) {
    head.append(cell('th', h));
  }
  const thead = document.createElement('thead');
  thead.append(head);

  const tbody = document.createElement('tbody');
  for (const c of r.changes.slice(0, CHANGE_ROWS)) {
    const tr = document.createElement('tr');
    tr.append(
      cell('td', c.expected ? 'Beklenen' : 'Beklenmeyen'),
      cell('td', c.key),
      cell('td', c.column),
      valueCell(c.oldValue),
      valueCell(c.newValue),
      cell('td', KIND_LABELS[c.kind]),
    );
    if (!c.expected) tr.className = 'unexpected';
    tbody.append(tr);
  }
  const table = document.createElement('table');
  table.append(thead, tbody);
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  wrap.append(table);
  changesResultsEl.append(wrap);

  if (r.changes.length > CHANGE_ROWS) {
    changesResultsEl.append(
      cell(
        'p',
        `İlk ${CHANGE_ROWS} değişiklik gösteriliyor (beklenmeyenler önce); ${r.changes.length - CHANGE_ROWS} değişiklik daha gösterilmiyor. Yukarıdaki sayılar gösterilmeyenler dahil bütün değişiklikleri kapsar.`,
      ),
    );
  }
}

// Hücre değişikliği bölümü: kapsam notu, beklenen kolon seçimi ve sonuçlar.
function renderChanges() {
  const loading = state.old.status === 'loading' || state.new.status === 'loading';
  const ready = state.old.status === 'ok' && state.new.status === 'ok';

  changesResultsEl.replaceChildren();
  expectedListEl.replaceChildren();
  changesScopeEl.textContent = '';

  if (loading) {
    changesEl.hidden = true; // yükleme sırasında seçim korunur, eski sonuç gösterilmez
    return;
  }
  if (!ready) {
    expectedColumns.clear(); // hatalı/boş dosya: seçimler artık uygun değil
    changesEl.hidden = true;
    return;
  }

  // Yalnızca hâlâ uygun kolonlar kalır; yeni anahtar kolon seçimlerden çıkar.
  const columns = comparableColumns();
  for (const name of [...expectedColumns]) if (!columns.includes(name)) expectedColumns.delete(name);

  changesEl.hidden = selectedKey === '' || !currentMatch;
  if (changesEl.hidden) return;

  // Kapsam dışı kolonlar: iki dosyada da tek kez bulunmayan veya adı boş olanlar (anahtar hariç).
  const outOfScope = [...new Set([...state.old.headers, ...state.new.headers])].filter(
    (n) => n !== selectedKey && !columns.includes(n),
  );
  const scope = [
    `Yalnızca güvenle eşleşen ${currentMatch.matched.length} kayıt çifti karşılaştırılır.`,
  ];
  if (currentMatch.partial) {
    scope.push('Belirsiz ve geçersiz anahtarlı kayıtların hücreleri karşılaştırılmadı.');
  }
  scope.push(`Anahtar kolon ("${selectedKey}") karşılaştırmaya katılmaz.`);
  if (outOfScope.length > 0) {
    const names = outOfScope.map((n) => (n.trim() === '' ? '(boş başlık)' : n)).join(', ');
    scope.push(`Kapsam dışı kolonlar (iki dosyada da tek kez bulunmuyor veya adı boş): ${names}.`);
  }
  changesScopeEl.textContent = scope.join(' ');

  for (const name of columns) {
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = name;
    box.checked = expectedColumns.has(name);
    box.addEventListener('change', () => {
      if (box.checked) expectedColumns.add(name);
      else expectedColumns.delete(name);
      renderChangeResults();
    });
    label.append(box, ' ', name);
    expectedListEl.append(label);
  }
  document.getElementById('expected-set').hidden = columns.length === 0; // seçilecek kolon yoksa kutuyu gösterme

  renderChangeResults();
}

// Seçilen anahtara göre iki dosyanın denetim sonucunu çizer.
function renderKeyResults() {
  renderMatch();
  renderChanges();
  keyResultsEl.replaceChildren();
  if (selectedKey === '' || state.old.status !== 'ok' || state.new.status !== 'ok') return;
  keyResultsEl.append(
    cell('p', 'Kayıt no, başlık satırı hariç 1\'den başlar; dosyadaki fiziksel satır numarası değildir.'),
    keyReport('Eski CSV', state.old.headers, state.old.records),
    keyReport('Yeni CSV', state.new.headers, state.new.records),
  );
}

// Dosyalar değişince çağrılır: adayları yeniden hesaplar, seçim artık uygun değilse temizler.
function renderKey() {
  const ready = state.old.status === 'ok' && state.new.status === 'ok';
  const candidates = ready ? findKeyCandidates(state.old.headers, state.new.headers) : [];
  const loading = state.old.status === 'loading' || state.new.status === 'loading';
  if (!loading && !candidates.includes(selectedKey)) selectedKey = '';

  keyPickerEl.hidden = candidates.length === 0;
  if (!ready) {
    keyHintEl.textContent = 'Anahtar kolon seçmek için iki dosyayı da başarıyla yükleyin.';
  } else if (candidates.length === 0) {
    keyHintEl.textContent =
      'Seçilebilecek kolon yok. Anahtar kolon iki dosyada da bulunmalı, adı boş olmamalı ve her dosyada yalnızca bir kez geçmelidir.';
  } else {
    keyHintEl.textContent = 'Anahtar kolonu siz seçersiniz; otomatik seçim yapılmaz.';
  }

  const placeholder = new Option('Kolon seçin…', '');
  keySelectEl.replaceChildren(placeholder, ...candidates.map((name) => new Option(name, name)));
  keySelectEl.value = selectedKey;
  renderKeyResults();
}

keySelectEl.addEventListener('change', () => {
  selectedKey = keySelectEl.value;
  renderKeyResults();
});

for (const side of SIDES) panels[side.id] = createPanel(side);
renderColumns();
renderKey();
