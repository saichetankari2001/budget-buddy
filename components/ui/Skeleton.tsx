export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      data-testid="skeleton"
      aria-hidden="true"
      className={`animate-pulse motion-reduce:animate-none rounded-lg bg-white/[0.06] ${className}`}
    />
  );
}
