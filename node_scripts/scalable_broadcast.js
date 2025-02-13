// Muaz Khan      - www.MuazKhan.com
// MIT License    - www.WebRTC-Experiment.com/licence
// Documentation  - github.com/muaz-khan/RTCMultiConnection

// pushLogs is used to write error logs into logs.json
import pushLogs  from './pushLogs.js';

let users = {}; // Consider using a Map for potentially faster lookups and iteration in some cases, though objects are generally fine for this scale.

function ScalableBroadcastHandler(config, socket, maxRelayLimitPerUser) {
    try {
        maxRelayLimitPerUser = parseInt(maxRelayLimitPerUser) || 2; // More robust parsing, consider Number() and isNaN check
    } catch (e) {
        maxRelayLimitPerUser = 2; // Default value already set, catch block might be redundant unless parsing logic becomes more complex
    }

    socket.on('join-broadcast', function(user) {
        try {
            if (!users[user.userid]) { // Check if user already exists to prevent overwriting existing user data.
                socket.userid = user.userid;
                socket.isScalableBroadcastSocket = true;

                users[user.userid] = { // Consider using a class or factory function to create user objects for better structure and maintainability.
                    userid: user.userid,
                    broadcastId: user.broadcastId,
                    isBroadcastInitiator: false,
                    maxRelayLimitPerUser: maxRelayLimitPerUser,
                    relayReceivers: [],
                    receivingFrom: null,
                    canRelay: false,
                    typeOfStreams: user.typeOfStreams || { // Default value if typeOfStreams is not provided.
                        audio: true,
                        video: true
                    },
                    socket: socket
                };

                notifyBroadcasterAboutNumberOfViewers(user.broadcastId); // Move this call after finding relayUser for better flow.
            } else {
                // Handle case where user already exists, maybe reconnecting? Could log this or handle differently.
                console.warn(`User ${user.userid} already exists in broadcast ${user.broadcastId}. Ignoring join request.`);
                return; // Early return to prevent further processing for existing user.
            }

            let relayUser = getFirstAvailableBroadcaster(user.broadcastId, maxRelayLimitPerUser);

            if (relayUser === 'ask-him-rejoin') {
                socket.emit('rejoin-broadcast', user.broadcastId);
                return;
            }

            if (relayUser && user.userid !== user.broadcastId) { // Check if relayUser is found and not the broadcaster joining as viewer.
                let hintsToJoinBroadcast = {
                    typeOfStreams: relayUser.typeOfStreams,
                    userid: relayUser.userid,
                    broadcastId: relayUser.broadcastId
                };

                users[user.userid].receivingFrom = relayUser.userid;
                users[relayUser.userid].relayReceivers.push(
                    users[user.userid]
                );
                users[user.broadcastId].lastRelayuserid = relayUser.userid; // Potentially redundant, lastRelayuserid might not be needed on broadcast initiator.

                socket.emit('join-broadcaster', hintsToJoinBroadcast);

                // logs for current socket
                socket.emit('logs', `You <${user.userid}> are getting data/stream from <${relayUser.userid}>`); // Use template literals for better readability.

                // logs for target relaying user
                relayUser.socket.emit('logs', `You <${relayUser.userid}> are now relaying/forwarding data/stream to <${user.userid}>`); // Use template literals for better readability.
            } else { // No relayUser found, user becomes broadcast initiator (or is the first viewer).
                users[user.userid].isBroadcastInitiator = true;
                socket.emit('start-broadcasting', users[user.userid].typeOfStreams);

                // logs to tell he is now broadcast initiator
                socket.emit('logs', `You <${user.userid}> are now serving the broadcast.`); // Use template literals for better readability.
            }

            notifyBroadcasterAboutNumberOfViewers(user.broadcastId); // Moved here to ensure viewer count is updated after successful join.
        } catch (e) {
            pushLogs(config, 'join-broadcast', e);
        }
    });

    socket.on('scalable-broadcast-message', function(message) {
        socket.broadcast.emit('scalable-broadcast-message', message); // Consider broadcasting to specific broadcastId only, not all connected sockets.
    });

    socket.on('can-relay-broadcast', function() {
        if (users[socket.userid]) { // Check if user exists before accessing properties.
            users[socket.userid].canRelay = true;
        }
    });

    socket.on('can-not-relay-broadcast', function() {
        if (users[socket.userid]) { // Check if user exists before accessing properties.
            users[socket.userid].canRelay = false;
        }
    });

    socket.on('check-broadcast-presence', function(userid, callback) {
        // we can pass number of viewers as well
        try {
            callback(!!users[userid] && users[userid].isBroadcastInitiator === true); // Simplify condition, !! is redundant, just use Boolean(users[userid])
        } catch (e) {
            pushLogs(config, 'check-broadcast-presence', e);
        }
    });

    socket.on('get-number-of-users-in-specific-broadcast', function(broadcastId, callback) {
        try {
            if (!broadcastId || !callback) return; // Early return for invalid input.

            if (!users[broadcastId]) { // Check if broadcast exists before accessing properties.
                callback(0);
                return;
            }

            callback(getNumberOfBroadcastViewers(broadcastId));
        } catch (e) {} // Consider logging this error even if just a generic message.
    });

    function getNumberOfBroadcastViewers(broadcastId) {
        try {
            let numberOfUsers = 0;
            for (const uid in users) { // Use for...in for iterating over object keys. Consider for...of with Object.values(users) if you only need values.
                const user = users[uid];
                if (user.broadcastId === broadcastId) {
                    numberOfUsers++;
                }
            }
            return numberOfUsers - 1; // Subtract 1 to exclude the broadcaster itself from viewers count. Clarify in comments.
        } catch (e) {
            return 0; // Return 0 on error, consider logging for debugging.
        }
    }

    function notifyBroadcasterAboutNumberOfViewers(broadcastId, userLeft) {
        try {
            if (!broadcastId || !users[broadcastId] || !users[broadcastId].socket) return; // Multiple checks for broadcast and socket existence.
            let numberOfBroadcastViewers = getNumberOfBroadcastViewers(broadcastId);

            if (userLeft === true) {
                numberOfBroadcastViewers--;
            }

            users[broadcastId].socket.emit('number-of-broadcast-viewers-updated', {
                numberOfBroadcastViewers: numberOfBroadcastViewers,
                broadcastId: broadcastId
            });
        } catch (e) {} // Consider logging error.
    }

    // this even is called from "signaling-server.js"
    socket.ondisconnect = function() {
        try {
            if (!socket.isScalableBroadcastSocket) return;

            let user = users[socket.userid];

            if (!user) return; // User might have disconnected before fully joining or if socket.userid is not set correctly.

            if (user.isBroadcastInitiator === false) {
                notifyBroadcasterAboutNumberOfViewers(user.broadcastId, true);
            }

            if (user.isBroadcastInitiator === true) {
                // need to stop entire broadcast? Yes, when initiator disconnects, the broadcast should ideally stop.
                for (const n in users) { // Use for...in for object keys.
                    const _user = users[n];

                    if (_user.broadcastId === user.broadcastId) {
                        _user.socket.emit('broadcast-stopped', user.broadcastId);
                    }
                }

                delete users[socket.userid]; // Remove initiator from users list.
                return;
            }

            if (user.receivingFrom || user.isBroadcastInitiator === true) { // `|| user.isBroadcastInitiator === true` seems redundant here as initiators are handled above.
                let parentUser = users[user.receivingFrom];

                if (parentUser) {
                    let newArray = [];
                    for (const n of parentUser.relayReceivers) { // Use for...of for array iteration.
                        if (n.userid !== user.userid) {
                            newArray.push(n);
                        }
                    }
                    users[user.receivingFrom].relayReceivers = newArray; // Update relayReceivers list after removing disconnected user.
                }
            }

            if (user.relayReceivers.length && user.isBroadcastInitiator === false) { // Only ask nested users to rejoin if user was relaying and not initiator.
                askNestedUsersToRejoin(user.relayReceivers);
            }

            delete users[socket.userid]; // Remove user from users list on disconnect.
        } catch (e) {
            pushLogs(config, 'scalable-broadcast-disconnect', e);
        }
    };

    return {
        getUsers: function() {
            try {
                let list = [];
                for (const uid in users) { // Use for...in for object keys.
                    const user = users[uid];
                    if(!user) continue; // Defensive check if user is somehow undefined.

                    try {
                        let relayReceivers = [];
                        for (const s of user.relayReceivers) { // Use for...of for array iteration.
                            relayReceivers.push(s.userid);
                        }

                        list.push({
                            userid: user.userid,
                            broadcastId: user.broadcastId,
                            isBroadcastInitiator: user.isBroadcastInitiator,
                            maxRelayLimitPerUser: user.maxRelayLimitPerUser,
                            relayReceivers: relayReceivers,
                            receivingFrom: user.receivingFrom,
                            canRelay: user.canRelay,
                            typeOfStreams: user.typeOfStreams
                        });
                    }
                    catch(e) {
                        pushLogs('getUsers', e); // Log error within getUsers function.
                    }
                }
                return list;
            }
            catch(e) {
                pushLogs('getUsers', e); // Log error in getUsers function wrapper.
            }
        }
    };
};

function askNestedUsersToRejoin(relayReceivers) {
    try {
        // let usersToAskRejoin = []; // Not used, can be removed.

        for (const receiver of relayReceivers) { // Use for...of for array iteration.
            if (!!users[receiver.userid]) { // Check if user still exists before accessing properties.
                users[receiver.userid].canRelay = false;
                users[receiver.userid].receivingFrom = null;
                receiver.socket.emit('rejoin-broadcast', receiver.broadcastId);
            }

        }
    } catch (e) {
        pushLogs(config, 'askNestedUsersToRejoin', e);
    }
}

function getFirstAvailableBroadcaster(broadcastId, maxRelayLimitPerUser) {
    try {
        let broadcastInitiator = users[broadcastId];

        // if initiator is capable to receive users
        if (broadcastInitiator && broadcastInitiator.relayReceivers.length < maxRelayLimitPerUser) {
            return broadcastInitiator;
        }

        // otherwise if initiator knows who is current relaying user
        if (broadcastInitiator && broadcastInitiator.lastRelayuserid) {
            let lastRelayUser = users[broadcastInitiator.lastRelayuserid];
            if (lastRelayUser && lastRelayUser.relayReceivers.length < maxRelayLimitPerUser) {
                return lastRelayUser;
            }
        }

        // otherwise, search for a user who not relayed anything yet
        // todo: why we're using "for-loop" here? it is not safe. -> Comment is outdated/misleading, for...in is safe for object iteration.
        let userFound;
        for (const n in users) { // Use for...in for object keys.
            const user = users[n];

            if (userFound) {
                continue;
            } else if (user.broadcastId === broadcastId) {
                // if (!user.relayReceivers.length && user.canRelay === true) { // Original condition was too strict.
                if (user.relayReceivers.length < maxRelayLimitPerUser && user.canRelay === true) { // Allow relaying if relayReceivers count is below limit and user can relay.
                    userFound = user;
                }
            }
        }

        if (userFound) {
            return userFound;
        }

        // need to increase "maxRelayLimitPerUser" in this situation
        // so that each relaying user can distribute the bandwidth
        return broadcastInitiator; // Return initiator as fallback, even if overloaded, to at least connect the viewer. Consider more sophisticated fallback strategies.
    } catch (e) {
        pushLogs(config, 'getFirstAvailableBroadcaster', e);
    }
}
export default ScalableBroadcastHandler