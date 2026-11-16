type Props = {
  customer: string;
  description: string;
  status: string;
  creator?: string;
  createdAt: string;
  expanded: boolean;
  onToggle: () => void;
};

export function CompactRequestRow({ customer, description, status, creator, createdAt, expanded, onToggle }: Props) {
  return <button type="button" onClick={onToggle} aria-expanded={expanded}
    aria-label={`${expanded ? 'Collapse' : 'Expand'} request for ${customer}`}
    className="flex min-h-11 w-full min-w-0 flex-col gap-1 px-3 py-2 text-left sm:hidden">
    <span className="flex w-full min-w-0 items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-primary">{customer}</span>
      <span className="max-w-[48%] shrink-0 truncate rounded bg-elevated px-1.5 py-0.5 text-[11px] font-semibold text-info" title={status}>{status.replace('Pending – ', '')}</span>
    </span>
    {!expanded && <span className="block w-full truncate text-xs text-secondary">{description}</span>}
    <span className="flex w-full min-w-0 items-center gap-2 text-[11px] text-muted">
      <span className="min-w-0 flex-1 truncate">{creator || 'Request'} · {new Date(createdAt).toLocaleDateString()}</span>
      <span aria-hidden="true" className="shrink-0">{expanded ? '−' : '+'}</span>
    </span>
  </button>;
}
