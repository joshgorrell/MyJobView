const formats: Record<string, { mime: string; label: string }> = {
  pdf: { mime: 'application/pdf', label: 'PDF document' },
  jpg: { mime: 'image/jpeg', label: 'Image attachment' },
  jpeg: { mime: 'image/jpeg', label: 'Image attachment' },
  png: { mime: 'image/png', label: 'Image attachment' },
  webp: { mime: 'image/webp', label: 'Image attachment' },
  doc: { mime: 'application/msword', label: 'Word document' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word document' },
  xls: { mime: 'application/vnd.ms-excel', label: 'Excel spreadsheet' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel spreadsheet' },
};
export const bidFileAccept = Object.keys(formats).map(ext => `.${ext}`).join(',');
export const bidFileHelp = 'PDF, Word (.doc/.docx), Excel (.xls/.xlsx), JPG, PNG or WebP';
export function bidFileFormat(name: string) {
  return formats[name.split('.').pop()?.toLowerCase() || ''] || null;
}

// Read only the ZIP directory: do not decompress customer files on the server.
function officePackage(bytes: Uint8Array, part: string): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let end = bytes.length - 22; end >= Math.max(0, bytes.length - 65557); end--) {
    if (view.getUint32(end, true) !== 0x06054b50 || end + 22 + view.getUint16(end + 20, true) !== bytes.length) continue;
    const entries = view.getUint16(end + 10, true);
    const size = view.getUint32(end + 12, true);
    let offset = view.getUint32(end + 16, true);
    if (offset + size !== end || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) return false;
    const names = new Set<string>();
    for (let i = 0; i < entries; i++) {
      if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) return false;
      const length = view.getUint16(offset + 28, true);
      const next = offset + 46 + length + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
      if (next > end || (view.getUint16(offset + 8, true) & 1)) return false;
      names.add(new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + length)));
      offset = next;
    }
    return offset === end && names.has('[Content_Types].xml') && names.has(part);
  }
  return false;
}
export function validBidFile(name: string, bytes: Uint8Array): boolean {
  const ext = name.split('.').pop()?.toLowerCase();
  const starts = (signature: number[]) => signature.every((n, i) => bytes[i] === n);
  if (ext === 'docx' || ext === 'xlsx') return officePackage(bytes, ext === 'docx' ? 'word/document.xml' : 'xl/workbook.xml');
  if (ext === 'doc' || ext === 'xls') return starts([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (ext === 'pdf') return starts([0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (ext === 'jpg' || ext === 'jpeg') return starts([0xff, 0xd8]);
  if (ext === 'png') return starts([0x89, 0x50, 0x4e, 0x47]);
  if (ext === 'webp') return new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP';
  return false;
}
