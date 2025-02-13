import fs from 'fs';
import { v4 as uuidv4 } from 'uuid'; // Para generar IDs únicos
import getJsonFile from './getJsonFile.js';

async function pushLogs(config, name, error, clearLogsCallback) {
    // Validación básica de parámetros
    if (!config || !config.logs) {
        console.error('Config or logs path is missing.');
        return;
    }

    // Si los logs están deshabilitados, solo imprimir en consola
    if (!config.enableLogs) {
        console.log(name, error?.message, error?.stack);
        return;
    }

    // Validación del callback
    if (clearLogsCallback && typeof clearLogsCallback !== 'function') {
        console.error('clearLogsCallback is not a function.');
        return;
    }

    try {
        // Leer el archivo de logs existente
        let logs = getJsonFile(config.logs) || {};

        // Si se solicita limpiar los logs
        if (clearLogsCallback) {
            logs = {};
            await fs.promises.writeFile(config.logs, JSON.stringify(logs));
            clearLogsCallback(true);
            return;
        }

        // Validación de los parámetros de error
        if (!name || !error || !error.message || !error.stack) {
            console.error('Invalid pushLogs parameters:', name, error);
            return;
        }

        // Crear una nueva entrada de log
        const logId = uuidv4(); // ID único para el log
        logs[logId] = {
            name,
            message: error.message,
            stack: error.stack,
            date: new Date().toUTCString(),
        };

        // Escribir los logs actualizados en el archivo
        await fs.promises.writeFile(config.logs, JSON.stringify(logs, null, 4));

    } catch (e) {
        console.error('Unable to write log:', e);

        // Notificar el error al callback si está definido
        if (clearLogsCallback) {
            clearLogsCallback('Unable to write log.');
        }
    }
}

export default pushLogs;