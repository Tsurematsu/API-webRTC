import fs from 'fs';
import path from 'path';
import getJsonFile from './getJsonFile.js';

function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
}

function getValues(param) {
    var result = {
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
        adminPassword: null
    };

    if (!fs.existsSync(param.config)) {
        console.log('File does not exist, creating it...', param.config);
        ensureDirectoryExistence(param.config);
        fs.writeFileSync(param.config, JSON.stringify(result, null, 4));
        return result;
    }

    var config = getJsonFile(param.config);

    ['sslKey', 'sslCert', 'sslCabundle'].forEach(function(key) {
        if (!config[key] || config[key].toString().length == 0) {
            return;
        }

        if (config[key].indexOf('/path/to/') === -1) {
            if (key === 'sslKey') {
                result.sslKey = config['sslKey'];
            }

            if (key === 'sslCert') {
                result.sslCert = config['sslCert'];
            }

            if (key === 'sslCabundle') {
                result.sslCabundle = config['sslCabundle'];
            }
        }
    });

    if ((config.port || '').toString() !== '9001') {
        result.port = (config.port || '').toString();
    }

    if ((config.autoRebootServerOnFailure || '').toString() === 'true') {
        result.autoRebootServerOnFailure = true;
    }

    if ((config.isUseHTTPs || '').toString() === 'true') {
        result.isUseHTTPs = true;
    }

    if ((config.enableLogs || '').toString() === 'true') {
        result.enableLogs = true;
    }

    if ((config.socketURL || '').toString().length) {
        result.socketURL = (config.socketURL || '').toString();
    }

    if ((config.dirPath || '').toString().length) {
        result.dirPath = (config.dirPath || '').toString();
    }

    if ((config.homePage || '').toString().length) {
        result.homePage = (config.homePage || '').toString();
    }

    if ((config.socketMessageEvent || '').toString().length) {
        result.socketMessageEvent = (config.socketMessageEvent || '').toString();
    }

    if ((config.socketCustomEvent || '').toString().length) {
        result.socketCustomEvent = (config.socketCustomEvent || '').toString();
    }

    if ((config.enableAdmin || '').toString() === 'true') {
        result.enableAdmin = true;
    }

    if ((config.adminUserName || '').toString().length) {
        result.adminUserName = (config.adminUserName || '').toString();
    }

    if ((config.adminPassword || '').toString().length) {
        result.adminPassword = (config.adminPassword || '').toString();
    }

    return result;
}

export default getValues;