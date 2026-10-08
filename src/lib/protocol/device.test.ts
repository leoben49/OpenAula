import { describe, expect, it } from 'vitest';
import { Dongle, setPacketGap, Wired } from './device';

setPacketGap(0);
import { DEFAULT_SYSTEM, keymapTable, macroMemory, type Action, type Macro } from './payloads';

const hex = (b: ArrayLike<number>) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const trim = (h: string) => h.replace(/(00)+$/, '');

/** Records reports and echoes each one back like the dongle / wired firmware does. */
class FakeHid {
  sent: string[] = [];
  features: string[] = [];
  private listeners = new Set<(e: unknown) => void>();
  private lastFeature = new Uint8Array(64);
  addEventListener(_: string, l: (e: unknown) => void) {
    this.listeners.add(l);
  }
  removeEventListener(_: string, l: (e: unknown) => void) {
    this.listeners.delete(l);
  }
  async sendReport(reportId: number, data: BufferSource) {
    const bytes = new Uint8Array(data as ArrayBuffer);
    this.sent.push(hex(bytes));
    const echo = bytes.slice();
    queueMicrotask(() => this.listeners.forEach((l) => l({ reportId, data: new DataView(echo.buffer) })));
  }
  async sendFeatureReport(_: number, data: BufferSource) {
    const bytes = new Uint8Array(data as ArrayBuffer);
    this.features.push(hex(bytes));
    this.lastFeature = bytes.slice();
  }
  async receiveFeatureReport() {
    return new DataView(this.lastFeature.buffer);
  }
}

const dongle = () => {
  const hid = new FakeHid();
  return { hid, d: new Dongle(hid as unknown as HIDDevice) };
};
const wired = () => {
  const hid = new FakeHid();
  return { hid, w: new Wired(hid as unknown as HIDDevice, hid as unknown as HIDDevice) };
};

const captureKeymap = new Map<number, Action>([
  [0x02, { kind: 'consumer', usage: 0x0183 }],
  [0x03, { kind: 'mouse', button: 1 }],
  [0x37, { kind: 'key', usage: 0x29, mods: 0 }],
]);

// "test" = A then B, "m1" = Ctrl+C with recorded delays (aula4 capture).
const captureMacros: Macro[] = [
  {
    name: 'test',
    steps: [
      { kind: 'key', usage: 0x04, down: true }, { kind: 'delay', ms: 10 },
      { kind: 'key', usage: 0x04, down: false }, { kind: 'delay', ms: 10 },
      { kind: 'key', usage: 0x05, down: true }, { kind: 'delay', ms: 10 },
      { kind: 'key', usage: 0x05, down: false }, { kind: 'delay', ms: 10 },
    ],
  },
  {
    name: 'm1',
    steps: [
      { kind: 'key', usage: 0xe0, down: true }, { kind: 'delay', ms: 216 },
      { kind: 'key', usage: 0x06, down: true }, { kind: 'delay', ms: 167 },
      { kind: 'key', usage: 0x06, down: false }, { kind: 'delay', ms: 87 },
      { kind: 'key', usage: 0xe0, down: false }, { kind: 'delay', ms: 10 },
    ],
  },
];

describe('dongle writes match the captures', () => {
  it('lighting', async () => {
    const { hid, d } = dongle();
    await d.writeLighting({ mode: 1, color: [255, 0, 255], rainbow: true, brightness: 5, speed: 3, direction: 0 });
    expect(hid.sent).toEqual(['05100001ff00ff00000000010503000000aa55000000000000000000000000' + '1c']);
  });

  it('LED off', async () => {
    const { hid, d } = dongle();
    await d.writeLighting({ mode: 0, color: [0, 0, 0], rainbow: false, brightness: 5, speed: 3, direction: 0 });
    expect(hid.sent).toEqual(['0510000000000000000000000000000000aa55000000000000000000000000' + '14']);
  });

  it('system settings', async () => {
    const { hid, d } = dongle();
    await d.writeSystem({ ...DEFAULT_SYSTEM, disableWin: true });
    expect(hid.sent).toEqual(['0710000001000001000100020000000000aa55000000000000000000000000' + '1b']);
  });

  it('keymap table and commit', async () => {
    const { hid, d } = dongle();
    await d.writeKeymap('top', keymapTable(captureKeymap));
    expect(hid.sent).toHaveLength(21);
    expect(hid.sent[0]).toBe('101c0000000000000000000383010001010100000000000000000000000000b6');
    expect(hid.sent[7]).toBe('101c07000000000000000000000000000000000000000000000000020029005e');
    expect(hid.sent[20]).toBe('1010140000000000000000000000000000aa5500101014000000000000000067');
  });

  it('macro memory', async () => {
    const { hid, d } = dongle();
    await d.writeMacros(macroMemory(captureMacros));
    const cap = (s: string) => s.replace(/ /g, '');
    expect(hid.sent).toHaveLength(19);
    expect(hid.sent[0]).toBe(cap('09 1c 00 90 01 00 00 b8 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 6f'));
    expect(hid.sent[14]).toBe(cap('09 1c 0e 00 00 00 00 00 00 00 00 08 00 00 00 00 00 00 00 00 00 04 b0 0a 00 00 50 00 00 04 30 7d'));
    expect(hid.sent[15]).toBe(cap('09 1c 0f 0a 00 00 50 00 00 05 b0 0a 00 00 50 00 00 05 30 0a 00 00 50 08 00 00 00 00 00 00 00 34'));
    expect(hid.sent[16]).toBe(cap('09 1c 10 00 00 e0 b0 d8 00 00 50 00 00 06 b0 a7 00 00 50 00 00 06 30 57 00 00 50 00 00 e0 30 87'));
    expect(hid.sent[17]).toBe(cap('09 1c 11 0a 00 00 50 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 90'));
    expect(hid.sent[18]).toBe(cap('09 04 12 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 aa 55 1e'));
  });
});

describe('wired writes match the captures', () => {
  it('lighting transaction', async () => {
    const { hid, w } = wired();
    await w.writeLighting({ mode: 1, color: [255, 0, 255], rainbow: true, brightness: 5, speed: 3, direction: 0 });
    expect(hid.features.map(trim)).toEqual(['0418', '041300000000000001', '01ff00ff00000000010503000000aa55', '0402']);
  });

  it('system transaction', async () => {
    const { hid, w } = wired();
    await w.writeSystem({ ...DEFAULT_SYSTEM, sleep: 2 });
    expect(hid.features[1].startsWith('041701000000000001')).toBe(true);
    expect(hid.features[2]).toBe('000100000000020002' + '00'.repeat(53) + 'aa55');
  });

  it('keymap transaction', async () => {
    const { hid, w } = wired();
    await w.writeKeymap('top', keymapTable(new Map([[0x02, { kind: 'consumer', usage: 0xcd }], [0x37, { kind: 'key', usage: 0x29, mods: 0 }]])));
    expect(trim(hid.features[1])).toBe('041100000000000009');
    expect(trim(hid.features[2])).toBe('000000000000000003cd');
    expect(trim(hid.features[5])).toBe('00000000000000000000000000000000000000000000000000000000020029');
    expect(hid.features[10].endsWith('aa55')).toBe(true);
    expect(hid.features).toHaveLength(12);
  });

  it('macro transaction', async () => {
    const { hid, w } = wired();
    await w.writeMacros(macroMemory(captureMacros.slice(0, 1)));
    expect(hid.features.slice(0, 2).map(trim)).toEqual(['0419', '041500000000000008']);
    expect(trim(hid.features[2])).toBe('9001');
    expect(trim(hid.features[8])).toBe('000000000000000000000000000000000800000000000000000004b00a000050000004300a000050000005b00a000050000005300a000050');
  });
});
