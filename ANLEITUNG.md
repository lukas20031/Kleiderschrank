# Kleiderschrank – Einrichtung

Web-App (PWA) für die digitale Garderobe. Alles wird zuerst auf dem Gerät gespeichert und dann mit einem eigenen App-Ordner in deinem OneDrive synchronisiert. Ohne OneDrive-Verbindung läuft die App rein lokal.

**Dateien:** `index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest`, `icons/`

---

## 1. App online stellen (GitHub Pages, kostenlos)

1. Auf github.com ein neues **öffentliches** Repository anlegen, z. B. `kleiderschrank`.
2. Alle Dateien aus diesem Ordner hochladen („Add file › Upload files“), inklusive des Ordners `icons`.
3. *Settings › Pages* öffnen, unter „Branch“ `main` und `/ (root)` wählen und speichern.
4. Nach etwa einer Minute ist die App erreichbar unter
   `https://<dein-github-name>.github.io/kleiderschrank/`

> Im Repository liegt nur der Programmcode. Deine Kleidungsdaten und Fotos landen ausschließlich in deinem OneDrive.

## 2. App bei Microsoft registrieren (einmalig, ca. 10 Minuten)

Microsoft erlaubt neue App-Registrierungen nur noch innerhalb eines Verzeichnisses (Tenant), nicht mehr direkt mit einem privaten Konto. Mit einem **kostenlosen Azure-Konto** bekommst du automatisch eins („Standardverzeichnis“). Bei der Anmeldung kann eine Kreditkarte zur Identitätsprüfung verlangt werden. Für die App-Registrierung fallen keine Kosten an.

1. Auf **https://entra.microsoft.com** mit deinem Microsoft-Konto anmelden. Falls noch kein Verzeichnis existiert, vorher über portal.azure.com ein kostenloses Azure-Konto anlegen.
2. *Entra ID › App-Registrierungen › Neue Registrierung*
   - **Name:** `Kleiderschrank`. Unter diesem Namen erscheint später der Ordner in OneDrive (*Apps › Kleiderschrank*).
   - **Unterstützte Kontotypen:** „Nur persönliche Microsoft-Konten“ oder „Konten in einem beliebigen Organisationsverzeichnis und persönliche Microsoft-Konten“
   - **Umleitungs-URI:** Plattform **„Single-Page-Anwendung (SPA)“** wählen und die URL aus Schritt 1 eintragen, **exakt mit Schrägstrich am Ende**, z. B. `https://<name>.github.io/kleiderschrank/`
3. Auf *Registrieren* klicken und die **Anwendungs-ID (Client-ID)** von der Übersichtsseite kopieren.

Ein Client-Geheimnis brauchst du nicht. API-Berechtigungen musst du ebenfalls nicht eintragen, denn die App fragt beim Anmelden nur nach `Files.ReadWrite.AppFolder`. Das ist der Zugriff auf ihren eigenen Ordner, nicht auf dein übriges OneDrive.

## 3. In der App verbinden

1. Die App-URL öffnen und auf das Zahnrad tippen.
2. Die Client-ID einfügen. Die angezeigte Umleitungs-URI muss genau mit der in Entra übereinstimmen.
3. Auf **„Mit Microsoft anmelden“** tippen und den Zugriff bestätigen.
4. Die Statusanzeige oben zeigt jetzt „Synchron“. Teile, die du vorher lokal angelegt hast, werden automatisch hochgeladen.

## 4. Auf dem Handy installieren

- **iPhone:** Die URL in Safari öffnen, dann *Teilen › Zum Home-Bildschirm*. Anschließend die App vom Home-Bildschirm starten und dort einmal anmelden. Safari und die Home-Bildschirm-App haben getrennte Speicher.
- **Android:** Die URL in Chrome öffnen, dann *Menü › App installieren*.

Fotos lassen sich direkt mit der Kamera aufnehmen oder aus der Galerie wählen, mehrere auf einmal. Sie werden auf 1600 px verkleinert (Vorschau 480 px), damit OneDrive und das Handy nicht volllaufen.

---

## Gut zu wissen

- **Speicherformat in OneDrive:** `Apps/Kleiderschrank/items/<id>.json` enthält ein Teil mit allen Feldern. Die Fotos liegen in `Apps/Kleiderschrank/fotos/<fotoId>.jpg`, dazu jeweils `_t.jpg` als Vorschau. Die Daten bleiben also lesbar, auch ohne die App.
- **Offline:** Du kannst alles ohne Netz erfassen. Ein orangefarbener Punkt auf der Karte bedeutet „noch nicht hochgeladen“. Die Synchronisierung läuft automatisch, sobald du wieder online bist, außerdem beim Öffnen der App und alle 5 Minuten.
- **Mehrere Geräte:** Wenn dasselbe Teil auf zwei Geräten gleichzeitig geändert wird, gilt die zuletzt hochgeladene Version.
- **Anmeldung:** Microsoft lässt die Anmeldung bei reinen Web-Apps nach etwa 24 Stunden ablaufen. Die App erneuert sie beim nächsten Start automatisch mit einer kurzen Weiterleitung. Nur wenn die Microsoft-Sitzung abgelaufen ist, erscheint ein Hinweis zum erneuten Anmelden.
- **Export:** *Einstellungen › Als CSV exportieren* erzeugt eine Tabelle für Excel. Wenn ein Filter aktiv ist, enthält sie nur die gefilterten Teile.
- **Updates der App:** Nach einer Änderung an den Dateien in `sw.js` die `VERSION` erhöhen. Sonst zeigen installierte Geräte noch die alte Version aus dem Cache.
- **Lokal testen:** `python -m http.server 8080` im Ordner starten und in Entra zusätzlich `http://localhost:8080/` als SPA-Umleitungs-URI eintragen.
