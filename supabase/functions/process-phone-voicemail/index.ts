import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { RingCentralVoicemailAPI } from '../_shared/ringcentral-voicemail-api.ts';
import { VoicemailTranscriptionAPI } from '../_shared/voicemail-transcription-api.ts';
import { VoicemailClassificationAPI } from '../_shared/voicemail-classification-api.ts';
import { nextVoicemailRetry, voicemailAudioType, voicemailAudioExtension } from '../_shared/phone-voicemail-retry.ts';

/**
 * Explicitly invoked, single-message processing worker.
 * This is NOT a public voicemail upload endpoint. Until per-organization
 * OAuth token storage is ready, the worker requires one configured RingCentral
 * account and will refuse to process any other account.
 */
Deno.serve(async (request: Request) => {
  const respond = (status: number, data: unknown) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  if (request.method !== 'POST') return respond(405, { error: 'method_not_allowed' });
  const secret = Deno.env.get('PHONE_DISPATCHER_WORKER_SECRET');
  const bearer = request.headers.get('authorization');
  if (!secret || !bearer || bearer !== 'Bearer ' + secret) return respond(401, { error: 'unauthorized' });
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const accountId = Deno.env.get('RINGCENTRAL_WORKER_ACCOUNT_ID');
  const accessToken = Deno.env.get('RINGCENTRAL_WORKER_ACCESS_TOKEN');
  const aiKey = Deno.env.get('OPENAI_API_KEY');
  if (!url || !serviceKey || !accountId || !accessToken || !aiKey) {
    return respond(503, { error: 'not_configured' });
  }
  let id: string;
  try {
    const payload = await request.json() as { id?: unknown };
    if (typeof payload.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.id)) return respond(400, { error: 'invalid_id' });
    id = payload.id;
  } catch { return respond(400, { error: 'invalid_json' }); }

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: item, error: readError } = await db.from('voicemail_messages')
    .select('id,organization_id,ringcentral_account_id,ringcentral_extension_id,ringcentral_message_id,state,retry_count')
    .eq('id', id).eq('state', 'received').maybeSingle();
  if (readError) return respond(503, { error: 'lookup_failed' });
  if (!item) return respond(202, { status: 'not_pending' });
  if (item.ringcentral_account_id !== accountId) return respond(403, { error: 'account_not_configured' });
  const { data: mailbox, error: mailboxError } = await db.from('ringcentral_mailboxes')
    .select('id').eq('organization_id', item.organization_id)
    .eq('ringcentral_account_id', item.ringcentral_account_id)
    .eq('ringcentral_extension_id', item.ringcentral_extension_id)
    .eq('enabled', true).maybeSingle();
  if (mailboxError || !mailbox) return respond(403, { error: 'mailbox_not_authorized' });
  const { data: claimed, error: claimError } = await db.from('voicemail_messages')
    .update({ state: 'processing', updated_at: new Date().toISOString() })
    .eq('id', id).eq('state', 'received').select('id');
  if (claimError) return respond(503, { error: 'claim_failed' });
  if (!claimed?.length) return respond(202, { status: 'already_claimed' });

  try {
    const api = new RingCentralVoicemailAPI(accessToken);
    const message = await api.getVoicemail(item.ringcentral_extension_id, item.ringcentral_message_id);
    const audio = await api.downloadRecording(message);
    // The supported RingCentral voicemail audio format must be confirmed
    // in sandbox before enabling live processing.
    const mime = voicemailAudioType(audio);
    const transcript = (await new VoicemailTranscriptionAPI(aiKey).transcribe(audio, mime)).text;
    const classification = await new VoicemailClassificationAPI(aiKey).classify(transcript);
    const urgent = classification.urgent;
    const spam = classification.spamConfidence;
    const confidence = classification.departmentConfidence;
    const quarantined = !urgent && spam !== null && spam >= 0.98;
    const ready = !quarantined && classification.department !== null &&
      confidence !== null && confidence >= 0.95 && spam !== null && spam < 0.98;
    const state = quarantined ? 'quarantined' : ready ? 'ready' : 'review';
    // Recordings live only in a PRIVATE storage bucket. Never return public URLs.
    const path = [item.organization_id, item.ringcentral_account_id,
      item.ringcentral_extension_id, item.ringcentral_message_id + '.' + voicemailAudioExtension(mime)].join('/');
    const { error: uploadError } = await db.storage.from('phone-voicemail-recordings')
      .upload(path, audio, { contentType: mime, upsert: false });
    if (uploadError && uploadError.message !== 'The resource already exists') throw Error('recording_storage_failed');
    const { data: updated, error: updateError } = await db.from('voicemail_messages').update({
      state, transcript, summary: classification.summary,
      department: classification.department,
      department_confidence: confidence,
      spam_confidence: spam,
      urgent, callback_requested: classification.callbackRequested,
      recording_path: path,
      quarantine_expires_at: quarantined ? new Date(Date.now() + 30 * 86400000).toISOString() : null,
      last_error: null, updated_at: new Date().toISOString(),
    }).eq('id', id).eq('state', 'processing').select('id');
    if (updateError || !updated?.length) throw Error('persistence_failed');
    return respond(200, { status: state });
  } catch (error) {
    console.error('Phone dispatcher worker failed', error instanceof Error ? error.name : 'unknown');
    await db.from('voicemail_messages').update({
      state: 'failed', last_error: 'processing_failed',
      retry_count: Math.min(5, (item.retry_count ?? 0) + 1),
      next_retry_at: nextVoicemailRetry(Math.min(5, (item.retry_count ?? 0) + 1)),
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('state', 'processing');
    return respond(503, { error: 'processing_failed' });
  }
});
