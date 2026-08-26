export interface GstExpense {
  amount: number;
  categoryIsGstFree: boolean;
}

export function computeGstPaid(expenses: GstExpense[]): number {
  const rawTotal = expenses
    .filter((e) => !e.categoryIsGstFree)
    .reduce((sum, e) => sum + e.amount / 11, 0);
  return Math.round(rawTotal * 100) / 100;
}
