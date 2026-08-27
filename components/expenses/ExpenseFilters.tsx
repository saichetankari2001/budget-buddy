'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export function ExpenseFilters({ categories }: { categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/expenses?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap gap-3 text-sm">
      <select
        aria-label="Filter by category"
        value={searchParams.get('categoryId') ?? ''}
        onChange={(e) => updateFilter('categoryId', e.target.value)}
        className="rounded-xl border border-border px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        aria-label="From date"
        value={searchParams.get('from') ?? ''}
        onChange={(e) => updateFilter('from', e.target.value ? new Date(e.target.value).toISOString() : '')}
        className="rounded-xl border border-border px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <input
        type="date"
        aria-label="To date"
        value={searchParams.get('to') ?? ''}
        onChange={(e) => updateFilter('to', e.target.value ? new Date(e.target.value).toISOString() : '')}
        className="rounded-xl border border-border px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  );
}
