import EventEmitter from "node:events";
import { randomUUID } from "crypto";
import IPCClient, { OPCode } from "./ipc";
import { getIPCPath } from "./ipc-path";
import type { DiscordActivity } from "./discord-rpc";

const MAX_ITER = 10;
const PID = process.pid ?? 0;
function limit(s: string, max: number, min: number) {
  if (s.length > max) return s.substring(0, max - 3) + "...";
  if (s.length < min) return s.padEnd(min, "\u200B");
  return s;
}
function sanitize(a: DiscordActivity): DiscordActivity {
  if (a.details) a.details = limit(a.details, 128, 2);
  if (a.state) a.state = limit(a.state, 128, 2);
  if (a.assets?.large_text) a.assets.large_text = limit(a.assets.large_text, 128, 2);
  if (a.assets?.small_text) a.assets.small_text = limit(a.assets.small_text, 128, 2);
  return a;
}

export default class DiscordClient extends EventEmitter {
  private clientId: string;
  private ipc = new IPCClient();
  private connected = false; private destroyed = false; private abort = false;
  private promise: Promise<void> | null = null;
  private current?: DiscordActivity; private prev: string | null = null;
  get presence() { return this.current; }
  get isConnected() { return this.connected && !this.destroyed; }
  constructor(clientId: string) { super(); this.clientId = clientId; }
  connect(): Promise<void> {
    if (this.destroyed) return Promise.reject(new Error("destroyed"));
    if (this.connected) return Promise.resolve();
    if (this.promise) return this.promise;
    this.abort = false; this.ipc.removeAllListeners();
    this.promise = new Promise(async (resolve, reject) => {
      let id = 0;
      while (id < MAX_ITER) {
        if (this.abort || this.destroyed) { this.promise = null; reject(new Error("aborted")); return; }
        try {
          await new Promise<void>((res, rej) => {
            const p = getIPCPath(id);
            this.ipc.once("close", () => { this.ipc.removeAllListeners(); rej(new Error("close")); });
            this.ipc.once("connect", () => { this.ipc.removeAllListeners(); res(); });
            this.ipc.connect(p);
          });
          if (this.abort || this.destroyed) { this.ipc.destroy(); this.promise = null; reject(new Error("aborted")); return; }
          this.connected = true;
          this.ipc.send({ v: 1, client_id: this.clientId }, OPCode.HANDSHAKE);
          this.emit("connect");
          this.ipc.on("close", () => { this.connected = false; this.emit("close"); });
          this.ipc.on("error", (e) => this.emit("error", e));
          this.ipc.on("data", (payload: { op: OPCode; json: unknown }) => { if (payload?.op === OPCode.PING) this.ipc.send(payload.json, OPCode.PONG); });
          this.promise = null; resolve(); return;
        } catch { id++; }
      }
      this.promise = null; reject(new Error("Failed to connect to Discord IPC"));
    });
    return this.promise;
  }
  close() { this.abort = true; this.promise = null; if (this.connected) { this.ipc.once("close", () => this.ipc.removeAllListeners()); this.ipc.close(); } this.connected = false; }
  destroy() { this.abort = true; this.destroyed = true; this.connected = false; this.current = undefined; this.prev = null; this.promise = null; this.removeAllListeners(); this.ipc.destroy(); }
  setActivity(a: DiscordActivity) {
    if (!this.isConnected) return;
    this.current = sanitize(a);
    try {
      this.ipc.send({ cmd: "SET_ACTIVITY", args: { pid: PID, activity: a }, nonce: randomUUID() });
      if (this.prev !== a.details) this.prev = a.details ?? null;
    } catch {}
  }
  clearActivity() {
    this.current = undefined;
    if (!this.isConnected) return;
    try { this.ipc.send({ cmd: "SET_ACTIVITY", args: { pid: PID }, nonce: randomUUID() }); } catch {}
  }
}
