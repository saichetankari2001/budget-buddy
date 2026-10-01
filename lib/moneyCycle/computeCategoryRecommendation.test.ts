import { describe, it, expect } from 'vitest';
import { computeCategoryRecommendation } from './computeCategoryRecommendation';

describe('computeCategoryRecommendation', () => {
  it('returns an empty array when there is no category history at all', () => {
    expect(computeCategoryRecommendation([], 300)).toEqual([]);
  });

  it('splits evenly across existing categories when there is no historical spend', () => {
    const result = computeCategoryRecommendation(
      [
        { categoryId: 'cat_1', categoryName: 'Food', color: '#f97316', total: 0 },
        { categoryId: 'cat_2', categoryName: 'Transport', color: '#3b82f6', total: 0 },
      ],
      300
    );
    expect(result).toEqual([
      { categoryId: 'cat_1', categoryName: 'Food', color: '#f97316', recommendedAmount: 150 },
      { categoryId: 'cat_2', categoryName: 'Transport', color: '#3b82f6', recommendedAmount: 150 },
    ]);
  });

  it('scales proportionally to history when there are 5 or fewer categories (no Other bucket)', () => {
    const result = computeCategoryRecommendation(
      [
        { categoryId: 'cat_1', categoryName: 'Food', color: '#f97316', total: 600 },
        { categoryId: 'cat_2', categoryName: 'Transport', color: '#3b82f6', total: 200 },
        { categoryId: 'cat_3', categoryName: 'Bills', color: '#22c55e', total: 200 },
      ],
      100
    );
    expect(result).toEqual([
      { categoryId: 'cat_1', categoryName: 'Food', color: '#f97316', recommendedAmount: 60 },
      { categoryId: 'cat_2', categoryName: 'Transport', color: '#3b82f6', recommendedAmount: 20 },
      { categoryId: 'cat_3', categoryName: 'Bills', color: '#22c55e', recommendedAmount: 20 },
    ]);
    expect(result.reduce((sum, r) => sum + r.recommendedAmount, 0)).toBe(100);
  });

  it('folds everything beyond the top 5 categories into a single Other bucket', () => {
    const history = [
      { categoryId: 'cat_1', categoryName: 'A', color: '#111', total: 500 },
      { categoryId: 'cat_2', categoryName: 'B', color: '#222', total: 200 },
      { categoryId: 'cat_3', categoryName: 'C', color: '#333', total: 100 },
      { categoryId: 'cat_4', categoryName: 'D', color: '#444', total: 100 },
      { categoryId: 'cat_5', categoryName: 'E', color: '#555', total: 50 },
      { categoryId: 'cat_6', categoryName: 'F', color: '#666', total: 30 },
      { categoryId: 'cat_7', categoryName: 'G', color: '#777', total: 20 },
    ];
    const result = computeCategoryRecommendation(history, 1000);

    expect(result).toHaveLength(6);
    expect(result[5]).toEqual({ categoryId: null, categoryName: 'Other', color: '#94a3b8', recommendedAmount: 50 });
    expect(result.reduce((sum, r) => sum + r.recommendedAmount, 0)).toBe(1000);
  });

  it('returns $0 for every category when the discretionary pool is 0 (a cycle already in shortfall)', () => {
    const result = computeCategoryRecommendation(
      [{ categoryId: 'cat_1', categoryName: 'Food', color: '#f97316', total: 100 }],
      0
    );
    expect(result).toEqual([{ categoryId: 'cat_1', categoryName: 'Food', color: '#f97316', recommendedAmount: 0 }]);
  });

  it('clamps a negative discretionary pool to 0 rather than producing negative recommendations', () => {
    const result = computeCategoryRecommendation(
      [{ categoryId: 'cat_1', categoryName: 'Food', color: '#f97316', total: 100 }],
      -50
    );
    expect(result[0].recommendedAmount).toBe(0);
  });

  it('assigns the rounding remainder to the largest category so amounts always sum exactly to the pool', () => {
    const result = computeCategoryRecommendation(
      [
        { categoryId: 'cat_1', categoryName: 'A', color: '#111', total: 1 },
        { categoryId: 'cat_2', categoryName: 'B', color: '#222', total: 1 },
        { categoryId: 'cat_3', categoryName: 'C', color: '#333', total: 1 },
      ],
      100
    );
    const sum = result.reduce((total, r) => total + r.recommendedAmount, 0);
    expect(sum).toBe(100);
    // 100/3 = 33.333...; two entries round to 33.33, the tie-break (first at that value) absorbs
    // the 0.01 remainder — the exact split isn't the point, the exact-sum guarantee is.
    expect(result.some((r) => r.recommendedAmount === 33.34)).toBe(true);
  });

  it('folds overflow categories into Other bucket when there is no historical spend (zero-history with >5 categories)', () => {
    const result = computeCategoryRecommendation(
      [
        { categoryId: 'cat_1', categoryName: 'Food', color: '#f97316', total: 0 },
        { categoryId: 'cat_2', categoryName: 'Transport', color: '#3b82f6', total: 0 },
        { categoryId: 'cat_3', categoryName: 'Bills', color: '#22c55e', total: 0 },
        { categoryId: 'cat_4', categoryName: 'Entertainment', color: '#a855f7', total: 0 },
        { categoryId: 'cat_5', categoryName: 'Health', color: '#ec4899', total: 0 },
        { categoryId: 'cat_6', categoryName: 'Shopping', color: '#f59e0b', total: 0 },
        { categoryId: 'cat_7', categoryName: 'Other', color: '#8b5cf6', total: 0 },
      ],
      700
    );

    expect(result).toHaveLength(6);
    expect(result[5]).toEqual({ categoryId: null, categoryName: 'Other', color: '#94a3b8', recommendedAmount: 200 });
    expect(result.reduce((sum, r) => sum + r.recommendedAmount, 0)).toBe(700);
  });

  it('does not create Other bucket when there are exactly 5 categories with historical spend', () => {
    const result = computeCategoryRecommendation(
      [
        { categoryId: 'cat_1', categoryName: 'Food', color: '#f97316', total: 500 },
        { categoryId: 'cat_2', categoryName: 'Transport', color: '#3b82f6', total: 250 },
        { categoryId: 'cat_3', categoryName: 'Bills', color: '#22c55e', total: 150 },
        { categoryId: 'cat_4', categoryName: 'Entertainment', color: '#a855f7', total: 75 },
        { categoryId: 'cat_5', categoryName: 'Health', color: '#ec4899', total: 25 },
      ],
      1000
    );

    expect(result).toHaveLength(5);
    expect(result.every((r) => r.categoryId !== null)).toBe(true);
    expect(result.reduce((sum, r) => sum + r.recommendedAmount, 0)).toBe(1000);
  });
});
