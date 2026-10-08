import type { Key } from './layout';

/**
 * Keycap legends as printed on the F75 Max (see the official driver's keyboard
 * image): shifted symbol above the base character, words in small type, all
 * top-left except the arrows.
 */
export type Legend =
  | { kind: 'dual'; top: string; bottom: string }
  | { kind: 'char'; text: string }
  | { kind: 'word'; text: string }
  | { kind: 'arrow'; text: string }
  | { kind: 'blank' };

const DUAL: Record<number, [string, string]> = {
  0x35: ['~', '`'],
  0x1e: ['!', '1'],
  0x1f: ['@', '2'],
  0x20: ['#', '3'],
  0x21: ['$', '4'],
  0x22: ['%', '5'],
  0x23: ['^', '6'],
  0x24: ['&', '7'],
  0x25: ['*', '8'],
  0x26: ['(', '9'],
  0x27: [')', '0'],
  0x2d: ['_', '-'],
  0x2e: ['+', '='],
  0x2f: ['{', '['],
  0x30: ['}', ']'],
  0x31: ['|', '\\'],
  0x33: [':', ';'],
  0x34: ['"', "'"],
  0x36: ['<', ','],
  0x37: ['>', '.'],
  0x38: ['?', '/'],
};

const WORDS: Record<number, string> = {
  0x29: 'Esc',
  0x2b: '⇥ Tab',
  0x39: 'Caps Lock',
  0xe1: '⇧ Shift',
  0xe5: '⇧ Shift',
  0xe0: 'Ctrl',
  0xe4: 'Ctrl',
  0xe3: 'Win',
  0xe2: 'Alt',
  0xe6: 'Alt',
  0xaf: 'Fn',
  0x28: 'Enter ↵',
  0x2a: '← Backspace',
  0x4c: 'Delete',
  0x4b: 'PgUp',
  0x4e: 'PgDn',
  0x4d: 'End',
};

const ARROWS: Record<number, string> = { 0x52: '↑', 0x50: '←', 0x51: '↓', 0x4f: '→' };

export function legendFor(k: Key): Legend {
  const u = k.usage;
  if (DUAL[u]) return { kind: 'dual', top: DUAL[u][0], bottom: DUAL[u][1] };
  if (ARROWS[u]) return { kind: 'arrow', text: ARROWS[u] };
  if (WORDS[u]) return { kind: 'word', text: WORDS[u] };
  if (u >= 0x04 && u <= 0x1d) return { kind: 'char', text: String.fromCharCode(65 + u - 0x04) };
  if (u >= 0x3a && u <= 0x45) return { kind: 'word', text: `F${u - 0x39}` };
  if (u === 0x2c) return { kind: 'blank' };
  return { kind: 'word', text: k.label };
}

/** Plain-text name, for titles and editor headings. */
export function keyName(k: Key): string {
  const l = legendFor(k);
  if (l.kind === 'dual') return l.bottom;
  if (l.kind === 'blank') return 'Space';
  return l.text.replace(/^[⇥⇧←] /, '').replace(/ ↵$/, '');
}
