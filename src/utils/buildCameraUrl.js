export default function buildCameraUrl(camera) {
    if (!camera) throw new Error("Missing camera config");

    if (camera.type === "rtsp") {
        const auth =
            camera.username && camera.password
                ? `${camera.username}:${camera.password}@`
                : "";

        return `rtsp://${auth}${camera.host}:${camera.port}${camera.path}`;
    }

    throw new Error("Unsupported camera type: " + camera.type);
}