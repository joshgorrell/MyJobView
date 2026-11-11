import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { PhoneCall, ExternalLink, Loader2 } from 'lucide-react';

/**
 * Connection initiation only. Provider credentials never enter the browser.
 * A successful RingCentral OAuth callback registers a disabled mailbox;
 * an administrator must separately approve activation after testing.
 */
export function RingCentralSettings() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function connect() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'ringcentral-oauth-start', { method: 'POST', body: {} },
      );
      if (invokeError) throw invokeError;
      if (typeof data?.authorizationUrl !== 'string') throw new Error('Authorization is unavailable');
      const url = new URL(data.authorizationUrl);
      if (url.origin !== 'https://platform.ringcentral.com' &&
          url.origin !== 'https://platform.devtest.ringcentral.com') {
        throw new Error('Unexpected RingCentral authorization destination');
      }
      if (url.pathname !== '/restapi/oauth/authorize') throw new Error('Invalid authorization destination');
      window.location.assign(url.toString());
    } catch {
      setError('Could not start RingCentral authorization. Confirm the integration is configured and try again.');
      setBusy(false);
    }
  }
  return (
    <section className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <PhoneCall className="w-5 h-5 text-blue-600" aria-hidden="true" />
        <h4 className="font-semibold text-gray-900">RingCentral — AI Phone Dispatcher</h4>
      </div>
      <p className="text-sm text-gray-600">
        Securely authorize your company's RingCentral account to prepare voicemail
        transcription and routing into Flow. No passwords or API tokens are entered here.
      </p>
      <p className="text-sm text-gray-600">
        Connecting does not change your phone system, enable voicemail processing,
        or activate any mailbox. Mailboxes stay disabled until reviewed.
      </p>
      <button type="button" disabled={busy} onClick={connect}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
        {busy ? 'Connecting…' : 'Connect RingCentral'}
      </button>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <p className="text-xs text-gray-500">
        Requires a configured RingCentral OAuth application and an MJV administrator account.
      </p>
    </section>
  );
}
