// Muaz Khan      - www.MuazKhan.com
// MIT License    - www.WebRTC-Experiment.com/licence
// Documentation  - github.com/muaz-khan/RTCMultiConnection

// via: stackoverflow.com/a/41407246/552182

const COLOR_CODES = {
    reset: '\x1b[0m', // Código para restablecer el formato
    blackFG: '\x1b[30m',
    redFG: '\x1b[31m',
    greenFG: '\x1b[32m',
    yellowFG: '\x1b[33m',
    blueFG: '\x1b[34m',
    pinkFG: '\x1b[35m',
    cyanFG: '\x1b[36m',
    whiteFG: '\x1b[37m',
    crimsonFG: '\x1b[38m',
    underline: '\x1b[4m',
    highlight: '\x1b[7m',
    yellowBG: '\x1b[43m',
    redBG: '\x1b[41m',
};

const BASH_COLORS_HELPER = {}; // Inicializamos como un objeto vacío

// Función para generar los métodos dinámicamente
for (const key in COLOR_CODES) {
    if (key !== 'reset') { // No creamos un método para 'reset'
        const styleCode = COLOR_CODES[key];
        const methodName = `get${key.charAt(0).toUpperCase()}${key.slice(1)}`; // getRedFG, getYellowBG, etc.

        BASH_COLORS_HELPER[methodName] = function(str) {
            return styleCode + (str || '%s') + COLOR_CODES.reset;
        };
    } else {
        BASH_COLORS_HELPER.reset = COLOR_CODES.reset; // Añadimos 'reset' directamente
    }
}

export default BASH_COLORS_HELPER;