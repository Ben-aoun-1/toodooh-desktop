# Toodooh Flasher v2 — Build Plan

## Goal
A Windows-focused, offline, ~no-toolchain flasher that writes a **prebuilt** firmware
binary to a TTGO T3 LoRa32 board, provisions the per-site **WiFi credentials** over
serial, and confirms the board reached WiFi + MQTT — so it appears on the web platform.

Same product name (**Toodooh Flasher**) and same icon (`resources/icon.ico` / `icon.png`).
**UI entirely in French.**

## User workflow
1. Connect the board via USB.
2. Open the app.
3. App auto-detects the COM port (existing VID/PID logic).
4. User enters WiFi SSID + password (2.4 GHz only).
5. User clicks **Flasher**.
6. Board flashes → provisions WiFi → connects → appears on the platform.

### What one "Flasher" click does (invisible to user, ~10–15 s)
1. **esptool-js** flashes the prebuilt `.bin` set (bootloader + partitions + boot_app0 + app).
2. Board reboots; app opens serial and sends `SET_WIFI <ssid> <pass>`.
3. Firmware saves creds to **NVS**, joins WiFi, connects to MQTT (server/creds baked in),
   publishes on its chip-ID topic.
4. App watches serial for "WiFi connected" + "MQTT connected" → shows **« Appareil en ligne ✓ »**
   (or a clear French error, e.g. « Mot de passe WiFi refusé »).

## Architecture decision
- **Stack: Electron** (keeps React UI; esptool-js has first-class Node + `serialport` support;
  Tauri would need a hand-built serial bridge and unreliable Web Serial in WebView2).
- **No Python, no PlatformIO, no compile-on-device.** Firmware is compiled **once in CI**.
- **Only per-device variable = WiFi creds**, provisioned at runtime via NVS. Everything else
  (BLE-only, deep-sleep 174, battery on /8, chip-ID topic, MQTT config) is baked into the
  universal binary.

---

## Firmware change (in `Ben-aoun-1/toodooh-firmware`)
New patch `patches/0002-nvs-wifi-provisioning.patch`:
- At boot, read WiFi SSID/pass from NVS (`Preferences`, namespace `toodooh`, keys
  `wifi_ssid` / `wifi_pass`) instead of the compile-time `WIFI_SSID` / `WIFI_PASS` macros
  (currently injected by `shared/build.py` from `ota.conf`). Fall back to compiled defaults
  if NVS is empty.
- Add a serial provisioning handler: on `SET_WIFI <ssid>\t<pass>`, store to NVS, reconnect,
  and reply `WIFI_SAVED` then emit the existing WiFi/MQTT connect logs.
- Provisioning happens in the fresh post-flash awake window (before deep sleep), so timing is fine.
- ~40–60 lines. CI applies `0001` + `0002`.

## Build gotchas (validated 2026-06-18)
- **SSID with spaces breaks compile-time WiFi** — `build.py` emits `-DWIFI_SSID="..."`;
  a space splits the flag. Hence WiFi creds MUST be runtime (NVS), not compiled.
- **Config-only changes need a clean build** — `shared/paxcounter.conf` is pulled in via
  a `-include` build flag, which SCons' dependency scanner does NOT track. Editing its
  content does not trigger a rebuild; CI must `pio run -t clean` (or the bin is stale).
- App bin is renamed `firmware_ttgov21new_v3.6.2.bin`; no `flasher_args.json` is emitted.
  ESP32 offsets: 0x1000 bootloader, 0x8000 partitions, 0xe000 boot_app0, 0x10000 app.

## CI pipeline (GitHub Actions in toodooh-firmware)
- Check out upstream ESP32-Paxcounter **v3.6.3**, apply `patches/*.patch`, copy
  `config-templates/*` into `shared/`, run `pio run -e usb`.
- Collect `.pio/build/usb/{bootloader.bin, partitions.bin, firmware.bin}`,
  framework `boot_app0.bin`, and `flasher_args.json` (so flash **offsets are read, not
  hardcoded**).
- Publish as release artifacts; the flasher bundles them under `resources/firmware-bin/`.

## App rewrite (this repo)
**Delete:** `src/main/pio-manager.js`, `src/main/config-generator.js`, the toolchain-seeding
half of `src/main/firmware-manager.js`, `scripts/setup-portable-python.js`, the
`platformio-core` extraResource, and the whole `resources/platformio-core` concept.

**Add:**
- `src/main/flasher.js` — esptool-js + a `serialport`-backed transport; flashes the bundled
  bins at offsets from `flasher_args.json`, streams progress.
- `src/main/provision.js` — opens serial, sends `SET_WIFI`, watches for connect logs,
  resolves online/offline with a timeout.
- `resources/firmware-bin/` — the CI-built bins + `flasher_args.json` (~2–3 MB).
- IPC `flash-device` handler: flash → provision → confirm, streaming phase + output.

**Keep:** React shell, Serial Monitor tab, port auto-detect / ESP32 VID-PID table
(`serial-manager.js`), preload/IPC structure.

**UI changes:**
- Trim FlashForm to: WiFi SSID, WiFi password, COM port, **Flasher** button.
  Remove deviceId / MQTT / RSSI fields (all fixed now).
- Progress stepper relabeled: Flashage → Configuration WiFi → Connexion → En ligne.
- `src/renderer/src/i18n/fr.js` — single source of all French strings.

## Packaging
- electron-builder `win portable`, keep icon, `productName: "Toodooh Flasher"`,
  `artifactName: ToodoohFlasher.exe`.
- `extraResources` now just `resources/firmware-bin`. Exe ~80 MB (no 1 GB toolchain).

---

## Status (2026-06-18): v2 SHIPPED
- App rewritten: esptool-js flash + serial NVS WiFi provisioning, French UI, no toolchain.
  Portable `dist/ToodoohFlasher.exe` (~71 MB). GUI end-to-end test passed on real hardware.
- Firmware: clean `patches/0002-nvs-wifi-provisioning.patch` + `.github/workflows/build-firmware.yml`
  committed in the `toodooh-firmware` clone (C:\toodooh-build\toodooh-firmware) — **needs `git push`**
  and a repo secret `MQTT_PASSWD`.
- Fresh-PC readiness: `resources/drivers/` (drop CH343SER.EXE), `docs/GUIDE-PREMIERE-UTILISATION.md`,
  in-app "no board / install driver" hint.
- Still open: code-signing (paid cert) to remove SmartScreen warning; the firmware repo's old
  `flash_device.sh` WiFi injection is now obsolete (WiFi is runtime) — prune when convenient.

## Milestones (de-risk first)
- **M0 — Spike: ✅ DONE (2026-06-18).** esptool-js + node `serialport` + Web Serial
  adapter (`scripts/webserial-node.mjs`) connected to the real board on COM11:
  DTR/RTS auto-reset → SYNC → chip detect → stub upload all worked, non-destructively.
  Board = **ESP32-PICO-D4 rev1, 4 MB flash**, MAC f0:24:f9:ad:89:b8 (CH9102 bridge).
  Gotcha handled: node-serialport `.set()` resets unspecified flags, so always send DTR+RTS.
  Test WiFi for later provisioning step: SSID `Ooredoo 6E25FB` / pass `marrouma123`.
  NOTE: SSID contains a space → provisioning protocol must NOT use space as a
  delimiter. Use tab/newline-delimited or JSON (e.g. `SET_WIFI\t<ssid>\t<pass>\n`).
- **M1 — Firmware:** add `0002-nvs-wifi-provisioning.patch`; build bins locally; manually
  verify NVS provisioning + connect.
- **M2 — CI:** GitHub Actions producing the bin set automatically.
- **M3 — App core:** `flasher.js` + `provision.js` + IPC, with online confirmation.
- **M4 — UI:** trim form, French i18n, keep name/icon.
- **M5 — Package + test:** portable exe; validate on a clean, offline Windows machine.

## Open items to confirm during M0/M1
- Serial provisioning protocol exact format + ack (firmware side).
- Need a physical board for M0 and M1.
- 2.4 GHz-only WiFi hint in UI.
