// Dumps HID traffic from a USBPcap .pcap: feature SET/GET reports (control
// transfers) and interrupt payloads, one line per transfer.
// Usage: node tools/usbpcap-dump.mjs capture.pcap [--all]
import { readFileSync } from 'node:fs';

const [file, flag] = process.argv.slice(2);
const buf = readFileSync(file);
const hex = (b) => Buffer.from(b).toString('hex').replace(/(00)+$/, '…');
let off = 24; // pcap global header
let t0 = null;
while (off + 16 <= buf.length) {
  const sec = buf.readUInt32LE(off);
  const usec = buf.readUInt32LE(off + 4);
  const incl = buf.readUInt32LE(off + 8);
  const rec = buf.subarray(off + 16, off + 16 + incl);
  off += 16 + incl;
  const t = sec + usec / 1e6;
  t0 ??= t;
  const hdrLen = rec.readUInt16LE(0);
  const info = rec[16];
  const endpoint = rec[21];
  const transfer = rec[22];
  const dataLen = rec.readUInt32LE(23);
  const data = rec.subarray(hdrLen, hdrLen + dataLen);
  const completion = (info & 1) === 1;
  const time = (t - t0).toFixed(2).padStart(8);
  if (transfer === 2) {
    const stage = rec[27];
    // Setup stage carries the 8-byte request; data follows in the same record for OUT.
    if (!completion && stage === 0 && data.length >= 8) {
      const bm = data[0];
      if (bm === 0x21 && data.length > 8) console.log(`${time} SET ${hex(data.subarray(8))}`);
      else if (bm === 0x21 || bm === 0xa1) continue;
    } else if (completion && (endpoint & 0x80) && dataLen === 64) {
      console.log(`${time} GET ${hex(data)}`);
    }
  } else if (transfer === 1 && dataLen > 0) {
    if (endpoint === 0x81 && flag !== '--all') continue; // keystrokes
    const dir = endpoint & 0x80 ? 'IN ' : 'OUT';
    const shown = data.length > 64 ? hex(data.subarray(0, 32)) + ` (+${data.length - 32} bytes)` : hex(data);
    console.log(`${time} ${dir}${(endpoint & 0x7f).toString(16)} ${shown}`);
  }
}
