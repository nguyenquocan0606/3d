export interface FilamentInput {
  type: string;
  colorName: string;
  colorHex?: string;
  brand?: string;
}

export interface SpoolInput {
  id: string; // Custom ID inputted by user
  filamentId: string;
  locationId?: string;
  printerId?: string;
  initialWeightG: number;
  emptySpoolWeightG?: number;
  remainingWeightG: number;
  status?: 'active' | 'depleted' | 'archived';
}

export interface PrinterInput {
  id: string;
  name: string;
  model?: string;
  status?: 'idle' | 'printing' | 'maintenance';
  /** Kết nối LAN trực tiếp tới máy Bambu. Bỏ trống cả ba thì máy chỉ đọc được qua Home Assistant. */
  lanIp?: string | null;
  lanAccessCode?: string | null;
  lanSerial?: string | null;
  /** ID máy in phía Home Assistant (tiền tố entity) — cũng là khóa tra cứu của provider. */
  cloudPrinterId?: string | null;
}

export interface Printer {
  id: string;
  name: string;
  model: string | null;
  status: string;
  lanIp?: string | null;
  lanSerial?: string | null;
  cloudPrinterId?: string | null;
  /** Có Access Code đã lưu hay chưa. **Không bao giờ trả chính mã đó về client.** */
  coAccessCode?: boolean;
  spools?: Spool[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SpoolUnifiedInput {
  id: string;
  filamentId?: string;
  locationId?: string;
  type?: string;
  colorName?: string;
  colorHex?: string;
  brand?: string;
  printerId?: string;
  initialWeightG: number;
  emptySpoolWeightG?: number;
  remainingWeightG: number;
  status?: 'active' | 'depleted' | 'archived';
}

export interface SpoolUpdateWeightInput {
  spoolId: string;
  remainingWeightG: number;
}

export interface Filament {
  id: string;
  type: string;
  colorName: string;
  colorHex: string | null;
  brand: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Spool {
  id: string;
  filamentId: string;
  locationId?: string | null;
  location?: any;
  printerId?: string | null;
  printer?: any;
  initialWeightG: number;
  emptySpoolWeightG: number;
  remainingWeightG: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FilamentWithSpools extends Filament {
  spools: Spool[];
}

export interface DashboardStats {
  totalSpools: number;
  activeSpools: number;
  depletedSpools: number;
  lowSpools: number;
  totalRemainingWeightG: number;
  spoolsByMaterialType: Record<string, number>;
  spoolsByColor: Record<string, number>;
}
