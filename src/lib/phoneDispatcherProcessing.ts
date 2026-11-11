import { buildVoicemailMessage, type VoicemailAIResult, type VoicemailMessageView } from './phoneDispatcherAI';
import { voicemailDedupeKey } from './phoneDispatcherPolicy';

/**
 * Transport-neutral voicemail ingestion orchestration.
 * The worker MUST resolve organizationId from a verified OAuth account mapping,
 * not from an untrusted webhook body. Do not call this from a public endpoint
 * before verifying RingCentral event authenticity.
 */
export interface VerifiedVoicemail {
  organizationId: string;
  ringcentralAccountId: string;
  messageId: string;
  mailboxId: string;
  callerNumber: string | null;
  recordingReference: string;
  receivedAt: string;
}

export interface VoicemailProcessingDependencies {
  /** Atomic claim: true for first processor, false for duplicate/already claimed. */
  claim(key: string, message: VerifiedVoicemail): Promise<boolean>;
  /** Audio is fetched server-side using the correct tenant's OAuth connection. */
  fetchRecording(message: VerifiedVoicemail): Promise<Uint8Array>;
  /** Speech recognition must preserve original words without invention. */
  transcribe(audio: Uint8Array): Promise<string>;
  /** AI classification receives transcript only, not caller number. */
  classify(transcript: string): Promise<Omit<VoicemailAIResult, 'transcript'>>;
  /** Store audio privately and persist transcript/summary and review decision. */
  persist(message: VerifiedVoicemail, result: VoicemailMessageView, audio: Uint8Array): Promise<void>;
  /** Retryable failures must release claim or mark failed for retry with backoff. */
  fail(key: string, reason: 'recording_unavailable' | 'processing_failed'): Promise<void>;
}

export type ProcessingOutcome =
  | { status: 'duplicate' }
  | { status: 'processed'; decision: VoicemailMessageView['decision']['kind'] }
  | { status: 'retry'; reason: 'recording_unavailable' | 'processing_failed' };

export async function processVerifiedVoicemail(
  message: VerifiedVoicemail,
  dependencies: VoicemailProcessingDependencies,
): Promise<ProcessingOutcome> {
  if (!message.organizationId || !message.ringcentralAccountId || !message.messageId ||
      !message.mailboxId || !message.recordingReference) {
    throw new Error('Incomplete verified voicemail identity');
  }
  const key = voicemailDedupeKey(message.organizationId, message.ringcentralAccountId, message.messageId);
  if (!(await dependencies.claim(key, message))) return { status: 'duplicate' };

  let audio: Uint8Array;
  try {
    audio = await dependencies.fetchRecording(message);
    if (!audio.length) throw new Error('Empty recording');
  } catch {
    await dependencies.fail(key, 'recording_unavailable');
    return { status: 'retry', reason: 'recording_unavailable' };
  }

  try {
    const transcript = await dependencies.transcribe(audio);
    if (!transcript.trim()) throw new Error('Empty transcript');
    const classification = await dependencies.classify(transcript);
    const result = buildVoicemailMessage({ ...classification, transcript }, true);
    // Even an uncertain classification is persisted for administrator review.
    await dependencies.persist(message, result, audio);
    return { status: 'processed', decision: result.decision.kind };
  } catch {
    await dependencies.fail(key, 'processing_failed');
    return { status: 'retry', reason: 'processing_failed' };
  }
}
