import { keyLabel } from './protocol/hid-keys';
import { MODIFIERS, type Action, type Macro } from './protocol/payloads';

/** Consumer-page usages offered for remapping (standard HID values). */
export const MEDIA: { usage: number; label: string; short: string }[] = [
  { usage: 0x00cd, label: 'Play / Pause', short: 'Play' },
  { usage: 0x00b5, label: 'Next track', short: 'Next' },
  { usage: 0x00b6, label: 'Previous track', short: 'Prev' },
  { usage: 0x00b7, label: 'Stop', short: 'Stop' },
  { usage: 0x00e9, label: 'Volume up', short: 'Vol+' },
  { usage: 0x00ea, label: 'Volume down', short: 'Vol−' },
  { usage: 0x00e2, label: 'Mute', short: 'Mute' },
  { usage: 0x0183, label: 'Media player', short: 'Media' },
  { usage: 0x0192, label: 'Calculator', short: 'Calc' },
  { usage: 0x018a, label: 'Mail', short: 'Mail' },
  { usage: 0x0194, label: 'File explorer', short: 'Files' },
  { usage: 0x0223, label: 'Browser home', short: 'Home' },
  { usage: 0x0221, label: 'Browser search', short: 'Search' },
  { usage: 0x0224, label: 'Browser back', short: 'Back' },
  { usage: 0x0225, label: 'Browser forward', short: 'Fwd' },
  { usage: 0x0227, label: 'Browser refresh', short: 'Refresh' },
  { usage: 0x022a, label: 'Browser favourites', short: 'Fav' },
  { usage: 0x006f, label: 'Screen brightness up', short: 'Bri+' },
  { usage: 0x0070, label: 'Screen brightness down', short: 'Bri−' },
];

/** Mouse buttons as HID button masks. Only left click is confirmed on this keyboard. */
export const MOUSE: { button: number; label: string; short: string }[] = [
  { button: 1, label: 'Left click', short: 'LMB' },
  { button: 2, label: 'Right click', short: 'RMB' },
  { button: 4, label: 'Middle click', short: 'MMB' },
  { button: 8, label: 'Back (button 4)', short: 'M4' },
  { button: 16, label: 'Forward (button 5)', short: 'M5' },
];

export const MACRO_MODES = [
  { value: 0, label: 'Play once' },
  { value: 1, label: 'Repeat N times' },
  { value: 3, label: 'Repeat while held' },
  { value: 2, label: 'Toggle on/off' },
] as const;

const modPrefix = (mods: number) => MODIFIERS.filter((m) => mods & m.bit).map((m) => m.label + '+').join('');

/** Short label shown on a remapped key. */
export function shortLabel(a: Action, macros: readonly Macro[]): string {
  switch (a.kind) {
    case 'default':
      return '';
    case 'key':
      return modPrefix(a.mods) + keyLabel(a.usage);
    case 'consumer':
      return MEDIA.find((m) => m.usage === a.usage)?.short ?? `0x${a.usage.toString(16)}`;
    case 'mouse':
      return MOUSE.find((m) => m.button === a.button)?.short ?? 'Mouse';
    case 'macro':
      return macros[a.slot]?.name || `Macro ${a.slot + 1}`;
  }
}

/** Longer description for the editor. */
export function describe(a: Action, macros: readonly Macro[]): string {
  switch (a.kind) {
    case 'default':
      return 'Default';
    case 'key':
      return modPrefix(a.mods) + keyLabel(a.usage);
    case 'consumer':
      return MEDIA.find((m) => m.usage === a.usage)?.label ?? `Consumer 0x${a.usage.toString(16)}`;
    case 'mouse':
      return MOUSE.find((m) => m.button === a.button)?.label ?? 'Mouse';
    case 'macro':
      return `Macro: ${macros[a.slot]?.name || a.slot + 1}`;
  }
}
