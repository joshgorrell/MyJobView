/** Server-side RingCentral voicemail API client. No phone routing changes. */
export interface RingCentralMessage {
  id: string;
  type?: string;
  attachments?: Array<{ type?: string; uri?: string }>;
}
export interface RingCentralTransport {
  fetch(input: string, init: RequestInit): Promise<Response>;
}
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
function safeId(id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw Error('Invalid RingCentral ID');
  return encodeURIComponent(id);
}
export class RingCentralVoicemailAPI {
  private readonly origin: string;
  constructor(
    private readonly accessToken: string,
    private readonly transport: RingCentralTransport = { fetch: (url, init) => fetch(url, init) },
    origin = 'https://platform.ringcentral.com',
  ) {
    const url = new URL(origin);
    if (!accessToken.trim()) throw Error('Missing OAuth access token');
    if (url.protocol !== 'https:' || !['platform.ringcentral.com', 'platform.devtest.ringcentral.com'].includes(url.hostname) ||
      url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
      throw Error('Unapproved RingCentral API origin');
    }
    this.origin = url.origin;
  }
  private async request(url: string): Promise<Response> {
    const response = await this.transport.fetch(url, {
      method: 'GET',
      redirect: 'error',
      headers: { Authorization: 'Bearer ' + this.accessToken },
    });
    if (!response.ok) throw Error('RingCentral API HTTP ' + response.status);
    return response;
  }
  async getVoicemail(extensionId: string, messageId: string): Promise<RingCentralMessage> {
    const url = this.origin + '/restapi/v1.0/account/~/extension/' + safeId(extensionId) +
      '/message-store/' + safeId(messageId);
    const message = await (await this.request(url)).json() as RingCentralMessage;
    if (String(message.id) !== messageId || message.type !== 'VoiceMail') {
      throw Error('Unexpected RingCentral voicemail identity or type');
    }
    return message;
  }
  /** Accept recording URI only from authenticated message-store lookup, never webhook input. */
  async downloadRecording(message: RingCentralMessage): Promise<Uint8Array> {
    const attachment = message.attachments?.find(a => a.type === 'AudioRecording' && a.uri);
    if (!attachment?.uri) throw Error('Missing voicemail audio attachment');
    const uri = new URL(attachment.uri);
    if (uri.origin !== this.origin || !uri.pathname.startsWith('/restapi/v1.0/') ||
      uri.username || uri.password || uri.hash) {
      throw Error('Untrusted RingCentral recording URL');
    }
    const response = await this.request(uri.toString());
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > MAX_AUDIO_BYTES) throw Error('Recording too large');
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.startsWith('audio/') && !contentType.startsWith('application/octet-stream')) {
      throw Error('Unexpected recording content type');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) throw Error('Invalid recording size');
    return bytes;
  }
}
