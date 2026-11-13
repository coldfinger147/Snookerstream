import { spawn } from "child_process";
import config from "../config.js";
import logger from "../utils/logger.js";

class StreamManager {
    constructor(health) {
        this.health = health;
        this.process = null;
        this.lastInfo = null;
    }

    buildArgs(streamInfo) {
        const q = config.streamQuality;
        const vf = config.videoFilters;
        const rtmp =
            `${streamInfo.ingestUrl}/${streamInfo.streamKey}`;

        return [

            "-fflags", "+genpts",
            "-avoid_negative_ts", "make_zero",
            "-use_wallclock_as_timestamps", "1",

            "-i", config.cameraUrl,

            "-stream_loop", "-1",
            "-f", "image2",
            "-i", config.overlayPath,

            "-filter_complex",
            `[0:v]scale=${q.width}:${q.height}:flags=lanczos,` +
            `eq=contrast=${vf.contrast}:brightness=${vf.brightness}:saturation=${vf.saturation},` +
            `unsharp=${vf.unsharpLumaX}:${vf.unsharpLumaY}:${vf.unsharpLumaAmount}:` +
            `${vf.unsharpChromaX}:${vf.unsharpChromaY}:${vf.unsharpChromaAmount}[bg];` +
            // overlayMode "full": SnookerCloud-Overlay (1920 × 1080, durchsichtig, Logo oben + Livescore unten) über das ganze Bild
            // sonst wie bisher: nur die Punkteleiste (oberste 100 px der Seite) unten einblenden
            (config.overlayMode === "full"
                ? `[1:v]scale=${q.width}:${q.height}[ov];[bg][ov]overlay=0:0[v]`
                : `[1:v]scale=${Math.floor(q.width * config.overlayScale)}:-1[ov];` +
                  `[bg][ov]overlay=(W-w)/2:H-h-10[v]`),


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