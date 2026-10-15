import { useState } from 'react';
import { Mic, Sparkles, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type FormKind = 'lead' | 'service' | 'support' | 'task';
type Prefill = Record<string, string | undefined>;

export function AIFormFill({ kind, onFill }: { kind: FormKind; onFill: (prefill: Prefill) => void }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);

  function dictate() {
    const w = window as typeof window & { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
    const Recognition = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Recognition) { setError('Voice dictation is unavailable in this browser. You can type instead.'); return; }
    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as ArrayLike<any>).map((result: any) => result[0].transcript).join(' ');
      setInput(previous => [previous, transcript].filter(Boolean).join(' '));
    };
    recognition.onerror = () => { setListening(false); setError('Could not capture speech. Try again or type.'); };
    recognition.onend = () => setListening(false);
    setError('');
    setListening(true);
    recognition.start();
  }

  async function fill() {
    if (!input.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sign in to use AI form fill.');
      const actionType: Record<FormKind, string> = {
        lead: 'CREATE_LEAD', service: 'CREATE_SERVICE_REQUEST', support: 'CREATE_SUPPORT_REQUEST', task: 'CREATE_TASK',
      };
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Prepare the ${actionType[kind]} action and prefill for the form already open. Extract only details explicitly supplied; leave unknown fields blank. Do not submit. Request: ${input.trim()}` }],
          context: { activeTab: kind === 'lead' ? 'leads' : kind === 'service' ? 'service_requests' : 'tasks' },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI request failed.');
      if (data.action?.type !== actionType[kind] || !data.action.prefill) {
        throw new Error(data.message || 'AI could not identify enough details. Please add more information.');
      }
      onFill(data.action.prefill as Prefill);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to fill the form.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3">
      <button type="button" onClick={() => setOpen(value => !value)} className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-600 hover:text-cyan-500">
        <Sparkles className="h-4 w-4" /> Fill with AI
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-subtle bg-surface p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-primary">Describe what you need</span>
            <button type="button" aria-label="Close AI form fill" onClick={() => setOpen(false)}><X className="h-4 w-4" /></button>
          </div>
          <textarea value={input} onChange={event => setInput(event.target.value)} rows={3} placeholder="Type the details, or use the microphone..." className="w-full rounded-md border border-subtle bg-surface px-3 py-2 text-sm text-primary" />
          {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={dictate} disabled={busy || listening} className="inline-flex items-center gap-1 text-sm text-secondary"><Mic className="h-4 w-4" /> {listening ? 'Listening...' : 'Dictate'}</button>
            <button type="button" onClick={fill} disabled={busy || !input.trim()} className="rounded-md bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Filling...' : 'Fill Form'}</button>
          </div>
          <p className="text-xs text-secondary">Review the populated fields before saving. Unknown details are left unchanged.</p>
        </div>
      )}
    </div>
  );
}
