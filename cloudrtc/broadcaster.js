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
  
export { createBroadcastHandler };