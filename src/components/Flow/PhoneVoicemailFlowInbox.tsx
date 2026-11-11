import { useEffect, useState } from 'react';
import { PhoneIncoming } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Voicemail = {
  id: string; received_at: string; caller_number: string | null;
  state: 'ready' | 'review'; summary: string | null; transcript: string | null;
  department: string | null; urgent: boolean; callback_requested: boolean;
};
export function PhoneVoicemailFlowInbox() {
  const [messages, setMessages] = useState<Voicemail[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(true);
  const [audioId, setAudioId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioError, setAudioError] = useState('');
  async function listen(id: string) {
    if (audioBusy) return;
    if (audioId === id) { setAudioId(null); setAudioUrl(null); return; }
    setAudioId(id);
    setAudioUrl(null);
    setAudioError('');
    setAudioBusy(true);
    try {
      const { data, error: requestError } = await supabase.functions.invoke(
        'phone-voicemail-recording', { method: 'POST', body: { id } },
      );
      if (requestError || typeof data?.url !== 'string') throw new Error('Audio unavailable');
      const target = new URL(data.url);
      const expected = new URL(import.meta.env.VITE_SUPABASE_URL);
      if (target.origin !== expected.origin ||
          !target.pathname.includes('/storage/v1/object/sign/phone-voicemail-recordings/')) {
        throw new Error('Unexpected audio URL');
      }
      setAudioUrl(target.toString());
    } catch {
      setAudioError('Recording unavailable. Please try again.');
    } finally {
      setAudioBusy(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data, error: requestError } = await supabase.functions.invoke(
          'phone-voicemail-inbox', { method: 'GET' },
        );
        if (cancelled) return;
        if (requestError) {
          const status = (requestError as { context?: { status?: number } }).context?.status;
          if (status === 403) { setAuthorized(false); return; }
          throw requestError;
        }
        setMessages(Array.isArray(data?.messages) ? data.messages : []);
        setError('');
      } catch {
        if (!cancelled) setError('Voicemail inbox is temporarily unavailable.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);
  if (!authorized) return null;
  if (loading) return <p className="text-sm text-gray-500">Loading voicemail…</p>;
  return (
    <section className="space-y-2" aria-label="Phone voicemail inbox">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <PhoneIncoming className="w-4 h-4" aria-hidden="true" /> Phone voicemail
      </h3>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!error && messages.length === 0 && <p className="text-sm text-gray-500">No voicemail messages to review.</p>}
      {messages.map(message => (
        <article key={message.id} className="rounded-lg border border-gray-200 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold">{message.caller_number || 'Unknown caller'}</span>
            <time dateTime={message.received_at}>{new Date(message.received_at).toLocaleString()}</time>
            {message.urgent && <span className="font-semibold text-red-700">Urgent</span>}
            {message.callback_requested && <span>Callback requested</span>}
            {message.state === 'review' && <span>Needs review</span>}
          </div>
          <p className="text-sm">{message.summary || 'No summary available'}</p>
          {message.department && <p className="text-xs text-gray-500">Suggested department: {message.department}</p>}
          <div className="space-y-2">
            <button type="button" disabled={audioBusy}
              className="text-xs text-blue-700 underline disabled:opacity-50"
              onClick={() => void listen(message.id)}>
              {audioId === message.id && audioUrl ? 'Close recording' :
                audioBusy && audioId === message.id ? 'Loading recording…' : 'Listen to recording'}
            </button>
            {audioId === message.id && audioUrl && (
              <audio controls preload="none" src={audioUrl} className="w-full" aria-label="Voicemail recording" />
            )}
            {audioId === message.id && audioError && (
              <p role="alert" className="text-xs text-red-700">{audioError}</p>
            )}
          </div>
          {message.transcript && (
            <div>
              <button type="button" className="text-xs text-blue-700 underline"
                onClick={() => setExpanded(expanded === message.id ? null : message.id)}>
                {expanded === message.id ? 'Hide transcript' : 'Read transcript'}
              </button>
              {expanded === message.id && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{message.transcript}</p>
              )}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
