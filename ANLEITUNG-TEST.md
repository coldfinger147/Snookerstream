# Verbesserte Version an einem Tisch testen

Ziel: An **einem** Pi die Version aus dem Branch `vorschlaege` aufspielen, ausprobieren und jederzeit auf den jetzigen Stand zurückgehen. Läuft sie gut, wird sie auf `main` übernommen. Danach kommen Updates für alle Pis über GitHub.

Die Befehle tippst du per SSH auf dem Pi ein (`ssh pi@192.168.178.103` für Tisch 3, Benutzer und Adresse ggf. anpassen).

## 1. Ordner und Startart herausfinden

```bash
ps aux | grep "[s]rc/app.js"
```

Die Zahl in der zweiten Spalte ist die Prozessnummer. Damit:

```bash
sudo ls -l /proc/<Prozessnummer>/cwd
```

Das zeigt den Ordner der Software (an Tisch 3: `/home/pi/Desktop/Stream`, Start über pm2 als „app“). Im Folgenden steht dafür `~/Stream`, setz den echten Ordner ein, z. B. `~/Desktop/Stream`. Wie die Software startet:

```bash
systemctl list-units --type=service | grep -i -E "stream|node|gsa"
pm2 list 2>/dev/null
crontab -l 2>/dev/null
```

Schreib dir auf, was dabei herauskommt. Daran siehst du später, wie man neu startet.

## 2. Sicherung anlegen

```bash
cp -a ~/Stream ~/Stream-sicherung-$(date +%F)
```

Das ist die komplette Kopie inklusive Zugangsdaten. Damit kommst du immer zurück (siehe Schritt 7).

## 3. Zugang zu GitHub für diesen Pi (einmalig)

Das Repository ist privat. Jeder Pi bekommt einen eigenen Schlüssel, der nur lesen darf:

```bash
sudo apt install -y git
ssh-keygen -t ed25519 -N "" -f ~/.ssh/snookerstream -C "stream-tisch3"
printf 'Host github.com\n  IdentityFile ~/.ssh/snookerstream\n  IdentitiesOnly yes\n' >> ~/.ssh/config
cat ~/.ssh/snookerstream.pub
```

Die ausgegebene Zeile (beginnt mit `ssh-ed25519`) kopieren. Dann auf GitHub im Repository **Snookerstream → Settings → Deploy keys → Add deploy key** einfügen, als Titel „Tisch 3“ eintragen und **Allow write access nicht anhaken**. Prüfen:

```bash
ssh -T git@github.com
```

Die Antwort „Hi coldfinger147/Snookerstream! You've successfully authenticated …“ heißt, dass es klappt.

## 4. Den Ordner mit GitHub verbinden (einmalig)

```bash
cd ~/Stream
git init -q
git remote add origin git@github.com:coldfinger147/Snookerstream.git
git fetch origin
git checkout -f -B main origin/main
git status
```

`main` ist genau der Code, der schon läuft. `config.json`, `client_secret.json`, `token.json` und `node_modules` bleiben, wie sie sind. `git status` sollte „nothing to commit, working tree clean“ zeigen.

## 5. Testversion aufspielen

```bash
./update.sh vorschlaege
```

Das Skript holt die Version und startet die Software neu. Sagt es „Bitte neu starten“, dann `sudo reboot`.

## 6. Ausprobieren

1. Im Browser `http://<Pi>:3555/` öffnen. Die Seite sieht aus wie immer.
2. Titel direkt testen: `http://<Pi>:3555/start?title=Test%20Tisch%203` aufrufen. Nach etwa 30 Sekunden heißt der Livestream auf YouTube „Test Tisch 3“. Danach `http://<Pi>:3555/stop`.
3. Mit SnookerCloud (sobald Version 1.34.0 installiert ist): am Tablet von Tisch 3 ein Match mit „Ja, streamen“ starten. Das Video heißt dann z. B. „13.11.2026 – Max Muster vs. Erika Beispiel – Tisch 3 – German Snooker Academy“. Im Startbildschirm endet der Stream.
4. Den Stream eine Weile laufen lassen. Die Seite zeigt den Zustand, `top` zeigt die Last.

Das Protokoll siehst du je nach Startart mit `journalctl -u <Dienst> -f` oder `pm2 logs`.

## 7. Zurück auf den jetzigen Stand

Normal:

```bash
cd ~/Stream
./update.sh main
```

Notfall (alles wie vor dem Test):

```bash
mv ~/Stream ~/Stream-test
cp -a ~/Stream-sicherung-<Datum> ~/Stream
sudo reboot
```

## 8. Wenn alles läuft

Sag Bescheid. Dann wird `vorschlaege` auf GitHub nach `main` übernommen (Pull Request). Auf jedem Pi werden einmal die Schritte 2–4 gemacht und danach `./update.sh main`.

Künftige Updates für jeden Pi:

```bash
cd ~/Stream && ./update.sh
```

Neue Änderungen kommen immer erst in einen eigenen Branch, werden an einem Tisch getestet und dann nach `main` übernommen.

## Logo oben links im Bild

Ab dem Zweig `vorschlaege` kann der Pi ein festes Logo oben links einblenden. Das Logo ist ein Einzelbild. FFmpeg skaliert es einmal und kopiert es dann in jedes Bild, deshalb braucht es kaum zusätzliche Rechenzeit.

In `config.json` ergänzen:

```json
"logoPath": "./logo.png",
"logoHoehe": 120,
"logoRand": 30,
"logoPosition": "oben-rechts",
"logo2Path": "./logo-snookercloud.png",
"logo2Position": "oben-links"
```

- `logo.png` (GSA-Logo mit durchsichtigem Hintergrund) liegt im Repo.
- `logoHoehe` ist die Höhe in Pixeln bei 1920 × 1080.
- `logoRand` ist der Abstand zum Bildrand in Pixeln (0 = direkt in der Ecke).
- `logo2Path` / `logo2Position`: ein zweites Logo (z. B. SnookerCloud oben links), gleiche Höhe und gleicher Rand. Weglassen, wenn nur ein Logo gewünscht ist.
- `logoPosition` ist die Ecke: `oben-links` (Standard), `oben-rechts`, `unten-links` oder `unten-rechts`. Unten liegt die Score-Leiste, deshalb besser oben.
- Tischschild: Unter dem zweiten Logo (SnookerCloud) steht automatisch ein Schild „TISCH 3“ in gleicher Breite. Jeder Pi nimmt dafür seinen eigenen Tisch: Startet SnookerCloud den Stream, kommt der Tischname direkt von SnookerCloud (der Tisch, für den der Pi abruft). Sonst gilt die Nummer aus `liveScoreUrl` (`&tisch=3`), also dieselbe, nach der die Score-Leiste ausgewählt wird, ersatzweise `snookerCloud.tisch` oder `tableNum`. Fester eigener Text mit `"tischSchildText": "Haupttisch"`, abschalten mit `"tischSchild": false`. Ohne `logo2Path` gibt es kein Schild.

Ohne `logoPath` läuft alles wie bisher. Danach den Dienst neu starten, z. B. mit `./update.sh vorschlaege`.

## Verwaltung aus SnookerCloud (Updates per Knopf)

Ab dem Zweig `vorschlaege` kann SnookerCloud Version und Zustand jedes Pi anzeigen (Zweig, Stand, CPU-Temperatur, Last, ob gerade gestreamt wird) und Updates starten. Einrichtung je Pi, einmalig:

1. In SnookerCloud unter *Turniere → Tische & TV → Livestream an den Tischen → Stream-Pis verwalten* beim Tisch auf **Schlüssel erzeugen** tippen und den Schlüssel kopieren.
2. Auf dem Pi in `config.json` eintragen:
   ```json
   "verwaltungSchluessel": "der-kopierte-schluessel",
   ```
3. `pm2 restart app`, oder bei systemd `sudo systemctl restart gsa-stream`.

Sicherheit:
- Ohne Schlüssel ist die Verwaltung aus.
- Erlaubt ist nur der Wechsel auf die Zweige `main` und `vorschlaege` (änderbar mit `"updateZweige"`), keine beliebigen Befehle.
- Solange ein Stream läuft, startet kein Update.
- Das Protokoll des letzten Updates steht in `logs/update.log`.
