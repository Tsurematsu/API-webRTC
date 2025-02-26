import fs from 'fs';
import path from 'path';
import url from 'url';
import http from 'http';
import https from 'https';
import cors from 'cors';    
import { Server } from 'socket.io';
import RTCMultiConnectionServer from '../node_scripts/index.js';

var PORT = 9001;
var isUseHTTPs = false;

const jsonPath = {
    config: 'config.json',
    logs: 'logs.json'
};  
    
const BASH_COLORS_HELPER = RTCMultiConnectionServer.BASH_COLORS_HELPER;
const getValuesFromConfigJson = RTCMultiConnectionServer.getValuesFromConfigJson;
const getBashParameters = RTCMultiConnectionServer.getBashParameters;

var config = getValuesFromConfigJson(jsonPath);
config = getBashParameters(config, BASH_COLORS_HELPER);

if (PORT === 9001) {
    PORT = config.port;
}
if (isUseHTTPs === false) {
    isUseHTTPs = config.isUseHTTPs;
}

function serverHandler(request, response) {
    config = getValuesFromConfigJson(jsonPath);
    config = getBashParameters(config, BASH_COLORS_HELPER);

    // Configurar encabezados CORS
    response.setHeader('Access-Control-Allow-Origin', '*'); // Permitir cualquier origen
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); // Métodos permitidos
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // Encabezados permitidos

    // Manejar preflight requests
    if (request.method === 'OPTIONS') {
        response.writeHead(204);
        response.end();
        return;
    }

    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.write('RTCMultiConnection Socket.io Server.\n\n');
    response.end();
}


var httpServer = http;
var httpApp;

if (isUseHTTPs) {
    httpServer = https;

    var options = {
        key: null,
        cert: null,
        ca: null
    };

    var pfx = false;

    if (!fs.existsSync(config.sslKey)) {
        console.log(BASH_COLORS_HELPER.getRedFG(), 'sslKey:\t ' + config.sslKey + ' does not exist.');
    } else {
        pfx = config.sslKey.includes('.pfx');
        options.key = fs.readFileSync(config.sslKey);
    }

    if (!fs.existsSync(config.sslCert)) {
        console.log(BASH_COLORS_HELPER.getRedFG(), 'sslCert:\t ' + config.sslCert + ' does not exist.');
    } else {
        options.cert = fs.readFileSync(config.sslCert);
    }

    if (config.sslCabundle && fs.existsSync(config.sslCabundle)) {
        options.ca = fs.readFileSync(config.sslCabundle);
    }

    if (pfx) {
        options = {
            pfx: fs.readFileSync(config.sslKey)
        };
    }

    httpApp = httpServer.createServer(options, serverHandler);
} else {
    httpApp = httpServer.createServer(serverHandler);
}

RTCMultiConnectionServer.beforeHttpListen(httpApp, config);
httpApp.listen(PORT, "0.0.0.0", function() {
    RTCMultiConnectionServer.afterHttpListen(httpApp, config);
});

// Socket.io
const ioServer = new Server(httpApp, {
    cors: {
        origin: '*', // Permitir cualquier origen
        methods: ['GET', 'POST']
    }
});

ioServer.on('connection', function(socket) {
    RTCMultiConnectionServer.addSocket(socket, config);

    const params = socket.handshake.query;
    if (!params.socketCustomEvent) {
        params.socketCustomEvent = 'custom-message';
    }

    socket.on(params.socketCustomEvent, function(message) {
        socket.broadcast.emit(params.socketCustomEvent, message);
    });
});
