import { describe, expect, it } from 'vitest';
import { blackFrame, CHUNK_BYTES, encodeAnimation, FRAME_BYTES, HEADER_BYTES, rgb565 } from './image';
import { encodeDongle, hex, isValidDongle } from './packet';

const bytes = (s: string) => Uint8Array.from(s.match(/../g)!, (h) => parseInt(h, 16));

describe('dongle packets', () => {
  it('matches the captured battery poll', () => {
    expect(hex(encodeDongle([0x20, 0x01]))).toBe(hex(bytes('20010000000000000000000000000000000000000000000000000000000000' + '21')));
  });

  it('accepts captured replies', () => {
    expect(isValidDongle(bytes('2001004000000000000000000000000000000000000000000000000000000061'))).toBe(true);
    expect(isValidDongle(bytes('02000040300000450c0a800801ffff0000000000000000000000000000000054'))).toBe(true);
    expect(isValidDongle(bytes('0710000001000000000200020000000000aa550000000000000000000000001b'))).toBe(true);
  });

  it('rejects a corrupted reply', () => {
    expect(isValidDongle(bytes('2001004100000000000000000000000000000000000000000000000000000061'))).toBe(false);
  });
});

describe('screen animation', () => {
  it('packs RGB565', () => {
    expect(rgb565(255, 255, 255)).toBe(0xffff);
    expect(rgb565(255, 0, 0)).toBe(0xf800);
    expect(rgb565(0, 255, 0)).toBe(0x07e0);
    expect(rgb565(0, 0, 255)).toBe(0x001f);
  });

  it('lays out header and frames like the driver', () => {
    const frames = Array.from({ length: 17 }, () => ({ ...blackFrame(), delayMs: 130 }));
    const out = encodeAnimation(frames);
    // The captured 17-frame upload was 137 chunks with delay byte 0x41.
    expect(out.length / CHUNK_BYTES).toBe(137);
    expect(out[0]).toBe(17);
    expect(out[1]).toBe(0x41);
    expect(out[17]).toBe(0x41);
    expect(out[18]).toBe(0xff);
    expect(out[HEADER_BYTES - 1]).toBe(0xff);
    expect(out.subarray(HEADER_BYTES, HEADER_BYTES + 17 * FRAME_BYTES).every((b) => b === 0)).toBe(true);
  });

  it('fits 251 frames in 2009 chunks like the captured upload', () => {
    const f = blackFrame();
    expect(encodeAnimation(Array(251).fill(f)).length / CHUNK_BYTES).toBe(2009);
  });
});
