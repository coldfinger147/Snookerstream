import fetch from "node-fetch";
import config from "../config.js";
import logger from "../utils/logger.js";
import sleep from "../utils/sleep.js";

class CameraManager {
    async getToken() {
        const url =
            `http://${config.cameraIp}` +
            `/cgi-bin/api.cgi?cmd=Login&token=null`;

        const payload = [
            {
                cmd: "Login",
                action: 0,
                param: {
                    User: {
                        userName: config.cameraUser,
                        password: config.cameraPassword
                    }
                }
            }
        ];

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify(payload)
            });

            const data =
                await response.json();

            const token =
                data?.[0]?.value?.Token?.name;

            if (!token) {
                throw new Error(
                    "No camera token received"
                );
            }

            return token;
        } catch (err) {
            logger.error(
                `Camera login failed: ${err.message}`
            );

            return null;
        }
    }

    async ptz(token, op, speed = 40) {
        if (!token) {
            return false;
        }

        const url =
            `http://${config.cameraIp}` +
            `/cgi-bin/api.cgi?cmd=PtzCtrl&token=${token}`;

        const payload = [
            {
                cmd: "PtzCtrl",
                action: 0,
                param: {
                    channel: 0,
                    op,
                    speed
                }
            }
        ];

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify(payload)
            });

            await response.json();

            logger.info(
                `PTZ command executed: ${op}`
            );

            return true;
        } catch (err) {
            logger.error(
                `PTZ ${op} failed: ${err.message}`
            );

            return false;
        }
    }

    async resetFocus() {
        const token =
            await this.getToken();

        if (!token) {
            return false;
        }

        logger.info(
            "Starting camera focus reset"
        );

        await this.ptz(
            token,
            "ZoomDec"
        );

        await sleep(800);

        await this.ptz(
            token,
            "Stop"
        );

        await this.ptz(
            token,
            "ZoomInc"
        );

        await sleep(800);

        await this.ptz(
            token,
            "Stop"
        );

        await sleep(4000);

        logger.info(
            "Camera focus reset completed"
        );

        return true;
    }
}

export default CameraManager;