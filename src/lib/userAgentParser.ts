export interface DeviceInfo {
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'unknown';
  browserName: string;
  browserVersion: string;
  osName: string;
  osVersion: string;
  deviceModel: string | null;
  deviceVendor: string | null;
}

export function parseUserAgent(userAgent: string): DeviceInfo {
  const ua = userAgent.toLowerCase();

  const deviceInfo: DeviceInfo = {
    deviceType: 'unknown',
    browserName: 'Unknown',
    browserVersion: '',
    osName: 'Unknown',
    osVersion: '',
    deviceModel: null,
    deviceVendor: null,
  };

  deviceInfo.deviceType = detectDeviceType(ua);
  const browser = detectBrowser(userAgent);
  deviceInfo.browserName = browser.name;
  deviceInfo.browserVersion = browser.version;
  const os = detectOS(userAgent);
  deviceInfo.osName = os.name;
  deviceInfo.osVersion = os.version;
  const device = detectDevice(userAgent);
  deviceInfo.deviceModel = device.model;
  deviceInfo.deviceVendor = device.vendor;

  return deviceInfo;
}

function detectDeviceType(ua: string): 'mobile' | 'tablet' | 'desktop' | 'unknown' {
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'tablet';
  }
  if (/mobile|iphone|ipod|android|blackberry|opera mini|opera mobi|skyfire|maemo|windows phone|palm|iemobile|symbian|symbos|fennec/i.test(ua)) {
    return 'mobile';
  }
  if (ua.includes('windows') || ua.includes('macintosh') || ua.includes('linux') || ua.includes('x11')) {
    return 'desktop';
  }
  return 'unknown';
}

function detectBrowser(userAgent: string): { name: string; version: string } {
  const ua = userAgent;

  if (/edg\//i.test(ua)) {
    const match = ua.match(/edg\/(\d+(\.\d+)?)/i);
    return { name: 'Edge', version: match ? match[1] : '' };
  }

  if (/opr\//i.test(ua) || /opera/i.test(ua)) {
    const match = ua.match(/(?:opr|opera)\/(\d+(\.\d+)?)/i);
    return { name: 'Opera', version: match ? match[1] : '' };
  }

  if (/chrome/i.test(ua) && !/edg/i.test(ua)) {
    const match = ua.match(/chrome\/(\d+(\.\d+)?)/i);
    return { name: 'Chrome', version: match ? match[1] : '' };
  }

  if (/safari/i.test(ua) && !/chrome/i.test(ua) && !/android/i.test(ua)) {
    const match = ua.match(/version\/(\d+(\.\d+)?)/i);
    return { name: 'Safari', version: match ? match[1] : '' };
  }

  if (/firefox/i.test(ua)) {
    const match = ua.match(/firefox\/(\d+(\.\d+)?)/i);
    return { name: 'Firefox', version: match ? match[1] : '' };
  }

  if (/msie|trident/i.test(ua)) {
    const match = ua.match(/(?:msie |rv:)(\d+(\.\d+)?)/i);
    return { name: 'Internet Explorer', version: match ? match[1] : '' };
  }

  return { name: 'Unknown', version: '' };
}

function detectOS(userAgent: string): { name: string; version: string } {
  const ua = userAgent;

  if (/windows nt 10/i.test(ua)) {
    return { name: 'Windows', version: '10' };
  }
  if (/windows nt 6.3/i.test(ua)) {
    return { name: 'Windows', version: '8.1' };
  }
  if (/windows nt 6.2/i.test(ua)) {
    return { name: 'Windows', version: '8' };
  }
  if (/windows nt 6.1/i.test(ua)) {
    return { name: 'Windows', version: '7' };
  }
  if (/windows/i.test(ua)) {
    return { name: 'Windows', version: '' };
  }

  if (/iphone os (\d+)[._](\d+)/i.test(ua)) {
    const match = ua.match(/iphone os (\d+)[._](\d+)/i);
    return { name: 'iOS', version: match ? `${match[1]}.${match[2]}` : '' };
  }
  if (/ipad.*os (\d+)[._](\d+)/i.test(ua)) {
    const match = ua.match(/os (\d+)[._](\d+)/i);
    return { name: 'iOS', version: match ? `${match[1]}.${match[2]}` : '' };
  }

  if (/android (\d+(\.\d+)?)/i.test(ua)) {
    const match = ua.match(/android (\d+(\.\d+)?)/i);
    return { name: 'Android', version: match ? match[1] : '' };
  }

  if (/mac os x (\d+)[._](\d+)/i.test(ua)) {
    const match = ua.match(/mac os x (\d+)[._](\d+)/i);
    return { name: 'macOS', version: match ? `${match[1]}.${match[2]}` : '' };
  }
  if (/macintosh/i.test(ua)) {
    return { name: 'macOS', version: '' };
  }

  if (/linux/i.test(ua) && !/android/i.test(ua)) {
    return { name: 'Linux', version: '' };
  }

  if (/cros/i.test(ua)) {
    return { name: 'Chrome OS', version: '' };
  }

  return { name: 'Unknown', version: '' };
}

function detectDevice(userAgent: string): { model: string | null; vendor: string | null } {
  const ua = userAgent;

  if (/iphone/i.test(ua)) {
    const model = extractiPhoneModel(ua);
    return { model, vendor: 'Apple' };
  }

  if (/ipad/i.test(ua)) {
    return { model: 'iPad', vendor: 'Apple' };
  }

  if (/macintosh/i.test(ua)) {
    return { model: 'Mac', vendor: 'Apple' };
  }

  const samsungMatch = ua.match(/samsung[;\s]*([\w-]+)/i);
  if (samsungMatch) {
    return { model: samsungMatch[1], vendor: 'Samsung' };
  }

  const sm = ua.match(/sm-([a-z0-9]+)/i);
  if (sm) {
    return { model: `SM-${sm[1]}`, vendor: 'Samsung' };
  }

  const pixel = ua.match(/pixel\s*(\d+[a-z]*)/i);
  if (pixel) {
    return { model: `Pixel ${pixel[1]}`, vendor: 'Google' };
  }

  const huawei = ua.match(/huawei[;\s]*([\w-]+)/i);
  if (huawei) {
    return { model: huawei[1], vendor: 'Huawei' };
  }

  const xiaomi = ua.match(/xiaomi[;\s]*([\w-]+)/i);
  if (xiaomi) {
    return { model: xiaomi[1], vendor: 'Xiaomi' };
  }

  if (/android/i.test(ua)) {
    return { model: 'Android Device', vendor: 'Android' };
  }

  if (/windows/i.test(ua)) {
    return { model: 'Windows PC', vendor: 'Microsoft' };
  }

  return { model: null, vendor: null };
}

function extractiPhoneModel(ua: string): string {
  if (/iphone\s*(\d+[,\s]*\d*)/i.test(ua)) {
    const match = ua.match(/iphone\s*(\d+[,\s]*\d*)/i);
    if (match) return `iPhone ${match[1]}`;
  }
  return 'iPhone';
}

export function getDeviceIcon(deviceType: string): string {
  switch (deviceType) {
    case 'mobile':
      return 'smartphone';
    case 'tablet':
      return 'tablet';
    case 'desktop':
      return 'monitor';
    default:
      return 'help-circle';
  }
}

export function getBrowserIcon(browserName: string): string {
  const browser = browserName.toLowerCase();
  if (browser.includes('chrome')) return 'chrome';
  if (browser.includes('firefox')) return 'firefox';
  if (browser.includes('safari')) return 'compass';
  if (browser.includes('edge')) return 'edge';
  if (browser.includes('opera')) return 'opera';
  return 'globe';
}

export function getOSIcon(osName: string): string {
  const os = osName.toLowerCase();
  if (os.includes('windows')) return 'square';
  if (os.includes('mac') || os.includes('ios')) return 'apple';
  if (os.includes('android')) return 'bot';
  if (os.includes('linux')) return 'terminal';
  return 'circle';
}
