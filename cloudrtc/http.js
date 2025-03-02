/**
 * HTTP server setup and management functions
 */
import { spawn } from 'child_process';
import { handleError, logInfo, logWarning, logServerStartup, logProcessInfo } from './logger.js';
import { cmdExec } from './logger.js';

/**
 * Setup HTTP server error handling before listen
 * @param {Object} httpServer - HTTP server instance
 * @param {Object} config - Server configuration
 */
export function before_http_listen(httpServer, config) {
    if (!httpServer) {
        logWarning('HTTP server instance is missing');
        return;
    }

    httpServer.on('error', (e) => {
        handleError(config, 'app.onerror', e);

        if (e.code !== 'EADDRINUSE') return;

        try {
            const address = e.address === '0.0.0.0' ? 'localhost' : e.address;
            const socketURL = `${config.isUseHTTPs ? 'https' : 'http'}://${address}:${e.port}/`;

            console.log('------------------------------');
            logWarning(`Unable to listen on port: ${e.port}`);
            logWarning(`${socketURL} is already in use. Please kill the processes below using "kill PID".`);
            console.log('------------------------------');

            // Find and display processes using the port
            const { stdout } = cmdExec('lsof', ['-n', '-i4TCP:' + e.port]);

            // Display process info after a brief delay
            setTimeout(() => logProcessInfo(stdout, e.port), 250);
        } catch (e) {
            handleError(config, 'app.onerror.EADDRINUSE', e);
        }
    });
}

/**
 * Handle HTTP server after successful listen
 * @param {Object} httpServer - HTTP server instance
 * @param {Object} config - Server configuration
 */
export function after_http_listen(httpServer, config) {
    if (!httpServer || !config) {
        logWarning('httpServer or config is missing.');
        return;
    }

    try {
        const addr = httpServer.address();
        const host = addr.address === '0.0.0.0' ? 'localhost' : addr.address;
        const protocol = config.isUseHTTPs ? 'https' : 'http';
        const domainURL = `${protocol}://${host}:${addr.port}/`;

        // Log server startup information
        logServerStartup(config, {
            protocol,
            host,
            port: addr.port,
            domainURL
        });
    } catch (e) {
        handleError(config, 'after_http_listen', e);
    }
}