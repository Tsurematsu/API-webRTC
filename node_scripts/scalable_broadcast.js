// Refactorización de RTCMultiConnection
// Basado en el trabajo de Muaz Khan - www.MuazKhan.com

import pushLogs from './pushLogs.js';

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

  setupSocket(socket) {
    socket.on('join-broadcast', (userData) => this.handleJoin(socket, userData));
    socket.on('scalable-broadcast-message', (msg) => this.relayMessage(socket, msg));
    socket.on('can-relay-broadcast', () => this.setRelayStatus(socket, true));
    socket.on('can-not-relay-broadcast', () => this.setRelayStatus(socket, false));
    socket.on('check-broadcast-presence', (userid, callback) => this.checkPresence(userid, callback));
    socket.on('get-number-of-users-in-specific-broadcast', (broadcastId, callback) => 
      this.getViewerCount(broadcastId, callback));
    
    socket.ondisconnect = () => this.handleDisconnect(socket);
    
    return {
      getUsers: () => this.getUsersList()
    };
  }

  handleJoin(socket, userData) {
    try {
      if (this.users[userData.userid]) {
        console.warn(`Usuario ${userData.userid} ya existe en broadcast ${userData.broadcastId}`);
        return;
      }

      socket.userid = userData.userid;
      socket.isScalableBroadcastSocket = true;
      
      this.users[userData.userid] = new User(userData, socket, this.maxRelays);
      
      const relayer = this.findAvailableRelayer(userData.broadcastId);
      
      if (relayer === 'ask-him-rejoin') {
        socket.emit('rejoin-broadcast', userData.broadcastId);
        return;
      }
      
      if (relayer && userData.userid !== userData.broadcastId) {
        this.connectToRelayer(userData.userid, relayer);
      } else {
        this.setupInitiator(userData.userid);
      }
      
      this.notifyViewerCount(userData.broadcastId);
    } catch (e) {
      pushLogs(this.config, 'join-broadcast', e);
    }
  }
  
  connectToRelayer(userId, relayer) {
    const viewer = this.users[userId];
    const joinInfo = {
      typeOfStreams: relayer.streams,
      userid: relayer.id,
      broadcastId: relayer.broadcastId
    };
    
    viewer.source = relayer.id;
    relayer.receivers.push(viewer);
    
    if (this.users[viewer.broadcastId]) {
      this.users[viewer.broadcastId].lastRelayId = relayer.id;
    }
    
    viewer.socket.emit('join-broadcaster', joinInfo);
    viewer.socket.emit('logs', `Tú <${viewer.id}> estás recibiendo datos de <${relayer.id}>`);
    relayer.socket.emit('logs', `Tú <${relayer.id}> estás retransmitiendo datos a <${viewer.id}>`);
  }
  
  setupInitiator(userId) {
    const user = this.users[userId];
    user.isInitiator = true;
    user.socket.emit('start-broadcasting', user.streams);
    user.socket.emit('logs', `Tú <${user.id}> estás sirviendo el broadcast.`);
  }
  
  relayMessage(socket, message) {
    socket.broadcast.emit('scalable-broadcast-message', message);
  }
  
  setRelayStatus(socket, status) {
    if (this.users[socket.userid]) {
      this.users[socket.userid].canRelay = status;
    }
  }
  
  checkPresence(userid, callback) {
    try {
      callback(Boolean(this.users[userid]?.isInitiator));
    } catch (e) {
      pushLogs(this.config, 'check-broadcast-presence', e);
    }
  }
  
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
  
  countViewers(broadcastId) {
    try {
      let count = 0;
      for (const id in this.users) {
        if (this.users[id].broadcastId === broadcastId) {
          count++;
        }
      }
      return Math.max(0, count - 1);
    } catch (e) {
      return 0;
    }
  }
  
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
    }
  }
  
  handleDisconnect(socket) {
    try {
      if (!socket.isScalableBroadcastSocket) return;
      
      const user = this.users[socket.userid];
      if (!user) return;
      
      if (!user.isInitiator) {
        this.notifyViewerCount(user.broadcastId, true);
      }
      
      if (user.isInitiator) {
        this.stopBroadcast(user.broadcastId);
        delete this.users[socket.userid];
        return;
      }
      
      if (user.source) {
        const source = this.users[user.source];
        if (source) {
          source.receivers = source.receivers.filter(r => r.id !== user.id);
        }
      }
      
      if (user.receivers.length && !user.isInitiator) {
        this.reconnectViewers(user.receivers);
      }
      
      delete this.users[socket.userid];
    } catch (e) {
      pushLogs(this.config, 'scalable-broadcast-disconnect', e);
    }
  }
  
  stopBroadcast(broadcastId) {
    for (const id in this.users) {
      const user = this.users[id];
      if (user.broadcastId === broadcastId) {
        user.socket.emit('broadcast-stopped', broadcastId);
      }
    }
  }
  
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
  
  findAvailableRelayer(broadcastId) {
    try {
      const initiator = this.users[broadcastId];
      
      if (initiator && initiator.receivers.length < this.maxRelays) {
        return initiator;
      }
      
      if (initiator && initiator.lastRelayId) {
        const lastRelay = this.users[initiator.lastRelayId];
        if (lastRelay && lastRelay.receivers.length < this.maxRelays) {
          return lastRelay;
        }
      }
      
      for (const id in this.users) {
        const user = this.users[id];
        if (user.broadcastId === broadcastId && 
            user.receivers.length < this.maxRelays && 
            user.canRelay) {
          return user;
        }
      }
      
      return initiator;
    } catch (e) {
      pushLogs(this.config, 'findAvailableRelayer', e);
      return null;
    }
  }
  
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

export default createBroadcastHandler;