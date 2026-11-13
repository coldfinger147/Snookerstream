import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "..");

const configPath = path.join(rootDir, "config.json");

if (!fs.existsSync(configPath)) {
    throw new Error(`Missing config.json: ${configPath}`);
}

const config = JSON.parse(
    fs.readFileSync(configPath, "utf8")
);

export default {
    ...config,

    rootDir,

    overlayDir: path.resolve(rootDir, config.overlayDir),

    overlayPath: path.resolve(rootDir, config.overlayPath),

    tempPath: path.resolve(rootDir, config.tempPath),

    credentialsPath: path.resolve(
        rootDir,
        config.credentialsPath
    ),

    tokenPath: path.resolve(
        rootDir,
        config.tokenPath
    )
};