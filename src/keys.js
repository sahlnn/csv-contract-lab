// Bu dosya ekrana (DOM) hiç dokunmaz: yalnızca anahtar kolon verisini denetler.
// Anahtar değerleri metin olarak, birebir karşılaştırılır: "001" ile "1" farklıdır;
// boşluk kırpılmaz, büyük/küçük harf dönüştürülmez.

function isBlankName(name) {
  return name.trim() === '';
}

function countOf(list, value) {
  let n = 0;
  for (const item of list) if (item === value) n++;
  return n;
}

/**
 * Anahtar olarak seçilebilecek kolon adları: iki dosyada da bulunan, adı boş
 * (veya yalnızca boşluk) olmayan ve her iki dosyada yalnızca bir kez geçen kolonlar.
 * Sıra, eski dosyadaki sıradır.
 */
export function findKeyCandidates(oldHeaders, newHeaders) {
  return oldHeaders.filter(
    (name, i) =>
      !isBlankName(name) &&
      oldHeaders.indexOf(name) === i &&
      countOf(oldHeaders, name) === 1 &&
      countOf(newHeaders, name) === 1,
  );
}

/**
 * Seçilen anahtar kolonu denetler.
 * Kayıt numarası, başlık satırı hariç 1'den başlar (fiziksel dosya satırı değildir).
 * Döndürür: { totalRecords, emptyRecords: [kayıt no, ...],
 *             duplicates: [{ value, recordNumbers: [...] }, ...] }
 * Boş metin ve yalnızca boşluk içeren değerler geçersiz sayılır; tekrar kontrolüne girmez.
 */
export function checkKey(headers, records, keyName) {
  const col = headers.indexOf(keyName);
  const emptyRecords = [];
  const groups = new Map(); // anahtar değeri -> kayıt numaraları

  records.forEach((record, i) => {
    const recordNumber = i + 1;
    const value = record[col] ?? ''; // satırda hücre yoksa boş sayılır
    if (value.trim() === '') {
      emptyRecords.push(recordNumber);
      return;
    }
    const list = groups.get(value);
    if (list) list.push(recordNumber);
    else groups.set(value, [recordNumber]);
  });

  const duplicates = [];
  for (const [value, recordNumbers] of groups) {
    if (recordNumbers.length > 1) duplicates.push({ value, recordNumbers });
  }
  return { totalRecords: records.length, emptyRecords, duplicates };
}
