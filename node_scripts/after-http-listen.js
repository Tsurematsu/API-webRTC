import pushLogs from './pushLogs.js';
import BASH_COLORS_HELPER from './bash_colors_helper.js';

function after_http_listen(httpServer, config) {
    // Validación de parámetros
    if (!httpServer || !config) {
        console.error('httpServer or config is missing.');
        return;
    }

    try {
        const addr = httpServer.address();
        const host = addr.address === '0.0.0.0' ? 'localhost' : addr.address;
        const protocol = config.isUseHTTPs ? 'https' : 'http';
        const domainURL = `${protocol}://${host}:${addr.port}/`;

        // Constantes para colores
        const green = BASH_COLORS_HELPER.getGreenFG();
        const yellow = BASH_COLORS_HELPER.getYellowFG();
        const redBG = BASH_COLORS_HELPER.getRedBG();

        // Función para imprimir mensajes con formato
        const printMessage = (color, message) => console.log(color, message);

        console.log('\n');

        // Mensaje de URL del servidor
        printMessage(green, 'Socket.io is listening at:');
        printMessage(green, `\t${domainURL}`);

        // Mensaje sobre el uso de HTTPS
        if (!config.isUseHTTPs) {
            console.log('You can use --ssl to enable HTTPs:');
            printMessage(yellow, '\tnode server --ssl');
        }

        // Mensaje para configurar el socketURL en el cliente
        console.log('Your web-browser (HTML file) MUST set this line:');
        printMessage(green, `\tconnection.socketURL = "${domainURL}";`);

        // Advertencia sobre el uso de HTTPs en Chrome
        if (host !== 'localhost' && !config.isUseHTTPs) {
            printMessage(redBG, 'Warning:');
            printMessage(redBG, 'Please run on HTTPs to make sure audio, video, and screen demos can work on Google Chrome as well.');
        }

        // Mensaje sobre la página de administración
        if (config.enableAdmin === true) {
            console.log(`Admin page is enabled and running on: ${domainURL}admin/`);
            console.log(`\tAdmin page username: ${config.adminUserName}`);
            console.log(`\tAdmin page password: ${config.adminPassword}`);
        }

        // Mensaje de ayuda
        console.log('For more help: ', yellow('node server.js --help'));
        console.log('\n');

    } catch (e) {
        // Manejo de errores
        pushLogs(config, 'after_http_listen', e);
    }
}

export default after_http_listen;