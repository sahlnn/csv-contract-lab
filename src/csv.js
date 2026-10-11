import Papa from 'papaparse';

// Bu dosya ekrana (DOM) hiç dokunmaz: yalnızca veri veya hata bilgisi döndürür.

export const MAX_BYTES = 2 * 1024 * 1024;

function formatMb(bytes) {
  return (Math.ceil((bytes / (1024 * 1024)) * 100) / 100).toFixed(2).replace('.', ',');
}

/**
 * CSV metnini ayrıştırır.
 * Başarılıysa: { ok: true, headers, records, columnCount }
 * Başarısızsa: { ok: false, error }
 * Tüm hücreler metin kalır; başlıklar ve değerler değiştirilmez.
 */
export function parseCsvText(text) {
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
    return { ok: false, error: `CSV okunurken hata oluştu${where}: ${e.message}` };
  }
  if (parsed.data.length === 0) {
    return { ok: false, error: 'Dosya boş görünüyor; okunacak satır bulunamadı.' };
  }

  const [headers, ...records] = parsed.data;
  const columnCount = parsed.data.reduce((max, r) => Math.max(max, r.length), 0);
  return { ok: true, headers, records, columnCount };
}

/** Seçilen dosyayı denetler (boyut, boşluk, UTF-8) ve parseCsvText ile ayrıştırır. */
export async function readCsvFile(file) {
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      error: `Dosya çok büyük (${formatMb(file.size)} MB). Şimdilik en fazla ${formatMb(MAX_BYTES)} MB'a kadar dosyalar açılabiliyor.`,
    };
  }
  if (file.size === 0) {
    return { ok: false, error: 'Dosya boş; okunacak içerik yok.' };
  }

  let text;
  try {
    const buffer = await file.arrayBuffer();
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof TypeError
          ? 'Dosya UTF-8 olarak okunamadı. Lütfen CSV dosyasını UTF-8 kodlamasıyla kaydedip tekrar deneyin.'
          : 'Dosya okunamadı. Lütfen tekrar deneyin.',
    };
  }

  return parseCsvText(text);
}

function duplicates(headers) {
  const seen = new Set();
  const dup = new Set();
  for (const h of headers) {
    if (seen.has(h)) dup.add(h);
    seen.add(h);
  }
  return [...dup];
}

/**
 * İki başlık listesini karşılaştırır. Adlar birebir (boşluk ve büyük/küçük harf dahil) eşleşir.
 * Yalnızca sıra değiştiyse eksik/eklenen sayılmaz; orderChanged ile ayrıca bildirilir.
 */
export function compareColumns(oldHeaders, newHeaders) {
  const oldSet = new Set(oldHeaders);
  const newSet = new Set(newHeaders);
  const missing = [...oldSet].filter((h) => !newSet.has(h));
  const added = [...newSet].filter((h) => !oldSet.has(h));
  const sameNames = missing.length === 0 && added.length === 0;
  const orderChanged =
    sameNames &&
    oldHeaders.length === newHeaders.length &&
    oldHeaders.some((h, i) => h !== newHeaders[i]);
  return {
    missing,
    added,
    orderChanged,
    duplicatesOld: duplicates(oldHeaders),
    duplicatesNew: duplicates(newHeaders),
  };
}
