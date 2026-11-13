import express from "express";
import fs from "fs";
import path from "path";
import config from "./config.js";
import logger from "./utils/logger.js";
import sleep from "./utils/sleep.js";

import HealthManager from "./services/HealthManager.js";
import OverlayManager from "./services/OverlayManager.js";
import YoutubeManager from "./services/YoutubeManager.js";
import StreamManager from "./services/StreamManager.js";
import WatchdogManager from "./services/WatchdogManager.js";
import BackendManager from "./services/BackendManager.js";
import CameraManager from "./services/CameraManager.js";

const app = express();
app.use(express.json());
app.use(express.static("public"));
const health = new HealthManager();

const overlay = new OverlayManager(health);
const youtube = new YoutubeManager(health);
const stream = new StreamManager(health);
const backend = new BackendManager();
const camera = new CameraManager();

const watchdog = new WatchdogManager(overlay, stream, health);

let running = false;
let streamInfo = null;
// Wer hat gestartet? "snookercloud" = Tablet/SnookerCloud (Abruf), sonst Knopf auf dieser Seite oder Aufruf von außen
let gestartetVon = null;
let aktuellerTitel = null;
let letzterFehler = 0;

watchdog.start();

/** title: YouTube-Titel (von SnookerCloud), leer = „Tisch X - German Snooker Academy“. */
async function start(title, von = "seite") {
    if (running) return;
    running = true;
    gestartetVon = von;
    aktuellerTitel = title || null;

    logger.info(`SYSTEM STARTING${title ? ` (${title})` : ""}`);

    try {
        await youtube.init();

        await overlay.start();

        await camera.resetFocus();

        streamInfo = await youtube.createStream(title);

        watchdog.start();

        await stream.start(streamInfo);

        await backend.notify(streamInfo, "start");

        health.startStream();

        logger.info("SYSTEM ONLINE");

    } catch (err) {
        logger.error("SYSTEM START FAILED", err);
        letzterFehler = Date.now();
        running = false;
        await stop();
    }
}

async function stop() {
    if (!running) return;

    const info = streamInfo;

    logger.info("STOP STREAM INFO:", info);
    logger.info("SYSTEM STOPPING");

    running = false;
    gestartetVon = null;

    watchdog.stop();


    if (info) {
        await backend.notify(info, "end");
    }

    stream.stop();
    await sleep(1000);

    await overlay.stop();

    streamInfo = null;
    health.stopStream();

    logger.info("SYSTEM OFFLINE");
}

app.get("/", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Stream Control</title>
<link rel="icon" href="/favicon.png?v=2">
    <style>
    * {
    box-sizing: border-box;
}
       body {
       margin: 0;
    font-family: Arial, sans-serif;
    background: #0f1115;
    color: #e6e6e6;

    height: 100vh;
    display: flex;
    flex-direction: column;

    overflow-x: hidden;
}

        .header {
            padding: 20px;
            text-align: center;
            background: #161a22;
            border-bottom: 1px solid #2a2f3a;
        }

        h1 {
            margin: 0;
            font-size: 26px;
        }

        .container {
               flex: 1;
    width: 100%;
    max-width: 100%;
    padding: 20px;

    overflow-y: auto;
    overflow-x: hidden;
        }

        .buttons {
            display: flex;
            gap: 45px;
            justify-content: center;
            margin-bottom: 30px;
        }

        button {
            padding: 14px 28px;
            font-size: 16px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
        }

        .start { background: #22c55e; }
        .stop { background: #ef4444; color: white; }

        .card {
             background: #161a22;
    border: 1px solid #2a2f3a;
    border-radius: 12px;
    padding: 20px;
    max-width: 700px;
    margin: 0 auto;
        }

        .row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #232836;
            
        }

        .row:last-child { border-bottom: none; }

        .label { color: #9ca3af; }
        .value { font-weight: bold; }

        .ok { color: #22c55e; }
        .bad { color: #ef4444; }
        .warn { color: #f59e0b; }

        .mono { font-family: monospace; }

        footer {
     width: 100%;
    padding: 20px;
    text-align: center;
    font-size: 12px;
    color: #9ca3af;
    border-top: 1px solid #2a2f3a;

    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 10px;
}
    </style>
</head>
<body>

<div class="header">
    <h1>🎥 Stream Control Center Tisch ${config.tableNum}</h1>
</div>

<div class="container">

    <div class="buttons">
        <button class="start" onclick="fetch('/start')">START</button>
        <button class="stop" onclick="fetch('/stop')">STOP</button>
    </div>

    <div class="card" id="status">Loading...</div>

</div>

<script>
function formatUptime(sec) {
    if (!sec) return "0s";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h + "h " + m + "m " + s + "s";
}

function formatTime(ms) {
    if (!ms) return "—";
    return new Date(ms).toLocaleString();
}

async function load() {
    const res = await fetch('/status');
    const data = await res.json();

    document.getElementById("status").innerHTML =
        "<div class='row'><div class='label'>Stream</div><div class='value " + (data.streamRunning ? "ok" : "bad") + "'>" +
        (data.streamRunning ? "RUNNING" : "STOPPED") +
        "</div></div>" +

        "<div class='row'><div class='label'>FFmpeg</div><div class='value " + (data.ffmpegRunning ? "ok" : "bad") + "'>" +
        (data.ffmpegRunning ? "ACTIVE" : "DOWN") +
        "</div></div>" +

        "<div class='row'><div class='label'>Overlay</div><div class='value " + (data.overlayRunning ? "ok" : "warn") + "'>" +
        (data.overlayRunning ? "LIVE" : "OFF") +
        "</div></div>" +

        "<div class='row'><div class='label'>YouTube</div><div class='value " + (data.youtubeConnected ? "ok" : "bad") + "'>" +
        (data.youtubeConnected ? "CONNECTED" : "DISCONNECTED") +
        "</div></div>" +

        "<div class='row'><div class='label'>Uptime</div><div class='value mono'>" +
        formatUptime(data.uptime) +
        "</div></div>" +

        "<div class='row'><div class='label'>Overlay Last Update</div><div class='value mono'>" +
        formatTime(data.overlayLastUpdate) +
        "</div></div>";
}

load();
setInterval(load, 2000);
</script>
<footer >
    <div>© Samuel M. Aliyari</div>
    <div>Email: samuel.aliyari@sawebs.de</div>
    <div>Phone: +49 157 3877 2212</div>
</footer>
</body>
</html>
    `);
});

// Start dauert (YouTube, Chromium, Kamera) – sofort antworten, damit SnookerCloud und die Seite nicht warten.
// Titel: ?title=… oder JSON {"title": "…"} (SnookerCloud schickt beides je nach Methode).
const startHandler = (req, res) => {
    const title = String(req.query.title || req.body?.title || "").trim();
    const lief = running;
    start(title, title ? "snookercloud" : "seite").catch(err => logger.error("Start failed", err));
    res.json({ ok: true, message: lief ? "Stream läuft bereits" : "Stream wird gestartet", title: title || null });
};
const stopHandler = (req, res) => {
    stop().catch(err => logger.error("Stop failed", err));
    res.json({ ok: true, message: "Stream wird gestoppt" });
};
app.get("/start", startHandler);
app.post("/start", startHandler);
app.get("/stop", stopHandler);
app.post("/stop", stopHandler);

app.get("/oauth2callback", async (req, res) => {
    try {
        const code = req.query.code;
        const { tokens } = await youtube.oauth.getToken(code);

        youtube.oauth.setCredentials(tokens);

        fs.writeFileSync(config.tokenPath, JSON.stringify(tokens, null, 2));

        res.send("Auth successful. You can close this tab.");
        logger.info("OAuth completed");

    } catch (err) {
        logger.error("OAuth callback failed", err);
        res.status(500).send("Auth failed");
    }
});

app.get("/status", (req, res) => {
    try {
        res.json(health.getStatus());
    } catch (err) {
        logger.error("Status route failed", err);

        res.status(500).json({
            error: true,
            message: err.message
        });
    }
});

// ---------------------------------------------------------------------------
// Abruf bei SnookerCloud: Der Pi fragt selbst nach, ob an seinem Tisch gestreamt werden soll.
// Damit muss SnookerCloud die Pis im Vereinsnetz nicht erreichen können.
// config.json: "snookerCloud": { "url": "https://snookercloud.com", "token": "<TV-Schlüssel>", "tisch": 3, "sekunden": 5 }
// ---------------------------------------------------------------------------
const sc = config.snookerCloud;
if (sc?.url && sc?.token) {
    const base = String(sc.url).replace(/\/+$/, "");
    const tisch = sc.tisch || config.tableNum;
    const url = `${base}/api/turnier-public/stream/${encodeURIComponent(sc.token)}/${tisch}?pi=1`;
    logger.info(`SnookerCloud-Abruf aktiv: Tisch ${tisch}`);
    const abrufen = async () => {
        try {
            const res = await fetch(url, { cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const einheit = data?.einheit;
            // Nach einem fehlgeschlagenen Start eine Minute warten, statt ständig neue YouTube-Streams anzulegen
            if (einheit && !running && Date.now() - letzterFehler > 60000) {
                await start(einheit.titel, "snookercloud");
            } else if (!einheit && running && gestartetVon === "snookercloud") {
                await stop();
            } else if (einheit && running && gestartetVon === "snookercloud" && einheit.titel !== aktuellerTitel) {
                // Neue Einheit am Tisch (z. B. neues Match): neues Video mit neuem Titel
                await stop();
                await sleep(3000);
                await start(einheit.titel, "snookercloud");
            }
        } catch (err) {
            logger.warn(`SnookerCloud-Abruf fehlgeschlagen: ${err.message}`);
        }
        setTimeout(abrufen, Math.max(3, Number(sc.sekunden) || 5) * 1000);
    };
    setTimeout(abrufen, 3000);
}

app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port}`);
});