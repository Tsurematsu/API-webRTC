/**
 * Refactored logging utility module
 * Provides consistent logging across the application
 */
import { spawn } from 'child_process';
import { defaultLogger, COLOR_CODES } from './utils.js';

/**
 * Centralized error handling function
 * @param {Object} config - Application configuration
 * @param {string} context - Error context
 * @param {Error|string} error - Error object or message
 */
export function handleError(config, context, error) {
    if (!config?.enableLogs) {
        defaultLogger.error(`${context}:`, error?.message || error);
        return;
    }
   
    // Dynamically import pushLogs to avoid circular dependencies
    import('./utils.js').then(({ pushLogs }) => {
        pushLogs(config, context, error instanceof Error ? error : new Error(error));
    }).catch(err => {
        defaultLogger.error('Failed to import pushLogs:', err.message);
    });
}

/**
 * Log informational message
 * @param {string} message - Message to log
 */
export function logInfo(message) {
    defaultLogger.log(message);
}

/**
 * Log warning message
 * @param {string} message - Warning message
 */
export function logWarning(message) {
    defaultLogger.warning(message);
}

/**
 * Log success message with color
 * @param {string} message - Success message
 * @param {string} color - Color to use (from COLOR_CODES)
 * @returns {string} - Colored message (for chaining)
 */
export function logSuccess(message, color = 'GREEN') {
    const colorCode = COLOR_CODES[color.toUpperCase()] || COLOR_CODES.GREEN;
    defaultLogger.logMessage("SUCCESS", text => `${colorCode}${text}${COLOR_CODES.RESET}`, message);
    return message; // Return for function chaining
}

/**
 * Log process information after port conflict
 * @param {string} stdout - Command output
 * @param {number} port - Port number
 */
export function logProcessInfo(stdout, port) {
    try {
        logInfo(stdout);
       
        const pidToBeKilled = stdout.split('\nnode    ')[1]?.split(' ')[0];
        if (!pidToBeKilled) {
            logInfo('No process found using the port.');
            return;
        }
       
        console.log('------------------------------');
        logInfo('Please execute the following command:');
        logWarning(`kill ${pidToBeKilled}`);
        logInfo('Then try to run "server.js" again.');
        console.log('------------------------------');
    } catch (e) {
        handleError(null, 'logProcessInfo', e);
    }
}

/**
 * Log server startup information
 * @param {Object} config - Server configuration
 * @param {Object} serverInfo - Server information
 */
export function logServerStartup(config, serverInfo) {
    const { protocol, host, port, domainURL } = serverInfo;
   
    console.log('\n');
    logSuccess(`Socket.io is listening at: ${domainURL}`);
   
    if (!config.isUseHTTPs) {
        logInfo('You can use --ssl to enable HTTPs:');
        logWarning('\tnode server --ssl');
    }
   
    logInfo('Your web-browser (HTML file) MUST set this line:');
    logSuccess(`\tconnection.socketURL = "${domainURL}";`);
   
    if (host !== 'localhost' && !config.isUseHTTPs) {
        logWarning('Warning: Please run on HTTPs to make sure audio, video, and screen demos can work on Google Chrome as well.');
    }
   
    if (config.enableAdmin === true) {
        logInfo(`Admin page is enabled and running on: ${domainURL}admin/`);
        logInfo(`\tAdmin page username: ${config.adminUserName}`);
        logInfo(`\tAdmin page password: ${config.adminPassword}`);
    }
   
    logInfo('For more help: node server.js --help');
    console.log('\n');
}

/**
 * Execute a command and return its output
 * @param {string} cmd - Command to execute
 * @param {Array} args - Command arguments
 * @param {Function} onData - Data callback
 * @param {Function} onEnd - End callback
 * @returns {Object} Command output
 */
export function cmdExec(cmd, args, onData, onEnd) {
    const child = spawn(cmd, args);
    let stdout = '';

    child.stdout.on('data', (data) => {
        try {
            stdout += data.toString();
            if (onData) onData(stdout);
        } catch (e) {
            handleError(null, 'cmdExec.data', e);
        }
    });

    child.stdout.on('end', () => {
        try {
            if (onEnd) onEnd(stdout);
        } catch (e) {
            handleError(null, 'cmdExec.end', e);
        }
    });

    return { stdout };
}