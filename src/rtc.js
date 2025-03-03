import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import Turn from 'node-turn'
import dgram from 'dgram'
class RoomManager {
    constructor() {
      this.rooms = new Map()       // roomName -> Set(userIds)
      this.userRooms = new Map()   // userId -> Set(roomNames)
    }
  
    join(room, userId) {
      if (!this.rooms.has(room)) {
        this.rooms.set(room, new Set())
      }
      this.rooms.get(room).add(userId)
  
      if (!this.userRooms.has(userId)) {
        this.userRooms.set(userId, new Set())
      }
      this.userRooms.get(userId).add(room)
    }
  
    leave(room, userId) {
      if (this.rooms.has(room)) {
        this.rooms.get(room).delete(userId)
        if (this.rooms.get(room).size === 0) {
          this.rooms.delete(room)
        }
      }
  
      if (this.userRooms.has(userId)) {
        this.userRooms.get(userId).delete(room)
        if (this.userRooms.get(userId).size === 0) {
          this.userRooms.delete(userId)
        }
      }
    }
  
    leaveAll(userId) {
      if (this.userRooms.has(userId)) {
        this.userRooms.get(userId).forEach(room => {
          this.leave(room, userId)
        })
      }
    }
  
    getUsers(room) {
      return this.rooms.get(room) || new Set()
    }
  }
class PM {
  constructor() {
    this.m = new Map()
  }
  add(id, ws) {
    this.m.set(id, ws)
  }
  get(id) {
    return this.m.get(id)
  }
  rem(id) {
    this.m.delete(id)
  }
}

class SS {
    constructor(srv, pm, rm) {  // Añade RoomManager
      this.ws = new WebSocketServer({ server: srv })
      this.pm = pm
      this.rm = rm  // RoomManager
      this.init()
    }
  
    init() {
      this.ws.on('connection', (ws, req) => {
        let id = new URL(req.url, `http://${req.headers.host}`).searchParams.get('id')
        if (!id) return ws.close()
        
        this.pm.add(id, ws)
        ws.on('message', d => this.hMsg(id, d))
        ws.on('close', () => {
          this.pm.rem(id)
          this.rm.leaveAll(id)  // Limpiar salas al desconectar
        })
      })
    }
  
    hMsg(fr, d) {
      try {
        let msg = JSON.parse(d)
        
        // Manejar mensajes de sala
        if (msg.type === 'join-room') {
          this.rm.join(msg.room, fr)
          this.notifyRoomMembers(msg.room, fr)
        } 
        else if (msg.type === 'leave-room') {
          this.rm.leave(msg.room, fr)
        }
        else if (msg.type === 'room-message') {
          this.broadcastToRoom(msg.room, fr, msg.data)
        }
        // Mensaje directo existente
        else if (msg.to) {
          let to = this.pm.get(msg.to)
          if (to) to.send(JSON.stringify({ ...msg, from: fr }))
        }
      } catch (e) {}
    }
  
    broadcastToRoom(room, from, data) {
      this.rm.getUsers(room).forEach(userId => {
        if (userId !== from) {
          const ws = this.pm.get(userId)
          if (ws) ws.send(JSON.stringify({
            type: 'room-message',
            room,
            data,
            from
          }))
        }
      })
    }
  
    notifyRoomMembers(room, newUser) {
      this.rm.getUsers(room).forEach(userId => {
        if (userId !== newUser) {
          const ws = this.pm.get(userId)
          if (ws) ws.send(JSON.stringify({
            type: 'user-joined',
            room,
            user: newUser
          }))
        }
      })
    }
  }

class TS {
  constructor(cfg) {
    this.s = new Turn(cfg)
  }
  start() {
    this.s.start()
  }
}

class STS {
  constructor(p) {
    this.p = p || 0 // 3478 is default port
    this.s = dgram.createSocket('udp4')
    this.s.on('message', (m, r) => this.hMsg(m, r))
  }
  hMsg(m, r) {
    if (m.length < 20) return
    let t = m.readUInt16BE(0)
    if (t !== 0x0001) return
    let tid = m.slice(8, 20)
    let ck = 0x2112A442
    let mp = r.port ^ (ck >> 16)
    let ipA = r.address.split('.').map(n => parseInt(n))
    let mip = Buffer.alloc(4)
    for (let i = 0; i < 4; i++) mip[i] = ipA[i] ^ ((ck >> ((3 - i) * 8)) & 0xff)
    let attr = Buffer.alloc(12)
    attr.writeUInt16BE(0x0020, 0)
    attr.writeUInt16BE(8, 2)
    attr.writeUInt8(0, 4)
    attr.writeUInt8(0x01, 5)
    attr.writeUInt16BE(mp, 6)
    mip.copy(attr, 8)
    let res = Buffer.alloc(20 + attr.length)
    res.writeUInt16BE(0x0101, 0)
    res.writeUInt16BE(attr.length, 2)
    res.writeUInt32BE(ck, 4)
    tid.copy(res, 8)
    attr.copy(res, 20)
    this.s.send(res, r.port, r.address)
  }
  start() {
    this.s.bind(this.p)
  }
}

class RTCLib {
    constructor(p) {
        this.p = Number(p) ? Number(p) : 0
        this.ex = express()
        this.srv = createServer(this.ex)
        this.pm = new PM()
        this.rm = new RoomManager()  // <-- Añade esto
        this.ss = new SS(this.srv, this.pm, this.rm)  // Pasa RoomManager
        this.ts = new TS({
          authMech: 'long-term',
          credentials: { usr: 'pwd' },
          listeningPort: p
        })
        this.sts = new STS(p)
      }
  
    start(p) {
      this.ex.use(cors())
  
      this.ex.use(helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"], // O puedes usar hashes o nonces
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'", "wss:"], // Permitir WebSockets
            frameAncestors: ["'none'"], // Evitar embedding en iframes
            upgradeInsecureRequests: [],
          },
        },
      }))
  
      this.ex.use(express.static('public')) // Servir archivos estáticos
  
      this.srv.listen(p, () => console.log('Servidor corriendo en puerto:', p))
      this.ts.start()
      this.sts.start()
    }
  }

export const rtc = new RTCLib(0)
