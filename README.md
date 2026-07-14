# Toodooh Flasher

Application Windows (Electron) pour flasher et provisionner les compteurs PAX
Toodooh (ESP32) en USB — **sans aucune chaîne de compilation à installer**.

## Ce que fait l'application

1. **Flash** du micrologiciel précompilé sur la carte ESP32 via [esptool-js](https://github.com/espressif/esptool-js)
   au-dessus de `serialport` (aucun Python / PlatformIO requis).
2. **Provisionnement** des identifiants WiFi et du **code agent** par liaison série
   (`SET_WIFI\t<ssid>\t<pass>[\t<agent>]`), stockés en NVS sur la carte.
3. **Vérification** en direct : la carte rejoint le WiFi puis se connecte au broker MQTT.
   Le code agent est republié de façon *retained* sur `paxcounter/<clientId>/agent`,
   ce qui permet à la plateforme d'attribuer la carte à l'agent installateur.

## Architecture

- `src/main/` — process principal Electron : flash (`flasher.js`), provisionnement série
  (`provision.js`), gestion série (`serial-manager.js`), pont IPC (`ipc-handlers.js`),
  adaptateur WebSerial sur `serialport` (`webserial-node.js`).
- `src/main/vendor/` — esptool-js pré-bundlé en CJS pour le process principal.
- `src/renderer/` — interface React (française) : formulaire de flash, suivi de progression,
  moniteur série.
- `resources/firmware-bin/` — binaires précompilés (bootloader / partitions / firmware) + manifest.
- `resources/drivers/` — pilote USB-série CH9102 (CH343SER).
- `firmware/ESP32-Paxcounter/` — source du micrologiciel vendu (upstream + overlay Toodooh).
- `scripts/` — scripts d'expérimentation (spikes) : ports, flash, provisionnement, MQTT.

## Développement

```bash
npm install
npm run dev        # lance l'application en mode développement
npm run package    # build + electron-builder (portable Windows)
```

## Matériel cible

LilyGO TTGO T3 LoRa32 v1.6.1 (ESP32-PICO-D4, 4 Mo). Pilote CH9102 fourni dans `resources/drivers/`.
