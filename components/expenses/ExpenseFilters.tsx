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
        value={searchParams.get('categoryId') ?? ''}
        onChange={(e) => updateFilter('categoryId', e.target.value)}
        className="rounded border border-gray-300 px-2 py-1"
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
        value={searchParams.get('from') ?? ''}
        onChange={(e) => updateFilter('from', e.target.value ? new Date(e.target.value).toISOString() : '')}
        className="rounded border border-gray-300 px-2 py-1"
      />
      <input
        type="date"
        value={searchParams.get('to') ?? ''}
        onChange={(e) => updateFilter('to', e.target.value ? new Date(e.target.value).toISOString() : '')}
        className="rounded border border-gray-300 px-2 py-1"
      />
    </div>
  );
}
