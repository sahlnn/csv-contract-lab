import Papa from 'papaparse';
import sampleCsv from './sample.csv?raw';
import './style.css';

const MAX_BYTES = 2 * 1024 * 1024;
const PREVIEW_ROWS = 20;

const fileInput = document.getElementById('file-input');
const sampleBtn = document.getElementById('sample-btn');
const messageEl = document.getElementById('message');
const resultEl = document.getElementById('result');
const nameEl = document.getElementById('s-name');
const rowsEl = document.getElementById('s-rows');
const colsEl = document.getElementById('s-cols');
const noteEl = document.getElementById('preview-note');
const tableEl = document.getElementById('preview');

// Eski bir okuma yenisinden sonra bitip ekranı ezmesin diye.
let currentRun = 0;

function clearResult() {
  resultEl.hidden = true;
  nameEl.textContent = '';
  rowsEl.textContent = '';
  colsEl.textContent = '';
  noteEl.textContent = '';
  tableEl.replaceChildren();
}

function showError(text) {
  clearResult();
  messageEl.textContent = text;
  messageEl.hidden = false;
}

function clearError() {
  messageEl.textContent = '';
  messageEl.hidden = true;
}

function formatMb(bytes) {
  return (Math.ceil((bytes / (1024 * 1024)) * 100) / 100).toFixed(2).replace('.', ',');
}

function cell(tag, text) {
  const el = document.createElement(tag);
  el.textContent = text; // metin olarak yazılır, HTML yorumlanmaz
  return el;
}

function render(fileName, rows) {
  const [header, ...records] = rows;
  const colCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const shown = records.slice(0, PREVIEW_ROWS);

  nameEl.textContent = fileName;
  rowsEl.textContent = String(records.length);
  colsEl.textContent = String(colCount);

  if (records.length === 0) {
    noteEl.textContent = 'Dosyada yalnızca başlık satırı var; veri kaydı yok.';
  } else if (records.length > PREVIEW_ROWS) {
    noteEl.textContent = `İlk ${PREVIEW_ROWS} veri kaydı gösteriliyor (toplam ${records.length}).`;
  } else {
    noteEl.textContent = `${records.length} veri kaydının tümü gösteriliyor.`;
  }

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (let i = 0; i < colCount; i++) headRow.append(cell('th', header[i] ?? ''));
  thead.append(headRow);

  const tbody = document.createElement('tbody');
  for (const record of shown) {
    const tr = document.createElement('tr');
    for (let i = 0; i < colCount; i++) tr.append(cell('td', record[i] ?? ''));
    tbody.append(tr);
  }

  tableEl.replaceChildren(thead, tbody);
  resultEl.hidden = false;
}

function parseText(fileName, text) {
  const parsed = Papa.parse(text, {
    header: false, // ilk satırı kendimiz başlık yapıyoruz; hücreler metin kalır
    dynamicTyping: false,
    skipEmptyLines: 'greedy',
    delimiter: '',
    delimitersToGuess: [',', ';'],
  });

  // Tek kolonlu dosyalarda ayırıcı bulunamaması hata sayılmaz.
  const errors = parsed.errors.filter((e) => e.code !== 'UndetectableDelimiter');
  if (errors.length > 0) {
    const e = errors[0];
    const where = typeof e.row === 'number' ? ` (yaklaşık ${e.row + 1}. satır)` : '';
    showError(`CSV okunurken hata oluştu${where}: ${e.message}`);
    return;
  }
  if (parsed.data.length === 0) {
    showError('Dosya boş görünüyor; okunacak satır bulunamadı.');
    return;
  }

  clearError();
  render(fileName, parsed.data);
}

async function handleFile(file) {
  const run = ++currentRun;
  clearError();
  clearResult();

  if (file.size > MAX_BYTES) {
    showError(
      `Dosya çok büyük (${formatMb(file.size)} MB). Şimdilik en fazla ${formatMb(MAX_BYTES)} MB'a kadar dosyalar açılabiliyor.`,
    );
    return;
  }
  if (file.size === 0) {
    showError('Dosya boş; okunacak içerik yok.');
    return;
  }

  let text;
  try {
    const buffer = await file.arrayBuffer();
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (err) {
    if (run !== currentRun) return;
    showError(
      err instanceof TypeError
        ? 'Dosya UTF-8 olarak okunamadı. Lütfen CSV dosyasını UTF-8 kodlamasıyla kaydedip tekrar deneyin.'
        : 'Dosya okunamadı. Lütfen tekrar deneyin.',
    );
    return;
  }
  if (run !== currentRun) return;

  parseText(file.name, text);
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) {
    // Seçim iptal edildi: önceki sonuçlar temizlenir.
    currentRun++;
    clearError();
    clearResult();
    return;
  }
  handleFile(file);
});

sampleBtn.addEventListener('click', () => {
  currentRun++;
  fileInput.value = '';
  parseText('ornek.csv', sampleCsv);
});
