import path from 'path';
import { spawn } from 'child_process';
import {
    getJsonFile,
    CONST_STRINGS
} from './utils.js';
import {
    handleError,
    logInfo,
    logWarning,
    logSuccess,
    logServerStartup,
    logProcessInfo
} from './logger.js';  // Your new logging module

function getBashParameters(config) {
    const argvArray = process.argv.slice(2); // Ignorar "node" y "server.js"

    // Mapeo de parámetros y sus acciones correspondientes
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
            logSuccess(`\t${json.version}`, 'yellow');
            process.exit(1);
        },
        '--dependencies': () => {
            const json = require(path.join(__dirname, 'package.json'));
            console.log('\n');
            logSuccess('dependencies:', 'yellow');
            logInfo(JSON.stringify(json.dependencies, null, '\t'));
            console.log('\n');
            logSuccess('devDependencies:', 'yellow');
            logInfo(JSON.stringify(json.devDependencies, null, '\t'));
            process.exit(1);
        },
        '--help': () => {
            console.log('\n');
            logInfo('You can manage configuration in the "config.json" file.');

            console.log('\n');
            logSuccess('Or use following commands:', 'yellow');
            logInfo('\tnode server.js');
            logInfo('\tnode server.js', logSuccess('--port=9002', 'yellow'));
            logInfo('\tnode server.js', logSuccess('--port=9002 --ssl', 'yellow'));
            logInfo('\tnode server.js', logSuccess('--port=9002 --ssl --sslKey=/home/ssl/ssl.key --sslCert=/home/ssl/ssl.crt', 'yellow'));

            console.log('\n');
            logInfo('Here is list of all config parameters:');
            
            // Display help info for all parameters (shortened for brevity)
            const helpParams = [
                { param: '--port=80', desc: 'This parameter allows you set any custom port.' },
                { param: '--ssl', desc: 'This parameter is shortcut for --isUseHTTPs=true' },
                // Add all other parameters here
            ];
            
            helpParams.forEach(({ param, desc }) => {
                logSuccess(param, 'yellow');
                logInfo(`\t${desc}`);
            });
            
            console.log('------------------------------');
            logInfo('Need more help?');
            process.exit(1);
        },
    };

    // Procesar cada parámetro
    argvArray.forEach((val) => {
        const actionKey = Object.keys(paramActions).find((key) => val.startsWith(key));
        if (actionKey) {
            paramActions[actionKey](val);
        }
    });

    return config;
}

function extractValue(val, prefix) {
    const inner = val.split(`${prefix}=`)[1]?.split(' ')[0]?.trim();
    return inner || null;
}

function after_http_listen(httpServer, config) {
    // Validación de parámetros
    if (!httpServer || !config) {
        logWarning('httpServer or config is missing.');
        return;
    }

    try {
        const addr = httpServer.address();
        const host = addr.address === '0.0.0.0' ? 'localhost' : addr.address;
        const protocol = config.isUseHTTPs ? 'https' : 'http';
        const domainURL = `${protocol}://${host}:${addr.port}/`;

        // Use the new centralized logging function
        logServerStartup(config, {
            protocol,
            host,
            port: addr.port,
            domainURL
        });

    } catch (e) {
        // Use our new error handler
        handleError(config, 'after_http_listen', e);
    }
}

function before_http_listen(httpServer, config) {
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

            // Ejecutar el comando lsof para obtener los procesos usando el puerto
            const { stdout } = cmdExec('lsof', ['-n', '-i4TCP:' + e.port]);

            // Mostrar los resultados en la consola después de un breve retraso
            setTimeout(() => logProcessInfo(stdout, e.port), 250);

        } catch (e) {
            handleError(config, 'app.onerror.EADDRINUSE', e);
        }
    });
}

function cmdExec(cmd, args, onData, onEnd) {
    const child = spawn(cmd, args);
    let stdout = '';

    child.stdout.on('data', (data) => {
        try {
            stdout += data.toString();
            if (onData) onData(stdout);
        } catch (e) {
            handleError(config, 'cmdExec.data', e);
        }
    });

    child.stdout.on('end', () => {
        try {
            if (onEnd) onEnd(stdout);
        } catch (e) {
            handleError(config, 'cmdExec.end', e);
        }
    });

    return { stdout };
}

export {
    getBashParameters,
    extractValue,
    after_http_listen,
    before_http_listen,
    cmdExec
};