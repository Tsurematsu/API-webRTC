import path from 'path';
import fs from 'fs';
import {
    pushLogs,
    getJsonFile,
    COLOR_CODES,
    BASH_COLORS_HELPER,
    CONST_STRINGS
} from './utils.js'
import {
    handleError,
    logInfo,
    logWarning,
    logSuccess,
    logServerStartup,
    logProcessInfo
} from './logger.js';  
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
function extractValue(val, prefix) {
    const inner = val.split(`${prefix}=`)[1]?.split(' ')[0]?.trim();
    return inner || null;
}

function getBashParameters(config) {
    const argvArray = process.argv.slice(2); // Ignorar "node" y "server.js"

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

    argvArray.forEach((val) => {
        const actionKey = Object.keys(paramActions).find((key) => val.startsWith(key));
        if (actionKey) {
            paramActions[actionKey](val);
        }
    });

    return config;
}
function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
}

function assignValue(result, config, key, defaultValue = null) {
    if (config[key] !== undefined && config[key] !== null && config[key] !== '') {
        result[key] = config[key];
    } else if (defaultValue !== null) {
        result[key] = defaultValue;
    }
}

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
function isAdminAuthorized(params, config) {
    if(!params || !params.adminUserName || !params.adminPassword) return false;
    return params.adminUserName === config.adminUserName && params.adminPassword === config.adminPassword;
};
class User {
    constructor(userData, socket, maxRelays) {
      this.id = userData.userid;
      this.broadcastId = userData.broadcastId;
      this.isInitiator = false;
      this.maxRelays = maxRelays;
      this.receivers = [];
      this.source = null;
      this.canRelay = false;
      this.streams = userData.typeOfStreams || { 
        audio: true,
        video: true 
      };
      this.socket = socket;
    }
  }
  
  class BroadcastManager {
    constructor(config, maxRelays = 2) {
      this.users = {};
      this.config = config;
      this.maxRelays = parseInt(maxRelays) || 2;
    }
  
    // Inicializar listeners para un socket
    setupSocket(socket) {
      socket.on('join-broadcast', (userData) => this.handleJoin(socket, userData));
      socket.on('scalable-broadcast-message', (msg) => this.relayMessage(socket, msg));
      socket.on('can-relay-broadcast', () => this.setRelayStatus(socket, true));
      socket.on('can-not-relay-broadcast', () => this.setRelayStatus(socket, false));
      socket.on('check-broadcast-presence', (userid, callback) => this.checkPresence(userid, callback));
      socket.on('get-number-of-users-in-specific-broadcast', (broadcastId, callback) => 
        this.getViewerCount(broadcastId, callback));
      
      // Manejar desconexión
      socket.ondisconnect = () => this.handleDisconnect(socket);
      
      return {
        getUsers: () => this.getUsersList()
      };
    }
  
    // Agregar un usuario al broadcast
    handleJoin(socket, userData) {
      try {
        if (this.users[userData.userid]) {
          console.warn(`Usuario ${userData.userid} ya existe en broadcast ${userData.broadcastId}`);
          return;
        }
  
        // Configurar socket
        socket.userid = userData.userid;
        socket.isScalableBroadcastSocket = true;
        
        // Crear nuevo usuario
        this.users[userData.userid] = new User(userData, socket, this.maxRelays);
        
        // Buscar relayer disponible
        const relayer = this.findAvailableRelayer(userData.broadcastId);
        
        if (relayer === 'ask-him-rejoin') {
          socket.emit('rejoin-broadcast', userData.broadcastId);
          return;
        }
        
        if (relayer && userData.userid !== userData.broadcastId) {
          // Conectar con el relayer
          this.connectToRelayer(userData.userid, relayer);
        } else {
          // Iniciar nuevo broadcast
          this.setupInitiator(userData.userid);
        }
        
        // Notificar recuento de espectadores
        this.notifyViewerCount(userData.broadcastId);
      } catch (e) {
        pushLogs(this.config, 'join-broadcast', e);
      }
    }
    
    // Conectar un usuario con un relayer
    connectToRelayer(userId, relayer) {
      const viewer = this.users[userId];
      const joinInfo = {
        typeOfStreams: relayer.streams,
        userid: relayer.id,
        broadcastId: relayer.broadcastId
      };
      
      // Establecer relación entre viewer y relayer
      viewer.source = relayer.id;
      relayer.receivers.push(viewer);
      
      // Si hay un broadcast, registrar el último relayer usado
      if (this.users[viewer.broadcastId]) {
        this.users[viewer.broadcastId].lastRelayId = relayer.id;
      }
      
      // Notificar a ambos
      viewer.socket.emit('join-broadcaster', joinInfo);
      viewer.socket.emit('logs', `Tú <${viewer.id}> estás recibiendo datos de <${relayer.id}>`);
      relayer.socket.emit('logs', `Tú <${relayer.id}> estás retransmitiendo datos a <${viewer.id}>`);
    }
    
    // Configurar un usuario como iniciador del broadcast
    setupInitiator(userId) {
      const user = this.users[userId];
      user.isInitiator = true;
      user.socket.emit('start-broadcasting', user.streams);
      user.socket.emit('logs', `Tú <${user.id}> estás sirviendo el broadcast.`);
    }
    
    // Relayar un mensaje a todos los sockets
    relayMessage(socket, message) {
      socket.broadcast.emit('scalable-broadcast-message', message);
    }
    
    // Actualizar estado de relay
    setRelayStatus(socket, status) {
      if (this.users[socket.userid]) {
        this.users[socket.userid].canRelay = status;
      }
    }
    
    // Verificar si un broadcast está activo
    checkPresence(userid, callback) {
      try {
        callback(Boolean(this.users[userid]?.isInitiator));
      } catch (e) {
        pushLogs(this.config, 'check-broadcast-presence', e);
      }
    }
    
    // Obtener número de espectadores
    getViewerCount(broadcastId, callback) {
      try {
        if (!broadcastId || !callback) return;
        if (!this.users[broadcastId]) {
          callback(0);
          return;
        }
        
        callback(this.countViewers(broadcastId));
      } catch (e) {
        callback(0);
      }
    }
    
    // Contar espectadores en un broadcast
    countViewers(broadcastId) {
      try {
        let count = 0;
        for (const id in this.users) {
          if (this.users[id].broadcastId === broadcastId) {
            count++;
          }
        }
        // Restar 1 para excluir al emisor
        return Math.max(0, count - 1);
      } catch (e) {
        return 0;
      }
    }
    
    // Notificar al iniciador sobre el número de espectadores
    notifyViewerCount(broadcastId, userLeft = false) {
      try {
        const initiator = this.users[broadcastId];
        if (!broadcastId || !initiator || !initiator.socket) return;
        
        let count = this.countViewers(broadcastId);
        if (userLeft) count--;
        
        initiator.socket.emit('number-of-broadcast-viewers-updated', {
          numberOfBroadcastViewers: count,
          broadcastId: broadcastId
        });
      } catch (e) {
        // Silently fail
      }
    }
    
    // Manejar desconexión de un socket
    handleDisconnect(socket) {
      try {
        if (!socket.isScalableBroadcastSocket) return;
        
        const user = this.users[socket.userid];
        if (!user) return;
        
        if (!user.isInitiator) {
          this.notifyViewerCount(user.broadcastId, true);
        }
        
        if (user.isInitiator) {
          // Detener todo el broadcast cuando se desconecta el iniciador
          this.stopBroadcast(user.broadcastId);
          delete this.users[socket.userid];
          return;
        }
        
        // Limpiar de la lista de receptores del emisor
        if (user.source) {
          const source = this.users[user.source];
          if (source) {
            source.receivers = source.receivers.filter(r => r.id !== user.id);
          }
        }
        
        // Si tenía receptores, pedirles que se reconecten
        if (user.receivers.length && !user.isInitiator) {
          this.reconnectViewers(user.receivers);
        }
        
        delete this.users[socket.userid];
      } catch (e) {
        pushLogs(this.config, 'scalable-broadcast-disconnect', e);
      }
    }
    
    // Detener completamente un broadcast
    stopBroadcast(broadcastId) {
      for (const id in this.users) {
        const user = this.users[id];
        if (user.broadcastId === broadcastId) {
          user.socket.emit('broadcast-stopped', broadcastId);
        }
      }
    }
    
    // Pedir a los viewers que se reconecten
    reconnectViewers(receivers) {
      try {
        for (const receiver of receivers) {
          if (this.users[receiver.id]) {
            this.users[receiver.id].canRelay = false;
            this.users[receiver.id].source = null;
            receiver.socket.emit('rejoin-broadcast', receiver.broadcastId);
          }
        }
      } catch (e) {
        pushLogs(this.config, 'reconnectViewers', e);
      }
    }
    
    // Encontrar un relayer disponible
    findAvailableRelayer(broadcastId) {
      try {
        const initiator = this.users[broadcastId];
        
        // Comprobar si el iniciador puede recibir más usuarios
        if (initiator && initiator.receivers.length < this.maxRelays) {
          return initiator;
        }
        
        // Comprobar el último relayer usado
        if (initiator && initiator.lastRelayId) {
          const lastRelay = this.users[initiator.lastRelayId];
          if (lastRelay && lastRelay.receivers.length < this.maxRelays) {
            return lastRelay;
          }
        }
        
        // Buscar usuarios que puedan relay
        for (const id in this.users) {
          const user = this.users[id];
          if (user.broadcastId === broadcastId && 
              user.receivers.length < this.maxRelays && 
              user.canRelay) {
            return user;
          }
        }
        
        // Devolver el iniciador como último recurso
        return initiator;
      } catch (e) {
        pushLogs(this.config, 'findAvailableRelayer', e);
        return null;
      }
    }
    
    // Obtener lista de usuarios para depuración
    getUsersList() {
      try {
        const list = [];
        for (const id in this.users) {
          const user = this.users[id];
          if (!user) continue;
          
          try {
            list.push({
              userid: user.id,
              broadcastId: user.broadcastId,
              isBroadcastInitiator: user.isInitiator,
              maxRelayLimitPerUser: user.maxRelays,
              relayReceivers: user.receivers.map(r => r.id),
              receivingFrom: user.source,
              canRelay: user.canRelay,
              typeOfStreams: user.streams
            });
          } catch (e) {
            pushLogs(this.config, 'getUsersList-item', e);
          }
        }
        return list;
      } catch (e) {
        pushLogs(this.config, 'getUsersList', e);
        return [];
      }
    }
  }
  
  function createBroadcastHandler(config, socket, maxRelays) {
    const manager = new BroadcastManager(config, maxRelays);
    return manager.setupSocket(socket);
  }
  
export {
    after_http_listen,
    before_http_listen,
    getBashParameters,
    getValues,
    createBroadcastHandler,
    isAdminAuthorized,
    createBroadcastHandler
};
