import { supabase } from './supabase';

// Stored legacy URLs identify private objects; never turn a private upload into
// a public download. Re-sign on each conversation refresh.
export async function resolveMessageAttachments<T extends { attachment_url?: string | null; attachment_type?: string | null }>(messages: T[]): Promise<T[]> {
  return Promise.all(messages.map(async message => {
    if (message.attachment_type !== 'image' || !message.attachment_url) return message;
    const marker = '/message-attachments/';
    const index = message.attachment_url.indexOf(marker);
    if (index < 0) return message;
    let path: string;
    try { path = decodeURIComponent(message.attachment_url.slice(index + marker.length).split('?')[0]); }
    catch { return { ...message, attachment_url: null }; }
    const { data, error } = await supabase.storage.from('message-attachments').createSignedUrl(path, 3600);
    return { ...message, attachment_url: error ? null : data?.signedUrl || null };
  }));
}
