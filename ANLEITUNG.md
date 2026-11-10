# Kleiderschrank – Einrichtung

Web-App (PWA) für die digitale Garderobe. Alles wird zuerst auf dem Gerät gespeichert und dann mit einem eigenen App-Ordner in deinem **Dropbox** oder **OneDrive** synchronisiert. Ohne Cloud-Verbindung läuft die App rein lokal.

**Dateien:** `index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest`, `icons/`

---

## 1. App online stellen (GitHub Pages, kostenlos)

1. Auf github.com ein neues **öffentliches** Repository anlegen, z. B. `kleiderschrank`.
2. Alle Dateien aus diesem Ordner hochladen („Add file › Upload files“), inklusive des Ordners `icons`.
3. *Settings › Pages* öffnen, unter „Branch“ `main` und `/ (root)` wählen und speichern.
4. Nach etwa einer Minute ist die App erreichbar unter
   `https://<dein-github-name>.github.io/kleiderschrank/`

> Im Repository liegt nur der Programmcode. Deine Kleidungsdaten und Fotos landen ausschließlich in deinem Dropbox bzw. OneDrive.

## 2. Cloud-Speicher einrichten – Dropbox **oder** OneDrive

In der App unter *Einstellungen › Cloud-Speicher* wählst du **Nur lokal**, **OneDrive** oder **Dropbox**. Wechselst du später, lädt die App alles, was auf dem Gerät liegt, in den neuen Speicher hoch. Der alte Speicher bleibt unverändert.

### 2a. Dropbox (einfacher, ohne Kreditkarte)

1. Auf **https://www.dropbox.com/developers/apps** mit deinem Dropbox-Konto anmelden und **Create app** wählen.
   - **Choose an API:** *Scoped access*
   - **Type of access:** **App folder**. Die App sieht dann nur ihren eigenen Ordner, nicht dein übriges Dropbox. Das lässt sich später nicht mehr ändern.
   - **Name:** z. B. `Kleiderschrank-Lukas`. Der Name muss bei Dropbox weltweit eindeutig sein. Unter diesem Namen erscheint der Ordner *Apps › …* in deinem Dropbox.
2. Im Reiter **Permissions** die Häkchen bei **files.content.write** und **files.content.read** setzen (`files.metadata.read` ist schon aktiv) und unten **Submit** klicken. Das muss *vor* der ersten Anmeldung passieren. Wenn du die Rechte später änderst, musst du dich in der App ab- und wieder anmelden.
3. Im Reiter **Settings**:
   - Unter **OAuth 2 › Redirect URIs** die App-Adresse eintragen, **exakt mit `/` am Ende**, z. B. `https://<name>.github.io/kleiderschrank/`, und auf **Add** klicken.
   - **Allow public clients (Implicit Grant & PKCE)** muss auf *Allow* stehen (Standard).
   - Den **App key** oben auf der Seite kopieren. Das *App secret* brauchst du nicht.
4. In der App unter *Einstellungen* **Dropbox** wählen, den App-Key einfügen und **„Mit Dropbox anmelden“** tippen.

Die Dropbox-Anmeldung läuft nicht ab. Du musst dich pro Gerät also nur einmal anmelden. Der Status „Development“ in der App Console ist für die eigene Nutzung völlig ausreichend.

### 2b. OneDrive (braucht ein eigenes Microsoft-Verzeichnis)

Microsoft erlaubt neue App-Registrierungen nur noch innerhalb eines Verzeichnisses (Tenant), nicht mehr direkt mit einem privaten Konto. Wer sich trotzdem so anmeldet, bekommt den Fehler *AADSTS16000 … tenant 'Microsoft Services'*. Abhilfe schafft ein **kostenloses Azure-Konto** (https://azure.microsoft.com/de-de/free/, am besten im privaten Browserfenster anlegen). Dabei entsteht ein „Standardverzeichnis“. Zur Identitätsprüfung kann eine Kreditkarte verlangt werden.

1. Auf **https://entra.microsoft.com** anmelden und prüfen, dass oben rechts dein eigenes Verzeichnis steht, nicht „Microsoft Services“.
2. *Entra ID › App-Registrierungen › Neue Registrierung*
   - **Name:** `Kleiderschrank`. So heißt später der Ordner *Apps › Kleiderschrank* in OneDrive.
   - **Unterstützte Kontotypen:** „Nur persönliche Microsoft-Konten“ oder „… und persönliche Microsoft-Konten“
   - **Umleitungs-URI:** Plattform **„Single-Page-Anwendung (SPA)“**, die App-Adresse **mit `/` am Ende**
3. Die **Anwendungs-ID (Client-ID)** kopieren. Ein Geheimnis oder API-Berechtigungen brauchst du nicht.
4. In der App **OneDrive** wählen, die Client-ID einfügen und **„Mit OneDrive anmelden“** tippen.

Microsoft lässt die Anmeldung bei reinen Web-Apps nach etwa 24 Stunden ablaufen. Die App erneuert sie beim nächsten Start automatisch mit einer kurzen Weiterleitung.

## 3. Auf dem Handy installieren

- **iPhone:** Die URL in Safari öffnen, dann *Teilen › Zum Home-Bildschirm*. Anschließend die App vom Home-Bildschirm starten und dort einmal anmelden. Safari und die Home-Bildschirm-App haben getrennte Speicher.
- **Android:** Die URL in Chrome öffnen, dann *Menü › App installieren*.

Fotos lassen sich direkt mit der Kamera aufnehmen oder aus der Galerie wählen, mehrere auf einmal. Sie werden auf 1600 px verkleinert (Vorschau 480 px), damit Cloud und Handy nicht volllaufen. Pro Teil mit drei Fotos fällt etwa 1 MB an.

---

## Gut zu wissen

- **Speicherformat (Dropbox und OneDrive gleich):** `Apps/<App-Name>/items/<id>.json` enthält ein Teil mit allen Feldern. Die Fotos liegen in `Apps/<App-Name>/fotos/<fotoId>.jpg`, dazu jeweils `_t.jpg` als Vorschau. Die Daten bleiben also lesbar, auch ohne die App.
- **Offline:** Du kannst alles ohne Netz erfassen. Ein orangefarbener Punkt auf der Karte bedeutet „noch nicht hochgeladen“. Die Synchronisierung läuft automatisch, sobald du wieder online bist, außerdem beim Öffnen der App und alle 5 Minuten.
- **Mehrere Geräte:** Wenn dasselbe Teil auf zwei Geräten gleichzeitig geändert wird, gilt die zuletzt hochgeladene Version.
- **Export:** *Einstellungen › Als CSV exportieren* erzeugt eine Tabelle für Excel. Wenn ein Filter aktiv ist, enthält sie nur die gefilterten Teile.
- **Updates der App:** Nach einer Änderung an den Dateien in `sw.js` die `VERSION` erhöhen. Sonst zeigen installierte Geräte noch die alte Version aus dem Cache.
- **Lokal testen:** `python -m http.server 8080` im Ordner starten und in Dropbox bzw. Entra zusätzlich `http://localhost:8080/` als Redirect-URI eintragen.
