'use client';

import { useRef } from 'react';
import { CalendarDaysIcon } from '@heroicons/react/24/outline';

interface DateFieldProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className: string;
  required?: boolean;
}

/**
 * A native date input paired with a calendar-icon button that opens the
 * browser's real date picker via `showPicker()`. Typing into a native date
 * input's day/month/year segments is finicky (Safari in particular has no
 * visible calendar affordance and silently rejects incomplete typed years),
 * so this gives every user a reliable click-to-pick path without relying on
 * typing at all.
 */
export function DateField({ value, onChange, ariaLabel, className, required }: DateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="date"
        aria-label={ariaLabel}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${className} pr-9`}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.showPicker?.()}
        aria-label={`Open ${ariaLabel.toLowerCase()} calendar`}
        className="absolute inset-y-0 right-2 flex items-center text-muted hover:text-primary"
      >
        <CalendarDaysIcon className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}
