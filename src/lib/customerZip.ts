import { supabase } from './supabase';

export function validCustomerZip(value: unknown): value is string {
  return typeof value === 'string' && /^\d{5}(-\d{4})?$/.test(value.trim());
}

type ZipRequest = { contactId: string; name: string; resolve: (zip: string | null) => void };
let request: ZipRequest | null = null;
const listeners = new Set<() => void>();
export const subscribeZipRequest = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getZipRequest = () => request;
export function finishZipRequest(zip: string | null) {
  const pending = request;
  request = null;
  listeners.forEach(listener => listener());
  pending?.resolve(zip);
}

/** Re-read at creation time; the completion prompt preserves the caller's draft. */
export async function requireCustomerZip(contactId: string, enteredZip?: string): Promise<string | null> {
  const { data, error } = await supabase.from('contacts').select('id, contact_name, zip_code').eq('id', contactId).single();
  if (error) throw error;
  if (validCustomerZip(data.zip_code)) return data.zip_code.trim();
  if (validCustomerZip(enteredZip)) {
    const { data: saved, error: saveError } = await supabase.from('contacts').update({ zip_code: enteredZip.trim() }).eq('id', contactId).select('id').single();
    if (saveError || !saved) throw saveError || new Error('Customer ZIP was not saved.');
    return enteredZip.trim();
  }
  if (request) throw new Error('Complete the open customer ZIP prompt first.');
  return new Promise(resolve => {
    request = { contactId, name: data.contact_name, resolve };
    listeners.forEach(listener => listener());
  });
}
