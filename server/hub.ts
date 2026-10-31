/**
 * Il server di gioco, indipendente dal trasporto: sessioni, stanze, il loop a tick fissi.
 */
import { ClientMessage, PROTOCOL_VERSION, type ServerMessage } from "../shared/protocol.ts"
import { TICK_RATE } from "../shared/movement.ts"
import type { NetworkId } from "./network.ts"
import { newCode, Room } from "./room.ts"

export interface Peer {
  readonly network: NetworkId
  readonly send: (data: string) => void
  id: string | null
  name: string
  room: Room | null
}

const STEP_MS = 1000 / TICK_RATE
let sessionCounter = 0

/** Il messaggio più lungo del client (un `create`) sta ben sotto: oltre è spazzatura o un attacco. */
const MESSAGE_MAX = 2048
/** Messaggi al secondo per connessione: l'input a 60 Hz e il ping, con margine. */
const MESSAGES = { perSecond: 90, burst: 180 }
/** I comandi (creare, entrare, chat, squadra, bot…): a un umano ne bastano pochi; a chi prova i codici no. */
const COMMANDS = { perSecond: 2, burst: 8 }
/** Ogni stanza ha il suo mondo fisico e fino a 14 bot: un tetto, in tutto e per rete. */
const MAX_ROOMS = 40
const MAX_ROOMS_PER_NETWORK = 6

/** Un secchio di gettoni: si riempie a `perSecond`, fino a `burst`. */
class Bucket {
  private tokens: number
  private last = performance.now()
  constructor(private readonly rate: { perSecond: number; burst: number }) {
    this.tokens = rate.burst
  }
  take() {
    const now = performance.now()
    this.tokens = Math.min(this.rate.burst, this.tokens + ((now - this.last) / 1000) * this.rate.perSecond)
    this.last = now
    if (this.tokens < 1) return false
    this.tokens -= 1
    return true
  }
}

export class Hub {
  readonly rooms = new Map<string, Room>()
  private readonly peers = new Set<Peer>()
  private readonly limits = new Map<Peer, { messages: Bucket; commands: Bucket }>()
  /** Indirizzo pubblico per i link d'invito: da PUBLIC_URL o dal primo client arrivato da fuori. */
  private publicUrl: string | null = null

  setPublicUrl(url: string) {
    if (url === this.publicUrl) return
    this.publicUrl = url
    console.log(`🌍 Indirizzo pubblico: ${url}`)
    for (const peer of this.peers) this.send(peer, { t: "public", url })
  }
  private last = performance.now()
  private acc = 0

  open(peer: Peer) {
    this.peers.add(peer)
    this.limits.set(peer, { messages: new Bucket(MESSAGES), commands: new Bucket(COMMANDS) })
    peer.id = `p${++sessionCounter}-${Math.random().toString(36).slice(2, 7)}`
  }

  private send(peer: Peer, msg: ServerMessage) {
    peer.send(JSON.stringify(msg))
  }

  message(peer: Peer, raw: string) {
    // Chi esagera perde i messaggi in più, prima di spendere CPU a leggerli.
    const limits = this.limits.get(peer)
    if (!limits || raw.length > MESSAGE_MAX || !limits.messages.take()) return
    let parsed: ReturnType<typeof ClientMessage.safeParse>
    try {
      parsed = ClientMessage.safeParse(JSON.parse(raw))
    } catch {
      return
    }
    if (!parsed.success) {
      this.send(peer, { t: "error", code: "invalid" })
      return
    }
    const msg = parsed.data
    if (msg.t !== "input" && msg.t !== "ping" && !limits.commands.take()) return
    const id = peer.id!
    const room = peer.room
    switch (msg.t) {
      case "hello":
        peer.name = msg.name
        if (msg.version !== PROTOCOL_VERSION) this.send(peer, { t: "error", code: "version" })
        this.send(peer, { t: "welcome", id, version: PROTOCOL_VERSION, publicUrl: this.publicUrl })
        return
      case "list":
        this.send(peer, { t: "rooms", rooms: this.visibleTo(peer) })
        return
      case "create": {
        const mine = [...this.rooms.values()].filter((r) => r.networkKey === peer.network.key).length
        if (this.rooms.size >= MAX_ROOMS || mine >= MAX_ROOMS_PER_NETWORK) return this.send(peer, { t: "error", code: "busy" })
        this.leave(peer)
        const code = newCode((c) => this.rooms.has(c))
        const created = new Room(code, id, peer.name || "Furlan", peer.network.key, {
          mode: msg.mode,
          map: msg.map,
          minutes: msg.minutes,
          visibility: msg.visibility,
          level: msg.level,
          ff: msg.ff
        })
        this.rooms.set(code, created)
        this.enter(peer, created, msg.primary)
        created.fillBots(msg.bots)
        this.roomChanged(created)
        console.log(`🏰 Stanza ${code} (${msg.mode} a ${msg.map}, ${msg.visibility}) di ${peer.name}`)
        return
      }
      case "join": {
        const target = this.rooms.get(msg.code)
        if (!target) return this.send(peer, { t: "error", code: "notFound" })
        if (target.settings.visibility === "lan" && target.networkKey !== peer.network.key) {
          return this.send(peer, { t: "error", code: "lanOnly" })
        }
        if (target.full && ![...target.members.values()].some((m) => m.bot)) return this.send(peer, { t: "error", code: "full" })
        this.leave(peer)
        this.enter(peer, target, msg.primary)
        this.roomChanged(target)
        return
      }
      case "leave":
        this.leave(peer)
        this.send(peer, { t: "left" })
        return
      case "ping":
        if (room) {
          const m = room.members.get(id)
          if (m && msg.rtt !== undefined) m.ping = Math.round(msg.rtt)
        }
        this.send(peer, { t: "pong", c: msg.c, tick: room?.tick ?? 0 })
        return
    }
    if (!room) return
    switch (msg.t) {
      case "input":
        room.queueInput(id, msg.i)
        return
      case "team":
        room.setTeam(id, msg.team)
        this.roomChanged(room)
        return
      case "primary":
        room.sim.primary(id, msg.p)
        return
      case "chat":
        room.chat(id, msg.text)
        return
      case "start":
        if (room.hostId === id) room.start()
        return
      case "bot":
        if (room.hostId !== id) return
        if (msg.delta > 0) room.addBot(msg.team)
        else room.removeBot(msg.team)
        this.roomChanged(room)
        return
      case "level":
        if (room.hostId !== id) return
        room.setLevel(msg.level)
        this.roomChanged(room)
        return
    }
  }

  close(peer: Peer) {
    this.peers.delete(peer)
    this.limits.delete(peer)
    this.leave(peer)
  }

  private enter(peer: Peer, room: Room, primary: Parameters<Room["addHuman"]>[2]) {
    const ok = room.addHuman(peer.id!, peer.name || "Furlan", primary, (m) => this.send(peer, m))
    if (!ok) return this.send(peer, { t: "error", code: "full" })
    peer.room = room
    this.send(peer, { t: "joined", room: room.info(), you: peer.id!, tick: room.tick })
  }

  private leave(peer: Peer) {
    const room = peer.room
    if (!room) return
    peer.room = null
    room.removeMember(peer.id!)
    if (room.humans.length === 0) {
      this.rooms.delete(room.code)
      console.log(`🕯️  Stanza ${room.code} chiusa`)
    } else this.roomChanged(room)
  }

  private roomChanged(room: Room) {
    room.broadcast({ t: "room", room: room.info() })
  }

  private visibleTo(peer: Peer) {
    return [...this.rooms.values()].filter((r) => r.settings.visibility === "lan" && r.networkKey === peer.network.key).map((r) => r.summary())
  }

  /** Nessuno connesso e nessuna stanza: il loop si può fermare (su Cloudflare l'oggetto va a dormire). */
  get idle() {
    return this.peers.size === 0 && this.rooms.size === 0
  }

  /** Da chiamare spesso: avanza le stanze di quanti tick sono maturati. */
  update() {
    const now = performance.now()
    this.acc += Math.min(250, now - this.last)
    this.last = now
    let steps = 0
    while (this.acc >= STEP_MS && steps < 5) {
      this.acc -= STEP_MS
      steps++
      for (const room of this.rooms.values()) {
        try {
          room.step()
        } catch (error) {
          console.error(`Stanza ${room.code}:`, error)
        }
      }
    }
  }
}
