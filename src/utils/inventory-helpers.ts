export interface SpoolForInventory {
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
  filamentType: string;
  filamentColorName: string;
  filamentColorHex: string | null;
  filamentBrand: string | null;
}

/**
 * Filters and sorts spools for the inventory check process.
 * 
 * Sizing & sorting rules:
 * 1. Filter by status: unless showAllStatuses is true, only include 'active' spools.
 * 2. Filter by scan status: 'all' (no filter), 'scanned', or 'unscanned'.
 * 3. Filter by searchQuery (matches ID, type, color, or brand case-insensitively).
 * 4. Sort logic:
 *    - Unscanned spools (scannedMap[id] is falsy) come first.
 *    - Scanned spools come last.
 *    - Within each group, sort active spools first, then sort by remainingWeightG ascending.
 */
export function filterAndSortSpoolsForInventory(
  spools: SpoolForInventory[],
  scannedMap: Record<string, boolean>,
  searchQuery: string,
  showAllStatuses: boolean,
  filterScanStatus: 'all' | 'scanned' | 'unscanned' = 'all'
): SpoolForInventory[] {
  const query = searchQuery.trim().toLowerCase();

  return spools
    .filter((spool) => {
      // 1. Filter by status
      if (!showAllStatuses && spool.status !== 'active') {
        return false;
      }

      // 2. Filter by scan status
      const isScanned = !!scannedMap[spool.id];
      if (filterScanStatus === 'scanned' && !isScanned) {
        return false;
      }
      if (filterScanStatus === 'unscanned' && isScanned) {
        return false;
      }

      // 3. Filter by search query
      if (query) {
        const matchesId = spool.id.toLowerCase().includes(query);
        const matchesType = spool.filamentType.toLowerCase().includes(query);
        const matchesColor = spool.filamentColorName.toLowerCase().includes(query);
        const matchesBrand = spool.filamentBrand
          ? spool.filamentBrand.toLowerCase().includes(query)
          : false;

        if (!matchesId && !matchesType && !matchesColor && !matchesBrand) {
          return false;
        }
      }

      return true;
    })
    .sort((a, b) => {
      const aScanned = !!scannedMap[a.id];
      const bScanned = !!scannedMap[b.id];

      // Unscanned first, scanned last
      if (aScanned !== bScanned) {
        return aScanned ? 1 : -1;
      }

      // Within the same group, active first
      const aActive = a.status === 'active';
      const bActive = b.status === 'active';
      if (aActive !== bActive) {
        return aActive ? -1 : 1;
      }

      // Then sort by remaining weight ascending
      return a.remainingWeightG - b.remainingWeightG;
    });
}
