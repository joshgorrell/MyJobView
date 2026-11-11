/**
 * Server-side speech-to-text adapter for RingCentral voicemail audio.
 * Keep API credentials in Supabase Edge Function secrets, never client code.
 * Audio and transcript may contain sensitive customer information.
 */
export interface SpeechTransport {
  fetch(url: string, init: RequestInit): Promise<Response>;
}

export interface SpeechTranscript {
  text: string;
  language?: string;
}

export class VoicemailTranscriptionAPI {
  constructor(
    private readonly apiKey: string,
    private readonly transport: SpeechTransport = { fetch: (url, init) => fetch(url, init) },
    private readonly model = 'gpt-4o-mini-transcribe',
  ) {
    if (!apiKey.trim()) throw new Error('Missing transcription API key');
    if (!['gpt-4o-mini-transcribe', 'gpt-4o-transcribe'].includes(model)) {
      throw new Error('Unsupported transcription model');
    }
  }

  async transcribe(audio: Uint8Array, mimeType: string): Promise<SpeechTranscript> {
    if (!audio.length || audio.length > 25 * 1024 * 1024) {
      throw new Error('Invalid voicemail audio size');
    }
    const extensions: Record<string, string> = {
      'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav',
      'audio/x-wav': 'wav', 'audio/mp4': 'm4a', 'audio/m4a': 'm4a',
      'audio/ogg': 'ogg', 'audio/webm': 'webm',
    };
    const extension = extensions[mimeType.toLowerCase().split(';')[0].trim()];
    if (!extension) throw new Error('Unsupported voicemail audio format');

    const form = new FormData();
    form.append('model', this.model);
    form.append('response_format', 'json');
    form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), 'voicemail.' + extension);
    const response = await this.transport.fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + this.apiKey },
      body: form,
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Transcription provider HTTP ' + response.status);
    const data = await response.json() as { text?: unknown; language?: unknown };
    if (typeof data.text !== 'string' || !data.text.trim()) {
      throw new Error('Transcription provider returned empty transcript');
    }
    return {
      text: data.text.trim().slice(0, 20000),
      ...(typeof data.language === 'string' ? { language: data.language } : {}),
    };
  }
}
