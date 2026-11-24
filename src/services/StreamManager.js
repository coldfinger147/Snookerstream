import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import config from "../config.js";
import logger from "../utils/logger.js";

class StreamManager {
    constructor(health) {
        this.health = health;
        this.process = null;
        this.lastInfo = null;
        this.tischSchild = null;
    }

    buildArgs(streamInfo) {
        const q = config.streamQuality;
        const vf = config.videoFilters;
        const rtmp =
            `${streamInfo.ingestUrl}/${streamInfo.streamKey}`;

        // Feste Logos in den Ecken: nur Einzelbilder, werden einmal skaliert und dann
        // in jedes Bild kopiert. Kostet kaum Rechenzeit (kein zweites Video, kein Chromium).
        //   logoPath  + logoPosition  (Standard "oben-links"), z. B. GSA-Logo
        //   logo2Path + logo2Position (Standard "oben-rechts"), z. B. SnookerCloud-Logo
        // Ecken: "oben-links", "oben-rechts", "unten-links", "unten-rechts". logoHoehe und logoRand gelten für beide.
        const logoHoehe = Math.round(Number(config.logoHoehe) || 120);
        const randWert = Number(config.logoRand);
        const logoRand = Math.round(Number.isFinite(randWert) && randWert >= 0 ? randWert : 30);
        const logos = [
            [config.logoPath, config.logoPosition || "oben-links"],
            [config.logo2Path, config.logo2Position || "oben-rechts"]
        ].filter(([p]) => p && fs.existsSync(p));
        // Bilder, die nacheinander ins Video gelegt werden: Logos (auf logoHoehe skaliert) und das Tischschild (schon fertig groß)
        const bilder = logos.map(([p, position]) => {
            const ecke = String(position);
            return {
                pfad: p,
                skalieren: `scale=-1:${logoHoehe}`,
                x: ecke.endsWith("rechts") ? `W-w-${logoRand}` : `${logoRand}`,
                y: ecke.startsWith("unten") ? `H-h-${logoRand}` : `${logoRand}`
            };
        });
        if (this.tischSchild && fs.existsSync(this.tischSchild.pfad)) bilder.push({ ...this.tischSchild, skalieren: "null" });
        const overlayZiel = bilder.length ? "[vo]" : "[v]";
        const logoFilter = bilder.map((b, i) => {
            const ein = i === 0 ? "[vo]" : `[vl${i}]`;
            const aus = i === bilder.length - 1 ? "[v]" : `[vl${i + 1}]`;
            return `;[${2 + i}:v]${b.skalieren}[lg${i}];${ein}[lg${i}]overlay=${b.x}:${b.y}:eof_action=repeat${aus}`;
        }).join("");

        return [

            "-fflags", "+genpts",
            "-avoid_negative_ts", "make_zero",
            "-use_wallclock_as_timestamps", "1",

            "-i", config.cameraUrl,

            "-stream_loop", "-1",
            "-f", "image2",
            "-i", config.overlayPath,

            ...bilder.flatMap((b) => ["-i", b.pfad]),

            "-filter_complex",
            `[0:v]scale=${q.width}:${q.height}:flags=lanczos,` +
            `eq=contrast=${vf.contrast}:brightness=${vf.brightness}:saturation=${vf.saturation},` +
            `unsharp=${vf.unsharpLumaX}:${vf.unsharpLumaY}:${vf.unsharpLumaAmount}:` +
            `${vf.unsharpChromaX}:${vf.unsharpChromaY}:${vf.unsharpChromaAmount}[bg];` +
            // overlayMode "full": SnookerCloud-Overlay (1920 × 1080, durchsichtig, Logo oben + Livescore unten) über das ganze Bild
            // sonst wie bisher: nur die Punkteleiste (oberste 100 px der Seite) unten einblenden
            (config.overlayMode === "full"
                ? `[1:v]scale=${q.width}:${q.height}[ov];[bg][ov]overlay=0:0${overlayZiel}`
                : `[1:v]scale=${Math.floor(q.width * config.overlayScale)}:-1[ov];` +
                  `[bg][ov]overlay=(W-w)/2:H-h-10${overlayZiel}`) +
            logoFilter,


            "-map", "[v]",
            "-map", "0:a?",

            "-af", "aresample=async=1:first_pts=0",

            "-c:v", "libx264",
            "-preset", "veryfast",
            "-tune", "zerolatency",

            "-profile:v", "baseline",
            "-pix_fmt", "yuv420p",

            "-r", String(q.fps),
            "-g", String(q.fps * 2),

            "-b:v", `${q.bitrate}k`,
            "-maxrate", `${q.maxrate}k`,
            "-bufsize", `${q.bufsize}k`,

            "-c:a", "aac",
            "-b:a", `${q.audioBitrate || 128}k`,

            "-f", "flv",

            rtmp
        ];
    }

    /**
     * Tischschild unter dem SnookerCloud-Logo (logo2Path), z. B. „TISCH 3“, gleich breit wie das Logo.
     * Text aus tischSchildText, sonst „Tisch <tableNum>“. Abschalten mit "tischSchild": false in der config.json.
     * Wird einmal als PNG erzeugt (sharp) und dann wie die Logos ins Bild kopiert.
     */
    async tischSchildVorbereiten() {
        this.tischSchild = null;
        const text = String(config.tischSchildText || (config.tableNum ? `Tisch ${config.tableNum}` : "")).trim().toUpperCase();
        if (config.tischSchild === false || !text || !config.logo2Path || !fs.existsSync(config.logo2Path)) return;
        try {
            const logoHoehe = Math.round(Number(config.logoHoehe) || 120);
            const randWert = Number(config.logoRand);
            const logoRand = Math.round(Number.isFinite(randWert) && randWert >= 0 ? randWert : 30);
            const meta = await sharp(config.logo2Path).metadata();
            const breite = Math.round((logoHoehe * meta.width) / meta.height);
            const hoehe = Math.round(logoHoehe * 0.5);
            const abstand = Math.round(logoHoehe * 0.09);
            const radius = Math.round(logoHoehe * 0.09);
            const schrift = Math.round(hoehe * 0.52);
            const sicher = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            // Gleiches Grau wie der Hintergrund des SnookerCloud-Logos
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${breite}" height="${hoehe}">
  <rect width="${breite}" height="${hoehe}" rx="${radius}" ry="${radius}" fill="#3d3d3d"/>
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="#e5e7eb"
    font-family="Inter, 'DejaVu Sans', 'Liberation Sans', Arial, sans-serif" font-weight="600"
    font-size="${schrift}" letter-spacing="${Math.round(schrift * 0.14)}">${sicher}</text>
</svg>`;
            const pfad = path.join(config.overlayDir, "tisch-schild.png");
            fs.mkdirSync(config.overlayDir, { recursive: true });
            await sharp(Buffer.from(svg)).png().toFile(pfad);
            const ecke = String(config.logo2Position || "oben-rechts");
            this.tischSchild = {
                pfad,
                x: ecke.endsWith("rechts") ? `W-w-${logoRand}` : `${logoRand}`,
                // unter dem Logo; steht das Logo unten, dann darüber
                y: ecke.startsWith("unten") ? `H-h-${logoRand + logoHoehe + abstand}` : `${logoRand + logoHoehe + abstand}`
            };
            logger.info(`Tischschild „${text}“ erstellt`);
        } catch (err) {
            logger.error("Tischschild konnte nicht erstellt werden (Stream läuft ohne)", err);
        }
    }

    start(streamInfo = this.lastInfo) {
        if (!streamInfo) {
            logger.error("FFmpeg: keine Stream-Info zum Starten");
            return;
        }
        this.lastInfo = streamInfo;
        const args = this.buildArgs(streamInfo);

        logger.info("FFmpeg starting");

        this.process = spawn("ffmpeg", args, {
            stdio: ["ignore", "pipe", "pipe"]
        });

        this.health.set("ffmpegRunning", true);
        this.health.set("ffmpegLastStart", Date.now());

        this.process.stderr.on("data", d =>
            logger.debug(`[FFMPEG] ${d}`)
        );

        this.process.on("close", code => {
            logger.error("FFmpeg exited", code);
            this.health.set("ffmpegRunning", false);
        });
    }

    stop() {
        if (this.process) this.process.kill("SIGINT");
        this.process = null;
        this.health.set("ffmpegRunning", false);
        this.health.set("ffmpegLastStart", null);
    }

    restartManual(streamInfo = this.lastInfo) {
        this.stop();
        return this.start(streamInfo);
    }
}

export default StreamManager;