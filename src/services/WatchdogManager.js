import sleep from "../utils/sleep.js";
import logger from "../utils/logger.js";

class WatchdogManager {
    constructor(overlay, stream, health) {
        this.overlay = overlay;
        this.stream = stream;
        this.health = health;
        this.running = false;
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.loop();
    }

    async loop() {
        while (this.running) {
            try {
                const status = this.health.getStatus();

                if (status.overlayLastUpdate &&
                    Date.now() - status.overlayLastUpdate > 15000) {
                    logger.warn("Overlay stale → restart");
                    await this.overlay.restart();
                }

                if (!status.ffmpegRunning && status.ffmpegLastStart) {
                    logger.warn("FFmpeg down → restart");
                    await this.stream.restartManual();
                }

            } catch (e) {
                logger.error("Watchdog error", e);
            }

            await sleep(5000);
        }
    }

    stop() {
        this.running = false;
    }
}

export default WatchdogManager;