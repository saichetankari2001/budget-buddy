import Papa from 'papaparse';

export interface ParsedExpenseRow {
  date: string;
  description: string;
  categoryName: string;
  amount: number;
}

export interface SkippedRow {
  row: number;
  reason: string;
}

export interface ParseResult {
  valid: ParsedExpenseRow[];
  skipped: SkippedRow[];
}

const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function parseAndValidateCsvRows(csvText: string): ParseResult {
  const { data } = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
  });

  const valid: ParsedExpenseRow[] = [];
  const skipped: SkippedRow[] = [];

  data.forEach((row, index) => {
    const rowNumber = index + 1;
    const date = (row.date ?? '').trim();
    const description = (row.description ?? '').trim();
    const categoryName = (row.category ?? '').trim();
    const amountRaw = (row.amount ?? '').trim();

    const isValidDate =
      DATE_FORMAT_REGEX.test(date) &&
      !Number.isNaN(Date.parse(date)) &&
      new Date(date).toISOString().slice(0, 10) === date;

    if (!isValidDate) {
      skipped.push({ row: rowNumber, reason: `date "${date}" is not a valid YYYY-MM-DD date` });
      return;
    }
    if (!description) {
      skipped.push({ row: rowNumber, reason: 'description is empty' });
      return;
    }
    if (!categoryName) {
      skipped.push({ row: rowNumber, reason: 'category is empty' });
      return;
    }
    const amount = Number(amountRaw);
    if (amountRaw === '' || Number.isNaN(amount) || amount <= 0) {
      skipped.push({ row: rowNumber, reason: `amount "${amountRaw}" is not a positive number` });
      return;
    }

    valid.push({ date, description, categoryName, amount });
  });

  return { valid, skipped };
}

export interface CsvExpenseRow {
  date: string;
  description: string;
  categoryName: string;
  amount: number;
}

function escapeCsvField(field: string): string {
  if (/[",\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function serializeExpensesToCsv(expenses: CsvExpenseRow[]): string {
  const header = 'date,description,category,amount';
  const rows = expenses.map((e) =>
    [e.date, escapeCsvField(e.description), escapeCsvField(e.categoryName), e.amount.toFixed(2)].join(',')
  );
  return [header, ...rows].join('\n');
}
