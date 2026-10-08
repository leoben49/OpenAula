# OpenAula

A lightweight, open-source replacement for the EPOMAKER x AULA F75 Max keyboard
software. It runs in your browser, works offline, and installs nothing.

## Why

The official driver is a Windows-only program that wants to start with Windows
and sit in the tray. OpenAula is a single web page that talks to the keyboard
directly over [WebHID](https://developer.mozilla.org/docs/Web/API/WebHID_API).
Settings are stored **on the keyboard**, so once you've configured it you can
close the page. Nothing runs in the background.

## Features

- **Battery** percentage over the 2.4 GHz dongle
- **Lighting**: all 19 effects, rainbow or single colour, brightness, speed,
  direction, or off
- **Per-key colours**: paint individual keys
- **Key remapping** on the normal and Fn layers: other keys and combos
  (e.g. Ctrl+C), media keys, mouse buttons, macros
- **Macros**: record keys and mouse clicks with real timing, edit delays, play
  once / N times / while held
- **Screen**: upload a GIF or image to the 128×128 screen (resized
  automatically, pixel art stays crisp); remembers what you last uploaded
- **System**: sleep timer, key response time, disable Win / Alt+F4 / Alt+Tab
- **Backup & restore** your settings to a file
- **Light and dark** themes, following your system setting

## Using it

Open the page in Chrome, Edge, Brave or another Chromium browser on desktop
(Firefox and Safari don't support WebHID), plug in the 2.4 GHz dongle or the
USB cable, and click **Connect**. Close the AULA software first so the two don't
talk to the keyboard at the same time.

**Connections:**

- **2.4 GHz dongle**: battery, lighting, keys, macros and system settings.
- **USB cable (wired mode)**: everything above except battery, plus the screen.
  Screen images are too big for the dongle; the official software has the same
  limit.
- **Bluetooth**: can't be configured, but settings you made still apply.

The browser remembers the dongle, but forgets the cable connection each time the
keyboard switches modes (the keyboard has no USB serial number), so after
switching to wired click **Connect cable…** in the banner.

**Settings can't be read back.** The keyboard has no way to report its
settings (the official software has the same limitation and keeps its own
copy). OpenAula remembers what it sent from your browser. If you change things
with the official software, use **System → Send all** to make the keyboard
match OpenAula again, and **System → Backup** to keep a copy.

**Privacy:** the page makes no network requests. There's no analytics,
telemetry or update check, and a Content Security Policy blocks connections to
other sites.

### Platforms

| Platform | Status |
|---|---|
| Windows | Tested (Brave) |
| macOS | Should work in Chromium browsers; untested |
| Linux | Needs a one-time udev rule (below); untested |
| Firefox, Safari, phones | Not supported (no WebHID) |

#### Linux setup

```bash
printf '%s\n' \
  'KERNEL=="hidraw*", ATTRS{idVendor}=="0c45", ATTRS{idProduct}=="800a", TAG+="uaccess"' \
  'KERNEL=="hidraw*", ATTRS{idVendor}=="05ac", ATTRS{idProduct}=="024f", TAG+="uaccess"' \
  | sudo tee /etc/udev/rules.d/70-openaula.rules
sudo udevadm control --reload-rules && sudo udevadm trigger
```

The rules match the keyboard (`0C45:800A`) and its dongle (`05AC:024F`, which
borrows Apple's vendor ID) exactly, and nothing else.

## Supported devices

| Device | Status |
|---|---|
| EPOMAKER x AULA F75 Max (cable `0C45:800A`, dongle `05AC:024F`) | Tested |

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # protocol tests built from real USB captures
npm run check    # type-check
npm run build    # single-file build in dist/index.html
```

The protocol is documented in [docs/PROTOCOL.md](docs/PROTOCOL.md). It was
worked out from USB captures of the official driver; `tools/usbpcap-dump.mjs`
prints USBPcap captures in a readable form, and `tools/gen-layout.mjs`
regenerates the key layout from the official driver's layout file.

### Not yet confirmed

- Mouse buttons other than left click, the "toggle" macro mode and what the
  direction values do were inferred, not captured.
- Turning the screen off: no such command has been found (a black image still
  leaves the backlight on).

## Disclaimer

OpenAula is an independent project, not affiliated with or endorsed by EPOMAKER
or AULA. The names are used only to say which hardware this works with. It
sends the same commands as the official software, but use it at your own risk.

## License

[MIT](LICENSE)
