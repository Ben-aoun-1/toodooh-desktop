# Toodooh Flasher — Guide de première utilisation

Application portable pour Windows 10/11 (64 bits). Aucune installation requise.

---

## 1. Pilote USB (à faire une seule fois par ordinateur)

Les cartes Toodooh utilisent une puce USB **CH9102 / CH343 (WCH)**. Sans son
pilote, la carte n'apparaît pas comme port COM et l'application ne peut pas la
détecter.

- Pilote fourni dans le dossier **`drivers/`** à côté de l'application
  (`CH343SER.EXE`) — double-cliquez dessus puis **Installer**.
- Ou téléchargez-le sur le site officiel WCH :
  https://www.wch-ic.com/downloads/CH343SER_ZIP.html

Redémarrez l'ordinateur si Windows le demande.

> Astuce : si, carte branchée, aucun port n'apparaît dans l'application,
> c'est presque toujours le pilote qui manque.

---

## 2. Lancer l'application

1. Double-cliquez sur **`ToodoohFlasher.exe`**.
2. Au premier lancement, Windows peut afficher **« Windows a protégé votre
   PC »** (SmartScreen, car l'application n'est pas signée).
   → Cliquez sur **Informations complémentaires** puis **Exécuter quand même**.

---

## 3. Flasher une carte

1. Branchez la carte à l'ordinateur en **USB**.
2. Le **port COM** se sélectionne automatiquement
   (il affiche « — ESP32 (CH9102) »).
3. Saisissez le **Nom du réseau WiFi (SSID)** et le **Mot de passe WiFi**.
   ⚠️ Réseau **2,4 GHz uniquement** (l'ESP32 ne gère pas le 5 GHz).
4. Cliquez sur **Flasher**.
5. Suivez les étapes :
   **Flashage → Configuration WiFi → Connexion → Appareil en ligne ✓**

Quand « Appareil en ligne ✓ » s'affiche, la carte est flashée, connectée au
WiFi et visible sur la plateforme.

---

## 4. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Aucun port COM dans la liste | Pilote CH9102 absent | Installer le pilote (section 1), rebrancher la carte |
| « Mot de passe WiFi refusé » | Mauvais mot de passe WiFi | Vérifier le mot de passe et réessayer |
| Reste sur « Connexion », n'arrive pas « En ligne » | Réseau sans accès Internet, ou réseau 5 GHz | Utiliser un réseau 2,4 GHz avec accès Internet |
| « Windows a protégé votre PC » | Application non signée | Informations complémentaires → Exécuter quand même |

La carte ne se met en veille (30 min) qu'une fois le WiFi configuré : tant
qu'elle n'a pas reçu d'identifiants, elle reste éveillée pour pouvoir être
flashée.
