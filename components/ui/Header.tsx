'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';

const NAV_LINKS = [
  { href: '#', label: 'Dashboard' },
  { href: '#expenses', label: 'Expenses' },
  { href: '#budgets', label: 'Budgets' },
  { href: '#cashflow', label: 'Cash Flow' },
];

const SECTION_IDS = ['expenses', 'budgets', 'cashflow'];

export function Header() {
  const router = useRouter();
  const [activeHref, setActiveHref] = useState('#');
  const activeHrefRef = useRef(activeHref);
  activeHrefRef.current = activeHref;

  useEffect(() => {
    const sections = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null
    );
    if (sections.length === 0) return;

    // Tracks which observed section is most visible right now, keyed by element id, so the
    // callback (which only ever hears about the sections whose visibility just changed, not
    // every section's current state) can still pick the single most-visible one on every firing —
    // comparing only the sections that fired would wrongly ignore a still-mostly-visible section
    // that simply didn't cross a threshold on this particular callback.
    const ratios = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(entry.target.id, entry.intersectionRatio);
        }
        let bestId: string | null = null;
        let bestRatio = 0;
        for (const [id, ratio] of ratios) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
        const nextHref = bestRatio > 0.1 && bestId ? `#${bestId}` : '#';
        if (nextHref !== activeHrefRef.current) {
          setActiveHref(nextHref);
        }
      },
      { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  async function handleLogout() {
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
        }
      }
    } catch {
      // Best-effort — a failed unsubscribe shouldn't block logout. The stale
      // subscription self-cleans the next time a push to it 410s or 404s.
    }

    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="border-b border-border bg-card backdrop-blur-xl">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
        <span className="font-heading text-lg font-semibold text-foreground">Budget Buddy</span>
        <nav className="flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href === '#' ? '/dashboard' : `/dashboard${link.href}`}
              className={`text-sm font-medium ${
                activeHref === link.href ? 'text-primary-hover' : 'text-muted hover:text-foreground'
              }`}
            >
              {link.label}
            </a>
          ))}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-sm font-medium text-muted hover:text-destructive"
          >
            <ArrowRightOnRectangleIcon className="h-4 w-4" aria-hidden="true" />
            Log out
          </button>
        </nav>
      </div>
    </header>
  );
}
