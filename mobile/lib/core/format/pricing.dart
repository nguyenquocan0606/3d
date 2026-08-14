/// Port của `src/utils/dinh-gia-hang-hoa.ts` (backend).
///
/// Server luôn là nguồn sự thật — mọi giá đều được tính lại khi đồng bộ. Các hàm
/// dưới đây chỉ dùng để **preview** trên app cho khớp trước khi gửi lên.
///
/// Ràng buộc gốc: lợi nhuận trên sàn phải đúng bằng 1 lần giá vốn sau khi sàn trừ
/// phí cố định 3.000đ + 30% giá bán:
///   giaBanSan = (2 × giaVon + 3000) / (1 − 0.30)
library;

const double phiSanCoDinh = 3000;
const double phiSanPhanTram = 0.3;
const double tyLeKhuyenMaiSan = 0.25;

/// Giá bán trên sàn (TikTok Shop / Shopee).
double tinhGiaBanSan(double giaVon) {
  if (giaVon <= 0) return 0;
  return ((2 * giaVon + phiSanCoDinh) / (1 - phiSanPhanTram)).roundToDouble();
}

/// Giá bán lẻ ngoài sàn = giá vốn × 2.
double tinhGiaBanLe(double giaVon) {
  if (giaVon <= 0) return 0;
  return (giaVon * 2).roundToDouble();
}

/// Giá niêm yết để khi sàn tự trừ KM 25% thì về đúng giá bán sàn.
double tinhGiaKhuyenMai(double giaBanSan) {
  if (giaBanSan <= 0) return 0;
  return (giaBanSan / (1 - tyLeKhuyenMaiSan)).roundToDouble();
}

class GiaTinhToan {
  const GiaTinhToan({
    required this.gia,
    required this.giaBanLe,
    required this.giaKhuyenMai,
  });

  final double gia;
  final double giaBanLe;
  final double giaKhuyenMai;
}

GiaTinhToan tinhToanBoGia(double giaVon) {
  final gia = tinhGiaBanSan(giaVon);
  return GiaTinhToan(
    gia: gia,
    giaBanLe: tinhGiaBanLe(giaVon),
    giaKhuyenMai: tinhGiaKhuyenMai(gia),
  );
}

/// 3 sản phẩm con combo tự sinh cho mỗi sản phẩm mẹ.
const soLuongComboMacDinh = <int>[1, 2, 5];

/// Hệ số nhân giá vốn combo: mua càng nhiều càng lời trên mỗi cái (không tuyến tính).
const _heSoGiaVonCombo = <int, double>{1: 1.5, 2: 2, 5: 4};

double tinhGiaVonCombo(double giaVonCha, int soLuongCombo) {
  final heSo = _heSoGiaVonCombo[soLuongCombo] ?? soLuongCombo.toDouble();
  return (giaVonCha * heSo).roundToDouble();
}

String taoMaComboSku(String maGoc, int soLuong) => '$maGoc-$soLuong';

/// Tồn kho combo con = tồn kho mẹ chia số lượng gộp, làm tròn xuống.
int tinhSoLuongCombo(int soLuongCha, int soLuongCombo) {
  if (soLuongCombo <= 0) return 0;
  final result = soLuongCha ~/ soLuongCombo;
  return result < 0 ? 0 : result;
}
