// Verwaltung aus SnookerCloud: Version und Zustand melden, Update starten.
// Geschützt mit "verwaltungSchluessel" aus config.json (fehlt er, ist die Verwaltung aus).
// Erlaubt ist nur das Wechseln auf freigegebene Zweige über update.sh, keine beliebigen Befehle.
// Ein Update startet nie, solange ein Stream läuft.
import { execFile, spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import config from "../config.js";
import logger from "../utils/logger.js";

const ZWEIGE = Array.isArray(config.updateZweige) && config.updateZweige.length ? config.updateZweige : ["main", "vorschlaege"];
const LOG = path.join(config.rootDir, "logs", "update.log");
const EXIT = path.join(config.rootDir, "logs", "update.exit");

function git(args, timeout = 8000) {
    return new Promise((resolve) => {
        execFile("git", args, { cwd: config.rootDir, timeout }, (err, stdout) => resolve(err ? "" : String(stdout).trim()));
    });
}

function erlaubt(req) {
    const soll = String(config.verwaltungSchluessel || "");
    if (soll.length < 16) return { ok: false, status: 403, error: "Verwaltung ist auf diesem Pi nicht eingerichtet (verwaltungSchluessel in config.json)." };
    const ist = String(req.get("x-verwaltung") || "");
    const a = crypto.createHash("sha256").update(ist).digest();
    const b = crypto.createHash("sha256").update(soll).digest();
    if (!crypto.timingSafeEqual(a, b)) return { ok: false, status: 401, error: "Schlüssel falsch." };
    return { ok: true };
}

function lesen(datei, max = 4000) {
    try {
        const s = fs.readFileSync(datei, "utf8");
        return s.length > max ? s.slice(-max) : s;
    } catch {
        return "";
    }
}

function temperatur() {
    try {
        return Math.round(Number(fs.readFileSync("/sys/class/thermal/thermal_zone0/temp", "utf8")) / 100) / 10;
    } catch {
        return null;
    }
}

let updateSeit = 0;
let paketVersion = "";
try {
    paketVersion = JSON.parse(fs.readFileSync(path.join(config.rootDir, "package.json"), "utf8")).version || "";
} catch {}

export default function verwaltung(app, istStreamAktiv) {
    const pruefen = (req, res) => {
        const e = erlaubt(req);
        if (!e.ok) {
            res.status(e.status).json({ error: e.error });
            return false;
        }
        return true;
    };

    app.get("/verwaltung/info", async (req, res) => {
        if (!pruefen(req, res)) return;
        const zweig = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
        // Auf Wunsch neue Version suchen (git fetch, dauert ein paar Sekunden)
        if (req.query.suchen && zweig) await git(["fetch", "--quiet", "--prune", "origin"], 30000);
        const [commit, text, datum, hinter] = await Promise.all([
            git(["rev-parse", "--short", "HEAD"]),
            git(["log", "-1", "--format=%s"]),
            git(["log", "-1", "--format=%cI"]),
            zweig ? git(["rev-list", "--count", `HEAD..origin/${zweig}`]) : Promise.resolve(""),
        ]);
        const exitCode = lesen(EXIT).trim();
        const laeuftUpdate = updateSeit > 0 && !exitCode && Date.now() - updateSeit < 20 * 60_000;
        res.json({
            software: "gsa-stream",
            version: paketVersion,
            zweig: zweig || null,
            commit: commit || null,
            commitText: text || null,
            commitDatum: datum || null,
            neuere: hinter === "" ? null : Number(hinter),
            zweige: ZWEIGE,
            streamLaeuft: !!istStreamAktiv(),
            temperatur: temperatur(),
            last: os.loadavg().map((x) => Math.round(x * 100) / 100),
            kerne: os.cpus().length,
            ramFreiMb: Math.round(os.freemem() / 1048576),
            ramGesamtMb: Math.round(os.totalmem() / 1048576),
            laufzeitSek: Math.round(process.uptime()),
            hostname: os.hostname(),
            update: {
                laeuft: laeuftUpdate,
                ergebnis: exitCode === "" ? null : exitCode === "0" ? "ok" : "fehler",
                protokoll: lesen(LOG, 3000),
            },
        });
    });

    app.post("/verwaltung/update", async (req, res) => {
        if (!pruefen(req, res)) return;
        const ziel = String(req.body?.zweig || "");
        if (!ZWEIGE.includes(ziel)) return res.status(400).json({ error: `Nur diese Zweige sind erlaubt: ${ZWEIGE.join(", ")}` });
        if (istStreamAktiv()) return res.status(409).json({ error: "Gerade läuft ein Stream. Update erst danach." });
        if (updateSeit && !lesen(EXIT).trim() && Date.now() - updateSeit < 20 * 60_000) return res.status(409).json({ error: "Ein Update läuft bereits." });
        try {
            fs.mkdirSync(path.dirname(LOG), { recursive: true });
            fs.rmSync(EXIT, { force: true });
            fs.writeFileSync(LOG, `Update auf „${ziel}“ gestartet: ${new Date().toISOString()}\n`);
        } catch {}
        updateSeit = Date.now();
        logger.info(`VERWALTUNG: Update auf ${ziel}`);
        // Doppelt abgekoppelt (setsid + Hintergrund), damit der Neustart durch pm2/systemd das Skript nicht mit beendet
        const befehl = `cd "${config.rootDir}" && UPDATE_AUTOMATISCH=1 bash ./update.sh "$1" >> "${LOG}" 2>&1; echo $? > "${EXIT}"`;
        const kind = spawn("setsid", ["bash", "-c", `nohup bash -c '${befehl.replace(/'/g, `'\\''`)}' _ "${ziel}" >/dev/null 2>&1 &`], { detached: true, stdio: "ignore" });
        kind.on("error", (e) => logger.error("VERWALTUNG: Update ließ sich nicht starten", e));
        kind.unref();
        res.json({ ok: true, message: `Update auf „${ziel}“ läuft. Die Software startet danach neu.` });
    });
}
