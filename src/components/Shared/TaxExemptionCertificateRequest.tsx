import { useRef, useState } from 'react';
import { notify } from '../../lib/feedback';
import { supabase } from '../../lib/supabase';

interface Props {
  recipientId: string;
  source?: 'contact' | 'lead';
  email?: string | null;
  light?: boolean;
}

export function TaxExemptionCertificateRequest({ recipientId, source = 'contact', email, light }: Props) {
  const key = `${source}:${recipientId}:${email?.trim().toLowerCase() ?? ''}`;
  return <CertificateRequestButton key={key} recipientId={recipientId} source={source} email={email?.trim()} light={light} />;
}

function CertificateRequestButton({ recipientId, source, email, light }: Props) {
  const requestId = useRef<string | null>(null);
  const pending = useRef(false);
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(null);

  async function sendRequest() {
    if (!email || pending.current || sentAt) return;
    pending.current = true;
    requestId.current ??= crypto.randomUUID();
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-tax-exemption-request', {
        body: { recipientId, source, email, requestId: requestId.current },
      });
      if (error) {
        const detail = await error.context?.json?.().catch(() => null);
        throw new Error(detail?.error || 'The certificate request could not be sent. Please try again.');
      }
      if (!data?.sentAt) throw new Error('The email service did not confirm the request.');
      setSentAt(data.sentAt);
      notify(`Certificate request emailed to ${email}.`, { theme: 'violet', tone: 'success' });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not email the certificate request.', { theme: 'violet', tone: 'error' });
    } finally {
      pending.current = false;
      setSending(false);
    }
  }

  return (
    <div className={`rounded-lg border p-3 ${light ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-gray-900/50'}`}>
      <p className={`mb-2 text-xs font-semibold ${light ? 'text-gray-700' : 'text-gray-300'}`}>Sales tax exemption</p>
      <button
        type="button"
        onClick={sendRequest}
        disabled={!email || sending || !!sentAt}
        className={`rounded-lg border border-blue-500/50 px-3 py-2 text-sm hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-50 ${light ? 'text-blue-700' : 'text-blue-300'}`}
      >
        {sending ? 'Sending request…' : 'Request Sales Tax Exemption Certificate'}
      </button>
      <p aria-live="polite" className={`mt-1.5 break-words text-xs ${light ? 'text-gray-600' : 'text-gray-400'}`}>
        {sentAt
          ? `Emailed to ${email} on ${new Date(sentAt).toLocaleString()}.`
          : email ? `Email request to ${email}.` : 'Add an email address to the customer record to send a request.'}
      </p>
    </div>
  );
}
