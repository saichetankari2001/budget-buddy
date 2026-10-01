import type { CategoryTotal } from '@/lib/utils/expenseAggregation';

export interface CategoryRecommendation {
  categoryId: string | null;
  categoryName: string;
  color: string;
  recommendedAmount: number;
}

const MAX_TRACKED_CATEGORIES = 5;
const OTHER_LABEL = 'Other';
const OTHER_COLOR = '#94a3b8'; // the existing `muted` design token — neutral, not tied to any real category

/**
 * The single source of truth for how a cycle's discretionary pool gets split across categories.
 * `discretionaryPool` must already be `Math.max(remainingAmount - committedSpend, 0)` from
 * `projectCycle` — this function never re-derives it, so it can never disagree with the daily
 * safe-to-spend figure shown elsewhere in the app. Pure function: no DB access, fully covered by
 * this file's own test suite.
 */
export function computeCategoryRecommendation(
  history: CategoryTotal[],
  discretionaryPool: number
): CategoryRecommendation[] {
  const pool = Math.max(discretionaryPool, 0);

  if (history.length === 0) {
    return [];
  }

  const totalHistory = history.reduce((sum, h) => sum + h.total, 0);

  if (totalHistory === 0) {
    const tracked = history.slice(0, MAX_TRACKED_CATEGORIES);
    const share = pool / tracked.length;
    return distributeRoundingRemainder(
      tracked.map((h) => ({
        categoryId: h.categoryId,
        categoryName: h.categoryName,
        color: h.color,
        recommendedAmount: round2(share),
      })),
      pool
    );
  }

  const sorted = [...history].sort((a, b) => b.total - a.total);
  const top = sorted.slice(0, MAX_TRACKED_CATEGORIES);
  const rest = sorted.slice(MAX_TRACKED_CATEGORIES);

  const entries: CategoryRecommendation[] = top.map((h) => ({
    categoryId: h.categoryId,
    categoryName: h.categoryName,
    color: h.color,
    recommendedAmount: round2((h.total / totalHistory) * pool),
  }));

  if (rest.length > 0) {
    const otherTotal = rest.reduce((sum, h) => sum + h.total, 0);
    entries.push({
      categoryId: null,
      categoryName: OTHER_LABEL,
      color: OTHER_COLOR,
      recommendedAmount: round2((otherTotal / totalHistory) * pool),
    });
  }

  return distributeRoundingRemainder(entries, pool);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Floating-point division of `pool` across entries can leave the sum a cent or two off; assign the
// whole remainder to the largest entry so the recommendation always sums to exactly `pool` — a user
// comparing the table to the cycle's actual discretionary amount should never see a mismatch.
function distributeRoundingRemainder(
  entries: CategoryRecommendation[],
  pool: number
): CategoryRecommendation[] {
  if (entries.length === 0) return entries;
  const sum = entries.reduce((total, e) => total + e.recommendedAmount, 0);
  const remainder = round2(pool - sum);
  if (remainder === 0) return entries;

  const largestIndex = entries.reduce(
    (largest, entry, index) => (entry.recommendedAmount > entries[largest].recommendedAmount ? index : largest),
    0
  );
  const adjusted = [...entries];
  adjusted[largestIndex] = {
    ...adjusted[largestIndex],
    recommendedAmount: round2(adjusted[largestIndex].recommendedAmount + remainder),
  };
  return adjusted;
}
