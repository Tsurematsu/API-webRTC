// podrias analizar y decirme si puedo mejorar mi codigo? // Muaz Khan      - www.MuazKhan.com
// MIT License    - www.WebRTC-Experiment.com/licence
// Documentation  - github.com/muaz-khan/RTCMultiConnection
import  pushLogs from './pushLogs.js';
// const strings
import CONST_STRINGS from './const_strings.js';
import isAdminAuthorized from './verify-admin.js';
import { createRequire } from 'module';
import createBroadcastHandler from './scalable-broadcast.js';
const require = createRequire(import.meta.url);
// Usar Maps en lugar de objetos literales para mejor rendimiento en iteraciones y claridad
const listOfUsers = new Map();
const listOfRooms = new Map();

let adminSocket;

// for scalable-broadcast demos
let ScalableBroadcast;
import pushLogs from './pushLogs.js';
import CONST_STRINGS from './const_strings.js';
import isAdminAuthorized from './verify-admin.js';

// User class (unchanged from your code)
class User {
    constructor(socket, params) {
        this.socket = socket;
        this.userid = socket.userid;
        this.connectedWith = new Map();
        this.extra = params.extra || {};
        this.admininfo = {};
        this.socketMessageEvent = params.socketMessageEvent || 'RTCMultiConnection-Message';
        this.socketCustomEvent = params.socketCustomEvent || '';
    }

    updateExtra(extra) {
        this.extra = extra;
        this.admininfo.extra = extra;
    }

    disconnectRemoteUser(remoteUserId) {
        if (this.connectedWith.has(remoteUserId)) {
            this.connectedWith.delete(remoteUserId);
            this.socket.emit('user-disconnected', remoteUserId);
        }
    }

    toJSON() {
        return {
            userid: this.userid,
            admininfo: this.admininfo,
            connectedWith: Array.from(this.connectedWith.keys())
        };
    }
}

// Room class (unchanged from your code)
class Room {
    constructor(ownerId, sessionid, maxParticipantsAllowed, params) {
        this.owner = ownerId;
        this.sessionid = sessionid;
        this.maxParticipantsAllowed = parseInt(maxParticipantsAllowed, 10) || 1000;
        this.participants = [];
        this.extra = params.extra || {};
        this.socketMessageEvent = params.socketMessageEvent || '';
        this.socketCustomEvent = params.socketCustomEvent || '';
        this.identifier = params.identifier || '';
        this.session = params.session || { audio: true, video: true };
        this.password = params.password || null;
    }

    addParticipant(userid) {
        if (!this.participants.includes(userid)) {
            this.participants.push(userid);
        }
    }

    removeParticipant(userid) {
        this.participants = this.participants.filter(pid => pid !== userid);
    }

    isFull() {
        return this.participants.length >= this.maxParticipantsAllowed;
    }

    isPasswordProtected() {
        return !!this.password && this.password.trim().length > 0;
    }

    toJSON() {
        return {
            maxParticipantsAllowed: this.maxParticipantsAllowed,
            owner: this.owner,
            participants: this.participants,
            extra: this.extra,
            session: this.session,
            sessionid: this.sessionid,
            isRoomFull: this.isFull(),
            isPasswordProtected: this.isPasswordProtected()
        };
    }
}

// Main SignalingServer class
class SignalingServer {
    constructor(config = {}) {
        this.config = config;
        this.listOfUsers = new Map();
        this.listOfRooms = new Map();
        this.adminSocket = null;
        this.ScalableBroadcast = null;
    }

    // Initialize the server with a socket connection
    onConnection(socket) {
        const params = this.parseParams(socket.handshake.query);
        socket.userid = params.userid || this.generateRandomId();
        params.sessionid = params.sessionid || this.generateRandomId();

        if (params.userid === 'admin') {
            this.handleAdminSocket(socket, params);
            return;
        }

        this.appendUser(socket, params);
        this.setupSocketEvents(socket, params);
    }

    // Parse query parameters
    parseParams(query) {
        const params = { ...query };
        if (params.extra) {
            try {
                params.extra = typeof params.extra === 'string' ? JSON.parse(params.extra) : params.extra;
            } catch (e) {
                params.extra = {};
            }
        }
        return params;
    }

    // Generate random ID
    generateRandomId() {
        return String(Math.random() * 100).replace('.', '');
    }

    // Append a new user to the list
    appendUser(socket, params) {
        try {
            if (this.listOfUsers.has(socket.userid)) {
                const oldUserId = socket.userid;
                socket.userid = this.generateRandomId();
                socket.emit('userid-already-taken', oldUserId, socket.userid);
                return;
            }
            const user = new User(socket, params);
            this.listOfUsers.set(socket.userid, user);
            this.sendToAdmin();
        } catch (e) {
            pushLogs(this.config, 'appendUser', e);
        }
    }

    // Send updates to admin
    sendToAdmin(all = false) {
        if (!this.config.enableAdmin || !this.adminSocket) return;

        try {
            const users = Array.from(this.listOfUsers.entries()).map(([userid, user]) => user.toJSON());
            const rooms = all ? Array.from(this.listOfRooms.values()).map(room => room.toJSON()) : [];
            const scalableBroadcastUsers = this.ScalableBroadcast ? this.ScalableBroadcast._.getUsers() : [];

            this.adminSocket.emit('admin', {
                newUpdates: !all,
                listOfRooms: rooms,
                listOfUsers: users.length,
                scalableBroadcastUsers: scalableBroadcastUsers.length
            });
        } catch (e) {
            pushLogs(this.config, 'sendToAdmin', e);
        }
    }

    // Handle admin socket
    handleAdminSocket(socket, params) {
        if (!this.config.enableAdmin || !params.adminUserName || !params.adminPassword) {
            socket.emit('admin', { error: CONST_STRINGS.INVALID_ADMIN_CREDENTIAL });
            socket.disconnect();
            return;
        }

        if (!isAdminAuthorized(params, this.config)) {
            socket.emit('admin', { error: 'Invalid admin username or password.' });
            socket.disconnect();
            return;
        }

        this.adminSocket = socket;
        socket.emit('admin', { connected: true });

        socket.on('admin', (message, callback) => this.handleAdminMessage(socket, params, message, callback));
    }

    // Handle admin messages
    handleAdminMessage(socket, params, message, callback = () => {}) {
        if (!isAdminAuthorized(params, this.config)) {
            socket.emit('admin', { error: 'Invalid admin username or password.' });
            socket.disconnect();
            return;
        }

        if (message.all) {
            this.sendToAdmin(true);
        } else if (message.userinfo && message.userid) {
            const user = this.listOfUsers.get(message.userid);
            callback(user ? user.admininfo : { error: CONST_STRINGS.USERID_NOT_AVAILABLE });
        } else if (message.clearLogs) {
            pushLogs(this.config, '', '', callback);
        } else if (message.deleteUser && message.userid) {
            const user = this.listOfUsers.get(message.userid);
            if (user) {
                user.socket.disconnect();
                this.listOfUsers.delete(message.userid);
                callback(true);
            } else {
                callback(false);
            }
        } else if (message.deleteRoom && message.roomid) {
            const room = this.listOfRooms.get(message.roomid);
            if (room) {
                room.participants.forEach(userid => {
                    const user = this.listOfUsers.get(userid);
                    if (user) user.socket.disconnect();
                });
                this.listOfRooms.delete(message.roomid);
                callback(true);
            } else {
                callback(false);
            }
        }
    }

    // Setup socket event listeners
    setupSocketEvents(socket, params) {
        const enableScalableBroadcast = params.enableScalableBroadcast === true || params.enableScalableBroadcast === 'true';
        const socketMessageEvent = params.socketMessageEvent || 'RTCMultiConnection-Message';
        let autoCloseEntireSession = params.autoCloseEntireSession === true || params.autoCloseEntireSession === 'true';

        if (enableScalableBroadcast && !this.ScalableBroadcast) {
            this.ScalableBroadcast = createBroadcastHandler(this.config, socket, params.maxRelayLimitPerUser);
            this.ScalableBroadcast._ = this.ScalableBroadcast;
        }

        socket.on('extra-data-updated', extra => this.handleExtraDataUpdated(socket, extra));
        socket.on('get-remote-user-extra-data', (remoteUserId, callback) => this.handleGetRemoteUserExtraData(socket, remoteUserId, callback));
        socket.on('set-custom-socket-event-listener', customEvent => this.handleCustomSocketEvent(socket, customEvent));
        socket.on('changed-uuid', (newUserId, callback) => this.handleChangedUUID(socket, newUserId, callback));
        socket.on('set-password', (password, callback) => this.handleSetPassword(socket, password, callback));
        socket.on('disconnect-with', (remoteUserId, callback) => this.handleDisconnectWith(socket, remoteUserId, callback));
        socket.on('close-entire-session', callback => this.handleCloseEntireSession(socket, callback));
        socket.on('check-presence', (roomid, callback) => this.handleCheckPresence(roomid, callback));
        socket.on(socketMessageEvent, (message, callback) => this.handleMessage(socket, message, callback, enableScalableBroadcast));
        socket.on('is-valid-password', (password, roomid, callback) => this.handleIsValidPassword(password, roomid, callback));
        socket.on('get-public-rooms', (identifier, callback) => this.handleGetPublicRooms(identifier, callback));
        socket.on('open-room', (arg, callback) => this.handleOpenRoom(socket, arg, callback, params, enableScalableBroadcast, autoCloseEntireSession));
        socket.on('join-room', (arg, callback) => this.handleJoinRoom(socket, arg, callback, params, enableScalableBroadcast));
        socket.on('disconnect', () => this.handleDisconnect(socket));
    }

    // Event handler methods (implement these based on original logic)
    handleExtraDataUpdated(socket, extra) {
        const user = this.listOfUsers.get(socket.userid);
        if (!user) return;

        user.updateExtra(extra);
        for (const [remoteUserId, remoteSocket] of user.connectedWith) {
            remoteSocket.emit('extra-data-updated', socket.userid, extra);
        }
        const room = this.listOfRooms.get(user.admininfo.sessionid);
        if (room) {
            if (socket.userid === room.owner) room.extra = extra;
            room.participants.forEach(pid => {
                const participant = this.listOfUsers.get(pid);
                if (participant) participant.socket.emit('extra-data-updated', socket.userid, extra);
            });
        }
        this.sendToAdmin();
    }

    handleGetRemoteUserExtraData(socket, remoteUserId, callback = () => {}) {
        const remoteUser = this.listOfUsers.get(remoteUserId);
        callback(remoteUser ? remoteUser.extra : CONST_STRINGS.USERID_NOT_AVAILABLE);
    }

    handleCustomSocketEvent(socket, customEvent) {
        const dontDuplicateListeners = new Set();
        if (dontDuplicateListeners.has(customEvent)) return;
        dontDuplicateListeners.add(customEvent);
        socket.on(customEvent, message => socket.broadcast.emit(customEvent, message));
    }

    handleChangedUUID(socket, newUserId, callback = () => {}) {
        const currentUser = this.listOfUsers.get(socket.userid);
        if (currentUser) {
            this.listOfUsers.set(newUserId, currentUser);
            currentUser.socket.userid = socket.userid = newUserId;
            this.listOfUsers.delete(currentUser.userid);
        } else {
            socket.userid = newUserId;
            this.appendUser(socket, this.parseParams(socket.handshake.query));
        }
        callback();
    }

    handleSetPassword(socket, password, callback = () => {}) {
        const room = this.listOfRooms.get(socket.admininfo?.sessionid);
        if (!room) return callback(null, null, CONST_STRINGS.DID_NOT_JOIN_ANY_ROOM);
        if (room.owner === socket.userid) {
            room.password = password;
            callback(true, room.sessionid, null);
        } else {
            callback(false, room.sessionid, CONST_STRINGS.ROOM_PERMISSION_DENIED);
        }
    }

    handleDisconnectWith(socket, remoteUserId, callback = () => {}) {
        const user = this.listOfUsers.get(socket.userid);
        if (user) user.disconnectRemoteUser(remoteUserId);

        const remoteUser = this.listOfUsers.get(remoteUserId);
        if (remoteUser) remoteUser.disconnectRemoteUser(socket.userid);
        this.sendToAdmin();
        callback();
    }

    handleCloseEntireSession(socket, callback = () => {}) {
        const user = this.listOfUsers.get(socket.userid);
        if (!user || !user.admininfo) return callback(false, CONST_STRINGS.INVALID_SOCKET);

        const room = this.listOfRooms.get(user.admininfo.sessionid);
        if (!room || room.owner !== socket.userid) return callback(false, CONST_STRINGS.ROOM_PERMISSION_DENIED);

        this.closeOrShiftRoom(socket, true);
        callback(true);
    }

    handleCheckPresence(roomid, callback) {
        const room = this.listOfRooms.get(roomid);
        if (!room || room.participants.length === 0) {
            callback(false, roomid, { _room: { isFull: false, isPasswordProtected: false } });
        } else {
            const extra = { ...room.extra, _room: room.toJSON() };
            callback(true, roomid, extra);
        }
    }

    handleMessage(socket, message, callback = () => {}, enableScalableBroadcast) {
        // Implement message handling logic from onMessageCallback and joinARoom
        // This is a placeholder; you need to adapt the original logic here
    }

    handleIsValidPassword(password, roomid, callback = () => {}) {
        const room = this.listOfRooms.get(roomid);
        if (!room) return callback(false, roomid, CONST_STRINGS.ROOM_NOT_AVAILABLE);
        if (!password) return callback(false, roomid, 'You did not enter the password.');
        callback(room.password === password, roomid, room.password ? CONST_STRINGS.INVALID_PASSWORD : 'This room does not have a password.');
    }

    handleGetPublicRooms(identifier, callback) {
        const rooms = Array.from(this.listOfRooms.entries())
            .filter(([_, room]) => room.identifier === identifier)
            .map(([_, room]) => room.toJSON());
        callback(rooms);
    }

    handleOpenRoom(socket, arg, callback = () => {}, params, enableScalableBroadcast, autoCloseEntireSession) {
        this.closeOrShiftRoom(socket);
        if (this.listOfRooms.has(arg.sessionid) && this.listOfRooms.get(arg.sessionid).participants.length) {
            return callback(false, CONST_STRINGS.ROOM_NOT_AVAILABLE);
        }

        const room = new Room(socket.userid, arg.sessionid, params.maxParticipantsAllowed, {
            extra: arg.extra,
            session: arg.session,
            identifier: arg.identifier,
            password: arg.password
        });
        this.listOfRooms.set(arg.sessionid, room);
        room.addParticipant(socket.userid);

        const user = this.listOfUsers.get(socket.userid);
        if (user) {
            user.admininfo = { sessionid: arg.sessionid, session: arg.session, extra: arg.extra };
            user.extra = arg.extra;
        }

        this.sendToAdmin();
        callback(true);
    }

    handleJoinRoom(socket, arg, callback = () => {}, params, enableScalableBroadcast) {
        this.closeOrShiftRoom(socket);
        const room = this.listOfRooms.get(arg.sessionid);
        if (!room) return callback(false, CONST_STRINGS.ROOM_NOT_AVAILABLE);
        if (room.password && room.password !== arg.password) return callback(false, CONST_STRINGS.INVALID_PASSWORD);
        if (room.isFull()) return callback(false, CONST_STRINGS.ROOM_FULL);

        room.addParticipant(socket.userid);
        const user = this.listOfUsers.get(socket.userid);
        if (user) {
            user.admininfo = { sessionid: arg.sessionid, session: arg.session, extra: arg.extra };
            user.extra = arg.extra;
        }

        this.sendToAdmin();
        callback(true);
    }

    handleDisconnect(socket) {
        const user = this.listOfUsers.get(socket.userid);
        if (user) {
            for (const [remoteUserId, remoteSocket] of user.connectedWith) {
                remoteSocket.emit('user-disconnected', socket.userid);
            }
            this.listOfUsers.delete(socket.userid);
        }
        this.closeOrShiftRoom(socket);
        this.sendToAdmin();
    }

    closeOrShiftRoom(socket, autoClose = false) {
        const user = this.listOfUsers.get(socket.userid);
        if (!user || !user.admininfo) return;

        const room = this.listOfRooms.get(user.admininfo.sessionid);
        if (!room) return;

        if (socket.userid === room.owner) {
            if (!autoClose && room.participants.length > 1) {
                const newOwner = room.participants.find(pid => pid !== socket.userid && this.listOfUsers.has(pid));
                if (newOwner) {
                    room.owner = newOwner;
                    room.removeParticipant(socket.userid);
                    this.listOfUsers.get(newOwner).socket.emit('set-isInitiator-true', room.sessionid);
                } else {
                    this.listOfRooms.delete(room.sessionid);
                }
            } else {
                this.listOfRooms.delete(room.sessionid);
            }
        } else {
            room.removeParticipant(socket.userid);
        }
    }
}

export function signalingServer(socket, config) {
    const server = new SignalingServer(config);
    server.onConnection(socket);
}
// para reemplazar signaling_server hay que verificar si todas las funciones existen ya que signaling_server funciona y todos los metodos y funciones se usan 
function signaling_server (socket, config) {
    config = config || {};

    onConnection(socket);

    // to secure your socket.io usage: (via: docs/tips-tricks.md)
    // io.set('origins', 'https://domain.com');

    function appendUser(socket, params) {
        try {
            let extra = params.extra;

            let queryParams = socket.handshake.query; // Renombrar para claridad

            if (queryParams.extra) {
                try {
                    if (typeof queryParams.extra === 'string') {
                        queryParams.extra = JSON.parse(queryParams.extra);
                    }
                    extra = queryParams.extra;
                } catch (e) {
                    extra = queryParams.extra;
                }
            }

            listOfUsers.set(socket.userid, { // Usar Map.set
                socket: socket,
                connectedWith: new Map(), // Usar Map para consistencia
                extra: extra || {},
                admininfo: {},
                socketMessageEvent: queryParams.socketMessageEvent || '',
                socketCustomEvent: queryParams.socketCustomEvent || ''
            });
        } catch (e) {
            pushLogs(config, 'appendUser', e);
        }

        sendToAdmin();
    }

    function sendToAdmin(all) {
        if(config.enableAdmin !== true) {
            return;
        }

        try {
            if (adminSocket) {
                const users = [];
                // temporarily disabled
                if (config.enableAdmin === true) { // Simplificar la condición
                    for (const [userid, item] of listOfUsers.entries()) { // Iterar sobre Map
                        try {
                            if (!item) continue; // maybe user just left?

                            if (!item.connectedWith) {
                                item.connectedWith = new Map(); // Asegurar que connectedWith sea un Map si no existe
                            }

                            if (!item.socket) {
                                item.socket = {};
                            }

                            users.push({
                                userid: userid,
                                admininfo: item.socket.admininfo || '',
                                connectedWith: Array.from(item.connectedWith.keys()) // Obtener keys como Array
                            });
                        } catch (e) {
                            pushLogs(config, 'admin.user-looper', e);
                        }
                    }
                }


                let scalableBroadcastUsers = 0;
                if(ScalableBroadcast && ScalableBroadcast._) {
                    scalableBroadcastUsers = ScalableBroadcast._.getUsers();
                }

                adminSocket.emit('admin', {
                    newUpdates: !all,
                    listOfRooms: !!all ? Array.from(listOfRooms.values()) : [], // Convertir Map a Array si es necesario
                    listOfUsers: listOfUsers.size, // Usar Map.size
                    scalableBroadcastUsers: scalableBroadcastUsers.length
                });
            }
        } catch (e) {
            pushLogs(config, 'admin', e);
        }
    }

    function handleAdminSocket(socket, params) {
        if(config.enableAdmin !== true || !params.adminUserName || !params.adminPassword) {
            socket.emit('admin', {
                error: 'Please pass "adminUserName" and "adminPassword" via socket.io parameters.'
            });

            pushLogs(config, 'invalid-admin', {
                message: CONST_STRINGS.INVALID_ADMIN_CREDENTIAL,
                stack: `name: ${params.adminUserName}\npassword: ${params.adminPassword}` // Template literals para claridad
            });

            socket.disconnect(); //disabled admin
            return;
        }

        if (!isAdminAuthorized(params, config)) {
            socket.emit('admin', {
                error: 'Invalid admin username or password.'
            });

            pushLogs(config, 'invalid-admin', {
                message: CONST_STRINGS.INVALID_ADMIN_CREDENTIAL,
                stack: `name: ${params.adminUserName}\npassword: ${params.adminPassword}` // Template literals para claridad
            });

            socket.disconnect();
            return;
        }

        socket.emit('admin', {
            connected: true
        });

        adminSocket = socket;
        socket.on('admin', function(message, callback) {
            if (!isAdminAuthorized(params, config)) { // Reutilizar la validación
                socket.emit('admin', {
                    error: 'Invalid admin username or password.'
                });

                pushLogs(config, 'invalid-admin', {
                    message: CONST_STRINGS.INVALID_ADMIN_CREDENTIAL,
                    stack: `name: ${params.adminUserName}\npassword: ${params.adminPassword}` // Template literals para claridad
                });

                socket.disconnect();
                return;
            }

            callback = callback || function() {};

            if (message.all === true) {
                sendToAdmin(true);
            }

            if (message.userinfo === true && message.userid) {
                try {
                    const user = listOfUsers.get(message.userid); // Usar Map.get
                    if (user) {
                        callback(user.socket.admininfo || {});
                    } else {
                        callback({
                            error: CONST_STRINGS.USERID_NOT_AVAILABLE
                        });
                    }
                } catch (e) {
                    pushLogs(config, 'userinfo', e);
                }
            }

            if (message.clearLogs === true) {
                // last callback parameter will force to clear logs
                pushLogs(config, '', '', callback);
            }

            if (message.deleteUser === true) {
                try {
                    const user = listOfUsers.get(message.userid); // Usar Map.get

                    if (user) {
                        if (user.socket.owner) {
                            // delete listOfRooms[user.socket.owner];
                        }

                        user.socket.disconnect();
                    }

                    listOfUsers.delete(message.userid); // Usar Map.delete
                    callback(true);
                } catch (e) {
                    pushLogs(config, 'deleteUser', e);
                    callback(false);
                }
            }

            if (message.deleteRoom === true) {
                try {
                    const room = listOfRooms.get(message.roomid); // Usar Map.get

                    if (room) {
                        const participants = room.participants;
                        listOfRooms.delete(message.roomid); // Usar Map.delete
                        participants.forEach(userid => { // Usar forEach para iteración simple
                            const user = listOfUsers.get(userid); // Usar Map.get
                            if (user) {
                                user.socket.disconnect();
                            }
                        });
                    }
                    callback(true);
                } catch (e) {
                    pushLogs(config, 'deleteRoom', e);
                    callback(false);
                }
            }
        });
    }

    function onConnection(socket) {
        let params = socket.handshake.query;

        if(!params.userid) {
            params.userid = String(Math.random() * 100).replace('.', ''); // Convertir a string explicitamente
        }

        if(!params.sessionid) {
            params.sessionid = String(Math.random() * 100).replace('.', ''); // Convertir a string explicitamente
        }

        if (params.extra) {
            try {
                params.extra = JSON.parse(params.extra);
            } catch (e) {
                params.extra = {};
            }
        } else {
            params.extra = {};
        }

        const socketMessageEvent = params.msgEvent || 'RTCMultiConnection-Message'; // Declarar como const

        // for admin's record
        params.socketMessageEvent = socketMessageEvent;

        let autoCloseEntireSession = params.autoCloseEntireSession === true || params.autoCloseEntireSession === 'true';
        const sessionid = params.sessionid; // Declarar como const
        const maxParticipantsAllowed = parseInt(params.maxParticipantsAllowed || 1000, 10) || 1000; // Base 10 para parseInt
        const enableScalableBroadcast = params.enableScalableBroadcast === true || params.enableScalableBroadcast === 'true'; // Declarar como const

        if (params.userid === 'admin') {
            handleAdminSocket(socket, params);
            return;
        }

        if (enableScalableBroadcast === true) {
            try {
                if (!ScalableBroadcast) {
                    // path to scalable broadcast script must be accurate
                    ScalableBroadcast = require('./Scalable-Broadcast.js');
                }
                ScalableBroadcast._ = ScalableBroadcast(config, socket, params.maxRelayLimitPerUser);
            } catch (e) {
                pushLogs(config, 'ScalableBroadcast', e);
            }
        }

        // do not allow to override userid
        if (listOfUsers.has(params.userid)) { // Usar Map.has
            const useridAlreadyTaken = params.userid; // Declarar como const
            params.userid = String(Math.random() * 1000).replace('.', ''); // Convertir a string explicitamente
            socket.emit('userid-already-taken', useridAlreadyTaken, params.userid);
            return;
        }

        socket.userid = params.userid;
        appendUser(socket, params);

        socket.on('extra-data-updated', function(extra) {
            try {
                const user = listOfUsers.get(socket.userid); // Usar Map.get
                if (!user) return;

                if (user.socket.admininfo) {
                    user.socket.admininfo.extra = extra;
                }

                // todo: use "admininfo.extra" instead of below one
                user.extra = extra;

                try {
                    for (const remoteUserId of user.connectedWith.keys()) { // Iterar sobre Map keys
                        try {
                            const remoteUser = listOfUsers.get(remoteUserId); // Usar Map.get
                            if (remoteUser) {
                                remoteUser.socket.emit('extra-data-updated', socket.userid, extra);
                            }
                        } catch (e) {
                            pushLogs(config, 'extra-data-updated.connectedWith', e);
                        }
                    }
                } catch (e) {
                    pushLogs(config, 'extra-data-updated.connectedWith', e);
                }

                // sent alert to all room participants
                if (!socket.admininfo) {
                    sendToAdmin();
                    return;
                }

                const roomid = socket.admininfo.sessionid; // Declarar como const
                const room = listOfRooms.get(roomid); // Usar Map.get
                if (room) {
                    if (socket.userid == room.owner) {
                        // room's extra must match owner's extra
                        room.extra = extra;
                    }
                    room.participants.forEach(pid => { // Usar forEach para iteración simple
                        try {
                            const participantUser = listOfUsers.get(pid); // Usar Map.get
                            if (!participantUser) {
                                // todo: remove this user from participants list
                                return;
                            }

                            participantUser.socket.emit('extra-data-updated', socket.userid, extra);
                        } catch (e) {
                            pushLogs(config, 'extra-data-updated.participants', e);
                        }
                    });
                }

                sendToAdmin();
            } catch (e) {
                pushLogs(config, 'extra-data-updated', e);
            }
        });

        socket.on('get-remote-user-extra-data', function(remoteUserId, callback) {
            callback = callback || function() {};
            if (!remoteUserId || !listOfUsers.has(remoteUserId)) { // Usar Map.has
                callback(CONST_STRINGS.USERID_NOT_AVAILABLE);
                return;
            }
            const remoteUser = listOfUsers.get(remoteUserId); // Usar Map.get
            callback(remoteUser.extra);
        });

        const dontDuplicateListeners = new Set(); // Usar Set para eficiencia en la búsqueda
        socket.on('set-custom-socket-event-listener', function(customEvent) {
            if (dontDuplicateListeners.has(customEvent)) return; // Usar Set.has
            dontDuplicateListeners.add(customEvent); // Usar Set.add

            socket.on(customEvent, function(message) {
                try {
                    socket.broadcast.emit(customEvent, message);
                } catch (e) {
                    pushLogs(config, 'set-custom-socket-event-listener.broadcast', e); // Loguear error específico
                }
            });
        });

        socket.on('changed-uuid', function(newUserId, callback) {
            callback = callback || function() {};

            try {
                const currentUser = listOfUsers.get(socket.userid); // Usar Map.get
                if (currentUser && currentUser.socket.userid == socket.userid) {
                    if (newUserId === socket.userid) return;

                    const oldUserId = socket.userid; // Declarar como const
                    listOfUsers.set(newUserId, currentUser); // Usar Map.set
                    listOfUsers.get(newUserId).socket.userid = socket.userid = newUserId; // Usar Map.get y actualizar
                    listOfUsers.delete(oldUserId); // Usar Map.delete

                    callback();
                    return;
                }

                socket.userid = newUserId;
                appendUser(socket, params);

                callback();
            } catch (e) {
                pushLogs(config, 'changed-uuid', e);
            }
        });

        socket.on('set-password', function(password, callback) {
            try {
                callback = callback || function() {};

                if (!socket.admininfo) {
                    callback(null, null, CONST_STRINGS.DID_NOT_JOIN_ANY_ROOM);
                    return;
                }

                const roomid = socket.admininfo.sessionid; // Declarar como const
                const room = listOfRooms.get(roomid); // Usar Map.get

                if (room && room.owner == socket.userid) {
                    room.password = password;
                    callback(true, roomid, null);
                }
                else {
                    callback(false, roomid, CONST_STRINGS.ROOM_PERMISSION_DENIED);
                }
            } catch (e) {
                pushLogs(config, 'set-password', e);
            }
        });

        socket.on('disconnect-with', function(remoteUserId, callback) {
            try {
                const user = listOfUsers.get(socket.userid); // Usar Map.get
                if (user && user.connectedWith.has(remoteUserId)) { // Usar Map.has
                    user.connectedWith.delete(remoteUserId); // Usar Map.delete
                    socket.emit('user-disconnected', remoteUserId);
                    sendToAdmin();
                }

                if (!listOfUsers.has(remoteUserId)) return callback(); // Usar Map.has

                const remoteUser = listOfUsers.get(remoteUserId); // Usar Map.get
                if (remoteUser && remoteUser.connectedWith.has(socket.userid)) { // Usar Map.has
                    remoteUser.connectedWith.delete(socket.userid); // Usar Map.delete
                    remoteUser.socket.emit('user-disconnected', socket.userid);
                    sendToAdmin();
                }
                callback();
            } catch (e) {
                pushLogs(config, 'disconnect-with', e);
            }
        });

        socket.on('close-entire-session', function(callback) {
            try {
                if(!callback || typeof callback !== 'function') {
                    callback = function() {};
                }

                const user = listOfUsers.get(socket.userid); // Usar Map.get

                if(!user) return callback(false, CONST_STRINGS.USERID_NOT_AVAILABLE);
                if(!user.roomid) return callback(false, CONST_STRINGS.ROOM_NOT_AVAILABLE); // roomid no parece estar definido en user
                if(!socket.admininfo) return callback(false, CONST_STRINGS.INVALID_SOCKET);

                const roomid = socket.admininfo.sessionid; // Declarar como const
                const room = listOfRooms.get(roomid); // Usar Map.get
                if(!room) return callback(false, CONST_STRINGS.ROOM_NOT_AVAILABLE);
                if(room.owner !== user.userid) return callback(false, CONST_STRINGS.ROOM_PERMISSION_DENIED);

                autoCloseEntireSession = true;
                closeOrShiftRoom();

                callback(true);
            } catch (e) {
                pushLogs(config, 'close-entire-session', e);
            }
        });

        socket.on('check-presence', function(roomid, callback) {
            try {
                const room = listOfRooms.get(roomid); // Usar Map.get
                if (!room || room.participants.length === 0) {
                    callback(false, roomid, {
                        _room: {
                            isFull: false,
                            isPasswordProtected: false
                        }
                    });
                } else {
                    let extra = room.extra;
                    if(typeof extra !== 'object' || !extra) {
                        extra = {
                            value: extra
                        };
                    }
                    extra._room = {
                        isFull: room.participants.length >= room.maxParticipantsAllowed,
                        isPasswordProtected: !!room.password && room.password.toString().trim().length > 0 // Usar trim() para eliminar espacios
                    };
                    callback(true, roomid, extra);
                }
            } catch (e) {
                pushLogs(config, 'check-presence', e);
            }
        });

        function onMessageCallback(message) {
            try {
                if (!listOfUsers.has(message.sender)) { // Usar Map.has
                    socket.emit('user-not-found', message.sender);
                    return;
                }

                const senderUser = listOfUsers.get(message.sender); // Usar Map.get

                // we don't need "connectedWith" anymore
                // todo: remove all these redundant codes
                // fire "onUserStatusChanged" for room-participants instead of individual users
                // rename "user-connected" to "user-status-changed"
                if (!message.message.userLeft && !senderUser.connectedWith.has(message.remoteUserId) && listOfUsers.has(message.remoteUserId)) { // Usar Map.has
                    const remoteUser = listOfUsers.get(message.remoteUserId); // Usar Map.get
                    senderUser.connectedWith.set(message.remoteUserId, remoteUser.socket); // Usar Map.set
                    senderUser.socket.emit('user-connected', message.remoteUserId);

                    if (!listOfUsers.has(message.remoteUserId)) { // Usar Map.has
                        listOfUsers.set(message.remoteUserId, { // Usar Map.set
                            socket: null,
                            connectedWith: new Map(), // Usar Map para consistencia
                            extra: {},
                            admininfo: {}
                        });
                    }

                    listOfUsers.get(message.remoteUserId).connectedWith.set(message.sender, socket); // Usar Map.set

                    if (listOfUsers.get(message.remoteUserId).socket) { // Usar Map.get
                        listOfUsers.get(message.remoteUserId).socket.emit('user-connected', message.sender); // Usar Map.get
                    }

                    sendToAdmin();
                }

                if (listOfUsers.has(message.sender) && listOfUsers.get(message.sender).connectedWith.has(message.remoteUserId) && listOfUsers.has(socket.userid)) { // Usar Map.has
                    message.extra = listOfUsers.get(socket.userid).extra; // Usar Map.get
                    const remoteUserSocket = listOfUsers.get(message.sender).connectedWith.get(message.remoteUserId); // Usar Map.get
                    if (remoteUserSocket) { // Verificar que el socket exista antes de emitir
                        remoteUserSocket.emit(socketMessageEvent, message);
                    }

                    sendToAdmin();
                }
            } catch (e) {
                pushLogs(config, 'onMessageCallback', e);
            }
        }

        function joinARoom(message) {
            try {
                if (!socket.admininfo || !socket.admininfo.sessionid) return;

                // let roomid = message.remoteUserId;
                const roomid = socket.admininfo.sessionid; // Declarar como const
                const room = listOfRooms.get(roomid); // Usar Map.get

                if (!room) return; // find a solution?

                if (room.participants.length >= room.maxParticipantsAllowed && room.participants.indexOf(socket.userid) === -1) {
                    // room is full
                    // todo: how to tell user that room is full?
                    // do not fire "room-full" event
                    // find something else
                    return;
                }

                if (room.session && (room.session.oneway === true || room.session.broadcast === true)) {
                    const owner = room.owner; // Declarar como const
                    const ownerUser = listOfUsers.get(owner); // Usar Map.get
                    if (ownerUser) {
                        message.remoteUserId = owner;

                        if (enableScalableBroadcast === false) {
                            // only send to owner i.e. only connect with room owner
                            ownerUser.socket.emit(socketMessageEvent, message);
                        }
                    }
                    return;
                }

                // redundant?
                // appendToRoom(roomid, socket.userid);

                if (enableScalableBroadcast === false) {
                    // connect with all participants
                    room.participants.forEach(pid => { // Usar forEach para iteración simple
                        if (pid === socket.userid || !listOfUsers.has(pid)) return; // Usar Map.has

                        const participantUser = listOfUsers.get(pid); // Usar Map.get
                        message.remoteUserId = pid;
                        participantUser.socket.emit(socketMessageEvent, message);
                    });
                }
            } catch (e) {
                pushLogs(config, 'joinARoom', e);
            }

            sendToAdmin();
        }

        function appendToRoom(roomid, userid) {
            try {
                let room = listOfRooms.get(roomid); // Usar Map.get
                if (!room) {
                    room = {
                        maxParticipantsAllowed: parseInt(params.maxParticipantsAllowed || 1000, 10) || 1000, // Base 10 para parseInt
                        owner: userid, // this can change if owner leaves and if control shifts
                        participants: [], // Inicializar como array vacio
                        extra: {}, // usually owner's extra-data
                        socketMessageEvent: '',
                        socketCustomEvent: '',
                        identifier: '',
                        session: {
                            audio: true,
                            video: true
                        }
                    };
                    listOfRooms.set(roomid, room); // Usar Map.set
                }

                if (room.participants.includes(userid)) return; // Usar includes para verificar existencia en array
                room.participants.push(userid);
            } catch (e) {
                pushLogs(config, 'appendToRoom', e);
            }
        }

        function closeOrShiftRoom() {
            try {
                if (!socket.admininfo) {
                    return;
                }

                const roomid = socket.admininfo.sessionid; // Declarar como const
                const room = listOfRooms.get(roomid); // Usar Map.get

                if (room) {
                    if (socket.userid === room.owner) {
                        if (autoCloseEntireSession === false && room.participants.length > 1) {
                            let firstParticipant;
                            for (const pid of room.participants) { // Usar for...of loop para iterar sobre array
                                if (firstParticipant || pid === socket.userid) continue;
                                if (!listOfUsers.has(pid)) continue; // Usar Map.has
                                firstParticipant = listOfUsers.get(pid); // Usar Map.get
                                break; // Salir del loop después de encontrar el primer participante
                            }


                            if (firstParticipant) {
                                // reset owner priviliges
                                room.owner = firstParticipant.socket.userid;

                                // redundant?
                                firstParticipant.socket.emit('set-isInitiator-true', roomid);

                                // remove from room's participants list
                                const newParticipantsList = room.participants.filter(pid => pid !== socket.userid); // Usar filter para crear nuevo array
                                room.participants = newParticipantsList;
                            } else {
                                listOfRooms.delete(roomid); // Usar Map.delete
                            }
                        } else {
                            listOfRooms.delete(roomid); // Usar Map.delete
                        }
                    } else {
                        const newParticipantsList = room.participants.filter(pid => pid && pid != socket.userid && listOfUsers.has(pid)); // Usar filter para crear nuevo array y Map.has
                        room.participants = newParticipantsList;
                    }
                }
            } catch (e) {
                pushLogs(config, 'closeOrShiftRoom', e);
            }
        }

        socket.on(socketMessageEvent, function(message, callback) {
            if (message.remoteUserId && message.remoteUserId === socket.userid) {
                // remoteUserId MUST be unique
                return;
            }

            try {
                if (message.remoteUserId && message.remoteUserId != 'system' && message.message.newParticipationRequest) {
                    if (enableScalableBroadcast === true) {
                        const remoteUser = listOfUsers.get(message.remoteUserId); // Usar Map.get
                        if (remoteUser) {
                            remoteUser.socket.emit(socketMessageEvent, message);
                        }

                        const currentUser = listOfUsers.get(socket.userid); // Usar Map.get
                        if (currentUser && currentUser.extra.broadcastId) {
                            // for /admin/ page
                            appendToRoom(currentUser.extra.broadcastId, socket.userid);
                        }
                    } else if (listOfRooms.has(message.remoteUserId)) { // Usar Map.has
                        joinARoom(message);
                        return;
                    }
                }

                // for v3 backward compatibility; >v3.3.3 no more uses below block
                if (message.remoteUserId == 'system') {
                    if (message.message.detectPresence) {
                        if (message.message.userid === socket.userid) {
                            callback(false, socket.userid);
                            return;
                        }

                        callback(listOfUsers.has(message.message.userid), message.message.userid); // Usar Map.has
                        return;
                    }
                }

                if (!listOfUsers.has(message.sender)) { // Usar Map.has
                    listOfUsers.set(message.sender, { // Usar Map.set
                        socket: socket,
                        connectedWith: new Map(), // Usar Map para consistencia
                        extra: {},
                        admininfo: {}
                    });
                }

                // if someone tries to join a person who is absent
                // -------------------------------------- DISABLED
                if (false && message.message.newParticipationRequest) {
                    let waitFor = 60 * 10; // 10 minutes
                    let invokedTimes = 0;
                    (function repeater() {
                        if (typeof socket == 'undefined' || !listOfUsers.has(socket.userid)) { // Usar Map.has
                            return;
                        }

                        invokedTimes++;
                        if (invokedTimes > waitFor) {
                            socket.emit('user-not-found', message.remoteUserId);
                            return;
                        }

                        // if user just come online
                        if (listOfUsers.has(message.remoteUserId) && listOfUsers.get(message.remoteUserId).socket) { // Usar Map.has
                            joinARoom(message);
                            return;
                        }

                        setTimeout(repeater, 1000);
                    })();

                    return;
                }

                onMessageCallback(message);
            } catch (e) {
                pushLogs(config, 'on-socketMessageEvent', e);
            }
        });

        socket.on('is-valid-password', function(password, roomid, callback) {
            try {
                callback = callback || function() {};

                if(!password || password.toString().trim().length === 0) { // Usar trim() y length === 0
                    callback(false, roomid, 'You did not enter the password.');
                    return;
                }

                if(!roomid || roomid.toString().trim().length === 0) { // Usar trim() y length === 0
                    callback(false, roomid, 'You did not enter the room-id.');
                    return;
                }

                if(!listOfRooms.has(roomid)) { // Usar Map.has
                    callback(false, roomid, CONST_STRINGS.ROOM_NOT_AVAILABLE);
                    return;
                }

                const room = listOfRooms.get(roomid); // Usar Map.get
                if(!room.password) {
                    callback(false, roomid, 'This room do not have any password.');
                    return;
                }

                if(room.password === password) {
                    callback(true, roomid, false);
                }
                else {
                    callback(false, roomid, CONST_STRINGS.INVALID_PASSWORD);
                }
            }
            catch(e) {
                pushLogs('is-valid-password', e);
            }
        });

        socket.on('get-public-rooms', function(identifier, callback) {
            try {
                if(!identifier || identifier.toString().trim().length === 0) { // Usar trim() y length === 0
                    callback(null, CONST_STRINGS.PUBLIC_IDENTIFIER_MISSING);
                    return;
                }

                const rooms = []; // Declarar como const
                for (const [key, room] of listOfRooms.entries()) { // Iterar sobre Map entries
                    if(!room || !room.identifier || room.identifier.toString().length === 0 || room.identifier !== identifier) continue;
                    rooms.push({
                        maxParticipantsAllowed: room.maxParticipantsAllowed,
                        owner: room.owner,
                        participants: room.participants,
                        extra: room.extra,
                        session: room.session,
                        sessionid: key,
                        isRoomFull: room.participants.length >= room.maxParticipantsAllowed,
                        isPasswordProtected: !!room.password && room.password.trim().length > 0 // Usar trim()
                    });
                }

                callback(rooms);
            }
            catch(e) {
                pushLogs('get-public-rooms', e);
            }
        });

        socket.on('open-room', function(arg, callback) {
            callback = callback || function() {};

            try {
                // if already joined a room, either leave or close it
                closeOrShiftRoom();

                if (listOfRooms.has(arg.sessionid) && listOfRooms.get(arg.sessionid).participants.length) { // Usar Map.has
                    callback(false, CONST_STRINGS.ROOM_NOT_AVAILABLE);
                    return;
                }

                if (enableScalableBroadcast === true) {
                    arg.session.scalable = true;
                    arg.sessionid = arg.extra.broadcastId;
                }

                // maybe redundant?
                if (!listOfUsers.has(socket.userid)) { // Usar Map.has
                    listOfUsers.set(socket.userid, { // Usar Map.set
                        socket: socket,
                        connectedWith: new Map(), // Usar Map para consistencia
                        extra: arg.extra,
                        admininfo: {},
                        socketMessageEvent: params.socketMessageEvent || '',
                        socketCustomEvent: params.socketCustomEvent || ''
                    });
                }
                listOfUsers.get(socket.userid).extra = arg.extra; // Usar Map.get

                if (arg.session && (arg.session.oneway === true || arg.session.broadcast === true)) {
                    autoCloseEntireSession = true;
                }
            } catch (e) {
                pushLogs(config, 'open-room', e);
            }

            // append this user into participants list
            appendToRoom(arg.sessionid, socket.userid);

            try {
                // override owner & session
                if (enableScalableBroadcast === true) {
                    const room = listOfRooms.get(arg.sessionid); // Usar Map.get
                    if (room && Object.keys(room).length == 1) { // Verificar existencia de room antes de acceder a propiedades
                        room.owner = socket.userid;
                        room.session = arg.session;
                    }
                } else {
                    // for non-scalable-broadcast demos
                    const room = listOfRooms.get(arg.sessionid); // Usar Map.get
                    if (room) { // Verificar existencia de room antes de acceder a propiedades
                        room.owner = socket.userid;
                        room.session = arg.session;
                        room.extra = arg.extra || {};
                        room.socketMessageEvent = listOfUsers.get(socket.userid).socketMessageEvent; // Usar Map.get
                        room.socketCustomEvent = listOfUsers.get(socket.userid).socketCustomEvent; // Usar Map.get
                        room.maxParticipantsAllowed = parseInt(params.maxParticipantsAllowed || 1000, 10) || 1000; // Base 10 para parseInt

                        if(arg.identifier && arg.identifier.toString().length) {
                            room.identifier = arg.identifier;
                        }

                        try {
                            if (typeof arg.password !== 'undefined' && arg.password.toString().length) {
                                // password protected room?
                                room.password = arg.password;
                            }
                        } catch (e) {
                            pushLogs(config, 'open-room.password', e);
                        }
                    }
                }

                // admin info are shared only with /admin/
                const currentUser = listOfUsers.get(socket.userid); // Usar Map.get
                if (currentUser) { // Verificar existencia de currentUser antes de acceder a propiedades
                    currentUser.socket.admininfo = {
                        sessionid: arg.sessionid,
                        session: arg.session,
                        mediaConstraints: arg.mediaConstraints,
                        sdpConstraints: arg.sdpConstraints,
                        streams: arg.streams,
                        extra: arg.extra
                    };
                }

            } catch (e) {
                pushLogs(config, 'open-room', e);
            }

            sendToAdmin();

            try {
                callback(true);
            } catch (e) {
                pushLogs(config, 'open-room', e);
            }
        });

        socket.on('join-room', function(arg, callback) {
            callback = callback || function() {};

            try {
                // if already joined a room, either leave or close it
                closeOrShiftRoom();

                if (enableScalableBroadcast === true) {
                    arg.session.scalable = true;
                    arg.sessionid = arg.extra.broadcastId;
                }

                // maybe redundant?
                if (!listOfUsers.has(socket.userid)) { // Usar Map.has
                    listOfUsers.set(socket.userid, { // Usar Map.set
                        socket: socket,
                        connectedWith: new Map(), // Usar Map para consistencia
                        extra: arg.extra,
                        admininfo: {},
                        socketMessageEvent: params.socketMessageEvent || '',
                        socketCustomEvent: params.socketCustomEvent || ''
                    });
                }
                listOfUsers.get(socket.userid).extra = arg.extra; // Usar Map.get
            } catch (e) {
                pushLogs(config, 'join-room', e);
            }

            try {
                if (!listOfRooms.has(arg.sessionid)) { // Usar Map.has
                    callback(false, CONST_STRINGS.ROOM_NOT_AVAILABLE);
                    return;
                }
            } catch (e) {
                pushLogs(config, 'join-room', e);
            }

            try {
                const room = listOfRooms.get(arg.sessionid); // Usar Map.get
                if (room && room.password && room.password != arg.password) {
                    callback(false, CONST_STRINGS.INVALID_PASSWORD);
                    return;
                }
            } catch (e) {
                pushLogs(config, 'join-room.password', e);
            }

            try {
                const room = listOfRooms.get(arg.sessionid); // Usar Map.get
                if (room && room.participants.length >= room.maxParticipantsAllowed) {
                    callback(false, CONST_STRINGS.ROOM_FULL);
                    return;
                }
            } catch (e) {
                pushLogs(config, 'join-room.ROOM_FULL', e);
            }

            // append this user into participants list
            appendToRoom(arg.sessionid, socket.userid);

            try {
                // admin info are shared only with /admin/
                const currentUser = listOfUsers.get(socket.userid); // Usar Map.get
                if (currentUser) { // Verificar existencia de currentUser antes de acceder a propiedades
                    currentUser.socket.admininfo = {
                        sessionid: arg.sessionid,
                        session: arg.session,
                        mediaConstraints: arg.mediaConstraints,
                        sdpConstraints: arg.sdpConstraints,
                        streams: arg.streams,
                        extra: arg.extra
                    };
                }
            } catch (e) {
                pushLogs(config, 'join-room', e);
            }

            sendToAdmin();

            try {
                callback(true);
            } catch (e) {
                pushLogs(config, 'join-room', e);
            }
        });

        socket.on('disconnect', function() {
            try {
                if (socket && socket.namespace && socket.namespace.sockets) {
                    delete socket.namespace.sockets[this.id];
                }
            } catch (e) {
                pushLogs(config, 'disconnect', e);
            }

            try {
                const user = listOfUsers.get(socket.userid); // Usar Map.get
                if (user) {
                    for (const remoteUserId of user.connectedWith.keys()) { // Iterar sobre Map keys
                        const remoteUserSocket = user.connectedWith.get(remoteUserId); // Usar Map.get
                        if (remoteUserSocket) { // Verificar que el socket exista antes de emitir
                            remoteUserSocket.emit('user-disconnected', socket.userid);
                        }

                        const remoteUser = listOfUsers.get(remoteUserId); // Usar Map.get
                        if (remoteUser && remoteUser.connectedWith.has(socket.userid)) { // Usar Map.has
                            remoteUser.connectedWith.delete(socket.userid); // Usar Map.delete
                            remoteUser.socket.emit('user-disconnected', socket.userid);
                        }
                    }
                }
            } catch (e) {
                pushLogs(config, 'disconnect', e);
            }

            closeOrShiftRoom();

            listOfUsers.delete(socket.userid); // Usar Map.delete

            if (socket.ondisconnect) {
                try {
                    // scalable-broadcast.js
                    socket.ondisconnect();
                }
                catch(e) {
                    pushLogs('socket.ondisconnect', e);
                }
            }

            sendToAdmin();
        });
    }
};
export default signaling_server