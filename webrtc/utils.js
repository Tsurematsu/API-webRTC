import fs from "fs";
import path from "path";
import colors from "colors";
import stripAnsi from "strip-ansi";
import { v4 as uuidv4 } from 'uuid';

class Logger {
    constructor() {
        this.LOGS_DIR = path.join(process.cwd(), "logs");
        this.ensureLogsDirExists();
    }

    ensureLogsDirExists() {
        if (!fs.existsSync(this.LOGS_DIR)) {
            fs.mkdirSync(this.LOGS_DIR, { recursive: true });
        }
    }

    getTimeFormatted() {
        const dateTime = new Date();
        return `[${dateTime.getHours().toString().padStart(2, "0")}:${dateTime.getMinutes().toString().padStart(2, "0")}:${dateTime.getSeconds().toString().padStart(2, "0")}.${dateTime.getMilliseconds().toString().padStart(3, "0")}]`;
    }

    getLastLogFileName() {
        const dateTime = new Date();
        return `${dateTime.getDate().toString().padStart(2, "0")}-${(dateTime.getMonth() + 1).toString().padStart(2, "0")}-${dateTime.getFullYear()}.log`;
    }

    async writeLineToLog(line) {
        const fileName = this.getLastLogFileName();
        const filePath = path.join(this.LOGS_DIR, fileName);

        try {
            await fs.promises.appendFile(filePath, `${line}\n`);
        } catch (err) {
            console.error(colors.red(`Error writing to log file: ${err.message}`));
        }
    }

    async logMessage(level, colorFn, ...text) {
        const preparedText = `${this.getTimeFormatted()} ${level ? `[${level}] ` : ""}${text.join(" ")}`;
        console.log(colorFn ? colorFn(preparedText) : preparedText);
        await this.writeLineToLog(stripAnsi(preparedText));
    }

    log(...text) {
        return this.logMessage("", null, ...text);
    }

    warning(...text) {
        return this.logMessage("WARN", colors.yellow, ...text);
    }

    error(...text) {
        return this.logMessage("ERR", colors.red, ...text);
    }
}

function getJsonFile(path) {
    try {
        const json = fs.readFileSync(path);
        return JSON.parse(json);
    } catch (error) {
        console.error(`Error reading JSON file at ${path}:`, error.message);
        return {};
    }
}

async function pushLogs(config, name, error, clearLogsCallback) {
    const logger = new Logger();
    if (!config?.logs) {
        return logger.error('Config or logs path is missing.');
    }

    if (!config.enableLogs) {
        return logger.log(name, error?.message, error?.stack);
    }

    if (clearLogsCallback) {
        if (typeof clearLogsCallback !== 'function') {
            return logger.error('clearLogsCallback is not a function.');
        }

        try {
            await fs.promises.writeFile(config.logs, JSON.stringify({}));
            clearLogsCallback(true);
            return;
        } catch (e) {
            logger.error('Unable to clear logs:', e);
            clearLogsCallback('Unable to clear logs.');
            return;
        }
    }

    if (!name || !error?.message || !error?.stack) {
        return logger.error('Invalid pushLogs parameters:', { name, error });
    }

    try {
        const logs = getJsonFile(config.logs) || {};
        logs[uuidv4()] = {
            name,
            message: error.message,
            stack: error.stack,
            date: new Date().toISOString(),
        };
        await fs.promises.writeFile(config.logs, JSON.stringify(logs, null, 2));
    } catch (e) {
        logger.error('Unable to write log:', e);
    }
}


const CONST_STRINGS = {
    ROOM_NOT_AVAILABLE: 'Room not available',
    INVALID_PASSWORD: 'Invalid password',
    USERID_NOT_AVAILABLE: 'User ID does not exist',
    ROOM_PERMISSION_DENIED: 'Room permission denied',
    ROOM_FULL: 'Room full',
    DID_NOT_JOIN_ANY_ROOM: 'Did not join any room yet',
    INVALID_SOCKET: 'Invalid socket',
    PUBLIC_IDENTIFIER_MISSING: 'publicRoomIdentifier is required',
    INVALID_ADMIN_CREDENTIAL: 'Invalid username or password attempted'
};

function resolveURL(url) {
    return process.platform.match(/^win/) !== null ? url.replace(/\//g, '\\') : url;
}

export {
    pushLogs,
    getJsonFile,
    CONST_STRINGS,
    resolveURL,
    Logger,
    StorageManager
};