import { IPrinterProvider, PrinterStatusData } from './types';
import prisma from '@/utils/db';
import { BambuLabProvider } from './providers/bambulab';
import { MoonrakerProvider } from './providers/moonraker';

class PrinterManager {
  private providers: Map<string, IPrinterProvider> = new Map();
  // Mutex chống race: các lời gọi getProviderAsync đồng thời cho cùng account
  // chia sẻ chung 1 promise khởi tạo
  private initPromises: Map<string, Promise<IPrinterProvider | undefined>> = new Map();

  /**
   * Register a provider instance for a specific cloud account
   * @param accountId CloudAccount ID from DB
   * @param provider Provider instance (e.g., BambuLabProvider)
   */
  registerProvider(accountId: string, provider: IPrinterProvider) {
    const oldProvider = this.providers.get(accountId);
    if (oldProvider) {
      oldProvider.disconnect().catch(() => {});
    }
    this.providers.set(accountId, provider);
  }

  getProvider(accountId: string): IPrinterProvider | undefined {
    return this.providers.get(accountId);
  }

  removeProvider(accountId: string) {
    const oldProvider = this.providers.get(accountId);
    if (oldProvider) {
      oldProvider.disconnect().catch(() => {});
      this.providers.delete(accountId);
    }
  }

  /**
   * Connect all registered providers
   */
  async connectAll() {
    for (const [id, provider] of this.providers.entries()) {
      try {
        await provider.connect();
        console.log(`Provider connected for account: ${id}`);
      } catch (error: any) {
        console.error(`Failed to connect provider for account: ${id}`, error);
        if (error?.message?.includes('Not authorized') || error?.code === 5) {
          await prisma.cloudAccount.update({ where: { id }, data: { isActive: false } }).catch(() => {});
        }
      }
    }
  }

  /**
   * Disconnect all providers
   */
  async disconnectAll() {
    for (const provider of this.providers.values()) {
      await provider.disconnect();
    }
    this.providers.clear();
  }

  /**
   * Tự động khởi tạo provider nếu server vừa restart.
   * Có mutex (initPromises): nhiều request đồng thời cùng accountId chỉ khởi tạo
   * DUY NHẤT 1 provider — tránh tạo/đè provider liên tục và leak interval polling.
   */
  async getProviderAsync(accountId: string): Promise<IPrinterProvider | undefined> {
    if (this.providers.has(accountId)) {
      return this.providers.get(accountId);
    }

    const inFlight = this.initPromises.get(accountId);
    if (inFlight) {
      return inFlight;
    }

    const initPromise = this.initProvider(accountId).finally(() => {
      this.initPromises.delete(accountId);
    });
    this.initPromises.set(accountId, initPromise);
    return initPromise;
  }

  private async initProvider(accountId: string): Promise<IPrinterProvider | undefined> {
    // Lazy load từ DB (do Next.js server bị restart)
    const account = await prisma.cloudAccount.findUnique({ where: { id: accountId } });
    if (account) {
      let provider: IPrinterProvider | undefined;

      if (account.provider === 'bambulab') {
        // For HA integration, email field holds the HA URL and token holds the Long-Lived Access Token.
        const url = account.email || 'http://192.168.99.166:8123';
        provider = new BambuLabProvider(url, account.token);
      } else if (account.provider === 'moonraker') {
        const url = account.email || 'http://127.0.0.1:7125';
        provider = new MoonrakerProvider(url);
      }

      if (provider) {
        this.registerProvider(accountId, provider);
        try {
          await provider.connect();
        } catch (error: any) {
          if (error?.message?.includes('Not authorized') || error?.code === 5 || error?.message?.includes('Failed to connect')) {
            await prisma.cloudAccount.update({ where: { id: accountId }, data: { isActive: false } }).catch(() => {});
          }
        }
        return provider;
      }
    }
    return undefined;
  }

  /**
   * Helper to get status across providers if we know the accountId
   */
  async getStatusAsync(accountId: string, printerId: string): Promise<PrinterStatusData | null> {
    const provider = await this.getProviderAsync(accountId);
    if (!provider) return null;
    return provider.getStatus(printerId);
  }

  async sendCommandAsync(accountId: string, printerId: string, command: string, payload?: any): Promise<boolean> {
    // Lazy-load provider nếu server vừa restart (giống getStatusAsync)
    const provider = await this.getProviderAsync(accountId);
    if (!provider) {
      console.warn(`[PrinterManager] No provider found for account ${accountId}`);
      return false;
    }
    
    // We expect providers to implement an optional sendCommand
    if (typeof (provider as any).sendCommand === 'function') {
      return await (provider as any).sendCommand(printerId, command, payload);
    }
    
    console.warn(`[PrinterManager] Provider ${accountId} does not support sendCommand`);
    return false;
  }

  async setFilamentAsync(
    accountId: string, 
    printerId: string, 
    amsId: number, 
    trayId: number, 
    type: string,
    colorHex: string
  ): Promise<boolean> {
    // Lazy-load provider nếu server vừa restart (giống getStatusAsync)
    const provider = await this.getProviderAsync(accountId);
    if (!provider) {
      console.warn(`[PrinterManager] No provider found for account ${accountId}`);
      return false;
    }

    if (typeof (provider as any).setFilament === 'function') {
      return await (provider as any).setFilament(printerId, amsId, trayId, type, colorHex);
    }

    console.warn(`[PrinterManager] Provider ${accountId} does not support setFilament`);
    return false;
  }
  
  getStatus(accountId: string, printerId: string): PrinterStatusData | null {
    const provider = this.providers.get(accountId);
    if (!provider) return null;
    return provider.getStatus(printerId);
  }
}

const createPrinterManager = () => new PrinterManager();

declare global {
  var printerManagerGlobal: undefined | PrinterManager;
}

// Tái sử dụng instance qua globalThis để không mất provider (và không leak
// setInterval polling mồ côi) mỗi lần Next.js hot-reload trong dev mode.
export const printerManager = globalThis.printerManagerGlobal ?? createPrinterManager();

if (process.env.NODE_ENV !== 'production') {
  globalThis.printerManagerGlobal = printerManager;
}
