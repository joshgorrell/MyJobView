/** Save the exact untracked email, then add an image only to the outbound copy. */
export async function sendTrackedProposalCheck(db: any, transport: (init: RequestInit) => Promise<Response>, values: any, baseUrl: string) {
  const read = async () => {
    const r = await db.from('proposal_check_emails').select('*').eq('organization_id', values.organization_id).eq('send_key', values.send_key).maybeSingle();
    if (r.error) throw r.error;
    return r.data;
  };
  let row = await read();
  if (!row) {
    const { data, error } = await db.from('proposal_check_emails').insert({ ...values, open_token: crypto.randomUUID() + crypto.randomUUID(), response_token: crypto.randomUUID() + crypto.randomUUID(), status: 'pending' }).select('*').single();
    if (error && error.code !== '23505') throw error;
    row = data || await read();
  }
  if (!row || row.sent_by !== values.sent_by) throw new Error('This send request belongs to another user.');
  if (['recipient_email', 'subject', 'email_html', 'from_address', 'reply_to', 'variant'].some(k => row[k] !== values[k])) throw new Error('The email changed. Preview it again before sending.');
  if (row.status === 'sent') return { success: true, history_id: row.id, already_sent: true };
  const src = new URL('/functions/v1/proposal-check-open', baseUrl);
  src.searchParams.set('token', row.open_token);
  const pixel = `<img src="${src.toString().replace(/&/g, '&amp;')}" width="1" height="1" alt="" style="width:1px;height:1px;border:0" />`;
  const trackedHtml = row.email_html.replace(/#proposal-check-preview-(love_it|considering|needs_work|off_base|declined)/g, (_match: string, choice: string) => `${baseUrl}/functions/v1/proposal-check-response?token=${row.response_token}&amp;choice=${choice}`);
  const html = trackedHtml.includes('</body>') ? trackedHtml.replace('</body>', pixel + '</body>') : trackedHtml + pixel;
  const response = await transport({ headers: { 'Idempotency-Key': `proposal-check-${row.organization_id}-${row.send_key}` }, body: JSON.stringify({ from: row.from_address, to: row.recipient_email, reply_to: row.reply_to, subject: row.subject, html }) });
  let provider: any = {};
  try { provider = await response.json(); } catch { /* Status still determines success. */ }
  const update = await db.from('proposal_check_emails').update(response.ok ? { status: 'sent', sent_at: new Date().toISOString(), provider_message_id: provider.id || null } : { status: 'failed' }).eq('id', row.id).eq('organization_id', row.organization_id);
  if (update.error) throw new Error(response.ok ? 'Email was sent, but its history status could not be updated. Refresh history before retrying.' : 'Unable to update email history.');
  if (!response.ok) throw new Error('Email could not be sent. The failed attempt is saved in history.');
  return { success: true, history_id: row.id };
}
