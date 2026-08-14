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
}

export interface Printer {
  id: string;
  name: string;
  model: string | null;
  status: string;
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
