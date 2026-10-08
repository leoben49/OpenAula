/** Helpers shared by the dongle and wired protocols. See docs/PROTOCOL.md. */

export const hex = (bytes: ArrayLike<number>) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

/** Dongle reports are 32 bytes; the last byte is the sum of the other 31. */
export const DONGLE_LEN = 32;

export function dongleChecksum(p: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < DONGLE_LEN - 1; i++) sum += p[i];
  return sum & 0xff;
}

export function encodeDongle(bytes: ArrayLike<number>): Uint8Array<ArrayBuffer> {
  if (bytes.length > DONGLE_LEN - 1) throw new RangeError('dongle packet too long');
  const p = new Uint8Array(DONGLE_LEN);
  p.set(bytes);
  p[DONGLE_LEN - 1] = dongleChecksum(p);
  return p;
}

export const isValidDongle = (p: Uint8Array) => p.length >= DONGLE_LEN && dongleChecksum(p) === p[DONGLE_LEN - 1];

/** Wired commands are 64-byte feature reports (report ID 0), zero padded. */
export const WIRED_LEN = 64;

export function encodeWired(bytes: ArrayLike<number>): Uint8Array<ArrayBuffer> {
  const p = new Uint8Array(WIRED_LEN);
  p.set(bytes);
  return p;
}
