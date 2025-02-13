import path from 'path';
import BASH_COLORS_HELPER from './bash_colors_helper.js';

// Función auxiliar para extraer valores de los parámetros
function extractValue(val, prefix) {
    const inner = val.split(`${prefix}=`)[1]?.split(' ')[0]?.trim();
    return inner || null;
}

// Función principal
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
            console.log(BASH_COLORS_HELPER.getYellowFG(), `\t${json.version}`);
            process.exit(1);
        },
        '--dependencies': () => {
            const json = require(path.join(__dirname, 'package.json'));
            console.log('\n');
            console.log(BASH_COLORS_HELPER.getYellowFG(), 'dependencies:');
            console.log(JSON.stringify(json.dependencies, null, '\t'));
            console.log('\n');
            console.log(BASH_COLORS_HELPER.getYellowFG(), 'devDependencies:');
            console.log(JSON.stringify(json.devDependencies, null, '\t'));
            process.exit(1);
        },
        '--help': () => {
            console.log('\n');
            console.log('You can manage configuration in the "config.json" file.');

            console.log('\n');
            console.log(BASH_COLORS_HELPER.getYellowFG(), 'Or use following commands:');
            console.log('\tnode server.js');
            console.log('\tnode server.js', BASH_COLORS_HELPER.getYellowFG('--port=9002'));
            console.log('\tnode server.js', BASH_COLORS_HELPER.getYellowFG('--port=9002 --ssl'));
            console.log('\tnode server.js', BASH_COLORS_HELPER.getYellowFG('--port=9002 --ssl --sslKey=/home/ssl/ssl.key --sslCert=/home/ssl/ssl.crt'));

            console.log('\n');
            console.log('Here is list of all config parameters:');
            console.log(BASH_COLORS_HELPER.getYellowFG(), '--port=80');
            console.log('\tThis parameter allows you set any custom port.');
            console.log(BASH_COLORS_HELPER.getYellowFG(), '--ssl');
            console.log('\tThis parameter is shortcut for --isUseHTTPs=true');
            console.log(BASH_COLORS_HELPER.getYellowFG(), '--isUseHTTPs=true');
            console.log('\tThis parameter allows you force HTTPs. Remove/Skip/Ignore this parameter to use HTTP.');
            console.log(BASH_COLORS_HELPER.getYellowFG(), '--sslKey=path');
            console.log('\tThis parameter allows you set your domain\'s .key file.');
            console.log(BASH_COLORS_HELPER.getYellowFG(), '--sslCert=path');
            console.log('\tThis parameter allows you set your domain\'s .crt file.');
            console.log(BASH_COLORS_HELPER.getYellowFG(), '--sslCabundle=path');
            console.log('\tThis parameter allows you set your domain\'s .cab file.');
            console.log(BASH_COLORS_HELPER.getYellowFG(), '--version');
            console.log('\tCheck RTCMultiConnection version number.');
            console.log(BASH_COLORS_HELPER.getYellowFG(), '--dependencies');
            console.log('\tCheck all RTCMultiConnection dependencies.');
            console.log(BASH_COLORS_HELPER.getYellowFG(), '--autoRebootServerOnFailure=false');
            console.log('\tDisable auto-restart server.js on failure.');
            console.log(BASH_COLORS_HELPER.getYellowFG(), '--dirPath=/var/www/html/');
            console.log('\tDirectory path that is used for HTML/CSS/JS content delivery.');
            console.log(BASH_COLORS_HELPER.getYellowFG(), '--homePage=/demos/Video-Conferencing.html');
            console.log('\tOpen a specific demo instead of loading list of demos.');
            console.log(BASH_COLORS_HELPER.getYellowFG(), '--enableAdmin=true');
            console.log('\tEnable /admin/ page.');
            console.log(BASH_COLORS_HELPER.getYellowFG(), '--adminUserName=username');
            console.log('\t/admin/ page\'s username.');
            console.log(BASH_COLORS_HELPER.getYellowFG(), '--adminPassword=password');
            console.log('\t/admin/ page\'s password.');
            console.log('------------------------------');
            console.log('Need more help?');
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

export default getBashParameters;