'use strict'

// const {waterfall} = require('async')
const RPC = require('./rpc')
const debug = require('debug')
const log = debug('libp2p:rendezvous:server')
const AsyncQueue = require('./queue')
const MAX_LIMIT = 200 // TODO: spec this

class NS {
  constructor (name, que) { // name is a utf8 string
    this.name = name
    this.hexName = Buffer.from(name).toString('hex') // needed to prevent queue-dos attacks
    this.que = que
    this.id = {}
    this.sorted = []
  }
  addPeer (pi, ts, ttl) {
    const id = pi.id.toB58String()
    this.id[id] = {pi, ts, ttl} // TODO: add TTL support
    this.update()
  }
  removePeer (pid) {
    delete this.id[pid]
    this.update()
  }
  update () {
    this.que.add(this.hexName + '/sort', () => {
      this.sorted = Object.keys(this.id).map(id => { return {id, ts: this.id[id].ts} }).sort((a, b) => a.ts - b.ts)
    })
  }
  getPeers (since, limit, ownId) {
    if (limit <= 0 || limit > MAX_LIMIT) limit = MAX_LIMIT
    return this.sorted.filter(p => p.ts >= since && p.id !== ownId).slice(0, limit).map(p => this.id[p.id])
  }
}

class Server {
  constructor (opt) {
    if (!opt) opt = {}
    this.node = opt.node
    this.config = opt.config
    this.que = new AsyncQueue()
    this.table = {
      NS: {},
      RPC: {}
    }
    this._stubNS = new NS('', this.que)
  }

  start () {
    this.node.handle('/rendezvous/1.0.0', (proto, conn) => {
      const rpc = new RPC(this)
      rpc.setup(conn, err => {
        if (err) return log(err)
        this.storeRPC(rpc)
      })
    })
  }

  stop () {
    // TODO: clear vars, shutdown conns, etc.
    this.node.unhandle('/rendezvous/1.0.0')
  }

  storeRPC (rpc) {
    // TODO: should a peer that's connected twice be overriden or rejected?
    this.table.RPC[rpc.id] = rpc
    // TODO: remove on disconnect
  }

  getNS (name, create) { // TODO: remove NSs that get empty
    if (!this.table.NS[name]) {
      if (create) {
        return (this.table.NS[name] = new NS(name, this.que))
      } else {
        return this._stubNS
      }
    }
    return this.table.NS[name]
  }
}

module.exports = Server
