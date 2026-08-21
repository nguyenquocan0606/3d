import { describe, it, expect } from 'vitest';
import {
  chiaLuotIn,
  chiaLuotInTheoMay,
  trangThaiDon,
  dinhDangThoiLuong,
  tongSoLoi,
  canBuBaoNhieu,
  soHangTot,
  sucChuaTheoMayTuLuot,
  chiaLaiGiuTienDo,
  type LuotDeTongHop,
  type LuotDaCo,
} from '../bulk-production';

describe('chiaLuotIn', () => {
  it('chia hết: 200 con, 50 con/mâm, 2 máy → 4 lượt đều 50 con', () => {
    const luots = chiaLuotIn(200, 50, 2);
    expect(luots).toHaveLength(4);
    expect(luots.every((l) => l.quantity === 50)).toBe(true);
  });

  it('lượt cuối nhận phần dư', () => {
    const luots = chiaLuotIn(250, 60, 1);
    expect(luots.map((l) => l.quantity)).toEqual([60, 60, 60, 60, 10]);
    expect(luots.reduce((s, l) => s + l.quantity, 0)).toBe(250);
  });

  it('chia vòng tròn: máy k nhận lượt k, k+soMay, k+2*soMay...', () => {
    const luots = chiaLuotIn(500, 50, 3); // 10 lượt / 3 máy
    expect(luots.map((l) => l.printerIndex)).toEqual([0, 1, 2, 0, 1, 2, 0, 1, 2, 0]);
    // PEI trên máy đầu: 1, 2, 3, 4
    expect(luots.filter((l) => l.printerIndex === 0).map((l) => l.peiIndex)).toEqual([1, 2, 3, 4]);
    // PEI trên máy thứ 3: 1, 2, 3
    expect(luots.filter((l) => l.printerIndex === 2).map((l) => l.peiIndex)).toEqual([1, 2, 3]);
  });

  it('tổng ít hơn 1 mâm → đúng 1 lượt bằng tổng', () => {
    expect(chiaLuotIn(12, 50, 4)).toEqual([{ seq: 1, printerIndex: 0, peiIndex: 1, quantity: 12 }]);
  });

  it('tham số không hợp lệ → mảng rỗng', () => {
    expect(chiaLuotIn(0, 50, 2)).toEqual([]);
    expect(chiaLuotIn(100, 0, 2)).toEqual([]);
    expect(chiaLuotIn(100, 50, 0)).toEqual([]);
    expect(chiaLuotIn(NaN, 50, 2)).toEqual([]);
  });
});

describe('chiaLuotInTheoMay', () => {
  it('mỗi máy xếp theo sức chứa mâm riêng của nó', () => {
    // Máy 1 khổ to (100 con/mâm), máy 2 khổ nhỏ (40 con/mâm).
    const luots = chiaLuotInTheoMay(280, [100, 40]);
    expect(luots.map((l) => l.quantity)).toEqual([100, 40, 100, 40]);
    expect(luots.map((l) => l.printerIndex)).toEqual([0, 1, 0, 1]);
    expect(luots.filter((l) => l.printerIndex === 1).map((l) => l.peiIndex)).toEqual([1, 2]);
    expect(luots.reduce((s, l) => s + l.quantity, 0)).toBe(280);
  });

  it('lượt cuối vẫn nhận phần dư', () => {
    const luots = chiaLuotInTheoMay(150, [100, 40]);
    expect(luots.map((l) => l.quantity)).toEqual([100, 40, 10]);
  });

  it('sức chứa <= 0 thì trả mảng rỗng thay vì lặp vô hạn', () => {
    expect(chiaLuotInTheoMay(100, [50, 0])).toEqual([]);
    expect(chiaLuotInTheoMay(100, [])).toEqual([]);
  });
});

describe('trangThaiDon', () => {
  it('chưa quẹt lượt nào → pending', () => {
    expect(trangThaiDon(['pending', 'pending'])).toBe('pending');
    expect(trangThaiDon([])).toBe('pending');
  });

  it('có lượt đang in hoặc đã xong → printing', () => {
    expect(trangThaiDon(['printing', 'pending'])).toBe('printing');
    expect(trangThaiDon(['completed', 'pending'])).toBe('printing');
  });

  it('xong hết → completed', () => {
    expect(trangThaiDon(['completed', 'completed'])).toBe('completed');
  });
});

describe('dinhDangThoiLuong', () => {
  it('tính khoảng cách 2 mốc quẹt', () => {
    const batDau = new Date('2026-08-13T08:00:00Z');
    expect(dinhDangThoiLuong(batDau, new Date('2026-08-13T10:15:00Z'))).toBe('2g 15p');
    expect(dinhDangThoiLuong(batDau, new Date('2026-08-13T08:45:00Z'))).toBe('45p');
  });

  it('thiếu mốc hoặc mốc ngược → gạch ngang', () => {
    expect(dinhDangThoiLuong(null, new Date())).toBe('—');
    expect(dinhDangThoiLuong(new Date('2026-08-13T10:00:00Z'), new Date('2026-08-13T08:00:00Z'))).toBe('—');
  });
});

describe('tổng hợp miếng lỗi', () => {
  const luot = (p: Partial<LuotDeTongHop>): LuotDeTongHop => ({
    printerId: 'may-1',
    quantity: 50,
    defectQuantity: 0,
    isRework: false,
    status: 'completed',
    peiIndex: 1,
    ...p,
  });

  it('hàng tốt trừ số lỗi, lượt chưa xong không tính', () => {
    const runs = [
      luot({ quantity: 50, defectQuantity: 3 }),
      luot({ quantity: 50, defectQuantity: 0 }),
      luot({ quantity: 50, status: 'printing' }),
    ];
    expect(soHangTot(runs)).toBe(97);
    expect(tongSoLoi(runs)).toBe(3);
  });

  it('lượt bù đã tạo thì trừ khỏi số cần bù, bấm hai lần không đẻ thêm', () => {
    const runs = [
      luot({ quantity: 50, defectQuantity: 8 }),
      luot({ quantity: 8, isRework: true, status: 'pending' }),
    ];
    expect(canBuBaoNhieu(runs)).toBe(0);
  });

  it('còn lỗi chưa bù thì ra đúng phần thiếu', () => {
    const runs = [
      luot({ quantity: 50, defectQuantity: 8 }),
      luot({ quantity: 50, defectQuantity: 2 }),
      luot({ quantity: 4, isRework: true, status: 'completed' }),
    ];
    expect(canBuBaoNhieu(runs)).toBe(6);
  });

  it('suy lại máy + sức chứa mâm từ các lượt, lấy lượt đầy nhất', () => {
    const runs = [
      luot({ printerId: 'A', quantity: 100 }),
      luot({ printerId: 'B', quantity: 40 }),
      luot({ printerId: 'A', quantity: 10 }), // lượt lẻ cuối
    ];
    expect(sucChuaTheoMayTuLuot(runs)).toEqual({
      printerIds: ['A', 'B'],
      sucChua: { A: 100, B: 40 },
    });
  });
});

describe('chiaLaiGiuTienDo', () => {
  const luot = (p: Partial<LuotDaCo> & { id: string; seq: number }): LuotDaCo => ({
    printerId: 'A',
    peiIndex: p.seq,
    quantity: 50,
    status: 'pending',
    isRework: false,
    ...p,
  });

  // Đơn 200 con / 1 máy / mâm 50: lượt 1 xong, lượt 2 đang in, lượt 3-4 chưa ai đụng.
  const donDangChay: LuotDaCo[] = [
    luot({ id: 'ma-1', seq: 1, status: 'completed' }),
    luot({ id: 'ma-2', seq: 2, status: 'printing' }),
    luot({ id: 'ma-3', seq: 3 }),
    luot({ id: 'ma-4', seq: 4 }),
  ];

  it('đổi số con/mâm (không sửa mâm đã in): lượt đã chạy nguyên vẹn, lượt chưa chạy dùng lại mã cũ', () => {
    // 100 con đã khóa, còn 100 con chia mâm 25 → 4 lượt, chỉ có 2 mã pending để dùng lại
    const keHoach = chiaLaiGiuTienDo(donDangChay, 200, ['A'], [25], false);
    expect(keHoach.daKhoa).toBe(100);
    expect(keHoach.giuNguyen.map((r) => r.id)).toEqual(['ma-1', 'ma-2']);
    expect(keHoach.capNhat.map((r) => r.id)).toEqual(['ma-3', 'ma-4']);
    expect(keHoach.capNhat.every((r) => r.quantity === 25)).toBe(true);
    expect(keHoach.themMoi).toHaveLength(2);
    expect(keHoach.xoa).toEqual([]);
    // PEI đếm tiếp sau mâm đang dán trên máy (lượt 2 đang in là PEI 2)
    expect([...keHoach.capNhat, ...keHoach.themMoi].map((r) => r.peiIndex)).toEqual([3, 4, 5, 6]);
  });

  it('giảm tổng số con: mã thừa bị xóa từ cuối', () => {
    const keHoach = chiaLaiGiuTienDo(donDangChay, 150, ['A'], [50]);
    expect(keHoach.capNhat.map((r) => r.id)).toEqual(['ma-3']);
    expect(keHoach.themMoi).toHaveLength(0);
    expect(keHoach.xoa).toEqual(['ma-4']);
  });

  it('tổng mới nhỏ hơn phần đã chạy: xóa hết lượt chưa chạy, không đụng lượt đã chạy', () => {
    const keHoach = chiaLaiGiuTienDo(donDangChay, 80, ['A'], [50]);
    expect(keHoach.giuNguyen).toHaveLength(2);
    expect(keHoach.capNhat).toEqual([]);
    expect(keHoach.xoa).toEqual(['ma-3', 'ma-4']);
  });

  it('lượt in bù bị khóa nhưng không trừ vào tổng số con của đơn', () => {
    const runs: LuotDaCo[] = [
      luot({ id: 'ma-1', seq: 1, status: 'completed', quantity: 50 }),
      luot({ id: 'bu-1', seq: 2, peiIndex: 2, quantity: 5, isRework: true }),
      luot({ id: 'ma-2', seq: 3, peiIndex: 3 }),
    ];
    const keHoach = chiaLaiGiuTienDo(runs, 150, ['A'], [50]);
    expect(keHoach.daKhoa).toBe(50); // 5 con của lượt bù không tính
    expect(keHoach.giuNguyen.map((r) => r.id)).toEqual(['ma-1', 'bu-1']);
    expect(keHoach.capNhat).toHaveLength(1);
    expect(keHoach.themMoi).toHaveLength(1);
  });

  it('đổi máy chạy: lượt chưa chạy chuyển sang máy mới, PEI đếm từ đầu trên máy đó', () => {
    const keHoach = chiaLaiGiuTienDo(donDangChay, 200, ['B'], [50]);
    expect(keHoach.capNhat.map((r) => r.printerIndex)).toEqual([0, 0]);
    expect(keHoach.capNhat.map((r) => r.peiIndex)).toEqual([1, 2]);
    expect(keHoach.capNhat.map((r) => r.seq)).toEqual([3, 4]);
  });

  it('khai nhầm sức chứa mâm: mâm ĐẦY đã in cũng được sửa số con', () => {
    // Máy A khai 34 nhưng thật ra mâm xếp 35 con; lượt cuối 30 con là mâm lẻ
    const runs: LuotDaCo[] = [
      luot({ id: 'ma-1', seq: 1, quantity: 34, status: 'completed' }),
      luot({ id: 'ma-2', seq: 2, quantity: 34, status: 'printing' }),
      luot({ id: 'ma-3', seq: 3, quantity: 30 }),
    ];
    const keHoach = chiaLaiGiuTienDo(runs, 98, ['A'], [35]);
    expect(keHoach.suaDaChay).toEqual([
      { id: 'ma-1', quantity: 35, quantityCu: 34 },
      { id: 'ma-2', quantity: 35, quantityCu: 34 },
    ]);
    expect(keHoach.daKhoa).toBe(70);
    // 98 - 70 = 28 con còn lại → 1 mâm lẻ, dùng lại mã pending sẵn có
    expect(keHoach.capNhat).toEqual([
      { id: 'ma-3', printerIndex: 0, seq: 3, peiIndex: 3, quantity: 28 },
    ]);
  });

  it('tắt sửa mâm đã in thì lượt đã chạy giữ nguyên số con cũ', () => {
    const runs: LuotDaCo[] = [
      luot({ id: 'ma-1', seq: 1, quantity: 34, status: 'completed' }),
      luot({ id: 'ma-2', seq: 2, quantity: 34 }),
    ];
    const keHoach = chiaLaiGiuTienDo(runs, 98, ['A'], [35], false);
    expect(keHoach.suaDaChay).toEqual([]);
    expect(keHoach.daKhoa).toBe(34);
  });

  it('mâm lẻ cuối và lượt in bù không bị sửa theo sức chứa mới', () => {
    const runs: LuotDaCo[] = [
      luot({ id: 'ma-1', seq: 1, quantity: 34, status: 'completed' }),
      luot({ id: 'ma-2', seq: 2, quantity: 12, status: 'completed' }), // mâm lẻ cuối
      luot({ id: 'bu-1', seq: 3, quantity: 34, isRework: true, status: 'completed' }),
    ];
    const keHoach = chiaLaiGiuTienDo(runs, 100, ['A'], [35]);
    expect(keHoach.suaDaChay.map((s) => s.id)).toEqual(['ma-1']);
  });
});
