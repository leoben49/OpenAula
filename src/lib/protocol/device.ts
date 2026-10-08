import { CHUNK_BYTES } from './image';
import { DONGLE_LEN, encodeDongle, encodeWired, isValidDongle, WIRED_LEN } from './packet';
import {
  clockPayload,
  lightingPayload,
  MODE_USER,
  systemPayload,
  TABLE_SLOTS,
  type Lighting,
  type System,
} from './payloads';

export const WIRED = { vendorId: 0x0c45, productId: 0x800a };
export const DONGLE = { vendorId: 0x05ac, productId: 0x024f };

export const HID_FILTERS: HIDDeviceFilter[] = [WIRED, DONGLE];

const RESPONSE_TIMEOUT_MS = 1500;
/** Gap between wired data packets; tests set it to 0. */
export let PACKET_GAP_MS = 40;
export const setPacketGap = (ms: number) => (PACKET_GAP_MS = ms);

export class TimeoutError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const reportSize = (d: HIDDevice, kind: 'outputReports' | 'featureReports') =>
  Math.max(
    0,
    ...d.collections.flatMap((c) => c[kind] ?? []).map((r) => (r.items ?? []).reduce((n, i) => n + (i.reportSize ?? 0) * (i.reportCount ?? 0), 0) / 8),
  );

const is = (d: HIDDevice, id: { vendorId: number; productId: number }) => d.vendorId === id.vendorId && d.productId === id.productId;

/** Waits for the next input report accepted by `match`, after running `send`. */
function exchange(hid: HIDDevice, send: () => Promise<void>, match: (p: Uint8Array) => boolean, what: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const onReport = (e: HIDInputReportEvent) => {
      const p = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength).slice();
      if (!match(p)) return;
      cleanup();
      resolve(p);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new TimeoutError(`no response to ${what}`));
    }, RESPONSE_TIMEOUT_MS);
    const cleanup = () => {
      clearTimeout(timer);
      hid.removeEventListener('inputreport', onReport);
    };
    hid.addEventListener('inputreport', onReport);
    send().catch((err) => {
      cleanup();
      reject(err);
    });
  });
}

export type Layer = 'top' | 'fn';

/** What both connections can do. The keyboard cannot be read back, so all writes are whole structures. */
export interface Link {
  readonly link: 'dongle' | 'wired';
  writeLighting(l: Lighting): Promise<void>;
  /** `table` from colourTable(); `brightness` 1–5. */
  writeUserLighting(table: Uint8Array, brightness: number): Promise<void>;
  writeSystem(s: System): Promise<void>;
  writeClock(d: Date): Promise<void>;
  /** `table` from keymapTable(). */
  writeKeymap(layer: Layer, table: Uint8Array): Promise<void>;
  /** `memory` from macroMemory(). */
  writeMacros(memory: Uint8Array): Promise<void>;
}

const withMarker = (bytes: ArrayLike<number>, size: number, at: number) => {
  const p = new Uint8Array(size);
  p.set(bytes);
  p[at] = 0xaa;
  p[at + 1] = 0x55;
  return p;
};

/** 2.4 GHz receiver: 32-byte interrupt reports on the vendor interface (MI_03). */
export class Dongle implements Link {
  readonly link = 'dongle';
  private queue: Promise<unknown> = Promise.resolve();

  constructor(readonly hid: HIDDevice) {}

  static pick(devices: HIDDevice[]): HIDDevice | undefined {
    return devices.find((d) => is(d, DONGLE) && reportSize(d, 'outputReports') === DONGLE_LEN);
  }

  /** Sends one packet (checksum added) and waits for the echo. */
  request(bytes: ArrayLike<number>): Promise<Uint8Array> {
    const cmd = bytes[0];
    const run = () =>
      exchange(
        this.hid,
        () => this.hid.sendReport(0, encodeDongle(bytes)),
        (p) => p.length >= DONGLE_LEN && p[0] === cmd && isValidDongle(p),
        `0x${cmd.toString(16)}`,
      );
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }

  /** Retries timeouts: packets get lost over the air and the keyboard may be asleep. */
  private async send(bytes: ArrayLike<number>, attempts = 3) {
    for (let i = 1; ; i++) {
      try {
        return await this.request(bytes);
      } catch (e) {
        if (!(e instanceof TimeoutError) || i >= attempts) throw e;
      }
    }
  }

  /** `[cmd, 10, 00, payload…]` with AA 55 at bytes 17–18. */
  private simple(cmd: number, payload: number[]) {
    return this.send(withMarker([cmd, 0x10, 0x00, ...payload], DONGLE_LEN - 1, 17));
  }

  /** 20 packets of seven entries, then a commit. Keymap commits repeat the header after the marker. */
  private async table(cmd: number, table: Uint8Array, trailer: boolean) {
    for (let seq = 0; seq < 20; seq++) await this.send([cmd, 0x1c, seq, ...table.subarray(seq * 28, seq * 28 + 28)]);
    const commit = withMarker([cmd, 0x10, 0x14], DONGLE_LEN - 1, 17);
    if (trailer) commit.set([0x00, cmd, 0x10, 0x14], 19);
    await this.send(commit);
  }

  async battery(attempts = 3): Promise<number> {
    return (await this.send([0x20, 0x01], attempts))[3];
  }

  writeLighting(l: Lighting) {
    return this.simple(0x05, lightingPayload(l)).then(() => {});
  }

  async writeUserLighting(table: Uint8Array, brightness: number) {
    await this.simple(0x05, lightingPayload({ mode: MODE_USER, brightness } as Lighting));
    await this.table(0x14, table, false);
  }

  writeSystem(s: System) {
    return this.simple(0x07, systemPayload(s)).then(() => {});
  }

  writeClock(d: Date) {
    return this.simple(0x0c, clockPayload(d)).then(() => {});
  }

  writeKeymap(layer: Layer, table: Uint8Array) {
    return this.table(layer === 'top' ? 0x10 : 0x12, table, true);
  }

  async writeMacros(memory: Uint8Array) {
    const count = Math.max(1, Math.ceil(memory.length / 28));
    for (let seq = 0; seq < count; seq++) await this.send([0x09, 0x1c, seq, ...memory.subarray(seq * 28, seq * 28 + 28)]);
    await this.send(withMarker([0x09, memory.length % 28, count], DONGLE_LEN - 1, 29));
  }
}

/**
 * Cable connection: 64-byte feature-report transactions on MI_03, screen data
 * as 4096-byte output reports on MI_02 (each acked with 01 5A 02).
 */
export class Wired implements Link {
  readonly link = 'wired';
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    readonly control: HIDDevice,
    readonly data: HIDDevice,
  ) {}

  static pick(devices: HIDDevice[]): { control: HIDDevice; data: HIDDevice } | undefined {
    const ours = devices.filter((d) => is(d, WIRED));
    const control = ours.find((d) => reportSize(d, 'featureReports') >= WIRED_LEN);
    const data = ours.find((d) => reportSize(d, 'outputReports') >= CHUNK_BYTES);
    return control && data ? { control, data } : undefined;
  }

  /**
   * The keyboard sometimes refuses a feature report while it is still busy with
   * the previous one (Chrome reports NotAllowedError); waiting and resending works.
   */
  private async sendFeature(data: Uint8Array<ArrayBuffer>) {
    for (let i = 1; ; i++) {
      try {
        return await this.control.sendFeatureReport(0, data);
      } catch (e) {
        if (i >= 4) throw e;
        await sleep(60 * i);
      }
    }
  }

  /** Sends a `04 xx` command and reads back the ack. */
  async command(bytes: number[]): Promise<Uint8Array> {
    await this.sendFeature(encodeWired(bytes));
    await sleep(20);
    const r = await this.control.receiveFeatureReport(0);
    const ack = new Uint8Array(r.buffer, r.byteOffset, r.byteLength);
    // Chrome may or may not prepend the report ID; the ack echoes the command.
    return ack[0] === bytes[0] ? ack : ack.subarray(1);
  }

  /** begin, target header, data packets, end. Serialised so transactions never interleave. */
  private transaction(target: number, sub: number, data: Uint8Array, begin = 0x18) {
    const run = async () => {
      const packets = data.length / WIRED_LEN;
      await this.command([0x04, begin]);
      await this.command([0x04, target, sub, 0, 0, 0, 0, 0, packets]);
      // Paced like the official driver (~45 ms per packet); back-to-back writes get refused.
      for (let i = 0; i < packets; i++) {
        await this.sendFeature(data.slice(i * WIRED_LEN, (i + 1) * WIRED_LEN));
        await sleep(PACKET_GAP_MS);
      }
      await this.command([0x04, 0x02]);
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }

  private single(target: number, sub: number, payload: number[], markerAt: number) {
    return this.transaction(target, sub, withMarker(payload, WIRED_LEN, markerAt));
  }

  /** 144-slot tables go out as 9 packets with the marker in the last two bytes. */
  private tableData(table: Uint8Array) {
    const out = new Uint8Array(TABLE_SLOTS * 4);
    out.set(table.subarray(0, out.length - 2));
    out[out.length - 2] = 0xaa;
    out[out.length - 1] = 0x55;
    return out;
  }

  writeLighting(l: Lighting) {
    return this.single(0x13, 0, lightingPayload(l), 14);
  }

  async writeUserLighting(table: Uint8Array, brightness: number) {
    await this.writeLighting({ mode: MODE_USER, brightness } as Lighting);
    await this.transaction(0x23, 0, this.tableData(table));
  }

  writeSystem(s: System) {
    return this.single(0x17, 1, systemPayload(s), 62);
  }

  writeClock(d: Date) {
    return this.single(0x28, 0, clockPayload(d), 62);
  }

  writeKeymap(layer: Layer, table: Uint8Array) {
    return this.transaction(layer === 'top' ? 0x11 : 0x27, 0, this.tableData(table));
  }

  writeMacros(memory: Uint8Array) {
    const out = new Uint8Array(8 * WIRED_LEN);
    out.set(memory.subarray(0, out.length - 2));
    out[out.length - 2] = 0xaa;
    out[out.length - 1] = 0x55;
    return this.transaction(0x15, 0, out, 0x19);
  }

  /**
   * Uploads an encoded animation (see image.ts). `slot` mirrors byte 2 of the
   * 04 72 command: the driver sent 01 and 02 in different uploads; meaning unknown.
   */
  uploadAnimation(payload: Uint8Array<ArrayBuffer>, slot: number, onProgress?: (done: number, total: number) => void) {
    const chunks = payload.length / CHUNK_BYTES;
    if (!Number.isInteger(chunks)) throw new RangeError('payload must be a multiple of 4096 bytes');
    const run = async () => {
      await this.command([0x04, 0x18]);
      await this.command([0x04, 0x72, slot, 0, 0, 0, 0, 0, chunks & 0xff, chunks >> 8]);
      try {
        for (let i = 0; i < chunks; i++) {
          const chunk = payload.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES);
          await exchange(this.data, () => this.data.sendReport(0, chunk), (p) => p[0] === 0x01 && p[1] === 0x5a, `chunk ${i}`);
          onProgress?.(i + 1, chunks);
        }
      } finally {
        await this.command([0x04, 0x02]);
      }
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }
}

export async function openAll(devices: HIDDevice[]) {
  for (const d of devices) if (!d.opened) await d.open();
}
