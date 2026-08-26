import { describe, it, expect } from 'vitest';
import { serializeExpensesToCsv } from './csv';
import { parseAndValidateCsvRows } from './csv';

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

describe('parseAndValidateCsvRows', () => {
  it('parses a clean file into valid rows', () => {
    const csv =
      'date,description,category,amount\n2026-08-01,Groceries,Food,42.50\n2026-08-02,Bus fare,Transport,3.00';
    const result = parseAndValidateCsvRows(csv);
    expect(result.valid).toEqual([
      { date: '2026-08-01', description: 'Groceries', categoryName: 'Food', amount: 42.5 },
      { date: '2026-08-02', description: 'Bus fare', categoryName: 'Transport', amount: 3 },
    ]);
    expect(result.skipped).toEqual([]);
  });

  it('skips a row with an invalid date', () => {
    const csv = 'date,description,category,amount\nnot-a-date,Groceries,Food,42.50';
    const result = parseAndValidateCsvRows(csv);
    expect(result.valid).toEqual([]);
    expect(result.skipped).toEqual([
      { row: 1, reason: 'date "not-a-date" is not a valid YYYY-MM-DD date' },
    ]);
  });

  it('skips a row with a non-numeric amount', () => {
    const csv = 'date,description,category,amount\n2026-08-01,Groceries,Food,not-a-number';
    const result = parseAndValidateCsvRows(csv);
    expect(result.valid).toEqual([]);
    expect(result.skipped).toEqual([
      { row: 1, reason: 'amount "not-a-number" is not a positive number' },
    ]);
  });

  it('skips a row with an empty description', () => {
    const csv = 'date,description,category,amount\n2026-08-01,,Food,42.50';
    const result = parseAndValidateCsvRows(csv);
    expect(result.valid).toEqual([]);
    expect(result.skipped).toEqual([{ row: 1, reason: 'description is empty' }]);
  });

  it('correctly parses a quoted field containing a comma (round-trip with the exporter)', () => {
    const csv = 'date,description,category,amount\n2026-08-01,"Coffee, tea",Food,5.00';
    const result = parseAndValidateCsvRows(csv);
    expect(result.valid).toEqual([
      { date: '2026-08-01', description: 'Coffee, tea', categoryName: 'Food', amount: 5 },
    ]);
    expect(result.skipped).toEqual([]);
  });

  it('returns empty valid and skipped arrays for a file with only a header', () => {
    const csv = 'date,description,category,amount';
    const result = parseAndValidateCsvRows(csv);
    expect(result.valid).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('rejects a calendar date that does not exist, like February 30th', () => {
    const csv = 'date,description,category,amount\n2026-02-30,Groceries,Food,42.50';
    const result = parseAndValidateCsvRows(csv);
    expect(result.valid).toEqual([]);
    expect(result.skipped).toEqual([
      { row: 1, reason: 'date "2026-02-30" is not a valid YYYY-MM-DD date' },
    ]);
  });

  it('correctly parses a quoted field containing an embedded newline (round-trip with the exporter)', () => {
    const exported = serializeExpensesToCsv([
      { date: '2026-08-01', description: 'Rent\nJuly installment', categoryName: 'Housing', amount: 500 },
    ]);
    const result = parseAndValidateCsvRows(exported);
    expect(result.valid).toEqual([
      { date: '2026-08-01', description: 'Rent\nJuly installment', categoryName: 'Housing', amount: 500 },
    ]);
    expect(result.skipped).toEqual([]);
  });
});
