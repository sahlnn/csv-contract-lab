import sampleCsv from './sample.csv?raw';
import { parseCsvText, readCsvFile, compareColumns } from './csv.js';
import './style.css';

const PREVIEW_ROWS = 20;
const SIDES = [
  { id: 'old', title: 'Eski CSV' },
  { id: 'new', title: 'Yeni CSV' },
];

// Her tarafın durumu birbirinden bağımsızdır:
// { status: 'empty' } | { status: 'ok', fileName, headers, records, columnCount } | { status: 'error', error }
const state = {
  old: { status: 'empty' },
  new: { status: 'empty' },
};

// Bir taraftaki eski bir okuma, yenisinden sonra bitip durumu ezmesin diye.
const runs = { old: 0, new: 0 };

const panels = {};
const columnsEl = document.getElementById('columns');

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
  setState(sideId, { status: 'empty' }); // önceki dosyanın sonuçları hemen temizlenir
  const parsed = await readCsvFile(file);
  if (run !== runs[sideId]) return;
  setState(sideId, toState(file.name, parsed));
}

function setState(sideId, next) {
  state[sideId] = next;
  renderPanel(sideId);
  renderColumns();
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

for (const side of SIDES) panels[side.id] = createPanel(side);
renderColumns();
