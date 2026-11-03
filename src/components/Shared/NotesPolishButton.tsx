import { useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { QuickActionModal } from './QuickActionModal';

interface Props {
  value: string;
  onApply: (value: string) => void;
  disabled?: boolean;
}

export function NotesPolishButton({ value, onApply, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [original, setOriginal] = useState('');
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  function close() {
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setOpen(false);
  }

  async function polish() {
    if (busy) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ai-assistant', {
        body: { mode: 'cleanup_work_order_notes', text: original },
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (invokeError) {
        const details = await invokeError.context?.json?.().catch(() => null);
        throw new Error(details?.error || 'Could not polish notes. Please try again.');
      }
      if (typeof data?.cleaned !== 'string' || !data.cleaned.trim()) throw new Error('No polished notes returned. Please try again.');
      setPreview(data.cleaned);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not polish notes.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <>
    <button type="button" disabled={disabled || !value.trim() || value.length > 12000}
      aria-label="Polish notes with AI" title="Polish notes with AI"
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-blue-600 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
      onClick={() => { setOriginal(value); setPreview(null); setError(''); setOpen(true); }}>
      <Sparkles className="h-5 w-5" />
    </button>
    {open && <QuickActionModal title={preview === null ? 'Polish your notes with AI?' : 'Review polished notes'}
      icon={<Sparkles className="h-5 w-5" />} onClose={close}>
      <div className="space-y-4">
        {preview === null ? <p className="text-sm text-gray-600">AI will clean up and organize your notes while preserving the original details.</p> : <>
          <label className="block text-sm font-medium text-gray-700">Edit before using
            <textarea aria-label="Polished notes" value={preview} onChange={e => setPreview(e.target.value)} rows={8}
              className="mt-2 w-full rounded-lg border border-gray-300 p-3 text-base focus:ring-2 focus:ring-blue-500" />
          </label>
          <details className="text-sm text-gray-600"><summary>Original notes</summary><p className="mt-2 whitespace-pre-wrap">{original}</p></details>
          {value !== original && <p role="alert" className="text-sm text-amber-700">Your notes changed while polishing. Cancel and polish again to include the latest edits.</p>}
        </>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
          <button type="button" disabled={busy || disabled || (preview !== null && (!preview.trim() || value !== original))}
            onClick={() => { if (preview === null) void polish(); else { onApply(preview); close(); } }}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-40">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? 'Polishing…' : preview === null ? 'Polish Notes' : 'Use These Notes'}
          </button>
        </div>
      </div>
    </QuickActionModal>}
  </>;
}
