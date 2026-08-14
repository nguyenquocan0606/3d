import 'package:flutter_test/flutter_test.dart';
import 'package:manage3d/core/format/pricing.dart';

/// Công thức giá phải khớp tuyệt đối với `src/utils/dinh-gia-hang-hoa.ts` của
/// backend — server luôn tính lại khi đồng bộ, nên nếu app hiển thị khác thì
/// người dùng sẽ thấy giá "nhảy" sau khi lưu.
void main() {
  group('giá bán sàn', () {
    test('lợi nhuận đúng bằng 1 lần giá vốn sau khi trừ phí sàn', () {
      const giaVon = 50000.0;
      final giaBan = tinhGiaBanSan(giaVon);

      // Sàn thu 3.000đ cố định + 30% giá bán.
      final loiNhuan = giaBan - phiSanCoDinh - giaBan * phiSanPhanTram - giaVon;
      expect(loiNhuan, closeTo(giaVon, 1)); // sai số 1đ do làm tròn
    });

    test('giá vốn 0 hoặc âm thì mọi giá đều 0', () {
      expect(tinhGiaBanSan(0), 0);
      expect(tinhGiaBanLe(0), 0);
      expect(tinhGiaKhuyenMai(0), 0);
      expect(tinhGiaBanSan(-1000), 0);
    });

    test('giá bán lẻ ngoài sàn gấp đôi giá vốn', () {
      expect(tinhGiaBanLe(50000), 100000);
    });

    test('giá niêm yết sau khi giảm 25% về đúng giá bán sàn', () {
      final giaBan = tinhGiaBanSan(50000);
      final niemYet = tinhGiaKhuyenMai(giaBan);
      expect(niemYet * (1 - tyLeKhuyenMaiSan), closeTo(giaBan, 1));
    });

    test('tinhToanBoGia trả về đúng bộ ba', () {
      final gia = tinhToanBoGia(50000);
      expect(gia.gia, tinhGiaBanSan(50000));
      expect(gia.giaBanLe, tinhGiaBanLe(50000));
      expect(gia.giaKhuyenMai, tinhGiaKhuyenMai(gia.gia));
    });
  });

  group('combo', () {
    test('hệ số giá vốn không tuyến tính — mua nhiều lời hơn mỗi cái', () {
      expect(tinhGiaVonCombo(10000, 1), 15000); // 1.5x
      expect(tinhGiaVonCombo(10000, 2), 20000); // 2x
      expect(tinhGiaVonCombo(10000, 5), 40000); // 4x
    });

    test('tồn kho combo làm tròn xuống từ tồn kho mẹ', () {
      expect(tinhSoLuongCombo(5, 1), 5);
      expect(tinhSoLuongCombo(5, 2), 2);
      expect(tinhSoLuongCombo(5, 5), 1);
      expect(tinhSoLuongCombo(4, 5), 0);
    });

    test('số lượng gộp không hợp lệ trả 0 thay vì chia cho 0', () {
      expect(tinhSoLuongCombo(10, 0), 0);
      expect(tinhSoLuongCombo(10, -2), 0);
    });

    test('mã SKU combo nối thêm số lượng gộp', () {
      expect(taoMaComboSku('SP-260814-A3F2K', 2), 'SP-260814-A3F2K-2');
    });

    test('bộ combo mặc định là 1 / 2 / 5', () {
      expect(soLuongComboMacDinh, [1, 2, 5]);
    });
  });
}
