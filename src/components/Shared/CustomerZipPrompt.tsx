import { useState, useSyncExternalStore } from 'react';
import { finishZipRequest, getZipRequest, subscribeZipRequest, validCustomerZip } from '../../lib/customerZip';
import { supabase } from '../../lib/supabase';

export function CustomerZipPrompt() {
  const request = useSyncExternalStore(subscribeZipRequest, getZipRequest);
  return request ? <ZipForm key={request.contactId} contactId={request.contactId} name={request.name} /> : null;
}

function ZipForm({ contactId, name }: { contactId: string; name: string }) {
  const [zip, setZip] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!validCustomerZip(zip)) { setError('Enter a five-digit ZIP or ZIP+4.'); return; }
    setBusy(true); setError('');
    try {
      const { data, error: saveError } = await supabase.from('contacts').update({ zip_code: zip.trim() }).eq('id', contactId).select('id').single();
      if (saveError || !data) throw saveError || new Error('Customer ZIP was not saved.');
      finishZipRequest(zip.trim());
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save ZIP.'); }
    finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="customer-zip-title">
    <form onSubmit={save} className="w-full max-w-sm rounded-xl border border-gray-600 bg-gray-900 p-5 text-white shadow-xl">
      <h2 id="customer-zip-title" className="text-lg font-semibold">Customer ZIP required</h2>
      <p className="mt-2 text-sm text-gray-300">Add a ZIP for {name} to continue. A street address can be added later.</p>
      <label className="mt-4 block text-sm">ZIP code<input autoFocus disabled={busy} autoComplete="postal-code" value={zip} onChange={event => setZip(event.target.value)} maxLength={10} className="mt-1 w-full rounded border border-gray-600 bg-gray-800 p-3" /></label>
      {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
      <div className="mt-4 flex justify-end gap-3"><button type="button" disabled={busy} onClick={() => finishZipRequest(null)} className="px-3 py-2">Cancel</button><button disabled={busy} className="rounded bg-blue-600 px-4 py-2">{busy ? 'Saving…' : 'Save & continue'}</button></div>
    </form>
  </div>;
}
