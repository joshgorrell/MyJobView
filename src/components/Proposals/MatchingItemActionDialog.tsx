interface Props {
  action: 'delete' | 'substitute';
  count: number;
  saving: boolean;
  onSingle: () => void;
  onAll: () => void;
  onCancel: () => void;
}

export default function MatchingItemActionDialog({ action, count, saving, onSingle, onAll, onCancel }: Props) {
  const verb = action === 'delete' ? 'Delete' : 'Substitute';
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="matching-action-title" className="bg-surface text-primary rounded-xl shadow-2xl p-5 w-full max-w-md">
        <h2 id="matching-action-title" className="text-lg font-bold">{verb} which items?</h2>
        <p className="text-sm text-secondary mt-2">This exact product appears in {count} line items in this proposal.</p>
        <p className="text-sm text-secondary mt-2">{action === 'delete' ? 'Deleting an item also removes its attached accessories.' : 'Each item keeps its current room, quantity, and attached accessories.'}</p>
        <div className="flex flex-col gap-2 mt-4">
          <button autoFocus disabled={saving} onClick={onSingle} className="px-4 py-2 border border-blue-600 text-blue-600 rounded-lg disabled:opacity-50">This item only</button>
          <button disabled={saving} onClick={onAll} className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 ${action === 'delete' ? 'bg-red-600' : 'bg-blue-600'}`}>All matching items in this proposal</button>
          <button disabled={saving} onClick={onCancel} className="px-4 py-2 text-secondary rounded-lg">Cancel</button>
        </div>
      </div>
    </div>
  );
}
