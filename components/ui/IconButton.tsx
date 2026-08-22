import { ComponentType, SVGProps } from 'react';

interface IconButtonProps {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  onClick?: () => void;
  variant?: 'default' | 'destructive';
}

export function IconButton({ icon: Icon, label, onClick, variant = 'default' }: IconButtonProps) {
  const colorClasses =
    variant === 'destructive' ? 'text-destructive hover:bg-red-50' : 'text-primary hover:bg-background';

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium transition duration-150 ${colorClasses}`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}
