declare module 'discord-rpc' {
  export class Client extends EventEmitter {
    constructor(options: { transport: string });
    login(options: { clientId: string }): Promise<void>;
    setActivity(activity: {
      details?: string;
      state?: string;
      type?: number;
      largeImageKey?: string;
      largeImageText?: string;
      smallImageKey?: string;
      smallImageText?: string;
      startTimestamp?: number;
      endTimestamp?: number;
      instance?: boolean;
      buttons?: Array<{ label: string; url: string }>;
    }): Promise<void>;
    clearActivity(): Promise<void>;
    destroy(): void;
    on(event: string, listener: (...args: any[]) => void): this;
  }
}
