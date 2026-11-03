import { supabase } from './supabase';
export interface ProposalDocument { filename: string; content: string; mimeType: string }
/** The current generator returns printable HTML; also accept future PDF responses. */
export async function loadProposalDocument(proposalId: string, proposalNumber: string, includePromisePage = true, templateId?: string | null): Promise<ProposalDocument> {
  const { data, error } = await supabase.functions.invoke('generate-proposal-pdf', { body: { proposalId, templateId, displayOptions: { includePromisePage } } });
  if (error) throw error;
  if (typeof data?.base64 === 'string' && data.base64) return { filename: `Proposal-${proposalNumber}.pdf`, content: data.base64, mimeType: 'application/pdf' };
  if (typeof data === 'string' && /^\s*<!doctype html/i.test(data)) {
    let binary = '';
    for (const byte of new TextEncoder().encode(data)) binary += String.fromCharCode(byte);
    return { filename: `Proposal-${proposalNumber}.html`, content: btoa(binary), mimeType: 'text/html;charset=utf-8' };
  }
  throw new Error('The proposal document could not be generated. Please try again before sending.');
}
export function downloadProposalDocument(file: ProposalDocument): void {
  const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(file.content), c => c.charCodeAt(0))], { type: file.mimeType }));
  const a = document.createElement('a');a.href = url;a.download = file.filename;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
