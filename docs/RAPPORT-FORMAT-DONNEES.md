# Toodooh PAX — Format des données (rapport serveur)

Ce que le **serveur** doit attendre du broker MQTT. Vérifié sur matériel le 2026-06-18.

## Broker
- MQTT 3.1.1 / TCP — `54.38.26.121:1883`
- Utilisateur `toodooh` (+ mot de passe)
- Chaque appareil a un identifiant stable : `paxcounter_<8 hex>` (dérivé du MAC).
- L'appareil se réveille **toutes les 30 min**, émet, puis repart en veille profonde.

## Topics

| Topic | Quand | Retained | Charge utile |
|---|---|---|---|
| `paxcounter/<id>/agent` | à chaque connexion | **oui** | **code agent** — texte UTF-8 brut (ex. `SH571587`) |
| `paxcounter/<id>/1` | chaque cycle (30 min) | non | **comptage** — binaire **base64** |
| `paxcounter/<id>/8` | chaque cycle (30 min) | non | **batterie** — binaire **base64** |
| `paxcounter` | à chaque connexion | non | chaîne `paxcounter_<id>` (annonce de présence) |

> 3 encodages : `/agent` et `paxcounter` = **texte brut** ; `/1` et `/8` = **base64**
> à décoder en binaire **big-endian**.

## Charges utiles (après décodage base64, big-endian)

**`/1` Comptage (4 octets)**
| Offset | Octets | Champ | Note |
|---|---|---|---|
| 0 | 2 | `wifi_count` (uint16) | toujours `0` (sniff WiFi désactivé) |
| 2 | 2 | `ble_count` (uint16) | nombre d'appareils BLE vus **sur le cycle** (pas cumulatif) |

**`/8` Batterie (2 octets)**
| Offset | Octets | Champ | Note |
|---|---|---|---|
| 0 | 2 | `battery_mV` (uint16) | tension en **millivolts** ; conversion mV → % côté serveur |

**`/agent`** : la chaîne du code agent telle quelle (ex. `SH571587`). Retained →
reçue dès l'abonnement. Sert à savoir quel agent a installé le compteur.

## Exemple réel (appareil `paxcounter_b6a8b421`)
```
paxcounter/paxcounter_b6a8b421/agent   "SH571587"
paxcounter/paxcounter_b6a8b421/1       AAAAAw==  -> 00 00 00 03  -> wifi 0, BLE 3
paxcounter/paxcounter_b6a8b421/8       EEQ=      -> 10 44       -> 4164 mV (~4,16 V)
```

## Décodage (Node.js)
```js
client.on('message', (topic, payload) => {
  const seg = topic.split('/').pop()
  if (seg === 'agent') return console.log('agent', payload.toString())
  const b = Buffer.from(payload.toString(), 'base64')
  if (seg === '1') console.log('wifi', b.readUInt16BE(0), 'ble', b.readUInt16BE(2))
  if (seg === '8') console.log('battery_mV', b.readUInt16BE(0))
})
```

## Repères
- ~1 message comptage + 1 batterie **toutes les 30 min** par appareil (pas en continu).
- `ble_count` est **par intervalle** ; le cumul se fait côté serveur si besoin.
- Le code agent ne change pas tant que l'appareil n'est pas re-provisionné.
