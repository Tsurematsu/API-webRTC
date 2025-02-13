import pushLogs from './pushLogs.js';
import BASH_COLORS_HELPER from './bash_colors_helper.js';

// Función para ejecutar comandos del sistema
function cmdExec(cmd, args, onData, onEnd) {
    const { spawn } = require('child_process');
    const child = spawn(cmd, args);

    let stdout = '';

    child.stdout.on('data', (data) => {
        try {
            stdout += data.toString();
            if (onData) onData(stdout);
        } catch (e) {
            pushLogs(config, 'cmdExec.data', e);
        }
    });

    child.stdout.on('end', () => {
        try {
            if (onEnd) onEnd(stdout);
        } catch (e) {
            pushLogs(config, 'cmdExec.end', e);
        }
    });

    return { stdout };
}

// Función para imprimir mensajes en la consola
function logConsole(stdout) {
    try {
        console.log(stdout);

        const pidToBeKilled = stdout.split('\nnode    ')[1]?.split(' ')[0];
        if (!pidToBeKilled) {
            console.log('No process found using the port.');
            return;
        }

        console.log('------------------------------');
        console.log('Please execute the following command:');
        console.log(BASH_COLORS_HELPER.getRedFG(`kill ${pidToBeKilled}`));
        console.log('Then try to run "server.js" again.');
        console.log('------------------------------');

    } catch (e) {
        pushLogs(config, 'logConsole', e);
    }
}

// Función principal
function before_http_listen(httpServer, config) {
    httpServer.on('error', (e) => {
        pushLogs(config, 'app.onerror', e);

        if (e.code !== 'EADDRINUSE') return;

        try {
            const address = e.address === '0.0.0.0' ? 'localhost' : e.address;
            const socketURL = `${config.isUseHTTPs ? 'https' : 'http'}://${address}:${e.port}/`;

            console.log('------------------------------');
            console.log(BASH_COLORS_HELPER.getRedFG(`Unable to listen on port: ${e.port}`));
            console.log(BASH_COLORS_HELPER.getRedFG(`${socketURL} is already in use. Please kill the processes below using "kill PID".`));
            console.log('------------------------------');

            // Ejecutar el comando lsof para obtener los procesos usando el puerto
            const { stdout } = cmdExec('lsof', ['-n', '-i4TCP:' + e.port]);

            // Mostrar los resultados en la consola después de un breve retraso
            setTimeout(() => logConsole(stdout), 250);

        } catch (e) {
            pushLogs(config, 'app.onerror.EADDRINUSE', e);
        }
    });
}

export default before_http_listen;