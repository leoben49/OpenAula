# EPOMAKER x AULA F75 Max — USB protocol notes

Reverse-engineered from USB captures of the official driver ("AULA F75 Max Gasket
Mechanical Keyboard Driver", Beta 1.0.0.5) on 2026-10-08. Raw captures live in
`captures/` (gitignored; they also contain keystrokes on the keyboard endpoint).

## Devices

| Mode | VID:PID | Config interface | Transport |
|---|---|---|---|
| Wired (USB-C) | `0C45:800A` (Sonix) | MI_03 (vendor page) | 64-byte feature reports + interrupt OUT `0x03` / IN `0x84` for bulk data |
| 2.4 GHz dongle | `05AC:024F` (borrowed Apple VID) | MI_03 | 32-byte interrupt OUT `0x05` / IN `0x85` |
| Bluetooth | — | none | driver says config unsupported |

The two transports speak **different command sets**.

## 2.4 GHz dongle (32-byte reports, no report ID)

Frame: `byte0 = command`, `byte1 = sub/flags`, payload, `byte31 = checksum`
where checksum = `sum(bytes[0..30]) & 0xFF`. Every OUT gets a 32-byte IN reply
echoing the command. Many write payloads carry an `AA 55` marker at bytes 17–18.

| Cmd | Request | Reply / meaning |
|---|---|---|
| `20 01` | battery poll (driver sends every 15 s) | `20 01 00 PP` — `PP` = battery % (0x42 = 66, confirmed vs driver UI). Byte 2 stays `00` with the cable charging (tested), so it is not a charging flag. |
| `02` | device info | `02 00 00 40 30 00 00 45 0C 0A 80 08 01 FF FF …` — contains wired VID/PID LE (`450C 0A80`). Firmware version location unknown (maybe `08 01`). |
| `0C 10` | clock sync, sent on connect | `0C 10 00 00 01 5A YY MM DD hh mm ss 00 WD 00 … AA 55` (YY = year-2000, WD = weekday, Thu = 4) |
| `07 10` | system settings write (always the full set) | `07 10 00 00 01 AT AF WK 00 SS 00 RR … AA 55` — `AT`/`AF`/`WK` = disable Alt+Tab / Alt+F4 / Win key (1 = disabled). `SS` sleep: 1 = 1 min, 2 = 5 min (UI order No Sleep/1/5/30 ⇒ likely 0..3). `RR` key response level 1–5. Byte 4 always `01`. |
| `05 10` | lighting write | `05 10 00 MM RR GG BB 00 00 00 00 CF BR SP DI 00 00 AA 55` — see below |
| `14 1C` / `14 10` | per-key colours (user lighting) | see tables |
| `10 1C` / `10 10` | top-layer keymap table | see tables |
| `12 1C` / `12 10` | Fn-layer keymap table | see tables |
| `03 04` | set one top-layer key | `03 04 KK T A B` — key index, then a 3-byte action (below) |
| `0D 04` | set one Fn-layer key | same layout as `03 04` |
| `09 1C` / `09 x4 10` | macro memory | see Macros |

No screen or firmware commands over the dongle (driver hides those pages).
The driver never reads settings back over the dongle: it keeps its own copy
and re-sends whole structures, so an app must keep state locally too.

### Lighting (`05 10`)

- `MM` mode = 1-based index into the driver's effect list: 1 Static, 2 SingleOn,
  3 SingleOff, 4 Glittering, 5 Falling, 6 Colourful, 7 Breath, 8 Spectrum,
  9 Outward, 10 Scrolling, 11 Rolling (factory default), 12 Rotating, 13 Explode,
  14 Launch, 15 Ripples, 16 Flowing, 17 Pulsating, 18 Tilt, 19 Shuttle.
  `0` = LED off (payload otherwise zero). `0x80` = user (per-key) lighting.
- `RR GG BB` colour; `CF` = 1 for the rainbow/"colourful" palette, 0 for the single colour.
- `BR` brightness 1–5, `SP` speed 1–5, `DI` direction (0, 2 seen).

### Tables (`10`, `12`, `14`)

20 packets `CC 1C NN e0 e1 … e6` (NN = 0x00–0x13), each carrying seven 4-byte
entries, so entry `i` lives in packet `i / 7` at byte `3 + 4 * (i % 7)`. Then a
commit `CC 10 14 00 … AA 55 [00 CC 10 14]` (bytes 17–18 = `AA 55`; the keymap
commits repeat `00 CC 10 14` after it). `i` is the layout `key_index`
(Esc = 1, F1–F12 = 2–13, Caps = 0x37 …; see `src/lib/layout.ts`).

- Keymap entry = action (below) + `00`. All zero = key keeps its default.
- User lighting entry = `KK RR GG BB` for every physical key (KK = key index),
  zero for unused slots. Lighting mode `0x80` (with brightness) is sent first.

### Key actions (3 bytes)

| Type | Bytes | Example |
|---|---|---|
| keyboard | `02 MM UU` (modifier mask, HID usage) | Caps→Esc `02 00 29` |
| consumer | `03 LL HH` (16-bit usage, LE) | Calculator `03 92 01` |
| mouse | `01 BB 01`? (button) | Left click `01 01 01` |
| macro | `06 NN PM LC` (slot, play mode, loop count) | `06 01 01 03` |

The single-key commands carry the action as 4 bytes too (`03 04 KK T A B C`).
Macro play modes: 0 play once, 1 play N times (`LC`), 3 repeat until released;
2 is probably "stop when pressed again" (unconfirmed).

### Macros (`09`)

Macro memory is a flat byte array sent as data packets `09 1C SS <28 bytes>`
(SS = 0, 1, 2 …; address = SS * 28 + byte − 3), then a commit
`09 LL NN 00 … AA 55 CS` with the marker at bytes 29–30, `NN` = number of data
packets and `LL` = bytes used in the last one.

- 0x000: offset table, one u32 LE per macro slot (0 = unused; the driver wrote
  `FF FF FF FF` for a just-deleted slot). Macro 0 starts at 0x190.
- Each macro: u32 LE record count, 4 zero bytes, then `count` u32 LE records,
  `type << 24 | value << 16` for inputs and `type << 24 | ms` for delays:

| Type | Meaning |
|---|---|
| `B0` / `30` | key down / up, value = HID usage |
| `90` / `10` | mouse button down / up, value = button (1 = left) |
| `50` | delay, low 24 bits = milliseconds |

Ctrl+C recorded: `E0 down, 216 ms, C down, 167 ms, C up, 87 ms, Ctrl up, 10 ms`.
The driver puts a delay after every input (default 10 ms).

## Wired (64-byte feature reports, report ID 0)

Command packets (`04 xx …`) are each followed by GET_REPORT(feature), which
echoes the command with byte 3 = `01` (ack). Data packets are plain SETs.

Every write is a transaction:

```
04 18                      begin (04 19 for macro memory)
04 TT SS 00 00 00 00 00 NN target TT, sub SS, NN data packets follow
<NN × 64-byte data>        payload; AA 55 marker (see below)
04 02                      end / commit
```

The payloads are the dongle payloads without their 3-byte header
(wired payload byte 0 = dongle byte 3):

| TT | SS | NN | Payload | AA 55 at |
|---|---|---|---|---|
| `13` | 0 | 1 | lighting (`MM RR GG BB … CF BR SP DI`) | 14–15 |
| `17` | 1 | 1 | system settings (`00 01 AT AF WK 00 SS 00 RR`) | 62–63 |
| `28` | 0 | 1 | clock (`00 01 5A YY MM DD hh mm ss 00 WD`) | 62–63 |
| `11` | 0 | 9 | top-layer keymap, 144 × 4-byte entries | 574–575 |
| `27` | 0 | 9 | Fn-layer keymap | 574–575 |
| `23` | 0 | 9 | per-key colours (`KK RR GG BB`) | 574–575 |
| `15` | 0 | 8 | macro memory (same layout as dongle) | 510–511 |
| `72` | slot | n | screen animation, see below (data on the interrupt endpoint) | — |

Also seen: `04 20 … 08` streamed continuously (live lighting, ignored) and a
polling read `04 F0`, `04 F5 … 09` whose GET returns 9 packets of
`[i, 0, 0, 0]` for i = 0…143 (meaning unknown; suggests reads are possible).

| Cmd | Meaning |
|---|---|
| `04 18` | begin transaction |
| `04 28 … [8]=01` | unknown (sent on connect) |
| `00 01 5A YY MM DD hh mm ss 00 WD … [62..63]=AA 55` | clock sync |
| `04 02` | end / commit |
| `04 72 01 00 00 00 00 00 NN NN` | start screen animation upload; `NNNN` (LE) = number of 4096-byte chunks to follow |

### Screen animation upload

After `04 18`, `04 72 …`, the driver writes `NNNN` × 4096-byte chunks to
interrupt OUT `0x03`; each is acked on IN `0x84` with `01 5A 02 00…`. Then `04 02`.

Payload (concatenated, zero-padded to a 4096 multiple):

- Header, 256 bytes: `byte0` = frame count (≤ 255), `bytes 1..n` = per-frame
  delay (units unclear; 0x05 and 0x41 seen), rest `0xFF`.
- Frames: 128 × 128 pixels, **RGB565 little-endian**, row-major, 32768 bytes each.

Verified by rebuilding frame 0 of a 17-frame upload into a PNG (`captures/frame0.png`).

## Firmware

AULA publishes `F75MAX firmware.exe` on aulastar.com (the AULA trademark
owner's site; Epomaker lists no firmware). Findings from inspecting it,
without running it:

- Unsigned; a rebranded Sonix "USB MCU ISP Tool" (file version 2.1.2.6) with an
  embedded zip holding `Settings/FWFiles/SN32F290.hex` and `UISettings.ini`.
- Chip: Sonix SN32F290 (ARM). Updates the keyboard over cable only, not the dongle.
- Version **1.09**: `CurVersion=0x0109` in the ini, and bytes `01 09` at
  offset 0x0C of the image. The dongle's `02` device-info reply contains
  `08 01` (bytes 11–12), most likely the installed version, 0x0108.
- No changelog anywhere.
- The firmware is plain (not encrypted). Its default keymap at 0x11BE0 is
  column-major, 8 bytes per column; the bottom row holds Right Alt, Fn and
  Right Ctrl in consecutive columns.

### Fn / Ctrl variants

AULA's own F75 Max has Alt + Fn right of the space bar (slots 95, 96 in the
driver's layout). The EPOMAKER x AULA edition has Fn + Ctrl, wired to slots
**96 and 98** (found by remapping slots 95–98 to letters on a real board; 95
and 97 are unwired). `tools/gen-layout.mjs` applies this.

## Open questions

- Firmware version field.
- Screen off / screen brightness: no such command seen. Candidates to probe: unknown `04 28`, other `04 xx` opcodes. Probe carefully (read-only first).
- Lighting field mapping; key remap / macro commands (not captured yet).
- Whether the board actually sleeps (battery drain investigation).
