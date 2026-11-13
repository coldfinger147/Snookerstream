import fs from "fs";
import fsExtra from "fs-extra";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

import config from "../config.js";
import logger from "../utils/logger.js";
import sleep from "../utils/sleep.js";

class OverlayManager {
    constructor(healthManager) {
        this.health = healthManager;

        this.browser = null;
        this.page = null;

        this.running = false;
        this.workerPromise = null;

        this.reloadCounter = 0;

        this.UPDATE_INTERVAL = 4000;
        this.RELOAD_AFTER = 300;
    }

    async start() {
        if (this.running) {
            return;
        }

        logger.info("Starting OverlayManager");

        this.running = true;

        await fsExtra.ensureDir(
            config.overlayDir
        );

        await this.createBrowser();

        this.workerPromise =
            this.updateLoop();
    }

    async stop() {
        logger.info("Stopping OverlayManager");

        this.running = false;

        try {
            if (this.page) {
                await this.page.close();
            }
        } catch { }

        try {
            if (this.browser) {
                await this.browser.close();
            }
        } catch { }

        this.page = null;
        this.browser = null;

        this.health.set(
            "overlayRunning",
            false
        );

        this.health.set(
            "browserRunning",
            false
        );
    }

    async createBrowser() {
        logger.info(
            "Launching Chromium"
        );

        this.browser =
            await puppeteer.launch({
                executablePath: "/usr/bin/chromium",
                headless: true,
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--single-process"
                ]
            });

        this.browser.on("targetdestroyed", () => {
            logger.error("Chromium target destroyed");

            this.health.set("browserRunning", false);
        });


        this.health.set("overlayRunning", true);
        this.health.set("overlayAge", 0);
        this.browser.on(
            "disconnected",
            () => {
                logger.error(
                    "Chromium disconnected"
                );

                this.health.set(
                    "browserRunning",
                    false
                );
            }
        );

        this.page =
            await this.browser.newPage();

        this.page.setDefaultTimeout(
            30000
        );

        this.page.setDefaultNavigationTimeout(
            30000
        );

        this.page.on(
            "pageerror",
            err => {
                logger.error(
                    "Page JS error",
                    err
                );
            }
        );

        this.page.on(
            "error",
            err => {
                logger.error(
                    "Page error",
                    err
                );
            }
        );

        await this.page.goto(
            config.liveScoreUrl,
            {
                waitUntil:
                    "networkidle2"
            }
        );

        await this.page.setViewport({
            width: 1920,
            height: 1080
        });

        this.health.set(
            "browserRunning",
            true
        );

        this.health.set(
            "overlayRunning",
            true
        );
    }

    async restartBrowser() {
        logger.warn(
            "Restarting Chromium"
        );

        try {
            if (this.page) {
                await this.page.close();
            }
        } catch { }

        try {
            if (this.browser) {
                await this.browser.close();
                this.health.set("browserRunning", false);
            }
        } catch { }

        this.page = null;
        this.browser = null;

        await sleep(3000);

        await this.createBrowser();
    }

    async captureOverlay() {
        const tempOverlay =
            config.overlayPath + ".new";

        await this.page.screenshot({
            path: config.tempPath,
            fullPage: false
        });

        this.health.set("overlayLastUpdate", Date.now());
        this.health.set("overlayRunning", true);

        const width = 1920;
        const height = 100;
        const radius = 50;

        const roundedCorners = Buffer.from(`
<svg width="${width}" height="${height}">
    <rect
        x="0"
        y="0"
        width="${width}"
        height="${height}"
        rx="${radius}"
        ry="${radius}"
        fill="white"
    />
</svg>
`);

        await sharp(config.tempPath)
            .extract({
                left: 0,
                top: 0,
                width,
                height
            })
            .composite([
                {
                    input: roundedCorners,
                    blend: "dest-in"
                }
            ])
            .png()
            .toFile(tempOverlay);

        await fs.promises.rename(
            tempOverlay,
            config.overlayPath
        );

        this.health.touchOverlay();
    }

    async updateLoop() {
        while (this.running) {
            try {
                const started =
                    Date.now();

                await this.captureOverlay();

                const duration =
                    Date.now() - started;

                logger.debug(
                    `Overlay updated (${duration}ms)`
                );

                this.reloadCounter++;

                if (
                    this.reloadCounter >=
                    this.RELOAD_AFTER
                ) {
                    logger.info(
                        "Reloading scoreboard page"
                    );

                    await this.page.reload({
                        waitUntil:
                            "networkidle2"
                    });

                    this.reloadCounter = 0;
                }
            } catch (err) {
                logger.error(
                    "Overlay capture failed",
                    err
                );

                try {
                    await this.restartBrowser();
                } catch (
                restartError
                ) {
                    logger.error(
                        "Browser restart failed",
                        restartError
                    );
                }
            }

            await sleep(
                this.UPDATE_INTERVAL
            );
        }
    }

    async restart() {
        logger.warn("Restarting OverlayManager");

        await this.stop();
        await sleep(2000);
        await this.start();
    }

    isRunning() {
        return this.running;
    }
}

export default OverlayManager;