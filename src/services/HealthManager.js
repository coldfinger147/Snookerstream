class HealthManager {
    constructor() {
        this.state = {
            streamRunning: false,
            ffmpegRunning: false,
            overlayRunning: false,
            browserRunning: false,
            youtubeConnected: false,
            overlayLastUpdate: null,
            ffmpegLastStart: null,
            streamStartedAt: null
        };
    }

    set(key, value) {
        this.state[key] = value;
    }

    touchOverlay() {
        this.state.overlayLastUpdate = Date.now();
    }

    startStream() {
        this.state.streamRunning = true;
        this.state.streamStartedAt = Date.now();
    }

    stopStream() {
        this.state.streamRunning = false;
        this.state.streamStartedAt = null;
    }

    getStatus() {
        const now = Date.now();

        const overlayAge =
            this.state.overlayLastUpdate
                ? Math.floor(
                    (now - this.state.overlayLastUpdate) / 1000
                )
                : null;

        const uptime =
            this.state.streamStartedAt
                ? Math.floor(
                    (now - this.state.streamStartedAt) / 1000
                )
                : 0;

        return {
            ...this.state,
            overlayAge,
            uptime
        };
    }
}

export default HealthManager;