function timestamp() {
    return new Date().toISOString();
}

function write(level, message, meta = null) {
    if (meta) {
        console.log(
            `[${timestamp()}] [${level}] ${message}`,
            meta
        );
        return;
    }

    console.log(
        `[${timestamp()}] [${level}] ${message}`
    );
}

export default {
    info(message, meta = null) {
        write("INFO", message, meta);
    },

    warn(message, meta = null) {
        write("WARN", message, meta);
    },

    error(message, meta = null) {
        write("ERROR", message, meta);
    },

    debug(message, meta = null) {
        write("DEBUG", message, meta);
    }
};