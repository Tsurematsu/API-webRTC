/**
 * Configuration helper functions
 * Extracted from server.js to improve code organization
 */
import fs from 'fs';
import path from 'path';
import { getJsonFile } from './utils.js';
import { logInfo, logSuccess, logWarning } from './logger.js';

/**
 * Ensure directory exists
 * @param {string} filePath - Path to ensure directory for
 */
export function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
}

/**
 * Safely assign value to result object
 * @param {Object} result - Target object
 * @param {Object} config - Source config
 * @param {string} key - Key to assign
 * @param {*} defaultValue - Default value if not in config
 */
export function assignValue(result, config, key, defaultValue = null) {
    if (config[key] !== undefined && config[key] !== null && config[key] !== '') {
        result[key] = config[key];
    } else if (defaultValue !== null) {
        result[key] = defaultValue;
    }
}

/**
 * Get config values, creating default config if needed
 * @param {Object} param - Parameters including config path
 * @returns {Object} Configuration values
 */
export function getValues(param) {
    const result = {
        socketURL: '/',
        dirPath: null,
        homePage: '/demos/index.html',
        socketMessageEvent: 'RTCMultiConnection-Message',
        socketCustomEvent: 'RTCMultiConnection-Custom-Message',
        port: process.env.PORT || 9001,
        enableLogs: false,
        autoRebootServerOnFailure: false,
        isUseHTTPs: null,
        sslKey: null,
        sslCert: null,
        sslCabundle: null,
        enableAdmin: false,
        adminUserName: null,
        adminPassword: null,
    };

    // Create default config if it doesn't exist
    if (!fs.existsSync(param.config)) {
        logInfo(`File does not exist, creating it... ${param.config}`);
        ensureDirectoryExistence(param.config);
        fs.writeFileSync(param.config, JSON.stringify(result, null, 4));
        return result;
    }

    // Read existing config
    const config = getJsonFile(param.config);

    // Assign all configuration values
    const configItems = [
        { key: 'port', defaultValue: '9001' },
        { key: 'autoRebootServerOnFailure', defaultValue: false },
        { key: 'isUseHTTPs', defaultValue: null },
        { key: 'enableLogs', defaultValue: false },
        { key: 'socketURL', defaultValue: '/' },
        { key: 'dirPath', defaultValue: null },
        { key: 'homePage', defaultValue: '/demos/index.html' },
        { key: 'socketMessageEvent', defaultValue: 'RTCMultiConnection-Message' },
        { key: 'socketCustomEvent', defaultValue: 'RTCMultiConnection-Custom-Message' },
        { key: 'enableAdmin', defaultValue: false },
        { key: 'adminUserName', defaultValue: null },
        { key: 'adminPassword', defaultValue: null },
    ];

    configItems.forEach(item => {
        assignValue(result, config, item.key, item.defaultValue);
    });

    // Handle SSL keys
    ['sslKey', 'sslCert', 'sslCabundle'].forEach((key) => {
        if (config[key] && config[key].toString().length > 0 && !config[key].includes('/path/to/')) {
            result[key] = config[key];
        }
    });

    return result;
}

/**
 * Extract value from command line arguments
 * @param {string} val - Raw command line argument
 * @param {string} prefix - Prefix to extract
 * @returns {string|null} Extracted value
 */
export function extractValue(val, prefix) {
    const inner = val.split(`${prefix}=`)[1]?.split(' ')[0]?.trim();
    return inner || null;
}

/**
 * Parse command line arguments to configure server
 * @param {Object} config - Configuration object to modify
 * @returns {Object} Updated configuration
 */
export function getBashParameters(config) {
    const argvArray = process.argv.slice(2);

    const paramActions = {
        '--ssl': () => { config.isUseHTTPs = true; },
        '--isUseHTTPs': (val) => { config.isUseHTTPs = extractValue(val, '--isUseHTTPs') === 'true'; },
        '--autoRebootServerOnFailure=true': () => { config.autoRebootServerOnFailure = true; },
        '--port': (val) => { config.port = extractValue(val, '--port'); },
        '--dirPath': (val) => { config.dirPath = extractValue(val, '--dirPath'); },
        '--homePage': (val) => { config.homePage = extractValue(val, '--homePage'); },
        '--enableAdmin=true': () => { config.enableAdmin = true; },
        '--adminUserName': (val) => { config.adminUserName = extractValue(val, '--adminUserName'); },
        '--adminPassword': (val) => { config.adminPassword = extractValue(val, '--adminPassword'); },
        '--sslKey': (val) => { config.sslKey = extractValue(val, '--sslKey'); },
        '--sslCert': (val) => { config.sslCert = extractValue(val, '--sslCert'); },
        '--sslCabundle': (val) => { config.sslCabundle = extractValue(val, '--sslCabundle'); },
        '--version': () => {
            const json = require(path.join(__dirname, 'package.json'));
            console.log('\n');
            logSuccess(`\t${json.version}`, 'YELLOW');
            process.exit(1);
        },
        '--dependencies': () => {
            const json = require(path.join(__dirname, 'package.json'));
            console.log('\n');
            logSuccess('dependencies:', 'YELLOW');
            logInfo(JSON.stringify(json.dependencies, null, '\t'));
            console.log('\n');
            logSuccess('devDependencies:', 'YELLOW');
            logInfo(JSON.stringify(json.devDependencies, null, '\t'));
            process.exit(1);
        },
        '--help': () => displayHelp(),
    };

    argvArray.forEach((val) => {
        const actionKey = Object.keys(paramActions).find((key) => val.startsWith(key));
        if (actionKey) {
            paramActions[actionKey](val);
        }
    });

    return config;
}

/**
 * Display help information
 */
function displayHelp() {
    console.log('\n');
    logInfo('You can manage configuration in the "config.json" file.');

    console.log('\n');
    logSuccess('Or use following commands:', 'YELLOW');
    logInfo('\tnode server.js');
    logInfo('\tnode server.js', logSuccess('--port=9002', 'YELLOW'));
    logInfo('\tnode server.js', logSuccess('--port=9002 --ssl', 'YELLOW'));
    logInfo('\tnode server.js', logSuccess('--port=9002 --ssl --sslKey=/home/ssl/ssl.key --sslCert=/home/ssl/ssl.crt', 'YELLOW'));

    console.log('\n');
    logInfo('Here is list of all config parameters:');
    
    // Display help info for all parameters (shortened for brevity)
    const helpParams = [
        { param: '--port=80', desc: 'This parameter allows you set any custom port.' },
        { param: '--ssl', desc: 'This parameter is shortcut for --isUseHTTPs=true' },
        { param: '--isUseHTTPs=true', desc: 'This parameter forces HTTPs.' },
        { param: '--autoRebootServerOnFailure=true', desc: 'This parameter keeps the server running.' },
        { param: '--dirPath=/path/to/directory/', desc: 'This parameter allows you set root directory for HTML/CSS/JS.' },
        { param: '--homePage=/demos/index.html', desc: 'This parameter allows you set a custom home page.' },
        { param: '--enableAdmin=true', desc: 'This parameter enables admin panel.' },
        { param: '--adminUserName=username', desc: 'This parameter allows you set admin username.' },
        { param: '--adminPassword=password', desc: 'This parameter allows you set admin password.' },
    ];
    
    helpParams.forEach(({ param, desc }) => {
        logSuccess(param, 'YELLOW');
        logInfo(`\t${desc}`);
    });
    
    console.log('------------------------------');
    logInfo('Need more help? Visit: https://github.com/your-repo');
    process.exit(1);
}

/**
 * Check if admin is authorized
 * @param {Object} params - Request parameters
 * @param {Object} config - Server configuration
 * @returns {boolean} Whether admin is authorized
 */
export function isAdminAuthorized(params, config) {
    if(!params || !params.adminUserName || !params.adminPassword) return false;
    return params.adminUserName === config.adminUserName && params.adminPassword === config.adminPassword;
}