// Refactored logging utility module

import path from 'path';
import { Logger } from './utils.js';

// Create a singleton logger instance
const logger = new Logger();

// Centralized error handling function
export function handleError(config, context, error) {
    if (!config?.enableLogs) {
        logger.error(`${context}:`, error?.message || error);
        return;
    }
    
    // Call the existing pushLogs function to maintain compatibility
    import('./utils.js').then(({ pushLogs }) => {
        pushLogs(config, context, error instanceof Error ? error : new Error(error));
    }).catch(err => {
        logger.error('Failed to import pushLogs:', err.message);
    });
}

// Console output helpers with logging
export function logInfo(message, includeInFile = true) {
    logger.log(message);
}

export function logWarning(message, includeInFile = true) {
    logger.warning(message);
}

export function logSuccess(message, color = 'green', includeInFile = true) {
    const colorFn = (text) => text; // Use colors from your color helper
    logger.logMessage("SUCCESS", colorFn, message);
}

// Helper for formatted console messages with optional logging
export function logFormatted(messages, color = null, includeInFile = true) {
    if (Array.isArray(messages)) {
        messages.forEach(msg => {
            const colorFn = color ? (text) => text : null; // Replace with your color helper
            logger.logMessage("", colorFn, msg);
        });
    } else {
        const colorFn = color ? (text) => text : null; // Replace with your color helper
        logger.logMessage("", colorFn, messages);
    }
}

// Server startup/shutdown logging
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

// Process management helper with logging
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