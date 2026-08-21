import { describe, expect, it } from 'vitest';

import { HaBackup } from '../printer-integration/providers/bambu/ha-backup';

/**
 * Số hiệu cụm AMS trong ha-bambulab lấy theo ID máy in báo về, không phải đếm từ 1: A1/P1S ở kho ra
 * `ams_1` nhưng A2L ra `ams_17`, còn A1_2 không lắp AMS nên chỉ có cuộn ngoài. Bản cũ dò cứng
 * `ams_1` nên hai máy sau mất sạch màu. Fixture dưới đây chép đúng ba dạng entity đó.
 */

/** Dựng entity trạng thái HA tối giản. */
function ent(entity_id: string, state: string, color?: string) {
  return { entity_id, state, attributes: color ? { color } : {} };
}

/** Các entity tối thiểu để updatePrinterStatus() chạy được, chưa có nhựa. */
function mayIn(prefix: string) {
  return [ent(`sensor.${prefix}_print_status`, 'RUNNING')];
}

type Nhua = { name: string; color: string } | null;

/** Cửa sổ nhìn vào phần private — test đi thẳng vào hàm phân tích một máy. */
type HaNoiBo = { doc(prefix: string, states: unknown[]): { khay: Nhua[] } };

/** Chạy bộ đọc HA trên một mớ state giả và trả về mảng khay. */
function docMaterials(prefix: string, states: ReturnType<typeof ent>[]): Nhua[] {
  const ha = new HaBackup('http://ha.local', 'token') as unknown as HaNoiBo;
  return ha.doc(prefix, states).khay;
}

describe('Đường backup Home Assistant — đọc màu nhựa AMS', () => {
  it('cụm AMS đánh số khác 1 vẫn ra đủ 4 khay (A2L → ams_17)', () => {
    const p = 'a2l_26a19a01b672201572';
    const materials = docMaterials(p, [
      ...mayIn(p),
      ent(`sensor.${p}_ams_17_tray_1`, 'Generic PETG', '#FFF144FF'),
      ent(`sensor.${p}_ams_17_tray_2`, 'Bambu PETG Basic', '#4F2C1DFF'),
      ent(`sensor.${p}_ams_17_tray_3`, 'Bambu PETG Basic', '#D6001CFF'),
      ent(`sensor.${p}_ams_17_tray_4`, 'Generic PETG', '#057748FF'),
      ent(`sensor.${p}_externalspool_external_spool`, 'Empty', '#00000000'),
    ]);

    expect(materials).toEqual([
      { name: 'Generic PETG', color: '#FFF144' },
      { name: 'Bambu PETG Basic', color: '#4F2C1D' },
      { name: 'Bambu PETG Basic', color: '#D6001C' },
      { name: 'Generic PETG', color: '#057748' },
    ]);
  });

  it('máy không lắp AMS thì lấy cuộn ngoài làm khay 1 (A1_2)', () => {
    const p = 'a1_039299660300203';
    const materials = docMaterials(p, [
      ...mayIn(p),
      ent(`sensor.${p}_externalspool_external_spool`, 'Generic PETG', '#FFFFFFFF'),
    ]);

    expect(materials).toEqual([{ name: 'Generic PETG', color: '#FFFFFF' }]);
  });

  it('máy có AMS thì bỏ qua cuộn ngoài để số khay không lệch', () => {
    const p = 'p1s_1';
    const materials = docMaterials(p, [
      ...mayIn(p),
      ent(`sensor.${p}_ams_1_tray_1`, 'Generic PETG', '#FFF144FF'),
      ent(`sensor.${p}_externalspool_external_spool`, 'Generic PETG', '#46A8F9FF'),
    ]);

    expect(materials).toEqual([{ name: 'Generic PETG', color: '#FFF144' }]);
  });

  it('khay rỗng giữ chỗ bằng null để không dồn slot', () => {
    const p = 'a1_03900d611509363';
    const materials = docMaterials(p, [
      ...mayIn(p),
      ent(`sensor.${p}_ams_1_tray_1`, 'Generic PETG', '#C52C18FF'),
      ent(`sensor.${p}_ams_1_tray_2`, 'Empty', '#00000000'),
      ent(`sensor.${p}_ams_1_tray_3`, 'unavailable'),
      ent(`sensor.${p}_ams_1_tray_4`, 'Generic PETG', '#FFFFFFFF'),
    ]);

    expect(materials).toEqual([
      { name: 'Generic PETG', color: '#C52C18' },
      null,
      null,
      { name: 'Generic PETG', color: '#FFFFFF' },
    ]);
  });

  it('nhiều cụm AMS được trải phẳng theo thứ tự cụm rồi tới khay', () => {
    const p = 'x1c_1';
    const materials = docMaterials(p, [
      ...mayIn(p),
      // Cố tình để lộn xộn: cụm 2 đứng trước cụm 1 trong danh sách trả về của HA
      ent(`sensor.${p}_ams_2_tray_1`, 'PLA C', '#333333FF'),
      ent(`sensor.${p}_ams_1_tray_2`, 'PLA B', '#222222FF'),
      ent(`sensor.${p}_ams_1_tray_1`, 'PLA A', '#111111FF'),
    ]);

    expect(materials.map(m => m?.name)).toEqual(['PLA A', 'PLA B', 'PLA C']);
  });

  it('không nhầm khay của máy khác khi prefix trùng phần đầu', () => {
    const materials = docMaterials('a1', [
      ...mayIn('a1'),
      ent('sensor.a1_ams_1_tray_1', 'PLA đúng máy', '#111111FF'),
      ent('sensor.a1_2_ams_1_tray_1', 'PLA máy khác', '#222222FF'),
    ]);

    expect(materials).toEqual([{ name: 'PLA đúng máy', color: '#111111' }]);
  });
});
