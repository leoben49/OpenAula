import { KEYS } from '../layout';
import { Dongle, HID_FILTERS, openAll, TimeoutError, Wired, type Layer, type Link } from '../protocol/device';
import {
  colourTable,
  DEFAULT_LIGHTING,
  DEFAULT_SYSTEM,
  keymapTable,
  macroMemory,
  type Action,
  type Lighting,
  type Macro,
  type Rgb,
  type System,
} from '../protocol/payloads';

/**
 * The keyboard can't report its settings, so OpenAula remembers what it last
 * sent (like the official driver does) and re-sends whole structures.
 */
export interface Settings {
  lighting: Lighting;
  /** Per-key colours by key index. */
  colours: Record<number, Rgb>;
  userBrightness: number;
  system: System;
  keymap: Record<Layer, Record<number, Action>>;
  macros: Macro[];
}

const STORE_KEY = 'openaula.settings';

const defaults = (): Settings => ({
  lighting: { ...DEFAULT_LIGHTING },
  colours: {},
  userBrightness: 5,
  system: { ...DEFAULT_SYSTEM },
  keymap: { top: {}, fn: {} },
  macros: [],
});

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch {}
  return defaults();
}

/** Dev server only: mirrors events to .devlog/log.jsonl. */
export function devlog(entry: object) {
  if (!import.meta.env.DEV) return;
  void fetch('/__devlog', { method: 'POST', body: JSON.stringify({ t: new Date().toISOString(), ...entry }) }).catch(() => {});
}

type Sync = 'idle' | 'saving' | 'saved' | 'error';

class KeyboardState {
  dongle = $state<Dongle | null>(null);
  wired = $state<Wired | null>(null);
  battery = $state<number | null>(null);
  settings = $state<Settings>(load());
  sync = $state<Sync>('idle');
  error = $state('');
  /**
   * Whether the keyboard answers over 2.4 GHz. The dongle stays plugged in when
   * the keyboard is switched to wired or Bluetooth, so its presence alone means little.
   */
  dongleAwake = $state<boolean | null>(null);
  /** Short-lived message about connection changes. */
  notice = $state('');

  /** Settings go over the cable when present (the dongle is idle then), else the dongle. */
  get link(): Link | null {
    return this.wired ?? this.dongle;
  }

  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private misses = 0;
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

  private tell(message: string) {
    this.notice = message;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => (this.notice = ''), 5000);
  }
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.settings));
    } catch {}
  }

  // ------------------------------------------------------------ connection

  async restore() {
    if (!('hid' in navigator)) return;
    navigator.hid.addEventListener('disconnect', (e) => {
      if (this.dongle?.hid === e.device) {
        this.dongle = null;
        this.dongleAwake = null;
      }
      if (this.wired && (this.wired.control === e.device || this.wired.data === e.device)) {
        this.wired = null;
        if (this.dongle) {
          this.tell('Cable disconnected. Using the 2.4 GHz dongle.');
          void this.readBattery();
        }
      }
      devlog({ step: 'disconnect', pid: e.device.productId.toString(16) });
    });
    navigator.hid.addEventListener('connect', () => void navigator.hid.getDevices().then((d) => this.adopt(d)));
    await this.adopt(await navigator.hid.getDevices());
    // Every 10 s, single attempt: doubles as the "is the keyboard still on
    // 2.4 GHz" check, since the dongle stays plugged in when it isn't.
    this.pollTimer ??= setInterval(() => void this.readBattery(1), 10_000);
  }

  async connect() {
    this.error = '';
    try {
      await this.adopt(await navigator.hid.requestDevice({ filters: HID_FILTERS }));
    } catch (e) {
      this.error = String(e);
    }
  }

  private async adopt(devices: HIDDevice[]) {
    const d = Dongle.pick(devices);
    const w = Wired.pick(devices);
    try {
      await openAll([d, w?.control, w?.data].filter((x): x is HIDDevice => !!x));
    } catch (e) {
      this.error = `Couldn't open the keyboard: ${e}. Close the AULA software if it's running.`;
      return;
    }
    const newWired = !!w && this.wired?.control !== w.control;
    const fresh = (d && this.dongle?.hid !== d) || newWired;
    if (d && this.dongle?.hid !== d) this.dongle = new Dongle(d);
    if (newWired) {
      this.wired = new Wired(w.control, w.data);
      if (this.dongle) this.tell('Keyboard connected by cable. Settings now go over the cable.');
    }
    devlog({ step: 'adopted', dongle: !!this.dongle, wired: !!this.wired });
    if (!fresh) return;
    if (this.dongle) void this.readBattery();
    // The official driver syncs the screen clock on every connect.
    void this.run('clock', (l) => l.writeClock(new Date()), false);
  }

  async readBattery(attempts = 3) {
    if (!this.dongle) return;
    try {
      this.battery = await this.dongle.battery(attempts);
      if (this.dongleAwake === false && !this.wired) this.tell('Keyboard is answering over 2.4 GHz again.');
      this.dongleAwake = true;
      this.misses = 0;
    } catch (e) {
      // Two misses in a row, so one dropped packet doesn't flash the banner.
      if (++this.misses >= 2 || attempts > 1) this.dongleAwake = false;
      devlog({ step: 'batteryError', error: String(e) });
    }
  }

  // ------------------------------------------------------------ writes

  /** Runs one write on the active link, tracking sync state. */
  private async run(what: string, write: (l: Link) => Promise<void>, report = true) {
    const link = this.link;
    if (!link) return;
    if (report) this.sync = 'saving';
    try {
      await write(link);
      if (report) this.sync = 'saved';
      devlog({ step: 'write', what, link: link.link });
    } catch (e) {
      if (e instanceof TimeoutError && link.link === 'dongle') {
        this.dongleAwake = false;
        this.error = "the keyboard didn't answer over 2.4 GHz. Press a key to wake it, or connect the cable if it's in wired mode.";
      } else {
        this.error = String(e);
      }
      if (report) this.sync = 'error';
      devlog({ step: 'writeError', what, error: String(e) });
    }
  }

  /** Coalesces rapid changes (sliders, colour pickers) into one write. */
  private debounced(what: string, write: (l: Link) => Promise<void>, ms = 250) {
    this.save();
    clearTimeout(this.timers.get(what));
    this.timers.set(what, setTimeout(() => void this.run(what, write), ms));
  }

  setLighting(patch: Partial<Lighting>) {
    this.settings.lighting = { ...this.settings.lighting, ...patch };
    const l = $state.snapshot(this.settings.lighting);
    this.debounced('lighting', (link) => link.writeLighting(l));
  }

  applyUserLighting() {
    const s = $state.snapshot(this.settings);
    this.settings.lighting = { ...this.settings.lighting, mode: 0x80 };
    const colours = new Map(Object.entries(s.colours).map(([k, v]) => [Number(k), v as Rgb]));
    this.debounced('userLighting', (link) => link.writeUserLighting(colourTable(KEYS.map((k) => k.index), colours), s.userBrightness), 400);
  }

  setSystem(patch: Partial<System>) {
    this.settings.system = { ...this.settings.system, ...patch };
    const sys = $state.snapshot(this.settings.system);
    this.debounced('system', (link) => link.writeSystem(sys));
  }

  setAction(layer: Layer, index: number, action: Action) {
    const map = { ...this.settings.keymap[layer] };
    if (action.kind === 'default') delete map[index];
    else map[index] = action;
    this.settings.keymap = { ...this.settings.keymap, [layer]: map };
    this.writeKeymap(layer);
  }

  private writeKeymap(layer: Layer) {
    const entries = $state.snapshot(this.settings.keymap[layer]);
    const table = keymapTable(new Map(Object.entries(entries).map(([k, v]) => [Number(k), v as Action])));
    this.debounced(`keymap-${layer}`, (link) => link.writeKeymap(layer, table), 100);
  }

  /** Saves the macro list; deleting a macro shifts later slots, so key assignments follow. */
  setMacros(macros: Macro[], removedSlot?: number) {
    this.settings.macros = macros;
    if (removedSlot != null) {
      for (const layer of ['top', 'fn'] as const) {
        const map: Record<number, Action> = {};
        for (const [k, a] of Object.entries(this.settings.keymap[layer])) {
          if (a.kind === 'macro' && a.slot === removedSlot) continue;
          map[Number(k)] = a.kind === 'macro' && a.slot > removedSlot ? { ...a, slot: a.slot - 1 } : a;
        }
        this.settings.keymap[layer] = map;
        this.writeKeymap(layer);
      }
    }
    const memory = macroMemory($state.snapshot(this.settings.macros) as Macro[]);
    this.debounced('macros', (link) => link.writeMacros(memory), 100);
  }

  /** Re-sends everything OpenAula remembers, e.g. after using the official software. */
  async sendAll() {
    const s = $state.snapshot(this.settings) as Settings;
    await this.run('all', async (link) => {
      await link.writeSystem(s.system);
      await link.writeMacros(macroMemory(s.macros));
      for (const layer of ['top', 'fn'] as const) {
        await link.writeKeymap(layer, keymapTable(new Map(Object.entries(s.keymap[layer]).map(([k, v]) => [Number(k), v]))));
      }
      if (s.lighting.mode === 0x80) {
        const colours = new Map(Object.entries(s.colours).map(([k, v]) => [Number(k), v]));
        await link.writeUserLighting(colourTable(KEYS.map((k) => k.index), colours), s.userBrightness);
      } else {
        await link.writeLighting(s.lighting);
      }
      await link.writeClock(new Date());
    });
  }

  resetStored() {
    this.settings = defaults();
    this.save();
  }

  /** JSON backup of everything OpenAula remembers. */
  exportSettings(): string {
    return JSON.stringify({ app: 'openaula', version: 1, savedAt: new Date().toISOString(), settings: $state.snapshot(this.settings) }, null, 2);
  }

  /** Replaces the stored settings with a backup. Throws on files that aren't OpenAula backups. */
  importSettings(json: string) {
    const data = JSON.parse(json);
    if (data?.app !== 'openaula' || typeof data.settings !== 'object') throw new Error('not an OpenAula backup file');
    const s = { ...defaults(), ...data.settings } as Settings;
    // Validate the parts that end up on the wire so a bad file can't produce garbage packets.
    macroMemory(s.macros);
    if (!s.keymap?.top || !s.keymap?.fn || !s.lighting || !s.system) throw new Error('backup is missing sections');
    this.settings = s;
    this.save();
  }
}

export const kb = new KeyboardState();
