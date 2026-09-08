import { existsSync } from "node:fs";
const PACKAGED = ["snap.discord","snap.discord-ptb","snap.discord-canary","app/com.discordapp.Discord","app/com.discordapp.DiscordPTB","app/com.discordapp.DiscordCanary"] as const;
export function linuxRuntimePrefix(dir: string): string { return dir.replace(/\/$/, "").replace(/\/snap\.[^/]+$/, "").replace(/\/app\/[^/]+$/, ""); }
export function linuxIpcCandidates(prefix: string, id: number): string[] { return [`${prefix}/discord-ipc-${id}`, ...PACKAGED.map((d) => `${prefix}/${d}/discord-ipc-${id}`)]; }
export function pickExistingIpcPath(c: string[], exists: (p: string) => boolean): string { return c.find((p) => exists(p)) ?? c[0]; }
export function getIPCPath(id: number, exists: (p: string) => boolean = existsSync): string {
  if (process.platform === "win32") return `\\\\?\\pipe\\discord-ipc-${id}`;
  const dirty = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || "/tmp";
  return pickExistingIpcPath(linuxIpcCandidates(linuxRuntimePrefix(dirty), id), exists);
}
