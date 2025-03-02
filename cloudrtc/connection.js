function onConnection(socket) {
    // Parse and prepare socket parameters
    let params = parseParams(socket);
    socket.userid = params.userid;
    socket.extra = params.extra;
    socket.socketMessageEvent = params.socketMessageEvent;
    socket.socketCustomEvent = params.socketCustomEvent;

    // Handle admin connections
    if (params.userid === 'admin') {
        AdminManager.handleAdminSocket(socket, params);
        return;
    }

    // Add user to the system; return early if userid is taken
    if (!UserManager.addUser(socket, params)) {
        return;
    }

    // Setup scalable broadcast if enabled
    if (params.enableScalableBroadcast === true || params.enableScalableBroadcast === 'true') {
        try {
            if (!ScalableBroadcast) {
                ScalableBroadcast = require('./Scalable-Broadcast.js');
            }
            ScalableBroadcast._ = ScalableBroadcast(config, socket, params.maxRelayLimitPerUser);
        } catch (e) {
            pushLogs(config, 'ScalableBroadcast', e);
        }
    }

    // Setup event listeners and notify admin
    setupEventListeners(socket, params);
    AdminManager.sendUpdateToAdmin(config);
}

// Helper function to parse socket parameters
function parseParams(socket) {
    let params = socket.handshake.query;

    if (!params.userid) {
        params.userid = (Math.random() * 100).toString().replace('.', '');
    }
    if (!params.sessionid) {
        params.sessionid = (Math.random() * 100).toString().replace('.', '');
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

    params.socketMessageEvent = params.msgEvent || 'RTCMultiConnection-Message';
    params.autoCloseEntireSession = params.autoCloseEntireSession === true || params.autoCloseEntireSession === 'true';
    params.maxParticipantsAllowed = parseInt(params.maxParticipantsAllowed || 1000) || 1000;
    params.enableScalableBroadcast = params.enableScalableBroadcast === true || params.enableScalableBroadcast === 'true';

    return params;
}

// Function to setup all event listeners
function setupEventListeners(socket, params) {
    socket.on('extra-data-updated', function(extra) {
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
                AdminManager.sendUpdateToAdmin(config);
                return;
            }

            let roomid = socket.admininfo.sessionid;
            if (roomid && listOfRooms[roomid]) {
                if (socket.userid === listOfRooms[roomid].owner) {
                    listOfRooms[roomid].extra = extra;
                }
                listOfRooms[roomid].participants.forEach(function(pid) {
                    try {
                        let user = listOfUsers[pid];
                        if (!user) return;
                        user.socket.emit('extra-data-updated', socket.userid, extra);
                    } catch (e) {
                        pushLogs(config, 'extra-data-updated.participants', e);
                    }
                });
            }

            AdminManager.sendUpdateToAdmin(config);
        } catch (e) {
            pushLogs(config, 'extra-data-updated', e);
        }
    });

    socket.on('get-remote-user-extra-data', function(remoteUserId, callback) {
        callback = callback || function() {};
        if (!remoteUserId || !listOfUsers[remoteUserId]) {
            callback(CONST_STRINGS.USERID_NOT_AVAILABLE);
            return;
        }
        callback(listOfUsers[remoteUserId].extra);
    });

    let dontDuplicateListeners = {};
    socket.on('set-custom-socket-event-listener', function(customEvent) {
        if (dontDuplicateListeners[customEvent]) return;
        dontDuplicateListeners[customEvent] = customEvent;

        socket.on(customEvent, function(message) {
            try {
                socket.broadcast.emit(customEvent, message);
            } catch (e) {}
        });
    });

    socket.on('changed-uuid', function(newUserId, callback) {
        callback = callback || function() {};
        try {
            if (listOfUsers[socket.userid] && listOfUsers[socket.userid].socket.userid === socket.userid) {
                if (newUserId === socket.userid) return;

                let oldUserId = socket.userid;
                listOfUsers[newUserId] = listOfUsers[oldUserId];
                listOfUsers[newUserId].socket.userid = socket.userid = newUserId;
                delete listOfUsers[oldUserId];
                callback();
                return;
            }

            socket.userid = newUserId;
            UserManager.addUser(socket, { ...params, userid: newUserId });
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

            let roomid = socket.admininfo.sessionid;
            if (listOfRooms[roomid] && listOfRooms[roomid].owner === socket.userid) {
                listOfRooms[roomid].password = password;
                callback(true, roomid, null);
            } else {
                callback(false, roomid, CONST_STRINGS.ROOM_PERMISSION_DENIED);
            }
        } catch (e) {
            pushLogs(config, 'set-password', e);
        }
    });

    socket.on('disconnect-with', function(remoteUserId, callback) {
        try {
            if (listOfUsers[socket.userid] && listOfUsers[socket.userid].connectedWith[remoteUserId]) {
                delete listOfUsers[socket.userid].connectedWith[remoteUserId];
                socket.emit('user-disconnected', remoteUserId);
                AdminManager.sendUpdateToAdmin(config);
            }

            if (!listOfUsers[remoteUserId]) return callback();

            if (listOfUsers[remoteUserId].connectedWith[socket.userid]) {
                delete listOfUsers[remoteUserId].connectedWith[socket.userid];
                listOfUsers[remoteUserId].socket.emit('user-disconnected', socket.userid);
                AdminManager.sendUpdateToAdmin(config);
            }
            callback();
        } catch (e) {
            pushLogs(config, 'disconnect-with', e);
        }
    });

    socket.on('close-entire-session', function(callback) {
        try {
            callback = callback || function() {};
            let user = listOfUsers[socket.userid];
            if (!user || !user.roomid || !socket.admininfo) {
                callback(false, CONST_STRINGS.INVALID_SOCKET);
                return;
            }

            let room = listOfRooms[user.roomid];
            if (!room || room.owner !== user.userid) {
                callback(false, CONST_STRINGS.ROOM_PERMISSION_DENIED);
                return;
            }

            params.autoCloseEntireSession = true;
            closeOrShiftRoom();
            callback(true);
        } catch (e) {
            pushLogs(config, 'close-entire-session', e);
        }
    });

    socket.on('check-presence', function(roomid, callback) {
        try {
            if (!listOfRooms[roomid] || !listOfRooms[roomid].participants.length) {
                callback(false, roomid, { _room: { isFull: false, isPasswordProtected: false } });
            } else {
                let extra = listOfRooms[roomid].extra || {};
                extra._room = {
                    isFull: listOfRooms[roomid].participants.length >= listOfRooms[roomid].maxParticipantsAllowed,
                    isPasswordProtected: !!listOfRooms[roomid].password && listOfRooms[roomid].password.toString().replace(/ /g, '').length
                };
                callback(true, roomid, extra);
            }
        } catch (e) {
            pushLogs(config, 'check-presence', e);
        }
    });

    socket.on(socket.socketMessageEvent, function(message, callback) {
        // Insert your existing socketMessageEvent handler here
        // For brevity, assuming it remains unchanged from original
        onMessageCallback(message);
    });

    socket.on('is-valid-password', function(password, roomid, callback) {
        // Insert your existing is-valid-password handler here
    });

    socket.on('get-public-rooms', function(identifier, callback) {
        // Insert your existing get-public-rooms handler here
    });

    socket.on('open-room', function(arg, callback) {
        // Insert your existing open-room handler here
    });

    socket.on('join-room', function(arg, callback) {
        // Insert your existing join-room handler here
    });

    socket.on('disconnect', function() {
        try {
            if (socket && socket.namespace && socket.namespace.sockets) {
                delete socket.namespace.sockets[this.id];
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
            if (socket.ondisconnect) socket.ondisconnect();
            AdminManager.sendUpdateToAdmin(config);
        } catch (e) {
            pushLogs(config, 'disconnect', e);
        }
    });
}