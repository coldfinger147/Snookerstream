import fetch from "node-fetch";
import config from "../config.js";
import logger from "../utils/logger.js";

class BackendManager {
    async notify(streamInfo, action = "start") {
        try {
            const url = `${config.backendUrl}/${action}`;

            const payload = {
                table: `Table${config.tableNum}`,
                youtubeID: streamInfo.broadcastId,
                url: `https://youtube.com/watch?v=${streamInfo.broadcastId}`
            };

            logger.info(`Backend URL: ${url}`);
            logger.info(`Payload: ${JSON.stringify(payload)}`);

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            const text = await response.text();

            if (!response.ok) {
                throw new Error(`Backend error ${response.status}: ${text}`);
            }

            logger.info(`Backend notified (${action}) OK`);
            return true;

        } catch (err) {
            logger.error(`Backend notification failed: ${err.message}`);
            return false;
        }
    }
}

export default BackendManager;