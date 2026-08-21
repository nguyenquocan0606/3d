export interface PrinterStatusData {
  status: 'idle' | 'printing' | 'offline' | 'maintenance' | 'error';
  /** Nhiệt độ luôn là **số nguyên** — provider làm tròn tại nguồn, nơi hiển thị cứ thế mà dùng. */
  nozzleTemp: number;
  nozzleTargetTemp: number;
  bedTemp: number;
  bedTargetTemp: number;
  progress: number; // 0-100
  remainingTimeSeconds?: number;
  fileName?: string;
  errorMessage?: string;
  previewUrl?: string; // Add previewUrl as well
  materials?: Array<{
    name: string;
    color: string;
  } | null>;
  extendedInfo?: any; // To hold any additional raw data like slice_result, settings, etc.
}

export interface IPrinterProvider {
  /**
   * Initialize connection to the provider's cloud/local API or MQTT
   */
  connect(): Promise<void>;

  /**
   * Disconnect and clean up resources
   */
  disconnect(): Promise<void>;

  /**
   * Fetch the list of printers registered with this provider account
   */
  fetchPrinters(): Promise<any[]>;

  /**
   * Get the current real-time status of a printer by its provider-specific ID/Key
   */
  getStatus(printerId: string): PrinterStatusData | null;

  /**
   * Send a specific command to the printer
   */
  sendCommand(printerId: string, command: string, payload?: any): Promise<boolean>;
}
