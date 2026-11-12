# Kleiderschrank – Einrichtung

Web-App (PWA) für die digitale Garderobe. Alles wird zuerst auf dem Gerät gespeichert und dann mit einem eigenen App-Ordner in deinem **Dropbox** oder **OneDrive** synchronisiert. Ohne Cloud-Verbindung läuft die App rein lokal.

**Dateien:** `index.html`, `kategorien.js`, `optionen.js`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest`, `icons/`

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

Fotos lassen sich mit „Foto aufnehmen“ direkt mit der Kamera machen oder über „Aus Galerie“ auswählen, dort auch mehrere auf einmal. Vor dem Speichern öffnet sich jedes Foto in einem Editor zum Drehen und Zuschneiden. Später geht das auch noch über Antippen des Fotos und dann „Drehen / Zuschneiden“. Sie werden auf 1600 px verkleinert (Vorschau 480 px), damit Cloud und Handy nicht volllaufen. Pro Teil mit drei Fotos fällt etwa 1 MB an.

---

## Gut zu wissen

- **Outfits:** Über die untere Leiste wechselst du zwischen „Teile“ und „Outfits“. Ein Outfit besteht aus Name (optional), Anlass, Jahreszeit, Notiz und den enthaltenen Teilen, die du mit Suche und den üblichen Filtern auswählst. Gespeichert wird es als `outfits/<id>.json` mit den IDs der Teile. Outfits lassen sich nach Anlass und Jahreszeit filtern, Teile zusätzlich nach Jahreszeit. In der Detailansicht eines Teils steht, in welchen Outfits es vorkommt. Löschst du ein Teil, wird es aus allen Outfits entfernt. Enthält ein Outfit Teile aus mindestens zwei Bereichen (Oberteile/Jacken, Ganzkörper, Unterteile, Schuhe), werden sie im Outfit-Bild übereinander angeordnet; Taschen und Accessoires stehen in einer schmalen Spalte daneben. Sonst bleibt es bei der normalen Collage.
- **Foto-Tags:** Im Editor ein Foto antippen und Tags wählen (Vorne, Hinten, Seite, Detail, Etikett, Getragen, Selfie, Spiegel) oder einen eigenen Tag anlegen. Tags sind optional, mehrere pro Foto möglich, und erscheinen auf den Vorschaubildern und in der Detailansicht.
- **Outfit-Fotos:** Im Outfit-Editor unter „Fotos vom Outfit“ eigene Bilder aufnehmen oder aus der Galerie wählen (mit denselben Bearbeitungs- und Tag-Funktionen). Das erste Foto ist das Titelbild des Outfits; ohne Foto wird das Bild aus den Teilen zusammengesetzt. In der Detailansicht stehen die Fotos oben, darunter weiterhin die Anordnung der Teile.
- **Wunschliste:** Eigener Bereich in der unteren Leiste. Wünsche legst du mit **+** an (gleiche Felder wie Teile, z. B. Preis und Link – nur Kaufdatum, Lagerort und Zustand gibt es erst nach dem Kauf). Suche, Sortierung und Filter funktionieren wie bei den Teilen (ohne Lagerort, Zustand, Status, Wäsche und Getragen). Wünsche erscheinen nirgends sonst: nicht bei den Teilen, in Outfits, Packlisten, Planer oder Statistik. In der Detailansicht verschiebt „Gekauft – in den Schrank verschieben“ den Wunsch mit allen Angaben und Fotos zu deinen Teilen; ein leeres Kaufdatum wird auf heute gesetzt.
- **Bild in den Kacheln:** Unter der Suchleiste wählst du bei „Bild:“, was die Kacheln zeigen. Bei Teilen: Titelbild oder ein Foto-Tag (z. B. „Hinten“) – Teile ohne Foto mit diesem Tag zeigen weiter ihr Titelbild. Bei Outfits: Outfitfoto oder Collage. Die Leiste erscheint, sobald es Tags bzw. Outfitfotos gibt.
- **Passform:** Unter Größe wählst du, wie ein Teil sitzt: Zu klein, Eng, Passend, Locker oder Zu groß (erneut tippen = abwählen). Danach kann gefiltert werden.
- **Anzahl:** Unter Passform (mit − / +, Standard 1) – für mehrere gleiche Teile, z. B. 3 Paar Socken. Angezeigt wird sie nur, wenn sie größer als 1 ist (Kachel „3×“, Detailansicht). Der Preis gilt pro Stück; Gesamtwert, Statistik und Preis pro Tragen rechnen mit Preis × Anzahl. Bei Anzahl > 1 stellst du in der Detailansicht mit − / + ein, wie viele in der Wäsche sind („2 von 3“, Kachel „2/3 Wäsche“). „Wäsche: Verfügbar“ zeigt alles, wovon mindestens eins nicht in der Wäsche ist; ausgegraut in der Teile-Auswahl ist ein Teil erst, wenn alle in der Wäsche sind.
- **Materialanteile:** Sobald du im Editor Materialien gewählt hast, erscheint darunter je Material ein Feld für den Anteil in Prozent (z. B. Baumwolle 90 %, Polyester 10 %). Die Angabe ist freiwillig; ergibt die Summe nicht 100 %, gibt es einen Hinweis. In der Detailansicht stehen die Materialien dann nach Anteil sortiert.
- **Fenster schließen durch Danebenklicken (Laptop):** Detailansicht von Teil oder Outfit, Tagesansicht im Planer, Papierkorb und Einstellungen schließen sich, wenn du neben das Fenster klickst. Editoren und Bildbearbeitung bleiben offen, damit nichts verloren geht. Auf dem Handy füllen die Fenster den Bildschirm, dort schließt du wie gewohnt oben.
- **Bilder per Drag & Drop (Laptop):** Bilddateien einfach ins Browserfenster ziehen – im offenen Teil- bzw. Outfit-Editor werden sie als Fotos hinzugefügt; auf der Teile-Übersicht bzw. Wunschliste entsteht ein neues Teil bzw. ein neuer Wunsch mit diesen Fotos. Danach öffnet sich wie gewohnt die Bildbearbeitung.
- **Farben:** Die Auswahl im Editor ist nach dem Regenbogen sortiert (Rot → Orange → Gelb → Grün → Blau → Violett → Rosa, danach Weiß bis Schwarz und Besondere wie Gold oder Mehrfarbig); „Olivgrün“ und „Hellbraun“ sind hinzugekommen. Im Filter klappt „Farbe“ eine Liste mit Farbkreisen auf (die häufigste zuerst). Mehrere Farben lassen sich ankreuzen; angezeigt wird alles, was mindestens eine der gewählten Farben hat.
- **Filter:** Jede Filter-Auswahl zeigt nur Werte, die zusammen mit den übrigen gesetzten Filtern noch vorkommen. Teile und Outfits ohne Angabe bei Anlass, Jahreszeit bzw. Passform erscheinen bei jedem Filter auf dieses Feld (sie gelten als „passt immer“).
- **Getragen:** In der Detailansicht von Teil und Outfit trägst du mit „Heute getragen“ (oder „Anderer Tag …“) ein, wann du etwas anhattest. Ein getragenes Outfit trägt das Datum auch bei allen seinen Teilen ein. Angezeigt werden Anzahl, „zuletzt getragen“ und bei Teilen mit Preis der **Preis pro Tragen** (noch nie getragen = voller Preis). Es gibt Filter „Getragen“ (z. B. „Seit 6 Monaten nicht“) und Sortierungen nach Tragen.
- **Wäsche:** „In die Wäsche“ in der Detailansicht markiert ein Teil vorübergehend. Es bekommt ein Schild auf der Karte, ist in der Teile-Auswahl ausgegraut, und Outfits zeigen „1 in der Wäsche“. Mit dem Filter „Wäsche: In der Wäsche“ erscheint der Knopf „Alle aus der Wäsche“.
- **Status:** Im Editor unten: Im Schrank / Aussortiert / Verkauft / Verschenkt. Nicht mehr vorhandene Teile verschwinden aus Übersicht und Teile-Auswahl (Filter „Status“ zeigt sie), bleiben aber in Outfits und Statistik erhalten.
- **Duplizieren:** „Teil duplizieren“ in der Detailansicht übernimmt alle Angaben außer Fotos, Tragen-Verlauf und Status.
- **Wetter:** Oben im Planer steht das heutige Wetter (Temperatur max/min, Regenwahrscheinlichkeit), im Kalender bei jedem Tag Symbol und Höchsttemperatur, beim Antippen eines Tages das Wetter dieses Tages – Vorhersage bis 16 Tage im Voraus, rückwirkend 31 Tage. Beim ersten Mal „Aktuellen Standort verwenden“ (Handy fragt nach der Erlaubnis) oder einen Ort eingeben; über „ändern“ jederzeit wechselbar. Die Daten kommen von Open-Meteo (kostenlos, ohne Konto); dabei werden nur die auf ca. 1 km gerundeten Koordinaten übertragen. Beim aktuellen Standort wird der Ortsname über BigDataCloud (ersatzweise OpenStreetMap) ermittelt und angezeigt, z. B. „Erfurt (aktueller Standort)“.
- **Papierkorb:** Gelöschte Teile, Wünsche, Outfits und Packlisten landen 30 Tage im Papierkorb (Einstellungen → Papierkorb) und lassen sich dort wiederherstellen; direkt nach dem Löschen gibt es zusätzlich „Rückgängig“. Fotos bleiben so lange erhalten. Nach 30 Tagen – oder mit „Papierkorb leeren“ / ✕ – wird endgültig gelöscht, auch aus der Cloud. Der Papierkorb wird zwischen Geräten synchronisiert.
- **Wetter beim Tragen:** Ist im Planer ein Standort eingerichtet, merkt sich „Getragen“ die Tageshöchsttemperatur (auch rückwirkend für die letzten 31 Tage). Die Detailansicht zeigt dann z. B. „getragen bei 8–14°“, und der Filter „Wetter: Passt zu heute“ zeigt Teile/Outfits, die du schon bei ähnlicher Temperatur (±4°) getragen hast.
- **Outfit als Bild teilen:** In der Outfit-Detailansicht erzeugt „Als Bild teilen“ ein Bild (Outfitfoto oder Collage mit Name) und öffnet das Teilen-Menü des Handys (z. B. WhatsApp). Am Computer wird es heruntergeladen.
- **Planer:** Kalender mit eingeplanten (gestrichelt) und getragenen (✓) Outfits. Tippe auf einen Tag zum Einplanen oder Eintragen. Darunter **Packlisten**: Name, Zeitraum, Teile einzeln oder ganze Outfits hinzufügen, abhaken (bei Teilen mit Anzahl > 1 stellst du „Mitnehmen − n +“ ein, und der Kreis zählt beim Antippen die eingepackten Stück hoch, z. B. 1/3, 2/3, 3/3, dann wieder leer); alles wird sofort gespeichert und als `packlisten/<id>.json` synchronisiert.
- **Statistik:** Anzahl und Wert im Schrank, Anteil der in 30 Tagen getragenen Teile, Verteilung nach Kategorie, Farbe, Marke und Zustand, meistgetragene, lange nicht getragene und teuerste Teile pro Tragen. Die Kacheln und „Alle anzeigen“ springen in die passend gefilterte Teile-Liste.
- **Speicherformat (Dropbox und OneDrive gleich):** `Apps/<App-Name>/items/<id>.json` enthält ein Teil mit allen Feldern. Die Fotos liegen in `Apps/<App-Name>/fotos/<fotoId>.jpg`, dazu jeweils `_t.jpg` als Vorschau. Die Daten bleiben also lesbar, auch ohne die App.
- **Offline:** Du kannst alles ohne Netz erfassen. Ein orangefarbener Punkt auf der Karte bedeutet „noch nicht hochgeladen“. Die Synchronisierung läuft automatisch, sobald du wieder online bist, außerdem beim Öffnen der App und alle 5 Minuten.
- **Mehrere Geräte:** Wenn dasselbe Teil auf zwei Geräten gleichzeitig geändert wird, gilt die zuletzt hochgeladene Version.
- **Freistellen im Foto-Editor:**
  - *✨ KI freistellen* läuft komplett auf dem Gerät mit [`@imgly/background-removal`](https://github.com/imgly/background-removal-js) (AGPL-Lizenz). Beim ersten Mal werden die Bibliothek (cdn.jsdelivr.net) und das KI-Modell (staticimgly.com) geladen und danach im App-Cache behalten. Unter *Einstellungen › Freistellen* wählst du zwischen „Schnell“ (~40 MB) und „Genau“ (~84 MB).
  - Den Rahmen ziehst du an den Ecken oder an den Balken in der Mitte jeder Seite; er ist auch sichtbar, wenn er das ganze Bild umfasst.
  - *Motiv Mitte* und *Untergrund* beurteilen nur, was innerhalb des Rahmens liegt, und lassen den Rahmen an seiner Stelle. Tipp: Rahmen zuerst grob um das Teil ziehen, damit Störendes am Rand (z. B. andere Kleidung) gar nicht erst mitzählt. Die KI betrachtet weiterhin das ganze Bild und passt den Rahmen anschließend an.
  - *◎ Motiv Mitte* geht davon aus, dass das Kleidungsstück die Bildmitte ausfüllt. Der Modus wächst von der Stoffarbe in der Mitte aus und füllt eingeschlossene Stellen wie Aufdrucke oder Etiketten mit auf. Die Toleranz wählt er für jedes Foto automatisch, über den Regler lässt sie sich nachstellen. Er klappt auch bei unruhigem Untergrund und ist bei flach hingelegten Shirts meist die beste Wahl.
  - *▢ Untergrund* entfernt alles, was vom Bildrand aus erreichbar ist und farblich zum Rand passt. Das geht ohne Download in Sekundenbruchteilen und ist ideal bei Fotos auf Laken, Boden oder Wand. Mit dem Regler „Toleranz“ legst du fest, wie stark Farbe und Schatten abweichen dürfen. Unter dem Regler stehen die erkannten Untergrund-Farben: eingekreist = wird entfernt, durchgestrichen = bleibt. Antippen schaltet eine Farbe um. Zusätzlich erkennt der Modus große, auffällig andersfarbige Flächen, die den Rand nicht berühren (z. B. ein Faltbrett unter dem Teil), und Stellen, die im Farbton eher zum Teil passen, bleiben auch bei Licht und Schatten erhalten. Die Farbe, die die Bildmitte beherrscht, gilt automatisch als Teil, und bleibt vom Teil fast nichts übrig, nimmt die App selbst Farben heraus bzw. senkt die Toleranz.
  - *Zoom* vergrößert die Ansicht für genaues Arbeiten: mit zwei Fingern auseinanderziehen oder den Regler nutzen, mit einem Finger verschieben, „Ganzes Bild“ setzt zurück (am Computer auch per Mausrad). Der Zoom bleibt beim Wechsel zu den Pinseln erhalten, die Pinselgröße bezieht sich auf den Bildschirm – gezoomt malst du also feiner.
  - *Zurückholen / Entfernen* sind Pinsel zum Nachbessern, *↶* macht den letzten Schritt rückgängig. Freigestellte Fotos werden mit transparentem Hintergrund gespeichert, je nach *Einstellungen › Bildqualität* als WebP (`fotos/<id>.webp`, klein) oder bei 100 % als PNG (verlustfrei, groß). Safari kann kein WebP erzeugen, dort verkleinert der Regler stattdessen die Auflösung. Zusätzlich wird das Original ohne Freistellung in derselben Qualität abgelegt (`fotos/<id>_o.webp` bzw. `_o.jpg`), damit du es später erneut bearbeiten kannst.
- **Feste Auswahllisten:** Farben, Materialien, Größen und Zustände stehen in `optionen.js`. Die Reihenfolge dort ist auch die Reihenfolge in der App, beim Zustand also von bester zu schlechtester Qualität. Farbe und Material erlauben Mehrfachauswahl. Werte aus früheren Versionen, die zu keinem Listeneintrag passen, zeigt die App im Editor orange als „Bisher …“ an, bis du neu ausgewählt hast.
- **Kategorien:** Die feste Liste (Kategorie › Unterkategorie › Art, übernommen aus Whering) steht in `kategorien.js` und lässt sich dort ändern. Gespeichert werden die Felder `kategorie`, `unterkategorie` und `typ`. Einträge mit einer frei getippten Kategorie aus früheren Versionen ordnet die App automatisch zu. Was sie nicht zuordnen kann, erscheint im Filter unter „Nicht zugeordnet“. Abweichend von Whering heißt „T-Shirts“ hier „Kurzarmshirts“ (T-Shirt, T-Shirt mit V-Ausschnitt, Grafik-T-Shirt, Poloshirt kurzärmlig, Dreiviertelarm-Shirt), und es gibt zusätzlich „Langarmshirts“ (Langarmshirt, Langarmshirt mit V-Ausschnitt, Grafik-Langarmshirt, Poloshirt langärmlig). Sweatshirtjacke und Sweatshirtweste stehen unter „Hoodies & Sweatshirts“ (Reihenfolge: Sweatshirt, Hoodie, Sweatshirtjacke, Sweatshirtweste, Fleece) statt unter „Pullover und Strickjacken“; „Sweatjacke“ ist in „Sweatshirtjacke“ aufgegangen. Schmuck ist eine eigene Kategorie mit Ohrschmuck (inkl. Ohrpiercings), Ketten (Anhänger, Kettenarten nach Christ, Choker, Fußkettchen, Körperkette), Ringe (Ringarten nach Christ), Uhren, Piercings und Sonstiger Schmuck; „Echtschmuck“ und „Anderer Schmuck“ gibt es nicht mehr. Weniger geläufige Arten haben in der Kategorie-Auswahl und in der Detailansicht ein „?“, das eine kurze Erklärung aufklappt – die Texte stehen in `kategorien.js` unter `ART_INFO` und lassen sich dort ergänzen. Bestehende Teile und gespeicherte Filter werden beim Update automatisch umgestellt.
- **Export:** *Einstellungen › Als CSV exportieren* erzeugt eine Tabelle für Excel. Wenn ein Filter aktiv ist, enthält sie nur die gefilterten Teile.
- **Updates der App:** Nach einer Änderung an den Dateien in `sw.js` die `VERSION` erhöhen. Sonst zeigen installierte Geräte noch die alte Version aus dem Cache.
- **Lokal testen:** `python -m http.server 8080` im Ordner starten und in Dropbox bzw. Entra zusätzlich `http://localhost:8080/` als Redirect-URI eintragen.

## Updates

Nach einem Push sucht die App beim Öffnen bzw. Zurückkehren selbst nach der neuen Version und lädt sie automatisch (ist gerade ein Dialog offen, erscheint stattdessen ein Hinweis zum Antippen). In den Einstellungen zeigt „Nach Update suchen“, ob auf GitHub Pages eine neuere Version liegt, und lädt sie notfalls direkt – deine Daten bleiben dabei erhalten. GitHub Pages braucht nach dem Push meist 1–2 Minuten, bis die neue Version online ist.

Während ein Teil, Outfit, Foto oder eine Packliste bearbeitet wird, lässt sich die Seite nicht versehentlich per „nach unten ziehen“ neu laden; bei einem Neuladen fragt der Browser vorher nach.
