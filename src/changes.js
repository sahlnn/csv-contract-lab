// Bu dosya ekrana (DOM) hiç dokunmaz: yalnızca eşleşen kayıt çiftlerinin hücrelerini karşılaştırır.
// Değerler birebir metin olarak karşılaştırılır: boşluk kırpılmaz, sayıya veya küçük harfe çevrilmez.
// Kolonlar her dosyanın kendi başlığından, adlarına göre bulunur.

import { findKeyCandidates } from './keys.js';

/**
 * Hücre karşılaştırmasına girebilen kolonlar: iki dosyada da bulunan, adı boş olmayan,
 * her dosyada yalnızca bir kez geçen kolonlar. Anahtar kolon hariçtir.
 */
export function findComparableColumns(oldHeaders, newHeaders, keyName) {
  return findKeyCandidates(oldHeaders, newHeaders).filter((name) => name !== keyName);
}

/**
 * Hücre değeri: metin ya da undefined (kayıtta o hücre hiç yok).
 * Eksik hücre ('' ile) aynı sayılmaz.
 */
function cellAt(record, index) {
  return record[index]; // kısa kayıtta undefined döner
}

/**
 * Güvenle eşleşen kayıt çiftlerinin seçili kolonlardaki hücrelerini karşılaştırır.
 * matched: matchRecords sonucundaki matched listesi (oldRecord/newRecord içerir)
 * expectedColumns: kullanıcının "beklenen değişiklik" olarak işaretlediği kolon adları (Set)
 *
 * Değişiklik türleri:
 *   'changed'     : iki kayıtta da hücre var, değerler farklı
 *   'old-missing' : eski kayıtta hücre yok, yenide var
 *   'new-missing' : eski kayıtta hücre var, yeni kayıtta yok
 * İki kayıtta da hücre yoksa değişiklik sayılmaz.
 *
 * Sonuç sırası: önce beklenmeyen, sonra beklenen değişiklikler (kendi içlerinde dosya sırasıyla).
 */
export function compareCells(matched, oldHeaders, newHeaders, columns, expectedColumns) {
  const cols = columns.map((name) => ({
    name,
    oldIndex: oldHeaders.indexOf(name),
    newIndex: newHeaders.indexOf(name),
    expected: expectedColumns.has(name),
  }));

  const unexpected = [];
  const expected = [];
  let changedRecordCount = 0;

  for (const pair of matched) {
    let changedHere = false;
    for (const col of cols) {
      const oldValue = cellAt(pair.oldRecord, col.oldIndex);
      const newValue = cellAt(pair.newRecord, col.newIndex);
      if (oldValue === newValue) continue; // aynı metin ya da ikisinde de hücre yok

      let kind = 'changed';
      if (oldValue === undefined) kind = 'old-missing';
      else if (newValue === undefined) kind = 'new-missing';

      changedHere = true;
      const change = {
        key: pair.key,
        column: col.name,
        oldValue,
        newValue,
        kind,
        expected: col.expected,
        oldRecordNumber: pair.oldRecordNumber,
        newRecordNumber: pair.newRecordNumber,
      };
      (col.expected ? expected : unexpected).push(change);
    }
    if (changedHere) changedRecordCount++;
  }

  return {
    changes: [...unexpected, ...expected],
    unexpectedCount: unexpected.length,
    expectedCount: expected.length,
    changedRecordCount,
    comparedPairCount: matched.length,
  };
}
