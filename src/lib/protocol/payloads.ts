/**
 * Settings payloads shared by both links. The dongle prefixes them with a
 * 3-byte header and the cable sends them as-is; see docs/PROTOCOL.md.
 */

export type Rgb = [number, number, number];

// ---------------------------------------------------------------- lighting

export const EFFECTS = [
  'Static', 'SingleOn', 'SingleOff', 'Glittering', 'Falling', 'Colourful', 'Breath', 'Spectrum', 'Outward',
  'Scrolling', 'Rolling', 'Rotating', 'Explode', 'Launch', 'Ripples', 'Flowing', 'Pulsating', 'Tilt', 'Shuttle',
] as const;
export const MODE_OFF = 0;
export const MODE_USER = 0x80;

export interface Lighting {
  /** 1-based index into EFFECTS, MODE_OFF or MODE_USER. */
  mode: number;
  color: Rgb;
  rainbow: boolean;
  brightness: number; // 1–5
  speed: number; // 1–5
  direction: number;
}

export const DEFAULT_LIGHTING: Lighting = { mode: 11, color: [255, 0, 0], rainbow: true, brightness: 5, speed: 3, direction: 0 };

export function lightingPayload(l: Lighting): number[] {
  if (l.mode === MODE_OFF) return [];
  if (l.mode === MODE_USER) return [MODE_USER, 0, 0, 0, 0, 0, 0, 0, 0, l.brightness];
  return [l.mode, ...l.color, 0, 0, 0, 0, l.rainbow ? 1 : 0, l.brightness, l.speed, l.direction];
}

// ---------------------------------------------------------------- system

export const SLEEP_OPTIONS = [
  { value: 0, label: 'Never' },
  { value: 1, label: '1 min' },
  { value: 2, label: '5 min' },
  { value: 3, label: '30 min' },
] as const;

export interface System {
  sleep: number; // index into SLEEP_OPTIONS
  responseLevel: number; // 1–5
  disableWin: boolean;
  disableAltF4: boolean;
  disableAltTab: boolean;
}

export const DEFAULT_SYSTEM: System = { sleep: 1, responseLevel: 2, disableWin: false, disableAltF4: false, disableAltTab: false };

export function systemPayload(s: System): number[] {
  return [0, 1, +s.disableAltTab, +s.disableAltF4, +s.disableWin, 0, s.sleep, 0, s.responseLevel];
}

// ---------------------------------------------------------------- clock

export function clockPayload(d: Date): number[] {
  return [0, 1, 0x5a, d.getFullYear() - 2000, d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), 0, d.getDay()];
}

// ---------------------------------------------------------------- key actions

export type Action =
  | { kind: 'default' }
  | { kind: 'key'; usage: number; mods: number }
  | { kind: 'consumer'; usage: number }
  | { kind: 'mouse'; button: number }
  | { kind: 'macro'; slot: number; mode: MacroMode; count: number };

/** 0 play once, 1 play `count` times, 2 toggle (unconfirmed), 3 repeat while held. */
export type MacroMode = 0 | 1 | 2 | 3;

export const MODIFIERS = [
  { bit: 0x01, label: 'Ctrl' },
  { bit: 0x02, label: 'Shift' },
  { bit: 0x04, label: 'Alt' },
  { bit: 0x08, label: 'Win' },
] as const;

export function actionBytes(a: Action): [number, number, number, number] {
  switch (a.kind) {
    case 'default':
      return [0, 0, 0, 0];
    case 'key':
      return [0x02, a.mods, a.usage, 0];
    case 'consumer':
      return [0x03, a.usage & 0xff, a.usage >> 8, 0];
    case 'mouse':
      // Only left click (01 01 01) has been captured; other buttons assume the same shape.
      return [0x01, a.button, 0x01, 0];
    case 'macro':
      return [0x06, a.slot, a.mode, a.mode === 1 ? a.count : 0];
  }
}

/** Keymap and colour tables: 144 four-byte slots addressed by key index. */
export const TABLE_SLOTS = 144;

export function keymapTable(actions: ReadonlyMap<number, Action>): Uint8Array {
  const t = new Uint8Array(TABLE_SLOTS * 4);
  for (const [index, a] of actions) t.set(actionBytes(a), index * 4);
  return t;
}

/** Per-key colours: every physical key gets an entry (black if unset). */
export function colourTable(keys: readonly number[], colours: ReadonlyMap<number, Rgb>): Uint8Array {
  const t = new Uint8Array(TABLE_SLOTS * 4);
  for (const index of keys) t.set([index, ...(colours.get(index) ?? [0, 0, 0])], index * 4);
  return t;
}

// ---------------------------------------------------------------- macros

export type MacroStep =
  | { kind: 'key'; usage: number; down: boolean }
  | { kind: 'mouse'; button: number; down: boolean }
  | { kind: 'delay'; ms: number };

export interface Macro {
  name: string;
  steps: MacroStep[];
}

/** Bytes available for macros: the cable sends 512 bytes ending in AA 55. */
export const MACRO_MEMORY = 510;
const MACRO_BASE = 0x190;

function stepWord(s: MacroStep): number {
  switch (s.kind) {
    case 'key':
      return ((s.down ? 0xb0 : 0x30) << 24) | (s.usage << 16);
    case 'mouse':
      return ((s.down ? 0x90 : 0x10) << 24) | (s.button << 16);
    case 'delay':
      return (0x50 << 24) | Math.max(0, Math.min(0xffffff, Math.round(s.ms)));
  }
}

export const macroBytes = (m: Macro) => 8 + 4 * m.steps.length;

/** Lays out the macro memory: u32 offset table, then [count, 0, records…] per macro. */
export function macroMemory(macros: readonly Macro[]): Uint8Array {
  const used = MACRO_BASE + macros.reduce((n, m) => n + macroBytes(m), 0);
  if (used > MACRO_MEMORY) throw new RangeError(`macros need ${used} bytes, the keyboard has ${MACRO_MEMORY}`);
  const mem = new Uint8Array(used);
  const view = new DataView(mem.buffer);
  let at = MACRO_BASE;
  macros.forEach((m, i) => {
    view.setUint32(i * 4, at, true);
    view.setUint32(at, m.steps.length, true);
    m.steps.forEach((s, j) => view.setUint32(at + 8 + j * 4, stepWord(s) >>> 0, true));
    at += macroBytes(m);
  });
  return mem;
}

export const macroSpaceUsed = (macros: readonly Macro[]) => MACRO_BASE + macros.reduce((n, m) => n + macroBytes(m), 0);
