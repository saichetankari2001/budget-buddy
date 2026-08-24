# Budget Buddy v1.3 — CSV Import/Export

## Purpose

Third follow-on feature phase after v1 (core), the Indigo Bento redesign, v1.1
(budgets), and v1.2 (recurring expenses). Lets a user export their full
expense history to a CSV file, and import a CSV file to bulk-create
expenses — matching the original v1 design spec's phased roadmap (v1.3
between recurring expenses and the Australian-standards scope).

## Architecture

Two new API routes, each backed by a pure, unit-testable function kept
separate from the Prisma-touching code that reads/writes the database — the
same separation already used for `computeCountUpValue`, `aggregateByCategory`,
and `computeMissingOccurrences` in earlier phases:

- **Export:** `GET /api/expenses/export` queries all of the user's expenses
  and serializes them to CSV via a pure `serializeExpensesToCsv()` function,
  returning `text/csv` with a `Content-Disposition: attachment` header. The
  browser handles the download directly — no client-side CSV logic needed.
- **Import:** `POST /api/expenses/import` accepts an uploaded CSV file. Its
  text is handed to a pure `parseAndValidateCsvRows()` function (using the
  `papaparse` library for tokenizing), then a Prisma-touching wrapper
  (`importExpensesFromCsv`) looks up or creates categories and creates the
  valid expense rows, skipping and collecting reasons for invalid ones.

## Export

- Route: `GET /api/expenses/export`. Auth-checked like every other route
  (`getCurrentUser()` → 401 if absent). Queries
  `prisma.expense.findMany({ where: { userId }, include: { category: true },
  orderBy: { date: 'asc' } })` — the user's full expense history, no filters.
- CSV columns, in this order: `date,description,category,amount`. Dates are
  formatted `YYYY-MM-DD`; amounts as plain decimal strings (e.g. `42.50`);
  category as its name, not its ID.
- `serializeExpensesToCsv(expenses): string` is a pure function in
  `lib/utils/csv.ts`. It takes an array of plain
  `{ date, description, categoryName, amount }` objects and returns the CSV
  text, hand-escaping fields per standard CSV rules: a field containing a
  comma, a double quote, or a newline is wrapped in double quotes, with any
  internal double quotes doubled (`"` → `""`). Serialization is simple
  enough to hand-roll safely — the tricky edge cases live on the parsing
  side, which is why import uses a library instead (see below).
- UI: an "Export CSV" button on `/expenses`, next to the existing "Add
  expense" button, that links directly to `/api/expenses/export` — the
  browser handles the download via the response's `Content-Disposition`
  header, no client JS beyond a plain link.

## Import

- Route: `POST /api/expenses/import`. Auth-checked the same way. Accepts a
  multipart file upload containing the CSV file's text.
- `parseAndValidateCsvRows(csvText: string)` is a pure function in
  `lib/utils/csv.ts`. It uses `papaparse` to tokenize the CSV (correctly
  handling quoted commas, quoted newlines, and other edge cases that are
  easy to get subtly wrong by hand), then validates each row:
  - `date` must be a valid `YYYY-MM-DD` string (matching the export
    format exactly — any other date format, or a value `new Date()` can't
    parse, is treated as invalid)
  - `amount` must parse to a positive number
  - `description` must be a non-empty string
  - `category` must be a non-empty string

  Returns `{ valid: ParsedRow[], skipped: { row: number, reason: string }[] }`,
  where `row` is the 1-indexed row number (excluding the header) for
  reporting back to the user. Being a pure function with no Prisma
  dependency, this is fully unit-testable against in-memory CSV strings.

- `importExpensesFromCsv(userId, csvText): Promise<{ imported: number,
  skipped: { row: number, reason: string }[] }>` is the Prisma-touching
  wrapper in `lib/importExpensesFromCsv.ts`. It:
  1. Calls `parseAndValidateCsvRows` to get valid rows and already-skipped
     rows.
  2. Loads the user's existing categories once into an in-memory
     case-insensitive name lookup.
  3. For each valid row, matches its category name against the lookup
     (case-insensitive). If no match exists, creates a new `Category` for
     the user — cycling through a small fixed color palette (the same one
     already used for chart colors elsewhere in this app) — and adds it to
     the lookup, so later rows in the same file reuse it instead of
     creating duplicate categories.
  4. Creates an `Expense` row for each valid row, scoped to `userId`.
  5. Returns `{ imported: <count of rows actually created>, skipped:
     <the full skipped list from step 1> }`.

- UI: an "Import CSV" button on `/expenses`, next to "Export CSV", that
  opens a native file picker (`<input type="file" accept=".csv">`). On file
  selection, it uploads immediately, then shows a short results summary
  (e.g. "Imported 42 expenses. 3 rows skipped:" followed by each skipped
  row's reason) and refreshes the expense list to show the newly imported
  rows.

## Testing

Follows the project's established TDD pattern:

- `serializeExpensesToCsv` — pure function tests: an empty list, normal
  rows, a description containing a comma, one containing a double quote,
  and one containing both.
- `parseAndValidateCsvRows` — pure function tests: a clean file, a file
  with a bad date, a non-numeric amount, an empty description, a quoted
  field containing a comma (proving `papaparse` correctly parses what the
  hand-rolled exporter produces — a round-trip check), and a completely
  empty file.
- `importExpensesFromCsv` — wrapper tests using the shared Prisma mock
  (`tests/mocks/prisma.ts`): creates expenses for valid rows, auto-creates
  a missing category and reuses it across multiple rows in the same file,
  matches an existing category case-insensitively, and correctly reports
  skipped rows in its return value.
- Both new API routes get route tests following the existing
  `route.test.ts` pattern: auth check (401 when not logged in), success
  path, and — for import — that the skipped-rows summary is present in the
  response body.
- No dedicated test file for the two new UI buttons on
  `ExpensesClient.tsx`, matching this app's established convention (no
  page-level or client-component test file exists for this component) —
  curl-verified instead: export downloads a well-formed CSV, and importing
  a small file round-trips correctly.

## Out of Scope

- No recurring-expense fields (`isRecurring`/`recurrenceInterval`) in the
  CSV format — only the core columns (`date`, `description`, `category`,
  `amount`). A recurring expense exports as its already-generated one-off
  instances; importing a file never recreates a recurring template.
- No CSV format auto-detection or support for other apps'/banks' export
  formats — only this app's own `date,description,category,amount` format
  is accepted on import.
- No progress bar or streaming support for very large files — a
  synchronous request/response is sufficient at this project's scale
  (personal expense tracking, not enterprise bulk import).
- No column-mapping UI (letting a user match arbitrary CSV columns to
  fields) — the import format is fixed to the four columns above.
- The Australian-standards scope and the PWA mobile pass remain separate,
  later phases.
