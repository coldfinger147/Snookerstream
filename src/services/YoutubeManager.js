import fs from "fs";
import { google } from "googleapis";
import express from "express";
import config from "../config.js";
import logger from "../utils/logger.js";

class YoutubeManager {
    constructor(healthManager) {
        this.health = healthManager;

        const credentials = JSON.parse(
            fs.readFileSync(config.credentialsPath, "utf8")
        );

        const client = credentials.installed || credentials.web;

        this.oauth = new google.auth.OAuth2(
            client.client_id,
            client.client_secret,
            client.redirect_uris[0]
        );

        this.oauth.on("tokens", (tokens) => {
            try {
                const current = fs.existsSync(config.tokenPath)
                    ? JSON.parse(fs.readFileSync(config.tokenPath, "utf8"))
                    : {};

                const updated = { ...current, ...tokens };

                fs.writeFileSync(
                    config.tokenPath,
                    JSON.stringify(updated, null, 2)
                );

                logger.info("OAuth token refreshed and saved");
            } catch (err) {
                logger.error("Failed to save refreshed token", err);
            }
        });
    }


    async init() {
        return await this.loadToken();
    }

    async loadToken() {
        if (!fs.existsSync(config.tokenPath)) {
            logger.warn("No token found → starting auth flow");
            return await this.startAuthFlow();
        }

        try {
            const token = JSON.parse(
                fs.readFileSync(config.tokenPath, "utf8")
            );

            this.oauth.setCredentials(token);

            logger.info("YouTube token loaded");
            return true;

        } catch (err) {
            logger.error("Invalid token → starting auth flow", err);
            return await this.startAuthFlow();
        }
    }

    async startAuthFlow() {
        const app = express();
        const port = 5050;

        const server = app.listen(port, () => {
            const url = this.oauth.generateAuthUrl({
                access_type: "offline",
                prompt: "consent select_account",
                scope: ["https://www.googleapis.com/auth/youtube.force-ssl"]
            });

            logger.warn("AUTH REQUIRED");
            logger.warn(url);

            import("open").then(({ default: open }) => open(url));
        });

        app.get("/oauth2callback", async (req, res) => {
            try {
                const code = req.query.code;

                const { tokens } = await this.oauth.getToken(code);

                this.oauth.setCredentials(tokens);

                fs.writeFileSync(
                    config.tokenPath,
                    JSON.stringify(tokens, null, 2)
                );

                logger.info("OAuth success, token saved");

                res.send("Auth successful. Close this tab.");

                server.close();

            } catch (err) {
                logger.error("OAuth callback failed", err);
                res.status(500).send("Auth failed");
            }
        });
    }

    getYoutube() {
        return google.youtube({
            version: "v3",
            auth: this.oauth
        });
    }

    async createStream() {
        const youtube = this.getYoutube();

        const streamRes = await youtube.liveStreams.insert({
            part: ["id", "snippet", "cdn", "status"],
            requestBody: {
                snippet: {
                    title: `Tisch ${config.tableNum} - German Snooker Academy`
                },
                cdn: {
                    frameRate: "variable",
                    ingestionType: "rtmp",
                    resolution: "variable"
                }
            }
        });

        const broadcastRes = await youtube.liveBroadcasts.insert({
            part: ["id", "snippet", "contentDetails", "status"],
            requestBody: {
                snippet: {
                    title: `Tisch ${config.tableNum} - German Snooker Academy`,
                    scheduledStartTime: new Date().toISOString()
                },
                contentDetails: {
                    enableAutoStart: true,
                    enableAutoStop: true,
                    recordFromStart: true,
                    enableDvr: true
                },
                status: {
                    privacyStatus: "public",
                    selfDeclaredMadeForKids: false
                }
            }
        });

        await youtube.liveBroadcasts.bind({
            part: ["id", "snippet", "contentDetails"],
            id: broadcastRes.data.id,
            streamId: streamRes.data.id
        });

        this.health.set("youtubeConnected", true);

        return {
            streamId: streamRes.data.id,
            streamKey: streamRes.data.cdn.ingestionInfo.streamName,
            ingestUrl: streamRes.data.cdn.ingestionInfo.ingestionAddress,
            broadcastId: broadcastRes.data.id
        };
    }
}

export default YoutubeManager;