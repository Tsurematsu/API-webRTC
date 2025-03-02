import fs from "fs";
import path from "path";
import colors from "colors";
import stripAnsi from "strip-ansi";
import { v4 as uuidv4 } from 'uuid';

/**
 * Logger class for managing application logs
 * Handles console output and file logging
 */
class Logger {
    constructor(options = {}) {
        this.LOGS_DIR = options.logsDir || path.join(process.cwd(), "logs");
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

    getLogFileName() {
        const dateTime = new Date();
        return `${dateTime.getDate().toString().padStart(2, "0")}-${(dateTime.getMonth() + 1).toString().padStart(2, "0")}-${dateTime.getFullYear()}.log`;
    }

    async writeLineToLog(line) {
        const fileName = this.getLogFileName();
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
        return this.logMessage("INFO", null, ...text);
    }

    success(...text) {
        return this.logMessage("SUCCESS", colors.green, ...text);
    }

    warning(...text) {
        return this.logMessage("WARN", colors.yellow, ...text);
    }

    error(...text) {
        return this.logMessage("ERR", colors.red, ...text);
    }
}

// Create a singleton instance for the application
const logger = new Logger();

/**
 * Safely reads and parses a JSON file
 * @param {string} filePath - Path to the JSON file
 * @returns {Object} Parsed JSON object or empty object on error
 */
function getJsonFile(filePath) {
    try {
        const json = fs.readFileSync(filePath);
        return JSON.parse(json);
    } catch (error) {
        logger.error(`Error reading JSON file at ${filePath}:`, error.message);
        return {};
    }
}

/**
 * Pushes error logs to a JSON file
 * @param {Object} config - Application configuration
 * @param {string} name - Context name where error occurred
 * @param {Error} error - Error object
 * @param {Function} clearLogsCallback - Optional callback for log clearing
 */
async function pushLogs(config, name, error, clearLogsCallback) {
    if (!config?.logs) {
        return logger.error('Config or logs path is missing.');
    }

    if (!config.enableLogs) {
        return logger.log(name, error?.message, error?.stack);
    }

    // Handle log clearing if callback provided
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

    // Validate required parameters
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

/**
 * Storage manager for handling file operations
 */
class StorageManager {
    constructor(basePath = process.cwd()) {
        this.basePath = basePath;
    }

    ensureDirectoryExists(dirPath) {
        const fullPath = path.join(this.basePath, dirPath);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
        return fullPath;
    }

    writeJsonFile(filePath, data) {
        const fullPath = path.join(this.basePath, filePath);
        this.ensureDirectoryExists(path.dirname(fullPath));
        fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
    }

    readJsonFile(filePath) {
        return getJsonFile(path.join(this.basePath, filePath));
    }
}

/**
 * Common constant strings used throughout the application
 */
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

/**
 * Color codes for console output
 */
const COLOR_CODES = {
    RESET: "\x1b[0m",
    BRIGHT: "\x1b[1m",
    RED: "\x1b[31m",
    GREEN: "\x1b[32m",
    YELLOW: "\x1b[33m",
    BLUE: "\x1b[34m",
    MAGENTA: "\x1b[35m",
    CYAN: "\x1b[36m",
    WHITE: "\x1b[37m"
};
const BASH_COLORS_HELPER = {}; // Inicializamos como un objeto vacío

// Función para generar los métodos dinámicamente
for (const key in COLOR_CODES) {
    if (key !== 'reset') { // No creamos un método para 'reset'
        const styleCode = COLOR_CODES[key];
        const methodName = `get${key.charAt(0).toUpperCase()}${key.slice(1)}`; // getRedFG, getYellowBG, etc.

        BASH_COLORS_HELPER[methodName] = function(str) {
            return styleCode + (str || '%s') + COLOR_CODES.reset;
        };
    } else {
        BASH_COLORS_HELPER.reset = COLOR_CODES.reset; // Añadimos 'reset' directamente
    }
}
/**
 * Helper function for platform-specific path resolution
 * @param {string} url - URL to resolve
 * @returns {string} Resolved URL based on platform
 */
function resolveURL(url) {
    return process.platform.match(/^win/) !== null ? url.replace(/\//g, '\\') : url;
}

export {
    pushLogs,
    getJsonFile,
    CONST_STRINGS,
    COLOR_CODES,
    resolveURL,
    Logger,
    StorageManager,
    logger as defaultLogger,
    BASH_COLORS_HELPER
};