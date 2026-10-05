export interface BidEmailAttachment {
  filename: string;
  content: string;
}

// Stay below common mailbox limits and Resend's 40 MB encoded limit.
// A single accepted 10 MB upload encodes to about 14 MB.
export function bidEmailBatches(files: BidEmailAttachment[]): BidEmailAttachment[][] {
  const batches: BidEmailAttachment[][] = [[]];
  let size = 0;
  for (const file of files) {
    if (size + file.content.length > 18_000_000 && batches[batches.length - 1].length) {
      batches.push([]);
      size = 0;
    }
    batches[batches.length - 1].push(file);
    size += file.content.length;
  }
  return batches;
}
