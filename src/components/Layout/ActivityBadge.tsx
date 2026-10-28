interface ActivityBadgeProps {
  count: number;
  label?: string;
  className?: string;
}

export function ActivityBadge({ count, label = 'new activity', className = '' }: ActivityBadgeProps) {
  if (!Number.isFinite(count) || count <= 0) return null;

  return (
    <span
      role="status"
      aria-label={`${count} ${label}`}
      className={`inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full border border-red-300/60 bg-gradient-to-b from-red-400 via-red-500 to-red-700 text-white text-[11px] leading-none font-extrabold shadow-[0_2px_5px_rgba(127,29,29,0.35)] tabular-nums ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
