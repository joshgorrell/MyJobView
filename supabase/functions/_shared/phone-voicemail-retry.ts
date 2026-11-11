/** Pure retry policy shared by voicemail worker and queue drainer. */
export const MAX_VOICEMAIL_ATTEMPTS = 5;
export function nextVoicemailRetry(attempt: number, now = Date.now()): string | null {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > MAX_VOICEMAIL_ATTEMPTS) {
    throw Error('Invalid voicemail attempt count');
  }
  if (attempt >= MAX_VOICEMAIL_ATTEMPTS) return null;
  // 1m, 2m, 4m, 8m backoff, capped by the attempt limit.
  return new Date(now + Math.min(60_000 * 2 ** (attempt - 1), 15 * 60_000)).toISOString();
}
export function voicemailAudioType(audio: Uint8Array): 'audio/mpeg' | 'audio/wav' | 'audio/ogg' | 'audio/mp4' {
  if (audio.length < 12) throw Error('Audio too short');
  const ascii = (start: number, end: number) => String.fromCharCode(...audio.slice(start, end));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'audio/wav';
  if (ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(4, 8) === 'ftyp') return 'audio/mp4';
  if (ascii(0, 3) === 'ID3' || audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  throw Error('Unsupported voicemail audio format');
}
export function voicemailAudioExtension(mime: string): string {
  const extensions: Record<string, string> = {
    'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a',
  };
  if (!extensions[mime]) throw Error('Unsupported voicemail audio format');
  return extensions[mime];
}
