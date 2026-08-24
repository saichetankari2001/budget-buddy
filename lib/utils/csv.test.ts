import { describe, it, expect } from 'vitest';
import { serializeExpensesToCsv } from './csv';

describe('serializeExpensesToCsv', () => {
  it('returns just the header for an empty list', () => {
    expect(serializeExpensesToCsv([])).toBe('date,description,category,amount');
  });

  it('serializes normal rows', () => {
    const csv = serializeExpensesToCsv([
      { date: '2026-08-01', description: 'Groceries', categoryName: 'Food', amount: 42.5 },
      { date: '2026-08-02', description: 'Bus fare', categoryName: 'Transport', amount: 3 },
    ]);
    expect(csv).toBe(
      'date,description,category,amount\n2026-08-01,Groceries,Food,42.50\n2026-08-02,Bus fare,Transport,3.00'
    );
  });

  it('quotes a description containing a comma', () => {
    const csv = serializeExpensesToCsv([
      { date: '2026-08-01', description: 'Coffee, tea', categoryName: 'Food', amount: 5 },
    ]);
    expect(csv).toBe('date,description,category,amount\n2026-08-01,"Coffee, tea",Food,5.00');
  });

  it('escapes a description containing a double quote', () => {
    const csv = serializeExpensesToCsv([
      { date: '2026-08-01', description: 'The "best" coffee', categoryName: 'Food', amount: 5 },
    ]);
    expect(csv).toBe('date,description,category,amount\n2026-08-01,"The ""best"" coffee",Food,5.00');
  });

  it('quotes and escapes a description containing both a comma and a double quote', () => {
    const csv = serializeExpensesToCsv([
      { date: '2026-08-01', description: 'Coffee, "the best"', categoryName: 'Food', amount: 5 },
    ]);
    expect(csv).toBe('date,description,category,amount\n2026-08-01,"Coffee, ""the best""",Food,5.00');
  });
});
