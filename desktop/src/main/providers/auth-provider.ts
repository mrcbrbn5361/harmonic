// ytmdesktop2/src/main/trpc/routers/auth uyarlaması — Harmonic tasarımıyla
import { randomUUID } from 'crypto';
import Store from 'electron-store';
// Token'lar sürelidir (bk. ANALIZ-RAPORU S-01): süresiz token + renderer'a sızıntı kapatıldı.
export const CLIENT_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 90; // 90 gün
interface Client { appId:string; appName:string; appVersion?:string; token:string; createdAt:number; expiresAt:number; }
export interface PublicClient { appId:string; appName:string; appVersion?:string; createdAt:number; expiresAt:number; }
const store = new Store<{clients: Client[], pending:any[]}>({ name:'harmonic-auth-clients', defaults:{ clients:[], pending:[] }});
export class AuthProvider {
  constructor() { this.migrateLegacy(); }
  // Eski kayıtlarda expiresAt yok → createdAt + TTL ile doldur (yoksa createdAt).
  private migrateLegacy(): void {
    try {
      const list = this.listClients();
      let dirty = false;
      for (const c of list) {
        if (typeof (c as Partial<Client>).expiresAt !== 'number') {
          c.expiresAt = (c.createdAt || Date.now()) + CLIENT_TOKEN_TTL_MS;
          dirty = true;
        }
      }
      if (dirty) store.set('clients', list);
    } catch {}
  }
  listClients(): Client[] { return store.get('clients')||[]; }
  // Renderer'a token içermeyen görünüm verilir — gizli alan sızıntısı yok.
  listPublicClients(): PublicClient[] {
    return this.listClients().map(({appId,appName,appVersion,createdAt,expiresAt}) => ({appId,appName,appVersion,createdAt,expiresAt}));
  }
  createManual(input:{appId:string;appName:string;appVersion?:string}): Client {
    const now = Date.now();
    const c:Client={ appId:input.appId, appName:input.appName, appVersion:input.appVersion, token:randomUUID(), createdAt:now, expiresAt:now+CLIENT_TOKEN_TTL_MS };
    const list=this.listClients(); list.push(c); store.set('clients', list); return c;
  }
  revoke(appId:string){ const f=this.listClients().filter(c=>c.appId!==appId); store.set('clients',f); return true; }
  getToken(appId:string){ return this.listClients().find(c=>c.appId===appId)?.token||null; }
  isValid(token:string){
    const c=this.listClients().find(c=>c.token===token);
    if (!c) return false;
    if (c.expiresAt <= Date.now()) { this.purgeExpired(); return false; }
    return true;
  }
  purgeExpired(): number {
    const list=this.listClients(); const alive=list.filter(c=>c.expiresAt>Date.now());
    if (alive.length!==list.length) store.set('clients',alive);
    return list.length-alive.length;
  }
}
export const authProvider = new AuthProvider();
