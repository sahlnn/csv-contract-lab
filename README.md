# CSV Contract Lab

A small browser tool that compares an **old** and a **new** CSV file and shows
which cell changes you **expected** and which you did **not**.

You pick a key column (for example `id`) to match rows, and you mark the columns
you expect to change (for example `price`). Every other change is shown as
unexpected.

The interface is in Turkish.

## What it does

- Loads an old and a new CSV file, each with its own preview (first 20 records).
- Compares column names and reports missing, added and reordered columns.
- Lets you choose a key column to match records. Nothing is chosen automatically.
- Matches records by key and reports matched, added and removed records.
- Compares the cells of matched records and splits the changes into
  **expected** (in a column you marked) and **unexpected** (everything else).

## Install and run

You need npm and Node.js `^20.19.0` or `>=22.12.0` (the range required by the
installed Vite 8.3.4).

```bash
npm install
npm run dev
```

Then open http://localhost:5173/ (Vite prints the address it uses).

Other commands from `package.json`:

```bash
npm run build     # production build into dist/
npm run preview   # serve the production build locally
```

There is no test suite yet.

## Try it with the example files

The repository contains two small files in `src/`:

`src/example-old.csv`

```csv
id,name,price
001,Kalem,10
002,Defter,25
003,Silgi,5
```

`src/example-new.csv`

```csv
id,name,price
001,Kalem,12
002,Defter A5,25
003,Silgi,5
```

Steps:

1. Choose `example-old.csv` in the **Eski CSV** box and `example-new.csv` in
   the **Yeni CSV** box.
2. In the key column list, select `id`.
3. In the expected-columns list, tick only `price`.

Expected result:

- Columns: "Kolon adları aynı." (same names).
- Record matching: 3 matched, 0 added, 0 removed.
- Cell changes: 1 expected, 1 unexpected, in 2 of 3 records.
  - Expected: key `001`, column `price`, `"10"` → `"12"`.
  - Unexpected: key `002`, column `name`, `"Defter"` → `"Defter A5"`.
- Record `003` did not change.

If you tick nothing, both changes are shown as unexpected.

The **Örnek dosyayı aç** button in each box loads a built-in sample
(`src/sample.csv`) instead. It has a repeated `id` and a blank `name`, so it is
useful for trying the key checks.

## How comparison works

- **Plain text.** Every cell is read as text and compared exactly. `001` and `1`
  are different. `A` and `a` are different. A trailing space is a difference.
  Nothing is trimmed, converted to a number or lowercased.
- **Columns are matched by name**, not by position. Reordering columns or rows
  does not create changes.
- **Row 1 is the header.** Empty lines are skipped. Comma and semicolon
  delimiters are detected. Files must be UTF-8.
- **Missing cell is not an empty value.** If a short row has no cell for a
  column, that is shown as `(hücre yok)` and is different from an empty text
  (`(boş metin)`).
- **Record numbers** start at 1 after the header row. They are not physical line
  numbers in the file.

### Key column rules

You can choose a column as the key only if it exists in both files, has a
non-empty name and appears only once in each file's header.

Records are excluded from comparison when:

- **The key is empty or only spaces.** These records are listed separately.
- **The key is repeated in either file.** All records with that key, in both
  files, are put in an "ambiguous" group. A single copy in the other file does
  not resolve it.

Excluded records are not counted as matched, added or removed, and their cells
are not compared. When this happens the page says the results are partial.

Only matched pairs are compared. The key column itself and columns that are not
present exactly once in both files are out of scope for cell comparison.

## Limits

- Maximum file size: 2 MB per file.
- Each file preview shows the first 20 records.
- Added and removed record tables show the first 20 records each.
- The cell change table shows the first 50 changes (unexpected first). The
  counts above the table include every change, shown or not.
- Lists of ambiguous keys and record numbers are shortened after 20 items.

## Privacy

The files are processed in your browser. The application code makes no network
requests, does not upload file contents and does not store them (no cookies,
local storage or IndexedDB). CSV parsing uses
[Papa Parse](https://www.papaparse.com/) on text already read in the browser.
Closing or reloading the page discards everything.

## What "expected" means

"Expected" only records **your intent**: you said you expected that column to
change. It does **not** mean the change is correct, safe or approved. Review
expected changes as carefully as unexpected ones.

## Not included

- This tool does not import, export or sync data, and it does not connect to
  Shopify or any other system. It makes **no guarantee** that a file will be
  accepted or handled correctly by Shopify or any other system.
- It does not check email formats, dates, required fields or value rules.
- It does not edit or save files.

## License

MIT License. Copyright (c) 2026 Ali Sahin. See [LICENSE](LICENSE).
