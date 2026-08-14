import { describe, it, expect } from 'vitest';
import { filterAndSortSpoolsForInventory, SpoolForInventory } from '../inventory-helpers';

// Helper to create mock spools
const createMockSpool = (overrides: Partial<SpoolForInventory>): SpoolForInventory => ({
  id: 'SPL-01',
  filamentId: 'fil-1',
  initialWeightG: 1000,
  emptySpoolWeightG: 220,
  remainingWeightG: 800,
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
  filamentType: 'PLA',
  filamentColorName: 'Red',
  filamentColorHex: '#FF0000',
  filamentBrand: 'eSun',
  ...overrides,
});

describe('filterAndSortSpoolsForInventory', () => {
  const spools: SpoolForInventory[] = [
    createMockSpool({ id: 'SPL-01', remainingWeightG: 500, filamentColorName: 'Red' }),
    createMockSpool({ id: 'SPL-02', remainingWeightG: 200, filamentColorName: 'Blue' }),
    createMockSpool({ id: 'SPL-03', remainingWeightG: 700, status: 'depleted', filamentColorName: 'Green' }),
    createMockSpool({ id: 'SPL-04', remainingWeightG: 100, filamentColorName: 'Red', filamentBrand: 'Creality' }),
  ];

  it('should filter out non-active spools by default (showAllStatuses = false)', () => {
    const result = filterAndSortSpoolsForInventory(spools, {}, '', false);
    expect(result).toHaveLength(3);
    expect(result.map(s => s.id)).not.toContain('SPL-03');
  });

  it('should include non-active spools when showAllStatuses is true', () => {
    const result = filterAndSortSpoolsForInventory(spools, {}, '', true);
    expect(result).toHaveLength(4);
    expect(result.map(s => s.id)).toContain('SPL-03');
  });

  it('should filter spools by searchQuery (case-insensitive matches on id, type, color, brand)', () => {
    // Match color Red
    let result = filterAndSortSpoolsForInventory(spools, {}, 'red', false);
    expect(result).toHaveLength(2);
    expect(result.map(s => s.id)).toEqual(expect.arrayContaining(['SPL-01', 'SPL-04']));

    // Match brand Creality
    result = filterAndSortSpoolsForInventory(spools, {}, 'creality', false);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('SPL-04');
  });

  it('should put unscanned spools first and scanned spools last', () => {
    const scannedMap = {
      'SPL-01': true, // Scanned
    };

    const result = filterAndSortSpoolsForInventory(spools, scannedMap, '', false);
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('SPL-04'); // unscanned, remaining weight 100
    expect(result[1].id).toBe('SPL-02'); // unscanned, remaining weight 200
    expect(result[2].id).toBe('SPL-01'); // scanned, remaining weight 500
  });

  it('should filter by filterScanStatus = scanned', () => {
    const scannedMap = {
      'SPL-01': true,
      'SPL-04': true,
    };

    // Filter scanned active spools
    const result = filterAndSortSpoolsForInventory(spools, scannedMap, '', false, 'scanned');
    expect(result).toHaveLength(2);
    expect(result.map(s => s.id)).toEqual(expect.arrayContaining(['SPL-01', 'SPL-04']));
  });

  it('should filter by filterScanStatus = unscanned', () => {
    const scannedMap = {
      'SPL-01': true,
    };

    // Filter unscanned active spools
    // Active spools are SPL-01, SPL-02, SPL-04. Since SPL-01 is scanned, remaining active unscanned are SPL-02 and SPL-04.
    const result = filterAndSortSpoolsForInventory(spools, scannedMap, '', false, 'unscanned');
    expect(result).toHaveLength(2);
    expect(result.map(s => s.id)).toEqual(expect.arrayContaining(['SPL-02', 'SPL-04']));
  });
});
