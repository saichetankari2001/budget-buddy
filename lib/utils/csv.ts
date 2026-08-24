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
