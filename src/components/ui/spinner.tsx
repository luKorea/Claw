import { cn } from '@/lib/utils';

interface SpinnerProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: 'size-3',
  md: 'size-4',
  lg: 'size-6',
} as const;

export function Spinner({ className, size = 'md' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="加载中"
      className={cn(
        'inline-block animate-spin rounded-full border-2 border-current border-t-transparent',
        sizeMap[size],
        className,
      )}
    />
  );
}
