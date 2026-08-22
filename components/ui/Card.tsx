import { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export function Card({ hoverable = false, className = '', children, ...rest }: CardProps) {
  const hoverClasses = hoverable
    ? 'transition duration-200 hover:scale-[1.02] hover:shadow-md motion-reduce:hover:scale-100'
    : '';

  return (
    <div
      className={`rounded-2xl border border-border bg-card p-6 shadow-sm ${hoverClasses} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
