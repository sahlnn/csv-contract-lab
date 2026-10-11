// Bu dosya ekrana (DOM) hiç dokunmaz: yalnızca kayıtları anahtara göre eşleştirir.
// Anahtarlar birebir metin olarak karşılaştırılır (boşluk kırpılmaz, harf boyutu değişmez).
// Kayıt numarası, başlık satırı hariç 1'den başlar (fiziksel dosya satırı değildir).

/** Bir dosyayı anahtara göre gruplar. Anahtar kolonu o dosyanın kendi başlığından bulunur. */
function indexByKey(headers, records, keyName) {
  const col = headers.indexOf(keyName);
  const invalid = []; // boş veya yalnızca boşluk içeren anahtarlı kayıt numaraları
  const groups = new Map(); // anahtar -> [{ recordNumber, record }]

  records.forEach((record, i) => {
    const recordNumber = i + 1;
    const value = record[col] ?? ''; // satırda hücre yoksa boş sayılır
    if (value.trim() === '') {
      invalid.push(recordNumber);
      return;
    }
    const item = { recordNumber, record };
    const list = groups.get(value);
    if (list) list.push(item);
    else groups.set(value, [item]);
  });

  return { invalid, groups };
}

/**
 * Eski ve yeni kayıtları anahtara göre eşleştirir.
 *
 * - matched:   anahtar iki dosyada da tam birer kez var
 * - added:     anahtar yalnızca yeni dosyada ve tek kez var
 * - removed:   anahtar yalnızca eski dosyada ve tek kez var
 * - ambiguous: anahtar herhangi bir dosyada birden fazla kez var; o anahtarın
 *              İKİ dosyadaki bütün kayıtları buraya girer
 * - invalidOld / invalidNew: boş veya yalnızca boşluk içeren anahtarlı kayıt numaraları
 *
 * Belirsiz ve geçersiz kayıtlar matched/added/removed'a katılmaz.
 */
export function matchRecords(oldData, newData, keyName) {
  const oldIdx = indexByKey(oldData.headers, oldData.records, keyName);
  const newIdx = indexByKey(newData.headers, newData.records, keyName);

  const matched = [];
  const added = [];
  const removed = [];
  const ambiguous = [];

  for (const [key, oldItems] of oldIdx.groups) {
    const newItems = newIdx.groups.get(key) ?? [];
    if (oldItems.length > 1 || newItems.length > 1) {
      ambiguous.push({
        key,
        oldRecordNumbers: oldItems.map((x) => x.recordNumber),
        newRecordNumbers: newItems.map((x) => x.recordNumber),
      });
    } else if (newItems.length === 1) {
      matched.push({
        key,
        oldRecordNumber: oldItems[0].recordNumber,
        newRecordNumber: newItems[0].recordNumber,
        oldRecord: oldItems[0].record,
        newRecord: newItems[0].record,
      });
    } else {
      removed.push({ key, ...oldItems[0] });
    }
  }

  for (const [key, newItems] of newIdx.groups) {
    if (oldIdx.groups.has(key)) continue; // yukarıda işlendi
    if (newItems.length > 1) {
      ambiguous.push({
        key,
        oldRecordNumbers: [],
        newRecordNumbers: newItems.map((x) => x.recordNumber),
      });
    } else {
      added.push({ key, ...newItems[0] });
    }
  }

  const ambiguousRecordCount = ambiguous.reduce(
    (sum, g) => sum + g.oldRecordNumbers.length + g.newRecordNumbers.length,
    0,
  );
  const invalidCount = oldIdx.invalid.length + newIdx.invalid.length;

  return {
    matched,
    added,
    removed,
    ambiguous,
    ambiguousRecordCount,
    invalidOld: oldIdx.invalid,
    invalidNew: newIdx.invalid,
    partial: ambiguous.length > 0 || invalidCount > 0,
  };
}
