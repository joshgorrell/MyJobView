import { Eye, Lock, RefreshCw } from 'lucide-react';

export function ProposalLockControl({ onUnlock }: { onUnlock: () => void }) {
  return <button type="button" onClick={onUnlock}
    className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded font-medium text-secondary hover:bg-elevated transition-colors"
    title="Editing locked — click for unlock or revision options" aria-label="Editing locked — unlock options">
    <Lock className="w-3.5 h-3.5" /><span>Locked</span>
  </button>;
}

export function ProposalReviewControls({ expired, onReactivate, onPreview }: {
  expired: boolean; onReactivate: () => void; onPreview: () => void;
}) {
  return <>
    {expired && <button type="button" onClick={onReactivate}
      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
      title="Extend the approval window and choose portal visibility">
      <RefreshCw className="w-4 h-4" /><span>Reopen for Customer</span>
    </button>}
    <button type="button" onClick={onPreview}
      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-subtle bg-elevated text-primary hover:bg-strong/25"
      title="Read-only customer preview — available even when expired" aria-label="Preview as Customer">
      <Eye className="w-4 h-4" /><span>Preview</span>
    </button>
  </>;
}
