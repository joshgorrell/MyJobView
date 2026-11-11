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
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data, error: requestError } = await supabase.functions.invoke(
          'phone-voicemail-inbox', { method: 'GET' },
        );
        if (cancelled) return;
        if (requestError) throw requestError;
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
