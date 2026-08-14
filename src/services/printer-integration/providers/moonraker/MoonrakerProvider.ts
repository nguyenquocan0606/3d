import { IPrinterProvider, PrinterStatusData } from '../../types';

export class MoonrakerProvider implements IPrinterProvider {
  private url: string;
  private printerStatuses: Map<string, PrinterStatusData> = new Map();
  private pollingInterval: NodeJS.Timeout | null = null;
  // true sau khi disconnect() — chặn connect() đang chạy dở khởi động polling mồ côi
  private isStopped = false;
  private activePrinters: string[] = [];

  constructor(url: string) {
    this.url = url.replace(/\/$/, ''); // Remove trailing slash
  }

  async connect(): Promise<void> {
    console.log(`[MoonrakerProvider] Connecting to Moonraker at ${this.url}`);
    this.isStopped = false;
    try {
      const res = await fetch(`${this.url}/printer/info`);
      if (!res.ok) {
        throw new Error(`Failed to connect to Moonraker: ${res.statusText}`);
      }

      console.log(`[MoonrakerProvider] Successfully connected to Moonraker`);
      await this.fetchPrinters();

      // Nếu đã bị disconnect trong lúc chờ fetch (bị provider mới đè) → không start polling
      if (this.isStopped) {
        console.log('[MoonrakerProvider] Connect finished after disconnect — skip polling.');
        return;
      }
      this.startPolling();
    } catch (error) {
      console.error('[MoonrakerProvider] Connection error:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.isStopped = true;
    this.stopPolling();
    console.log('[MoonrakerProvider] Disconnected');
  }

  async fetchPrinters(): Promise<any[]> {
    try {
      const res = await fetch(`${this.url}/machine/system_info`);
      if (!res.ok) {
        throw new Error(`Failed to fetch system info: ${res.statusText}`);
      }

      const data = await res.json();
      const hostname = data.result?.system_info?.network?.hostname || 'moonraker-klipper';
      
      const printer = {
        id: hostname,
        name: `Moonraker (${hostname})`,
        model: 'Klipper Printer'
      };

      this.activePrinters = [hostname];
      return [printer];
    } catch (error) {
      console.error('[MoonrakerProvider] Error fetching printers:', error);
      // Fallback
      this.activePrinters = ['moonraker'];
      return [{ id: 'moonraker', name: 'Moonraker Printer', model: 'Klipper Printer' }];
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- chữ ký theo IPrinterProvider; Moonraker chỉ có 1 máy in/URL
  getStatus(printerId: string): PrinterStatusData | null {
    // For Moonraker, there is only one printer per IP, so we can ignore the printerId if it doesn't match perfectly,
    // but typically it will match what we returned in fetchPrinters.
    return this.printerStatuses.get(this.activePrinters[0]) || null;
  }

  async sendCommand(printerId: string, command: string, payload?: any): Promise<boolean> {
    try {
      let endpoint = '';
      const method = 'POST';
      let body: any = null;

      if (command === 'pause') endpoint = '/printer/print/pause';
      else if (command === 'resume') endpoint = '/printer/print/resume';
      else if (command === 'stop') endpoint = '/printer/print/cancel';
      else if (command === 'temp-nozzle') {
        const temp = payload?.target || 0;
        endpoint = `/printer/gcode/script?script=M104 S${temp}`;
      }
      else if (command === 'temp-bed') {
        const temp = payload?.target || 0;
        endpoint = `/printer/gcode/script?script=M140 S${temp}`;
      }
      else if (command === 'fan') {
        const speedPct = payload?.speed || 0;
        const speedVal = Math.round((speedPct / 100) * 255);
        endpoint = `/printer/gcode/script?script=M106 S${speedVal}`;
      }
      else if (command === 'light') {
        const turnOn = payload?.on;
        // KX-Bridge specific endpoint for light
        endpoint = '/api/light';
        body = {
          type: 3,
          status: turnOn ? 1 : 0,
          brightness: turnOn ? 100 : 0
        };
      }

      if (endpoint) {
        const fetchOptions: RequestInit = { method };
        if (body) {
          fetchOptions.headers = { 'Content-Type': 'application/json' };
          fetchOptions.body = JSON.stringify(body);
        }
        
        const res = await fetch(`${this.url}${endpoint}`, fetchOptions);
        
        if (!res.ok) {
          const text = await res.text();
          console.error(`[MoonrakerProvider] Command ${command} failed with ${res.status}: ${text}`);
          return false;
        }
        return true;
      }
      
      console.log(`[MoonrakerProvider] Command ${command} not supported yet.`);
      return false;
    } catch (e) {
      console.error(`[MoonrakerProvider] Error sending command ${command}:`, e);
      return false;
    }
  }

  private startPolling() {
    this.stopPolling();
    // Poll every 5 seconds
    this.pollingInterval = setInterval(() => this.pollStatus(), 5000);
  }

  private stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private async pollStatus() {
    if (this.activePrinters.length === 0) return;
    const printerId = this.activePrinters[0];
    
    try {
      const res = await fetch(`${this.url}/printer/objects/query?print_stats&extruder&heater_bed&display_status`);
      if (res.ok) {
        const data = await res.json();
        this.updatePrinterStatus(printerId, data);
      }
    } catch (error) {
      console.error(`[MoonrakerProvider] Error polling status:`, error);
    }
  }

  private updatePrinterStatus(printerId: string, payload: any) {
    const statusData = payload.result?.status;
    if (!statusData) return;

    let mappedStatus: 'idle' | 'printing' | 'offline' | 'maintenance' | 'error' = 'idle';
    const rawState = statusData.print_stats?.state; // "standby", "printing", "paused", "error", "complete"

    if (rawState === 'printing') mappedStatus = 'printing';
    else if (rawState === 'paused' || rawState === 'error') mappedStatus = 'error';
    else if (rawState === 'standby' || rawState === 'complete') mappedStatus = 'idle';
    else mappedStatus = 'offline';

    const progress = statusData.display_status?.progress || 0; // 0.0 to 1.0
    const printDuration = statusData.print_stats?.print_duration || 0;
    
    // Estimate remaining time naively if possible
    let remainingTimeSeconds = 0;
    if (progress > 0 && mappedStatus === 'printing') {
      remainingTimeSeconds = Math.round((printDuration / progress) - printDuration);
    }

    const fileName = statusData.print_stats?.filename;
    
    // Attempt to fetch thumbnail if filename is available and printing/paused
    let previewUrl: string | undefined;
    if (fileName && (mappedStatus === 'printing' || mappedStatus === 'error')) {
      // Async metadata fetch (non-blocking for this update, but we'll fetch it and store it)
      // To avoid spamming, only fetch if we don't have it or if filename changed
      const current = this.printerStatuses.get(printerId);
      if (current && current.fileName === fileName && current.previewUrl) {
        previewUrl = current.previewUrl;
      } else {
        this.fetchThumbnail(fileName, printerId).catch(() => {});
      }
    }

    const currentStatus: PrinterStatusData = {
      status: mappedStatus,
      nozzleTemp: statusData.extruder?.temperature || 0,
      nozzleTargetTemp: statusData.extruder?.target || 0,
      bedTemp: statusData.heater_bed?.temperature || 0,
      bedTargetTemp: statusData.heater_bed?.target || 0,
      progress: Math.round(progress * 100),
      remainingTimeSeconds,
      fileName: fileName || undefined,
      previewUrl,
      materials: [],
      extendedInfo: {
        provider: 'moonraker',
        payload: payload
      }
    };

    // If we have a previewUrl pending or cached, keep it
    const existing = this.printerStatuses.get(printerId);
    if (existing && existing.fileName === fileName && existing.previewUrl && !currentStatus.previewUrl) {
      currentStatus.previewUrl = existing.previewUrl;
    }

    this.printerStatuses.set(printerId, currentStatus);
  }

  private async fetchThumbnail(fileName: string, printerId: string) {
    try {
      const res = await fetch(`${this.url}/server/files/metadata?filename=${encodeURIComponent(fileName)}`);
      if (res.ok) {
        const data = await res.json();
        const thumbnails = data.result?.thumbnails;
        if (thumbnails && thumbnails.length > 0) {
          // Find the largest thumbnail or just use the first one
          const thumb = thumbnails.reduce((prev: any, current: any) => (prev.width > current.width) ? prev : current);
          const previewUrl = `${this.url}/server/files/gcodes/${thumb.relative_path}`;
          
          const currentStatus = this.printerStatuses.get(printerId);
          if (currentStatus && currentStatus.fileName === fileName) {
            currentStatus.previewUrl = previewUrl;
            this.printerStatuses.set(printerId, currentStatus);
          }
        }
      }
    } catch (e) {
      console.error('[MoonrakerProvider] Error fetching thumbnail:', e);
    }
  }
}
