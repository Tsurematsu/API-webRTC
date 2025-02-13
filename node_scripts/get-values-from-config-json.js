import fs from 'fs';
import path from 'path';
import getJsonFile from './getJsonFile.js';

// Función para asegurar que el directorio exista
function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
}

// Función auxiliar para asignar valores desde config a result
function assignValue(result, config, key, defaultValue = null) {
    if (config[key] !== undefined && config[key] !== null && config[key] !== '') {
        result[key] = config[key];
    } else if (defaultValue !== null) {
        result[key] = defaultValue;
    }
}

// Función principal
function getValues(param) {
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

    // Si el archivo de configuración no existe, crearlo con valores predeterminados
    if (!fs.existsSync(param.config)) {
        console.log('File does not exist, creating it...', param.config);
        ensureDirectoryExistence(param.config);
        fs.writeFileSync(param.config, JSON.stringify(result, null, 4));
        return result;
    }

    // Leer el archivo de configuración
    const config = getJsonFile(param.config);

    // Asignar valores desde config a result
    assignValue(result, config, 'port', '9001');
    assignValue(result, config, 'autoRebootServerOnFailure', false);
    assignValue(result, config, 'isUseHTTPs', null);
    assignValue(result, config, 'enableLogs', false);
    assignValue(result, config, 'socketURL', '/');
    assignValue(result, config, 'dirPath', null);
    assignValue(result, config, 'homePage', '/demos/index.html');
    assignValue(result, config, 'socketMessageEvent', 'RTCMultiConnection-Message');
    assignValue(result, config, 'socketCustomEvent', 'RTCMultiConnection-Custom-Message');
    assignValue(result, config, 'enableAdmin', false);
    assignValue(result, config, 'adminUserName', null);
    assignValue(result, config, 'adminPassword', null);

    // Manejar claves específicas para SSL
    ['sslKey', 'sslCert', 'sslCabundle'].forEach((key) => {
        if (config[key] && config[key].toString().length > 0 && !config[key].includes('/path/to/')) {
            result[key] = config[key];
        }
    });

    return result;
}

export default getValues;