'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { DateField } from '@/components/ui/DateField';

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
        className="rounded-xl border border-border px-2 py-1 text-base focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <DateField
        ariaLabel="From date"
        value={searchParams.get('from') ?? ''}
        onChange={(value) => updateFilter('from', value ? new Date(value).toISOString() : '')}
        className="rounded-xl border border-border px-2 py-1 text-base focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <DateField
        ariaLabel="To date"
        value={searchParams.get('to') ?? ''}
        onChange={(value) => updateFilter('to', value ? new Date(value).toISOString() : '')}
        className="rounded-xl border border-border px-2 py-1 text-base focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  );
}
