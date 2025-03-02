import { pushLogs, CONST_STRINGS } from './utils.js';

let listOfUsers = {};
let listOfRooms = {};
let adminSocket;
let ScalableBroadcast;

function isAdminAuthorized(params, config) {
    if (!params || !params.adminUserName || !params.adminPassword) return false;
    return params.adminUserName === config.adminUserName && 
           params.adminPassword === config.adminPassword;
}

// User management helper functions
const UserManager = {
    createUser(socket, extra = {}) {
        return {
            socket,
            connectedWith: {},
            extra,
            admininfo: {},
            socketMessageEvent: socket.handshake.query.socketMessageEvent || '',
            socketCustomEvent: socket.handshake.query.socketCustomEvent || ''
        };
    },

    addUser(socket, params) {
        try {
            const extra = this.parseExtra(params);
            listOfUsers[socket.userid] = this.createUser(socket, extra);
            return true;
        } catch (e) {
            pushLogs(config, 'appendUser', e);
            return false;
        }
    },

    parseExtra(params) {
        if (!params.extra) return {};
        
        if (typeof params.extra === 'string') {
            try {
                return JSON.parse(params.extra);
            } catch (e) {
                return params.extra;
            }
        }
        return params.extra;
    }
};

// Admin related functionality
const AdminManager = {
    sendUpdateToAdmin(config, allData = false) {
        if (!config.enableAdmin || !adminSocket) return;

        try {
            const adminUpdate = this.prepareAdminUpdate(allData);
            adminSocket.emit('admin', adminUpdate);
        } catch (e) {
            pushLogs(config, 'admin', e);
        }
    },

    prepareAdminUpdate(includeAllData) {
        const users = this.getUsersInfo();
        const scalableBroadcastUsers = this.getScalableBroadcastUsers();

        return {
            newUpdates: !includeAllData,
            listOfRooms: includeAllData ? listOfRooms : [],
            listOfUsers: Object.keys(listOfUsers).length,
            scalableBroadcastUsers: scalableBroadcastUsers.length
        };
    },

    getUsersInfo() {
        const users = [];
        Object.keys(listOfUsers).forEach(userid => {
            try {
                const item = listOfUsers[userid];
                if (!item) return;

                users.push({
                    userid,
                    admininfo: item.socket.admininfo || '',
                    connectedWith: Object.keys(item.connectedWith || {})
                });
            } catch (e) {
                pushLogs(config, 'admin.user-looper', e);
            }
        });
        return users;
    },

    getScalableBroadcastUsers() {
        return (ScalableBroadcast && ScalableBroadcast._) ? 
               ScalableBroadcast._.getUsers() : 
               [];
    }
};

// Admin socket handler
function handleAdminSocket(socket, params) {
    if (!isValidAdminRequest(params, config)) {
        handleInvalidAdmin(socket, params);
        return;
    }

    setupAdminSocket(socket, params);
}

function isValidAdminRequest(params, config) {
    return config.enableAdmin === true && 
           params.adminUserName && 
           params.adminPassword &&
           isAdminAuthorized(params, config);
}

function handleInvalidAdmin(socket, params) {
    socket.emit('admin', {
        error: 'Please pass "adminUserName" and "adminPassword" via socket.io parameters.'
    });

    pushLogs(config, 'invalid-admin', {
        message: CONST_STRINGS.INVALID_ADMIN_CREDENTIAL,
        stack: `name: ${params.adminUserName}\npassword: ${params.adminPassword}`
    });

    socket.disconnect();
}

function setupAdminSocket(socket, params) {
    socket.emit('admin', { connected: true });
    adminSocket = socket;

    socket.on('admin', (message, callback) => {
        if (!isAdminAuthorized(params, config)) {
            handleInvalidAdmin(socket, params);
            return;
        }

        handleAdminMessage(message, callback || function() {});
    });
}

function handleAdminMessage(message, callback) {
    if (message.all === true) {
        AdminManager.sendUpdateToAdmin(config, true);
    }
    if (message.userinfo === true && message.userid) {
        handleUserInfoRequest(message, callback);
    }
    if (message.clearLogs === true) {
        pushLogs(config, '', '', callback);
    }
    if (message.deleteUser === true) {
        handleDeleteUser(message, callback);
    }
    if (message.deleteRoom === true) {
        handleDeleteRoom(message, callback);
    }
}

// Replace the original functions with calls to these new implementations
function appendUser(socket, params) {
    return UserManager.addUser(socket, params);
}

function sendToAdmin(all = false) {
    AdminManager.sendUpdateToAdmin(config, all);
}

function signaling_server(socket, config) {
    config = config || {};

    onConnection(socket);

    // to secure your socket.io usage: (via: docs/tips-tricks.md)
    // io.set('origins', 'https://domain.com');
    appendUser(socket, params);

    sendToAdmin(all);
    handleAdminSocket(socket, params);

    function onConnection(socket) {
        // Initialize parameters and session variables
        const params = initializeParameters(socket);
        const sessionConfig = parseSessionConfig(params);

        // Handle admin user
        if (params.userid === 'admin') {
            handleAdminSocket(socket, params);
            return;
        }

        // Set up scalable broadcast if enabled
        initializeScalableBroadcast(params, sessionConfig.enableScalableBroadcast);

        // Handle duplicate user IDs
        if (listOfUsers[params.userid]) {
            handleDuplicateUserId(socket, params);
            return;
        }

        // Assign user ID and append user
        socket.userid = params.userid;
        appendUser(socket, params);

        // Set up socket event listeners
        setupSocketEventListeners(socket, params, sessionConfig);
    }

    // Helper function to initialize parameters
    function initializeParameters(socket) {
        const params = socket.handshake.query;

        // Assign default user ID if not provided
        if (!params.userid) {
            params.userid = `${Math.random() * 100}`.replace('.', '');
        }

        // Assign default session ID if not provided
        if (!params.sessionid) {
            params.sessionid = `${Math.random() * 100}`.replace('.', '');
        }

        // Parse extra data
        params.extra = UserManager.parseExtra(params);

        // Set default message event
        const socketMessageEvent = params.msgEvent || 'RTCMultiConnection-Message';
        params.socketMessageEvent = socketMessageEvent;

        return params;
    }

    // Helper function to parse session configuration
    function parseSessionConfig(params) {
        return {
            autoCloseEntireSession: params.autoCloseEntireSession === true || params.autoCloseEntireSession === 'true',
            sessionid: params.sessionid,
            maxParticipantsAllowed: parseInt(params.maxParticipantsAllowed || 1000) || 1000,
            enableScalableBroadcast: params.enableScalableBroadcast === true || params.enableScalableBroadcast === 'true',
        };
    }

    // Helper function to initialize scalable broadcast
    function initializeScalableBroadcast(params, enableScalableBroadcast) {
        if (!enableScalableBroadcast) return;

        try {
            if (!ScalableBroadcast) {
                ScalableBroadcast = require('./Scalable-Broadcast.js');
            }
            ScalableBroadcast._ = ScalableBroadcast(config, socket, params.maxRelayLimitPerUser);
        } catch (e) {
            pushLogs(config, 'ScalableBroadcast', e);
        }
    }

    // Helper function to handle duplicate user IDs
    function handleDuplicateUserId(socket, params) {
        const useridAlreadyTaken = params.userid;
        params.userid = `${Math.random() * 1000}`.replace('.', '');
        socket.emit('userid-already-taken', useridAlreadyTaken, params.userid);
    }

    // Helper function to set up socket event listeners
    function setupSocketEventListeners(socket, params, sessionConfig) {
        const { socketMessageEvent } = params;

        socket.on('extra-data-updated', (extra) => handleExtraDataUpdated(socket, extra));
        socket.on('get-remote-user-extra-data', (remoteUserId, callback) => handleGetRemoteUserExtraData(socket, remoteUserId, callback));
        socket.on('set-custom-socket-event-listener', (customEvent) => handleCustomSocketEvent(socket, customEvent));
        socket.on('changed-uuid', (newUserId, callback) => handleChangedUUID(socket, newUserId, callback));
        socket.on('set-password', (password, callback) => handleSetPassword(socket, password, callback));
        socket.on('disconnect-with', (remoteUserId, callback) => handleDisconnectWith(socket, remoteUserId, callback));
        socket.on('close-entire-session', (callback) => handleCloseEntireSession(socket, callback));
        socket.on('check-presence', (roomid, callback) => handleCheckPresence(socket, roomid, callback));
        socket.on(socketMessageEvent, (message, callback) => onMessageCallback(socket, message, callback));
        socket.on('is-valid-password', (password, roomid, callback) => handleIsValidPassword(socket, password, roomid, callback));
        socket.on('get-public-rooms', (identifier, callback) => handleGetPublicRooms(socket, identifier, callback));
        socket.on('open-room', (arg, callback) => handleOpenRoom(socket, arg, callback));
        socket.on('join-room', (arg, callback) => handleJoinRoom(socket, arg, callback));
        socket.on('disconnect', () => handleDisconnect(socket));
    }

    // Event handler functions (extracted from original onConnection)

    function handleExtraDataUpdated(socket, extra) {
        try {
            if (!listOfUsers[socket.userid]) return;

            if (listOfUsers[socket.userid].socket.admininfo) {
                listOfUsers[socket.userid].socket.admininfo.extra = extra;
            }

            listOfUsers[socket.userid].extra = extra;

            for (let user in listOfUsers[socket.userid].connectedWith) {
                try {
                    listOfUsers[user].socket.emit('extra-data-updated', socket.userid, extra);
                } catch (e) {
                    pushLogs(config, 'extra-data-updated.connectedWith', e);
                }
            }

            if (!socket.admininfo) {
                sendToAdmin();
                return;
            }

            const roomid = socket.admininfo.sessionid;
            if (roomid && listOfRooms[roomid]) {
                if (socket.userid === listOfRooms[roomid].owner) {
                    listOfRooms[roomid].extra = extra;
                }
                listOfRooms[roomid].participants.forEach((pid) => {
                    try {
                        const user = listOfUsers[pid];
                        if (!user) return;
                        user.socket.emit('extra-data-updated', socket.userid, extra);
                    } catch (e) {
                        pushLogs(config, 'extra-data-updated.participants', e);
                    }
                });
            }

            sendToAdmin();
        } catch (e) {
            pushLogs(config, 'extra-data-updated', e);
        }
    }

    function handleGetRemoteUserExtraData(socket, remoteUserId, callback) {
        callback = callback || function() {};
        if (!remoteUserId || !listOfUsers[remoteUserId]) {
            callback(CONST_STRINGS.USERID_NOT_AVAILABLE);
            return;
        }
        callback(listOfUsers[remoteUserId].extra);
    }

    function handleCustomSocketEvent(socket, customEvent) {
        const dontDuplicateListeners = {};
        if (dontDuplicateListeners[customEvent]) return;
        dontDuplicateListeners[customEvent] = customEvent;

        socket.on(customEvent, (message) => {
            try {
                socket.broadcast.emit(customEvent, message);
            } catch (e) {}
        });
    }

    function handleChangedUUID(socket, newUserId, callback) {
        callback = callback || function() {};

        try {
            if (listOfUsers[socket.userid] && listOfUsers[socket.userid].socket.userid === socket.userid) {
                if (newUserId === socket.userid) return;

                const oldUserId = socket.userid;
                listOfUsers[newUserId] = listOfUsers[oldUserId];
                listOfUsers[newUserId].socket.userid = socket.userid = newUserId;
                delete listOfUsers[oldUserId];

                callback();
                return;
            }

            socket.userid = newUserId;
            appendUser(socket, params);

            callback();
        } catch (e) {
            pushLogs(config, 'changed-uuid', e);
        }
    }

    function handleSetPassword(socket, password, callback) {
        try {
            callback = callback || function() {};

            if (!socket.admininfo) {
                callback(null, null, CONST_STRINGS.DID_NOT_JOIN_ANY_ROOM);
                return;
            }

            const roomid = socket.admininfo.sessionid;
            if (listOfRooms[roomid] && listOfRooms[roomid].owner === socket.userid) {
                listOfRooms[roomid].password = password;
                callback(true, roomid, null);
            } else {
                callback(false, roomid, CONST_STRINGS.ROOM_PERMISSION_DENIED);
            }
        } catch (e) {
            pushLogs(config, 'set-password', e);
        }
    }

    function handleDisconnectWith(socket, remoteUserId, callback) {
        try {
            if (listOfUsers[socket.userid] && listOfUsers[socket.userid].connectedWith[remoteUserId]) {
                delete listOfUsers[socket.userid].connectedWith[remoteUserId];
                socket.emit('user-disconnected', remoteUserId);
                sendToAdmin();
            }

            if (!listOfUsers[remoteUserId]) return callback();

            if (listOfUsers[remoteUserId].connectedWith[socket.userid]) {
                delete listOfUsers[remoteUserId].connectedWith[socket.userid];
                listOfUsers[remoteUserId].socket.emit('user-disconnected', socket.userid);
                sendToAdmin();
            }
            callback();
        } catch (e) {
            pushLogs(config, 'disconnect-with', e);
        }
    }

    function handleCloseEntireSession(socket, callback) {
        try {
            if (!callback || typeof callback !== 'function') {
                callback = function() {};
            }

            const user = listOfUsers[socket.userid];
            if (!user) return callback(false, CONST_STRINGS.USERID_NOT_AVAILABLE);
            if (!user.roomid) return callback(false, CONST_STRINGS.ROOM_NOT_AVAILABLE);
            if (!socket.admininfo) return callback(false, CONST_STRINGS.INVALID_SOCKET);

            const room = listOfRooms[user.roomid];
            if (!room) return callback(false, CONST_STRINGS.ROOM_NOT_AVAILABLE);
            if (room.owner !== user.userid) return callback(false, CONST_STRINGS.ROOM_PERMISSION_DENIED);

            sessionConfig.autoCloseEntireSession = true;
            closeOrShiftRoom();

            callback(true);
        } catch (e) {
            pushLogs(config, 'close-entire-session', e);
        }
    }

    function handleCheckPresence(socket, roomid, callback) {
        try {
            if (!listOfRooms[roomid] || !listOfRooms[roomid].participants.length) {
                callback(false, roomid, {
                    _room: {
                        isFull: false,
                        isPasswordProtected: false
                    }
                });
            } else {
                let extra = listOfRooms[roomid].extra;
                if (typeof extra !== 'object' || !extra) {
                    extra = { value: extra };
                }
                extra._room = {
                    isFull: listOfRooms[roomid].participants.length >= listOfRooms[roomid].maxParticipantsAllowed,
                    isPasswordProtected: listOfRooms[roomid].password && listOfRooms[roomid].password.toString().replace(/ /g, '').length
                };
                callback(true, roomid, extra);
            }
        } catch (e) {
            pushLogs(config, 'check-presence', e);
        }
    }

    function onMessageCallback(socket, message, callback) {
        try {
            if (!listOfUsers[message.sender]) {
                socket.emit('user-not-found', message.sender);
                return;
            }

            if (!message.message.userLeft && !listOfUsers[message.sender].connectedWith[message.remoteUserId] && !!listOfUsers[message.remoteUserId]) {
                listOfUsers[message.sender].connectedWith[message.remoteUserId] = listOfUsers[message.remoteUserId].socket;
                listOfUsers[message.sender].socket.emit('user-connected', message.remoteUserId);

                if (!listOfUsers[message.remoteUserId]) {
                    listOfUsers[message.remoteUserId] = {
                        socket: null,
                        connectedWith: {},
                        extra: {},
                        admininfo: {}
                    };
                }

                listOfUsers[message.remoteUserId].connectedWith[message.sender] = socket;
                if (listOfUsers[message.remoteUserId].socket) {
                    listOfUsers[message.remoteUserId].socket.emit('user-connected', message.sender);
                }

                sendToAdmin();
            }

            if (listOfUsers[message.sender] && listOfUsers[message.sender].connectedWith[message.remoteUserId] && listOfUsers[socket.userid]) {
                message.extra = listOfUsers[socket.userid].extra;
                listOfUsers[message.sender].connectedWith[message.remoteUserId].emit(params.socketMessageEvent, message);
                sendToAdmin();
            }
        } catch (e) {
            pushLogs(config, 'onMessageCallback', e);
        }
    }

    function joinARoom(message) {
        try {
            if (!socket.admininfo || !socket.admininfo.sessionid) return;

            const roomid = socket.admininfo.sessionid;
            if (!listOfRooms[roomid]) return;

            if (listOfRooms[roomid].participants.length >= listOfRooms[roomid].maxParticipantsAllowed && listOfRooms[roomid].participants.indexOf(socket.userid) === -1) {
                return;
            }

            if (listOfRooms[roomid].session && (listOfRooms[roomid].session.oneway === true || listOfRooms[roomid].session.broadcast === true)) {
                const owner = listOfRooms[roomid].owner;
                if (listOfUsers[owner]) {
                    message.remoteUserId = owner;
                    if (sessionConfig.enableScalableBroadcast === false) {
                        listOfUsers[owner].socket.emit(params.socketMessageEvent, message);
                    }
                }
                return;
            }

            if (sessionConfig.enableScalableBroadcast === false) {
                listOfRooms[roomid].participants.forEach((pid) => {
                    if (pid === socket.userid || !listOfUsers[pid]) return;
                    const user = listOfUsers[pid];
                    message.remoteUserId = pid;
                    user.socket.emit(params.socketMessageEvent, message);
                });
            }
        } catch (e) {
            pushLogs(config, 'joinARoom', e);
        }

        sendToAdmin();
    }

    function appendToRoom(roomid, userid) {
        try {
            if (!listOfRooms[roomid]) {
                listOfRooms[roomid] = {
                    maxParticipantsAllowed: parseInt(params.maxParticipantsAllowed || 1000) || 1000,
                    owner: userid,
                    participants: [userid],
                    extra: {},
                    socketMessageEvent: '',
                    socketCustomEvent: '',
                    identifier: '',
                    session: { audio: true, video: true }
                };
            }

            if (listOfRooms[roomid].participants.indexOf(userid) !== -1) return;
            listOfRooms[roomid].participants.push(userid);
        } catch (e) {
            pushLogs(config, 'appendToRoom', e);
        }
    }

    function closeOrShiftRoom() {
        try {
            if (!socket.admininfo) return;

            const roomid = socket.admininfo.sessionid;
            if (roomid && listOfRooms[roomid]) {
                if (socket.userid === listOfRooms[roomid].owner) {
                    if (sessionConfig.autoCloseEntireSession === false && listOfRooms[roomid].participants.length > 1) {
                        let firstParticipant;
                        listOfRooms[roomid].participants.forEach((pid) => {
                            if (firstParticipant || pid === socket.userid) return;
                            if (!listOfUsers[pid]) return;
                            firstParticipant = listOfUsers[pid];
                        });

                        if (firstParticipant) {
                            listOfRooms[roomid].owner = firstParticipant.socket.userid;
                            firstParticipant.socket.emit('set-isInitiator-true', roomid);

                            const newParticipantsList = listOfRooms[roomid].participants.filter(pid => pid !== socket.userid);
                            listOfRooms[roomid].participants = newParticipantsList;
                        } else {
                            delete listOfRooms[roomid];
                        }
                    } else {
                        delete listOfRooms[roomid];
                    }
                } else {
                    const newParticipantsList = listOfRooms[roomid].participants.filter(pid => pid && pid !== socket.userid && listOfUsers[pid]);
                    listOfRooms[roomid].participants = newParticipantsList;
                }
            }
        } catch (e) {
            pushLogs(config, 'closeOrShiftRoom', e);
        }
    }

    function handleIsValidPassword(socket, password, roomid, callback) {
        try {
            callback = callback || function() {};

            if (!password || !password.toString().replace(/ /g, '').length) {
                callback(false, roomid, 'You did not enter the password.');
                return;
            }

            if (!roomid || !roomid.toString().replace(/ /g, '').length) {
                callback(false, roomid, 'You did not enter the room-id.');
                return;
            }

            if (!listOfRooms[roomid]) {
                callback(false, roomid, CONST_STRINGS.ROOM_NOT_AVAILABLE);
                return;
            }

            if (!listOfRooms[roomid].password) {
                callback(false, roomid, 'This room does not have any password.');
                return;
            }

            if (listOfRooms[roomid].password === password) {
                callback(true, roomid, false);
            } else {
                callback(false, roomid, CONST_STRINGS.INVALID_PASSWORD);
            }
        } catch (e) {
            pushLogs('is-valid-password', e);
        }
    }

    function handleGetPublicRooms(socket, identifier, callback) {
        try {
            if (!identifier || !identifier.toString().length || !identifier.toString().replace(/ /g, '').length) {
                callback(null, CONST_STRINGS.PUBLIC_IDENTIFIER_MISSING);
                return;
            }

            const rooms = [];
            Object.keys(listOfRooms).forEach((key) => {
                const room = listOfRooms[key];
                if (!room || !room.identifier || !room.identifier.toString().length || room.identifier !== identifier) return;
                rooms.push({
                    maxParticipantsAllowed: room.maxParticipantsAllowed,
                    owner: room.owner,
                    participants: room.participants,
                    extra: room.extra,
                    session: room.session,
                    sessionid: key,
                    isRoomFull: room.participants.length >= room.maxParticipantsAllowed,
                    isPasswordProtected: !!room.password && room.password.replace(/ /g, '').length > 0
                });
            });

            callback(rooms);
        } catch (e) {
            pushLogs('get-public-rooms', e);
        }
    }

    function handleOpenRoom(socket, arg, callback) {
        callback = callback || function() {};

        try {
            closeOrShiftRoom();

            if (listOfRooms[arg.sessionid] && listOfRooms[arg.sessionid].participants.length) {
                callback(false, CONST_STRINGS.ROOM_NOT_AVAILABLE);
                return;
            }

            if (sessionConfig.enableScalableBroadcast === true) {
                arg.session.scalable = true;
                arg.sessionid = arg.extra.broadcastId;
            }

            if (!listOfUsers[socket.userid]) {
                listOfUsers[socket.userid] = {
                    socket: socket,
                    connectedWith: {},
                    extra: arg.extra,
                    admininfo: {},
                    socketMessageEvent: params.socketMessageEvent || '',
                    socketCustomEvent: params.socketCustomEvent || ''
                };
            }
            listOfUsers[socket.userid].extra = arg.extra;

            if (arg.session && (arg.session.oneway === true || arg.session.broadcast === true)) {
                sessionConfig.autoCloseEntireSession = true;
            }

            appendToRoom(arg.sessionid, socket.userid);

            if (sessionConfig.enableScalableBroadcast === true) {
                if (Object.keys(listOfRooms[arg.sessionid]).length === 1) {
                    listOfRooms[arg.sessionid].owner = socket.userid;
                    listOfRooms[arg.sessionid].session = arg.session;
                }
            } else {
                listOfRooms[arg.sessionid].owner = socket.userid;
                listOfRooms[arg.sessionid].session = arg.session;
                listOfRooms[arg.sessionid].extra = arg.extra || {};
                listOfRooms[arg.sessionid].socketMessageEvent = listOfUsers[socket.userid].socketMessageEvent;
                listOfRooms[arg.sessionid].socketCustomEvent = listOfUsers[socket.userid].socketCustomEvent;
                listOfRooms[arg.sessionid].maxParticipantsAllowed = parseInt(params.maxParticipantsAllowed || 1000) || 1000;

                if (arg.identifier && arg.identifier.toString().length) {
                    listOfRooms[arg.sessionid].identifier = arg.identifier;
                }

                try {
                    if (typeof arg.password !== 'undefined' && arg.password.toString().length) {
                        listOfRooms[arg.sessionid].password = arg.password;
                    }
                } catch (e) {
                    pushLogs(config, 'open-room.password', e);
                }
            }

            listOfUsers[socket.userid].socket.admininfo = {
                sessionid: arg.sessionid,
                session: arg.session,
                mediaConstraints: arg.mediaConstraints,
                sdpConstraints: arg.sdpConstraints,
                streams: arg.streams,
                extra: arg.extra
            };

            sendToAdmin();
            callback(true);
        } catch (e) {
            pushLogs(config, 'open-room', e);
        }
    }

    function handleJoinRoom(socket, arg, callback) {
        callback = callback || function() {};

        try {
            closeOrShiftRoom();

            if (sessionConfig.enableScalableBroadcast === true) {
                arg.session.scalable = true;
                arg.sessionid = arg.extra.broadcastId;
            }

            if (!listOfUsers[socket.userid]) {
                listOfUsers[socket.userid] = {
                    socket: socket,
                    connectedWith: {},
                    extra: arg.extra,
                    admininfo: {},
                    socketMessageEvent: params.socketMessageEvent || '',
                    socketCustomEvent: params.socketCustomEvent || ''
                };
            }
            listOfUsers[socket.userid].extra = arg.extra;

            if (!listOfRooms[arg.sessionid]) {
                callback(false, CONST_STRINGS.ROOM_NOT_AVAILABLE);
                return;
            }

            if (listOfRooms[arg.sessionid].password && listOfRooms[arg.sessionid].password !== arg.password) {
                callback(false, CONST_STRINGS.INVALID_PASSWORD);
                return;
            }

            if (listOfRooms[arg.sessionid].participants.length >= listOfRooms[arg.sessionid].maxParticipantsAllowed) {
                callback(false, CONST_STRINGS.ROOM_FULL);
                return;
            }

            appendToRoom(arg.sessionid, socket.userid);

            listOfUsers[socket.userid].socket.admininfo = {
                sessionid: arg.sessionid,
                session: arg.session,
                mediaConstraints: arg.mediaConstraints,
                sdpConstraints: arg.sdpConstraints,
                streams: arg.streams,
                extra: arg.extra
            };

            sendToAdmin();
            callback(true);
        } catch (e) {
            pushLogs(config, 'join-room', e);
        }
    }

    function handleDisconnect(socket) {
        try {
            if (socket && socket.namespace && socket.namespace.sockets) {
                delete socket.namespace.sockets[socket.id];
            }

            if (listOfUsers[socket.userid]) {
                for (let s in listOfUsers[socket.userid].connectedWith) {
                    listOfUsers[socket.userid].connectedWith[s].emit('user-disconnected', socket.userid);
                    if (listOfUsers[s] && listOfUsers[s].connectedWith[socket.userid]) {
                        delete listOfUsers[s].connectedWith[socket.userid];
                        listOfUsers[s].socket.emit('user-disconnected', socket.userid);
                    }
                }
            }

            closeOrShiftRoom();
            delete listOfUsers[socket.userid];

            if (socket.ondisconnect) {
                try {
                    socket.ondisconnect();
                } catch (e) {
                    pushLogs('socket.ondisconnect', e);
                }
            }

            sendToAdmin();
        } catch (e) {
            pushLogs(config, 'disconnect', e);
        }
    }
}

export default signaling_server;