# GSA Stream-Pi (ein Raspberry Pi 5 je Tisch)

Diese Software streamt die Kamera eines Tisches zu YouTube und blendet die Punkteleiste ein. Geschrieben hat sie Samuel M. Aliyari. Der Stand auf `main` entspricht genau dem, was auf den Pis läuft. Nur die Zugangsdaten sind herausgenommen.

## Was die Software macht

- Die Startseite `http://<Pi>:3555/` zeigt START, STOP und den Status.
- `GET /start` legt bei YouTube einen Livestream „Tisch X - German Snooker Academy“ an, startet Chromium für das Overlay und FFmpeg für den Stream und meldet den Stream an `srv.german-snooker-academy.de`.
- `GET /stop` beendet den Stream.
- `GET /status` liefert den Zustand als JSON (`streamRunning`, `ffmpegRunning`, `uptime` …).
- Overlay: Chromium öffnet `liveScoreUrl` und macht alle 4 Sekunden ein Bild. Davon werden die obersten 100 Pixel genommen, die Ecken abgerundet und das Ergebnis unten ins Bild gelegt.

## Zusammenspiel mit SnookerCloud (ohne Code-Änderung)

- **Overlay:** In `config.json` wird `liveScoreUrl` auf die Leiste von SnookerCloud gestellt: `https://snookercloud.com/stream?t=<TV-Schlüssel>&tisch=3&leiste=1`. Sie zeigt das Logo, den Match-Livescore oder beim Training die Übung mit den Ergebnissen. Den fertigen Link zeigt SnookerCloud unter *Turniere → Tische & TV → Livestream an den Tischen*.
- **Start/Stopp:** SnookerCloud ruft `/start` und `/stop` auf, wie der Stream Manager der Kasse.
- **YouTube-Titel:** SnookerCloud ist einmal mit dem YouTube-Konto verknüpft. Nach dem Start sucht es den neuen Livestream „Tisch X - German Snooker Academy“ und benennt ihn um, zum Beispiel in `13.11.2026 – Max Muster vs. Erika Beispiel – Tisch 3 – German Snooker Academy`.

## Einrichten auf einem Pi

```bash
cd ~/Stream
npm ci
cp config.example.json config.json   # Tisch, Kamera-Passwort, Overlay-Link eintragen
```

`client_secret.json` (Google-Cloud-Projekt mit YouTube Data API), `token.json` (entsteht bei der ersten Google-Anmeldung) und `config.json` liegen nur auf dem Pi und gehören **nicht** ins Repository. Die `.gitignore` schließt sie aus.

Benötigt werden Node.js 18 oder neuer, `ffmpeg` und `chromium` (`/usr/bin/chromium`).

## Wie startet die Software auf den Pis?

Das lässt sich auf einem Pi so herausfinden:

```bash
systemctl list-units --type=service | grep -i -E "stream|node|gsa"
pm2 list 2>/dev/null
crontab -l 2>/dev/null
grep -v "^#" /etc/rc.local 2>/dev/null
ls ~/.config/autostart 2>/dev/null
```

Gibt es noch nichts, kann man `gsa-stream.service` als Dienst einrichten. Pfad und Benutzer müssen eventuell angepasst werden:

```bash
sudo cp gsa-stream.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gsa-stream
journalctl -u gsa-stream -f
```

## Bildqualität

Beispiele aus der ursprünglichen Anleitung stehen in `README.original.md` (Filter „Natürlich“, „Snooker“, „Maximale Schärfe“ und Qualität 1080p, 2K, 4K).

## Bekannte Punkte (noch nicht geändert)

Der Pi 5 läuft beim Streamen an der Grenze. Änderungen deshalb immer erst auf einem Tisch testen.

- `StreamManager.js`: Die Audio-Bitrate nutzt `maxrate` (5000k) statt `audioBitrate` (128k).
- `app.js`: `stop()` hält den Watchdog an, `start()` startet ihn nicht wieder. Nach dem ersten Stopp gibt es keine Überwachung mehr.
- `WatchdogManager.js`: `stream.restartManual()` wird ohne Stream-Info aufgerufen. Ein Neustart von FFmpeg durch den Watchdog schlägt deshalb fehl.
- `/start` antwortet erst, wenn alles läuft (YouTube, Chromium, Kamera). Wer den Aufruf mit kurzer Wartezeit macht, sieht einen Fehler, obwohl der Stream startet.

Vorschläge dafür liegen im Branch `vorschlaege` und sind nicht auf den Pis.
