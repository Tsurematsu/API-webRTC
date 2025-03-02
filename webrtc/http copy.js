import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import {
    pushLogs,
    getJsonFile,
    COLOR_CODES,
    BASH_COLORS_HELPER,
    CONST_STRINGS
} from './utils.js';

function after_http_listen(httpServer, config) {
    if (!httpServer || !config) {
        console.error('Error: httpServer or config is missing.');
        return;
    }

    try {
        const addr = httpServer.address();
        const host = addr.address === '0.0.0.0' ? 'localhost' : addr.address;
        const protocol = config.isUseHTTPs ? 'https' : 'http';
        const domainURL = `${protocol}://${host}:${addr.port}/`;

        // Bash color helpers
        const { getGreenFG, getYellowFG, getRedBG } = BASH_COLORS_HELPER;
        const green = getGreenFG();
        const yellow = getYellowFG();
        const redBG = getRedBG();

        console.log('\n');
        console.log(green, 'Socket.io is listening at:');
        console.log(green, `\t${domainURL}`);

        if (!config.isUseHTTPs) {
            console.log('You can use --ssl to enable HTTPs:');
            console.log(yellow, '\tnode server --ssl');
        }

        console.log('Your web-browser (HTML file) MUST set this line:');
        console.log(green, `\tconnection.socketURL = "${domainURL}";`);

        if (host !== 'localhost' && !config.isUseHTTPs) {
            console.log(redBG, 'Warning:');
            console.log(redBG, 'Please run on HTTPs to make sure audio, video, and screen demos can work on Google Chrome as well.');
        }

        if (config.enableAdmin === true) {
            console.log(`Admin page is enabled and running on: ${domainURL}admin/`);
            console.log(`\tAdmin page username: ${config.adminUserName}`);
            console.log(`\tAdmin page password: ${config.adminPassword}`);
        }

        console.log('For more help: ', yellow, 'node server.js --help');
        console.log('\n');
    } catch (error) {
        pushLogs(config, 'after_http_listen', error);
    }
}

function cmdExec(cmd, args, onData, onEnd) {
    const child = spawn(cmd, args);
    let stdout = '';

    child.stdout.on('data', (data) => {
        try {
            stdout += data.toString();
            if (onData) onData(stdout);
        } catch (error) {
            pushLogs(config, 'cmdExec.data', error);
        }
    });

    child.stdout.on('end', () => {
        try {
            if (onEnd) onEnd(stdout);
        } catch (error) {
            pushLogs(config, 'cmdExec.end', error);
        }
    });

    return { stdout };
}


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
        console.log(BASH_COLORS_HELPER.getRedFG(), `kill ${pidToBeKilled}`);
        console.log('Then try to run "server.js" again.');
        console.log('------------------------------');
    } catch (error) {
        pushLogs(config, 'logConsole', error);
    }
}


function before_http_listen(httpServer, config) {
    httpServer.on('error', (error) => {
        pushLogs(config, 'app.onerror', error);

        if (error.code !== 'EADDRINUSE') return;

        safeExecute(config, 'before_http_listen.error', () => { // Using safeExecute for error handling
            const address = error.address === '0.0.0.0' ? 'localhost' : error.address;
            const socketURL = `${config.isUseHTTPs ? 'https' : 'http'}://${address}:${error.port}/`;

            console.log('------------------------------');
            console.log(BASH_COLORS_HELPER.getRedFG(), `Unable to listen on port: ${error.port}`);
            console.log(BASH_COLORS_HELPER.getRedFG(), `${socketURL} is already in use. Please kill the processes below using "kill PID".`);
            console.log('------------------------------');

            // Find processes using the port - Using callbacks correctly.
            cmdExec(config, 'lsof', ['-n', '-i4TCP:' + error.port], undefined, (stdout) => { // Added config to cmdExec and onEnd callback
                logConsole(config, stdout); // Call logConsole with config and stdout when cmdExec finishes.
            });
        });
    });
}

function extractValue(val, prefix) {
    const inner = val.split(`${prefix}=`)[1]?.split(' ')[0]?.trim();
    return inner || null;
}

function getBashParameters(config) {
    const argvArray = process.argv.slice(2);

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
            displayHelpText();
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

function displayHelpText() {
    const yellow = BASH_COLORS_HELPER.getYellowFG();
    
    console.log('\n');
    console.log('You can manage configuration in the "config.json" file.');
    console.log('\n');
    console.log(yellow, 'Or use following commands:');
    console.log('\tnode server.js');
    console.log('\tnode server.js', yellow, '--port=9002');
    console.log('\tnode server.js', yellow, '--port=9002 --ssl');
    console.log('\tnode server.js', yellow, '--port=9002 --ssl --sslKey=/home/ssl/ssl.key --sslCert=/home/ssl/ssl.crt');

    console.log('\n');
    console.log('Here is list of all config parameters:');
    
    const helpItems = [
        { param: '--port=80', desc: 'This parameter allows you set any custom port.' },
        { param: '--ssl', desc: 'This parameter is shortcut for --isUseHTTPs=true' },
        { param: '--isUseHTTPs=true', desc: 'This parameter allows you force HTTPs. Remove/Skip/Ignore this parameter to use HTTP.' },
        { param: '--sslKey=path', desc: 'This parameter allows you set your domain\'s .key file.' },
        { param: '--sslCert=path', desc: 'This parameter allows you set your domain\'s .crt file.' },
        { param: '--sslCabundle=path', desc: 'This parameter allows you set your domain\'s .cab file.' },
        { param: '--version', desc: 'Check RTCMultiConnection version number.' },
        { param: '--dependencies', desc: 'Check all RTCMultiConnection dependencies.' },
        { param: '--autoRebootServerOnFailure=false', desc: 'Disable auto-restart server.js on failure.' },
        { param: '--dirPath=/var/www/html/', desc: 'Directory path that is used for HTML/CSS/JS content delivery.' },
        { param: '--homePage=/demos/Video-Conferencing.html', desc: 'Open a specific demo instead of loading list of demos.' },
        { param: '--enableAdmin=true', desc: 'Enable /admin/ page.' },
        { param: '--adminUserName=username', desc: '/admin/ page\'s username.' },
        { param: '--adminPassword=password', desc: '/admin/ page\'s password.' }
    ];
    
    helpItems.forEach(item => {
        console.log(yellow, item.param);
        console.log(`\t${item.desc}`);
    });
    
    console.log('------------------------------');
    console.log('Need more help?');
}

function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
    return true;
}

function assignValue(result, config, key, defaultValue = null) {
    if (config[key] !== undefined && config[key] !== null && config[key] !== '') {
        result[key] = config[key];
    } else if (defaultValue !== null) {
        result[key] = defaultValue;
    }
}


function getValues(param) {
    const defaultConfig = {
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

    // Create config file if it doesn't exist
    if (!fs.existsSync(param.config)) {
        console.log('File does not exist, creating it...', param.config);
        ensureDirectoryExistence(param.config);
        fs.writeFileSync(param.config, JSON.stringify(defaultConfig, null, 4));
        return defaultConfig;
    }

    // Read config file
    const config = getJsonFile(param.config);
    const result = { ...defaultConfig };

    // Assign values from config to result
    Object.keys(defaultConfig).forEach(key => {
        assignValue(result, config, key, defaultConfig[key]);
    });

    // Handle SSL-specific keys
    ['sslKey', 'sslCert', 'sslCabundle'].forEach((key) => {
        if (config[key] && config[key].toString().length > 0 && !config[key].includes('/path/to/')) {
            result[key] = config[key];
        }
    });

    return result;
}

class User {
    /**
     * Creates a new user
     * @param {Object} userData - User data
     * @param {Object} socket - Socket.io socket
     * @param {number} maxRelays - Maximum relays
     */
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
    /**
     * Creates a new BroadcastManager
     * @param {Object} config - Server configuration
     * @param {number} maxRelays - Maximum relays per user
     */
    constructor(config, maxRelays = 2) {
        this.users = {};
        this.config = config;
        this.maxRelays = parseInt(maxRelays) || 2;
    }

    /**
     * Sets up socket event handlers
     * @param {Object} socket - Socket.io socket
     * @returns {Object} API for interacting with broadcast system
     */
    setupSocket(socket) {
        socket.on('join-broadcast', (userData) => this.handleJoin(socket, userData));
        socket.on('scalable-broadcast-message', (msg) => this.relayMessage(socket, msg));
        socket.on('can-relay-broadcast', () => this.setRelayStatus(socket, true));
        socket.on('can-not-relay-broadcast', () => this.setRelayStatus(socket, false));
        socket.on('check-broadcast-presence', (userid, callback) => this.checkPresence(userid, callback));
        socket.on('get-number-of-users-in-specific-broadcast', (broadcastId, callback) => 
            this.getViewerCount(broadcastId, callback));
        
        // Handle disconnection
        socket.ondisconnect = () => this.handleDisconnect(socket);
        
        return {
            getUsers: () => this.getUsersList()
        };
    }

    /**
     * Handles user joining a broadcast
     * @param {Object} socket - Socket.io socket
     * @param {Object} userData - User data
     */
    handleJoin(socket, userData) {
        try {
            if (this.users[userData.userid]) {
                console.warn(`User ${userData.userid} already exists in broadcast ${userData.broadcastId}`);
                return;
            }
  
            // Configure socket
            socket.userid = userData.userid;
            socket.isScalableBroadcastSocket = true;
            
            // Create new user
            this.users[userData.userid] = new User(userData, socket, this.maxRelays);
            
            // Find available relayer
            const relayer = this.findAvailableRelayer(userData.broadcastId);
            
            if (relayer === 'ask-him-rejoin') {
                socket.emit('rejoin-broadcast', userData.broadcastId);
                return;
            }
            
            if (relayer && userData.userid !== userData.broadcastId) {
                // Connect to relayer
                this.connectToRelayer(userData.userid, relayer);
            } else {
                // Start new broadcast
                this.setupInitiator(userData.userid);
            }
            
            // Notify viewer count
            this.notifyViewerCount(userData.broadcastId);
        } catch (error) {
            pushLogs(this.config, 'join-broadcast', error);
        }
    }
    
    /**
     * Connects a viewer to a relayer
     * @param {string} userId - Viewer ID
     * @param {User} relayer - Relayer user
     */
    connectToRelayer(userId, relayer) {
        const viewer = this.users[userId];
        const joinInfo = {
            typeOfStreams: relayer.streams,
            userid: relayer.id,
            broadcastId: relayer.broadcastId
        };
        
        // Set relationship between viewer and relayer
        viewer.source = relayer.id;
        relayer.receivers.push(viewer);
        
        // Register last relayer used
        if (this.users[viewer.broadcastId]) {
            this.users[viewer.broadcastId].lastRelayId = relayer.id;
        }
        
        // Notify both parties
        viewer.socket.emit('join-broadcaster', joinInfo);
        viewer.socket.emit('logs', `You <${viewer.id}> are receiving data from <${relayer.id}>`);
        relayer.socket.emit('logs', `You <${relayer.id}> are relaying data to <${viewer.id}>`);
    }
    
    /**
     * Sets up a user as broadcast initiator
     * @param {string} userId - User ID
     */
    setupInitiator(userId) {
        const user = this.users[userId];
        user.isInitiator = true;
        user.socket.emit('start-broadcasting', user.streams);
        user.socket.emit('logs', `You <${user.id}> are serving the broadcast.`);
    }
    
    /**
     * Relays a message to all sockets
     * @param {Object} socket - Socket.io socket
     * @param {Object} message - Message to relay
     */
    relayMessage(socket, message) {
        socket.broadcast.emit('scalable-broadcast-message', message);
    }
    
    /**
     * Updates relay status for a user
     * @param {Object} socket - Socket.io socket
     * @param {boolean} status - Can relay status
     */
    setRelayStatus(socket, status) {
        if (this.users[socket.userid]) {
            this.users[socket.userid].canRelay = status;
        }
    }
    
    /**
     * Checks if a broadcast is active
     * @param {string} userid - User ID
     * @param {Function} callback - Callback function
     */
    checkPresence(userid, callback) {
        try {
            callback(Boolean(this.users[userid]?.isInitiator));
        } catch (error) {
            pushLogs(this.config, 'check-broadcast-presence', error);
        }
    }
    
    /**
     * Gets viewer count for a broadcast
     * @param {string} broadcastId - Broadcast ID
     * @param {Function} callback - Callback function
     */
    getViewerCount(broadcastId, callback) {
        try {
            if (!broadcastId || !callback) return;
            if (!this.users[broadcastId]) {
                callback(0);
                return;
            }
            
            callback(this.countViewers(broadcastId));
        } catch (error) {
            callback(0);
        }
    }
    
    /**
     * Counts viewers in a broadcast
     * @param {string} broadcastId - Broadcast ID
     * @returns {number} Viewer count
     */
    countViewers(broadcastId) {
        try {
            let count = 0;
            Object.values(this.users).forEach(user => {
                if (user.broadcastId === broadcastId) {
                    count++;
                }
            });
            
            // Subtract 1 to exclude initiator
            return Math.max(0, count - 1);
        } catch (error) {
            return 0;
        }
    }
    
    /**
     * Notifies initiator about viewer count
     * @param {string} broadcastId - Broadcast ID
     * @param {boolean} userLeft - Whether a user left
     */
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
        } catch (error) {
            // Silently fail
        }
    }
    
    /**
     * Handles socket disconnection
     * @param {Object} socket - Socket.io socket
     */
    handleDisconnect(socket) {
        try {
            if (!socket.isScalableBroadcastSocket) return;
            
            const user = this.users[socket.userid];
            if (!user) return;
            
            if (!user.isInitiator) {
                this.notifyViewerCount(user.broadcastId, true);
            }
            
            if (user.isInitiator) {
                // Stop broadcast when initiator disconnects
                this.stopBroadcast(user.broadcastId);
                delete this.users[socket.userid];
                return;
            }
            
            // Clean up receiver list for source
            if (user.source) {
                const source = this.users[user.source];
                if (source) {
                    source.receivers = source.receivers.filter(r => r.id !== user.id);
                }
            }
            
            // Ask receivers to reconnect
            if (user.receivers.length && !user.isInitiator) {
                this.reconnectViewers(user.receivers);
            }
            
            delete this.users[socket.userid];
        } catch (error) {
            pushLogs(this.config, 'scalable-broadcast-disconnect', error);
        }
    }
    
    /**
     * Stops a broadcast completely
     * @param {string} broadcastId - Broadcast ID
     */
    stopBroadcast(broadcastId) {
        Object.values(this.users).forEach(user => {
            if (user.broadcastId === broadcastId) {
                user.socket.emit('broadcast-stopped', broadcastId);
            }
        });
    }
    
    /**
     * Asks viewers to reconnect
     * @param {Array} receivers - Receiver users
     */
    reconnectViewers(receivers) {
        try {
            receivers.forEach(receiver => {
                if (this.users[receiver.id]) {
                    this.users[receiver.id].canRelay = false;
                    this.users[receiver.id].source = null;
                    receiver.socket.emit('rejoin-broadcast', receiver.broadcastId);
                }
            });
        } catch (error) {
            pushLogs(this.config, 'reconnectViewers', error);
        }
    }
    
    /**
     * Finds an available relayer
     * @param {string} broadcastId - Broadcast ID
     * @returns {User|string|null} Relayer user or special value
     */
    findAvailableRelayer(broadcastId) {
        try {
            const initiator = this.users[broadcastId];
            
            // Check if initiator can accept more users
            if (initiator && initiator.receivers.length < this.maxRelays) {
                return initiator;
            }
            
            // Check last used relayer
            if (initiator && initiator.lastRelayId) {
                const lastRelay = this.users[initiator.lastRelayId];
                if (lastRelay && lastRelay.receivers.length < this.maxRelays) {
                    return lastRelay;
                }
            }
            
            // Find users that can relay
            for (const id in this.users) {
                const user = this.users[id];
                if (user.broadcastId === broadcastId && 
                    user.receivers.length < this.maxRelays && 
                    user.canRelay) {
                    return user;
                }
            }
            
            // Return initiator as last resort
            return initiator;
        } catch (error) {
            pushLogs(this.config, 'findAvailableRelayer', error);
            return null;
        }
    }
    
    /**
     * Gets list of users for debugging
     * @returns {Array} User list
     */
    getUsersList() {
        try {
            const list = [];
            
            Object.values(this.users).forEach(user => {
                if (!user) return;
                
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
                } catch (error) {
                    pushLogs(this.config, 'getUsersList-item', error);
                }
            });
            
            return list;
        } catch (error) {
            pushLogs(this.config, 'getUsersList', error);
            return [];
        }
    }
}

function createBroadcastHandler(config, socket, maxRelays) {
    const manager = new BroadcastManager(config, maxRelays);
    return manager.setupSocket(socket);
}

// Exports
export {
    after_http_listen,
    before_http_listen,
    getBashParameters,
    getValues,
    createBroadcastHandler
};