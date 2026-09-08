// ytmdesktop2/src/main/trpc/routers/auth uyarlaması — Harmonic tasarımıyla
import { randomUUID } from 'crypto';
import Store from 'electron-store';
interface Client { appId:string; appName:string; appVersion?:string; token:string; createdAt:number; }
const store = new Store<{clients: Client[], pending:any[]}>({ name:'harmonic-auth-clients', defaults:{ clients:[], pending:[] }});
export class AuthProvider {
  listClients(): Client[] { return store.get('clients')||[]; }
  createManual(input:{appId:string;appName:string;appVersion?:string}): Client {
    const c:Client={ appId:input.appId, appName:input.appName, appVersion:input.appVersion, token:randomUUID(), createdAt:Date.now()};
    const list=this.listClients(); list.push(c); store.set('clients', list); return c;
  }
  revoke(appId:string){ const f=this.listClients().filter(c=>c.appId!==appId); store.set('clients',f); return true; }
  getToken(appId:string){ return this.listClients().find(c=>c.appId===appId)?.token||null; }
  isValid(token:string){ return this.listClients().some(c=>c.token===token); }
}
export const authProvider = new AuthProvider();
