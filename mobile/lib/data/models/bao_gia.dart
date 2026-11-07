/// Phiếu báo giá gửi khách — port `src/utils/phieu-bao-gia.ts` của bản web.
///
/// Mọi công thức tiền phải **khớp tuyệt đối** với bản web: server không tính lại tổng, nhưng web,
/// link khách `/bg/<token>` và ảnh phiếu đều tính từ cùng một file JSON — app hiện khác một đồng là
/// người soạn trên điện thoại thấy một số, khách thấy số khác. `test/bao_gia_test.dart` chép lại các
/// ca thử của `src/utils/tests/phieu-bao-gia.test.ts`.
library;

import 'json.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Hằng số dùng chung với web
// ─────────────────────────────────────────────────────────────────────────────

enum TrangThaiPhieu {
  nhap('nhap', 'Nháp'),
  daGui('da-gui', 'Đã gửi'),
  chot('chot', 'Khách chốt'),
  huy('huy', 'Huỷ');

  const TrangThaiPhieu(this.ma, this.nhan);

  /// Giá trị lưu trong JSON.
  final String ma;
  final String nhan;

  static TrangThaiPhieu tuMa(String? ma) => values.firstWhere((t) => t.ma == ma, orElse: () => TrangThaiPhieu.nhap);
}

/// Số ảnh tối đa của một hạng mục — phiếu A4 không có chỗ cho nhiều hơn.
const anhToiDaMoiDong = 6;

/// Giá một gram nhựa / một giờ in mặc định khi tính đơn giá theo gram, giờ.
const giaGramMacDinh = 500.0;
const giaGioMacDinh = 4000.0;

List<double> _dayGia(double tu, double buoc) => List.generate(6, (i) => tu + i * buoc);

/// Giá bấm nhanh của ô "Tiền / gr" và "Tiền / giờ in".
final goiYGiaGram = _dayGia(450, 50);
final goiYGiaGio = _dayGia(2500, 500);

/// Giá gốc (chi phí của xưởng) một gram nhựa và một giờ in. Chỉ xưởng xem, không in lên phiếu.
const giaGocGram = 150.0;
const giaGocGio = 1500.0;

/// Đơn vị hay dùng, giống danh sách gợi ý ở trình soạn web.
const donViGoiY = ['cái', 'bộ', 'chiếc', 'gói', 'mẫu', 'giờ', 'lần', 'kg', 'm²'];

/// Domain khách mở link báo giá. App thường nối máy chủ qua IP LAN (`http://192.168…`), khách ở
/// ngoài không mở được, nên link gửi khách luôn đi qua domain công khai — middleware cho `/bg/*`
/// mở ở đây mà không cần đăng nhập (`src/middleware.ts`).
const domainLinkKhach = 'https://mochilab3d.com';

String linkKhach(String token) => '$domainLinkKhach/bg/$token';

/// Đường dẫn công khai của một ảnh hạng mục (nối sau địa chỉ máy chủ).
String duongDanAnhDong(String id) => '/api/phieu-bao-gia/xem/anh/${Uri.encodeComponent(id)}';

// ─────────────────────────────────────────────────────────────────────────────
// Làm tròn kiểu JavaScript
// ─────────────────────────────────────────────────────────────────────────────

/// `Math.round` của JS: .5 luôn làm tròn **lên** (−2.5 → −2), khác `round()` của Dart (−2.5 → −3).
/// Tiền lãi có thể âm nên phải dùng đúng kiểu này mới khớp web.
double jsRound(num x) => (x + 0.5).floorToDouble();

double _so(num? x) => x == null || x.isNaN || x.isInfinite ? 0 : x.toDouble();
double _kep(double x, double min, double max) => x < min ? min : (x > max ? max : x);

// ─────────────────────────────────────────────────────────────────────────────
// Model
// ─────────────────────────────────────────────────────────────────────────────

/// Đánh dấu "bỏ giá trị" trong copyWith cho các trường nullable (khác với "không đổi").
const _xoa = Object();

class DongBaoGia {
  const DongBaoGia({
    required this.id,
    this.ten = '',
    this.moTa = '',
    this.soLuong = 1,
    this.donVi = 'cái',
    this.donGia = 0,
    this.chietKhauPct = 0,
    this.gram,
    this.giaGram,
    this.gioIn,
    this.giaGio,
    this.giaGramSauCk,
    this.giaGioSauCk,
    this.phiKhac,
    this.anh = const [],
  });

  /// Dòng trống như `dongTrong` của web.
  factory DongBaoGia.trong(String id) => DongBaoGia(
        id: id,
        gram: 0,
        giaGram: giaGramMacDinh,
        gioIn: 0,
        giaGio: giaGioMacDinh,
      );

  factory DongBaoGia.fromJson(Map<String, dynamic> j) => DongBaoGia(
        id: asString(j['id']),
        ten: asString(j['ten']),
        moTa: asString(j['moTa']),
        soLuong: asDouble(j['soLuong']),
        donVi: asString(j['donVi']),
        donGia: asDouble(j['donGia']),
        chietKhauPct: asDouble(j['chietKhauPct']),
        gram: asDoubleOrNull(j['gram']),
        giaGram: asDoubleOrNull(j['giaGram']),
        gioIn: asDoubleOrNull(j['gioIn']),
        giaGio: asDoubleOrNull(j['giaGio']),
        giaGramSauCk: asDoubleOrNull(j['giaGramSauCk']),
        giaGioSauCk: asDoubleOrNull(j['giaGioSauCk']),
        phiKhac: asDoubleOrNull(j['phiKhac']),
        anh: (j['anh'] is List) ? (j['anh'] as List).whereType<String>().toList() : const [],
      );

  final String id;
  final String ten;

  /// Quy cách: chất liệu, màu, kích thước, infill…
  final String moTa;
  final double soLuong;
  final String donVi;
  final double donGia;

  /// Chiết khấu riêng dòng, % (0–100). Có thể nhiều số lẻ khi suy ngược từ giá căn tay.
  final double chietKhauPct;

  /// Gram nhựa × đ/gram + giờ in × đ/giờ — chỉ để xưởng tính, không in lên phiếu.
  final double? gram;
  final double? giaGram;
  final double? gioIn;
  final double? giaGio;

  /// Tiền / gr và tiền / giờ sau giảm do xưởng căn tay. Null = chưa căn, tính từ CK %.
  final double? giaGramSauCk;
  final double? giaGioSauCk;

  /// Phí khác một sản phẩm: không bị chiết khấu, khách chỉ thấy giá đã gộp.
  final double? phiKhac;

  /// Mã ảnh sản phẩm (file trong `data/bao-gia/anh/` trên máy chủ).
  final List<String> anh;

  DongBaoGia copyWith({
    String? id,
    String? ten,
    String? moTa,
    double? soLuong,
    String? donVi,
    double? donGia,
    double? chietKhauPct,
    double? gram,
    double? giaGram,
    double? gioIn,
    double? giaGio,
    Object? giaGramSauCk = const _KhongDoi(),
    Object? giaGioSauCk = const _KhongDoi(),
    double? phiKhac,
    List<String>? anh,
  }) {
    return DongBaoGia(
      id: id ?? this.id,
      ten: ten ?? this.ten,
      moTa: moTa ?? this.moTa,
      soLuong: soLuong ?? this.soLuong,
      donVi: donVi ?? this.donVi,
      donGia: donGia ?? this.donGia,
      chietKhauPct: chietKhauPct ?? this.chietKhauPct,
      gram: gram ?? this.gram,
      giaGram: giaGram ?? this.giaGram,
      gioIn: gioIn ?? this.gioIn,
      giaGio: giaGio ?? this.giaGio,
      giaGramSauCk: _chon(giaGramSauCk, this.giaGramSauCk),
      giaGioSauCk: _chon(giaGioSauCk, this.giaGioSauCk),
      phiKhac: phiKhac ?? this.phiKhac,
      anh: anh ?? this.anh,
    );
  }

  /// Bỏ giá đã căn tay — dùng khi sửa tay đơn giá hoặc CK %.
  DongBaoGia boGiaCanTay() => copyWith(giaGramSauCk: _xoa, giaGioSauCk: _xoa);

  /// Gửi đủ mọi trường: server dựng lại từng dòng từ đầu (`chuanHoa`), thiếu trường nào là mất trường đó.
  Map<String, dynamic> toJson() => {
        'id': id,
        'ten': ten,
        'moTa': moTa,
        'soLuong': soLuong,
        'donVi': donVi,
        'donGia': donGia,
        'chietKhauPct': chietKhauPct,
        if (gram != null) 'gram': gram,
        if (giaGram != null) 'giaGram': giaGram,
        if (gioIn != null) 'gioIn': gioIn,
        if (giaGio != null) 'giaGio': giaGio,
        if (giaGramSauCk != null) 'giaGramSauCk': giaGramSauCk,
        if (giaGioSauCk != null) 'giaGioSauCk': giaGioSauCk,
        if (phiKhac != null) 'phiKhac': phiKhac,
        'anh': anh,
      };
}

class _KhongDoi {
  const _KhongDoi();
}

double? _chon(Object? moi, double? cu) {
  if (moi is _KhongDoi) return cu;
  if (identical(moi, _xoa)) return null;
  return (moi as num?)?.toDouble();
}

class KhachBaoGia {
  const KhachBaoGia({
    this.ten = '',
    this.congTy = '',
    this.sdt = '',
    this.email = '',
    this.diaChi = '',
    this.link = '',
  });

  factory KhachBaoGia.fromJson(Map<String, dynamic> j) => KhachBaoGia(
        ten: asString(j['ten']),
        congTy: asString(j['congTy']),
        sdt: asString(j['sdt']),
        email: asString(j['email']),
        diaChi: asString(j['diaChi']),
        link: asString(j['link']),
      );

  final String ten;
  final String congTy;
  final String sdt;
  final String email;
  final String diaChi;

  /// Link liên hệ khách (Facebook, Messenger…) — chỉ xưởng xem, không in lên phiếu.
  final String link;

  /// Tên hiện ở danh sách: tên khách, không có thì tên công ty.
  String get tenHien => ten.trim().isNotEmpty ? ten.trim() : congTy.trim();

  KhachBaoGia copyWith({
    String? ten,
    String? congTy,
    String? sdt,
    String? email,
    String? diaChi,
    String? link,
  }) =>
      KhachBaoGia(
        ten: ten ?? this.ten,
        congTy: congTy ?? this.congTy,
        sdt: sdt ?? this.sdt,
        email: email ?? this.email,
        diaChi: diaChi ?? this.diaChi,
        link: link ?? this.link,
      );

  Map<String, dynamic> toJson() => {
        'ten': ten,
        'congTy': congTy,
        'sdt': sdt,
        'email': email,
        'diaChi': diaChi,
        'link': link,
      };
}

/// Chiết khấu trên tổng: theo % hoặc theo số tiền.
class ChietKhauTong {
  const ChietKhauTong({this.theoPct = true, this.giaTri = 0});

  factory ChietKhauTong.fromJson(Map<String, dynamic> j) =>
      ChietKhauTong(theoPct: j['kieu'] != 'vnd', giaTri: asDouble(j['giaTri']));

  final bool theoPct;
  final double giaTri;

  Map<String, dynamic> toJson() => {'kieu': theoPct ? 'pct' : 'vnd', 'giaTri': giaTri};
}

/// Mã QR trên phiếu thu gì (khi không lấy hoá đơn).
enum KieuQr {
  coc('coc'),
  thanhToan('thanh-toan');

  const KieuQr(this.ma);
  final String ma;

  static KieuQr? tuMa(String? ma) => switch (ma) {
        'coc' => KieuQr.coc,
        'thanh-toan' => KieuQr.thanhToan,
        _ => null,
      };
}

class PhieuBaoGia {
  const PhieuBaoGia({
    required this.id,
    required this.so,
    required this.tieuDe,
    this.phanLoai = '',
    required this.trangThai,
    required this.ngayTao,
    required this.ngaySua,
    required this.hieuLucDen,
    required this.khach,
    required this.dong,
    required this.chietKhauTong,
    required this.phiVanChuyen,
    required this.vatPct,
    required this.datCocPct,
    this.kieuQr,
    this.daCoc,
    this.layHoaDon = false,
    required this.thoiGianGiao,
    required this.ghiChu,
    required this.dieuKhoan,
    required this.token,
    this.khachChotLuc,
    this.khachChotGhiChu,
    this.khachXemLuc,
    this.donHangId,
    this.donHangMa,
  });

  factory PhieuBaoGia.fromJson(Map<String, dynamic> j) => PhieuBaoGia(
        id: asString(j['id']),
        so: asString(j['so']),
        tieuDe: asString(j['tieuDe']),
        phanLoai: asString(j['phanLoai']).trim(),
        trangThai: TrangThaiPhieu.tuMa(asStringOrNull(j['trangThai'])),
        ngayTao: asString(j['ngayTao']),
        ngaySua: asString(j['ngaySua']),
        hieuLucDen: asString(j['hieuLucDen']),
        khach: KhachBaoGia.fromJson(asMap(j['khach'])),
        dong: asList(j['dong'], DongBaoGia.fromJson),
        chietKhauTong: ChietKhauTong.fromJson(asMap(j['chietKhauTong'])),
        phiVanChuyen: asDouble(j['phiVanChuyen']),
        vatPct: asDouble(j['vatPct']),
        datCocPct: asDouble(j['datCocPct']),
        kieuQr: KieuQr.tuMa(asStringOrNull(j['kieuQr'])),
        daCoc: asDoubleOrNull(j['daCoc']),
        layHoaDon: asBool(j['layHoaDon']),
        thoiGianGiao: asString(j['thoiGianGiao']),
        ghiChu: asString(j['ghiChu']),
        dieuKhoan: asString(j['dieuKhoan']),
        token: asString(j['token']),
        khachChotLuc: asDate(j['khachChotLuc']),
        khachChotGhiChu: asStringOrNull(j['khachChotGhiChu']),
        khachXemLuc: asDate(j['khachXemLuc']),
        donHangId: asStringOrNull(j['donHangId']),
        donHangMa: asStringOrNull(j['donHangMa']),
      );

  final String id;

  /// Số phiếu hiện cho khách, VD "BG-2610-007".
  final String so;
  final String tieuDe;

  /// Nhãn phân loại xưởng tự đặt. Rỗng = chưa phân loại.
  final String phanLoai;
  final TrangThaiPhieu trangThai;

  /// ISO, giữ nguyên chuỗi để so sánh/sắp xếp giống web.
  final String ngayTao;
  final String ngaySua;

  /// yyyy-mm-dd
  final String hieuLucDen;
  final KhachBaoGia khach;
  final List<DongBaoGia> dong;
  final ChietKhauTong chietKhauTong;
  final double phiVanChuyen;
  final double vatPct;
  final double datCocPct;
  final KieuQr? kieuQr;
  final double? daCoc;
  final bool layHoaDon;
  final String thoiGianGiao;
  final String ghiChu;
  final String dieuKhoan;

  /// Khoá của link công khai `/bg/<token>`.
  final String token;
  final DateTime? khachChotLuc;
  final String? khachChotGhiChu;
  final DateTime? khachXemLuc;
  final String? donHangId;
  final String? donHangMa;

  DateTime? get ngayTaoLuc => asDate(ngayTao);

  PhieuBaoGia copyWith({
    String? tieuDe,
    String? phanLoai,
    TrangThaiPhieu? trangThai,
    String? hieuLucDen,
    KhachBaoGia? khach,
    List<DongBaoGia>? dong,
    ChietKhauTong? chietKhauTong,
    double? phiVanChuyen,
    double? vatPct,
    double? datCocPct,
    KieuQr? kieuQr,
    double? daCoc,
    bool? layHoaDon,
    String? thoiGianGiao,
    String? ghiChu,
    String? dieuKhoan,
    String? token,
    String? donHangId,
    String? donHangMa,
  }) {
    return PhieuBaoGia(
      id: id,
      so: so,
      tieuDe: tieuDe ?? this.tieuDe,
      phanLoai: phanLoai ?? this.phanLoai,
      trangThai: trangThai ?? this.trangThai,
      ngayTao: ngayTao,
      ngaySua: ngaySua,
      hieuLucDen: hieuLucDen ?? this.hieuLucDen,
      khach: khach ?? this.khach,
      dong: dong ?? this.dong,
      chietKhauTong: chietKhauTong ?? this.chietKhauTong,
      phiVanChuyen: phiVanChuyen ?? this.phiVanChuyen,
      vatPct: vatPct ?? this.vatPct,
      datCocPct: datCocPct ?? this.datCocPct,
      kieuQr: kieuQr ?? this.kieuQr,
      daCoc: daCoc ?? this.daCoc,
      layHoaDon: layHoaDon ?? this.layHoaDon,
      thoiGianGiao: thoiGianGiao ?? this.thoiGianGiao,
      ghiChu: ghiChu ?? this.ghiChu,
      dieuKhoan: dieuKhoan ?? this.dieuKhoan,
      token: token ?? this.token,
      khachChotLuc: khachChotLuc,
      khachChotGhiChu: khachChotGhiChu,
      khachXemLuc: khachXemLuc,
      donHangId: donHangId ?? this.donHangId,
      donHangMa: donHangMa ?? this.donHangMa,
    );
  }

  /// Bản đang gõ, lấy thêm những trường chỉ server đổi (khách xem / chốt, đơn hàng vừa tạo, link mới).
  /// Dùng sau mỗi lần lưu: không được đè chữ người dùng gõ tiếp trong lúc chờ server trả lời.
  PhieuBaoGia kemTuServer(PhieuBaoGia s) => PhieuBaoGia(
        id: id,
        so: s.so,
        tieuDe: tieuDe,
        phanLoai: phanLoai,
        trangThai: trangThai,
        ngayTao: ngayTao,
        ngaySua: s.ngaySua,
        hieuLucDen: hieuLucDen,
        khach: khach,
        dong: dong,
        chietKhauTong: chietKhauTong,
        phiVanChuyen: phiVanChuyen,
        vatPct: vatPct,
        datCocPct: datCocPct,
        kieuQr: kieuQr,
        daCoc: daCoc,
        layHoaDon: layHoaDon,
        thoiGianGiao: thoiGianGiao,
        ghiChu: ghiChu,
        dieuKhoan: dieuKhoan,
        token: s.token,
        khachChotLuc: s.khachChotLuc,
        khachChotGhiChu: s.khachChotGhiChu,
        khachXemLuc: s.khachXemLuc,
        donHangId: s.donHangId,
        donHangMa: s.donHangMa,
      );

  /// Các trường được sửa — đúng những trường `chuanHoa` của server nhận. Các trường còn lại
  /// (số phiếu, token, dấu khách chốt, đơn hàng) server giữ nguyên.
  Map<String, dynamic> toJson() => {
        'tieuDe': tieuDe,
        'phanLoai': phanLoai,
        'trangThai': trangThai.ma,
        'hieuLucDen': hieuLucDen,
        'khach': khach.toJson(),
        'dong': dong.map((d) => d.toJson()).toList(),
        'chietKhauTong': chietKhauTong.toJson(),
        'phiVanChuyen': phiVanChuyen,
        'vatPct': vatPct,
        'datCocPct': datCocPct,
        if (kieuQr != null) 'kieuQr': kieuQr!.ma,
        if (daCoc != null) 'daCoc': daCoc,
        'layHoaDon': layHoaDon,
        'thoiGianGiao': thoiGianGiao,
        'ghiChu': ghiChu,
        'dieuKhoan': dieuKhoan,
      };
}

/// Thông tin xưởng và mặc định cho phiếu mới — chỉ đọc trên app (sửa ở web).
class CaiDatBaoGia {
  const CaiDatBaoGia({
    this.tenXuong = 'Xưởng In 3D',
    this.nganHang = '',
    this.soTaiKhoan = '',
    this.chuTaiKhoan = '',
    this.nganHangHoaDon = '',
    this.soTaiKhoanHoaDon = '',
    this.chuTaiKhoanHoaDon = '',
    this.datCocPctMacDinh = 50,
    this.dieuKhoanMacDinh = '',
  });

  factory CaiDatBaoGia.fromJson(Map<String, dynamic> j) => CaiDatBaoGia(
        tenXuong: asString(j['tenXuong'], 'Xưởng In 3D'),
        nganHang: asString(j['nganHang']),
        soTaiKhoan: asString(j['soTaiKhoan']),
        chuTaiKhoan: asString(j['chuTaiKhoan']),
        nganHangHoaDon: asString(j['nganHangHoaDon']),
        soTaiKhoanHoaDon: asString(j['soTaiKhoanHoaDon']),
        chuTaiKhoanHoaDon: asString(j['chuTaiKhoanHoaDon']),
        datCocPctMacDinh: asDouble(j['datCocPctMacDinh'], 50),
        dieuKhoanMacDinh: asString(j['dieuKhoanMacDinh']),
      );

  final String tenXuong;
  final String nganHang;
  final String soTaiKhoan;
  final String chuTaiKhoan;
  final String nganHangHoaDon;
  final String soTaiKhoanHoaDon;
  final String chuTaiKhoanHoaDon;
  final double datCocPctMacDinh;
  final String dieuKhoanMacDinh;

  bool get coTaiKhoanHoaDon => nganHangHoaDon.trim().isNotEmpty && soTaiKhoanHoaDon.trim().isNotEmpty;
}

/// Một lần tính giá ở trang `/bao-gia` (máy tính giá 3D) — kéo vào phiếu thành một dòng.
class LanTinhGia {
  const LanTinhGia({
    required this.id,
    required this.fileName,
    required this.createdAt,
    required this.soLuong,
    required this.weightG,
    required this.timeMinutes,
    required this.infillPercent,
    required this.layerHeightMm,
    required this.cheDo,
    required this.nhua,
    required this.giaBanLe,
  });

  factory LanTinhGia.fromJson(Map<String, dynamic> j) => LanTinhGia(
        id: asString(j['id']),
        fileName: asString(j['fileName']),
        createdAt: asDate(j['createdAt']),
        soLuong: asInt(j['soLuong'], 1) < 1 ? 1 : asInt(j['soLuong'], 1),
        weightG: asDouble(j['weightG']),
        timeMinutes: asDouble(j['timeMinutes']),
        infillPercent: asDouble(j['infillPercent']),
        layerHeightMm: asDouble(j['layerHeightMm']),
        cheDo: asString(j['cheDo']),
        nhua: asStringOrNull(j['nhua']),
        giaBanLe: asDouble(j['giaBanLe']),
      );

  final String id;
  final String fileName;
  final DateTime? createdAt;
  final int soLuong;
  final double weightG;
  final double timeMinutes;
  final double infillPercent;
  final double layerHeightMm;
  final String cheDo;
  final String? nhua;
  final double giaBanLe;

  /// Giống `ChonTuMayTinh` của web: giá bán lẻ là cho cả lô nên chia ra đơn giá, làm tròn 100đ.
  DongBaoGia thanhDong(String id) => DongBaoGia(
        id: id,
        ten: 'In 3D: ${fileName.replaceAll(RegExp(r'\.(stl|3mf|obj|step|stp)$', caseSensitive: false), '')}',
        moTa: [
          if (nhua != null) nhua!,
          'infill ${soGon(infillPercent)}%',
          'lớp ${soGon(layerHeightMm)} mm',
          if (weightG > 0) '~${jsRound(weightG / soLuong).toInt()} g/cái',
        ].join(' · '),
        soLuong: soLuong.toDouble(),
        donVi: 'cái',
        donGia: jsRound(giaBanLe / soLuong / 100) * 100,
        gram: jsRound(weightG / soLuong),
        giaGram: giaGramMacDinh,
        gioIn: jsRound(timeMinutes / 60 / soLuong * 100) / 100,
        giaGio: giaGioMacDinh,
      );
}

/// Mẫu dòng hay thêm, giống `MAU_NHANH` của web.
const mauDongNhanh = [
  (
    ten: 'Thiết kế / dựng file 3D',
    moTa: 'Dựng mô hình theo ảnh hoặc bản vẽ, gửi khách duyệt trước khi in',
    donVi: 'mẫu'
  ),
  (ten: 'Scan 3D', moTa: 'Quét mẫu thật, xử lý lưới, xuất file STL', donVi: 'mẫu'),
  (ten: 'Sơn hoàn thiện', moTa: 'Mài, sơn lót, sơn màu theo yêu cầu', donVi: 'cái'),
  (ten: 'In mẫu thử', moTa: 'In 1 mẫu để khách kiểm tra trước khi in số lượng', donVi: 'cái'),
];

// ─────────────────────────────────────────────────────────────────────────────
// Công thức — port nguyên từ web
// ─────────────────────────────────────────────────────────────────────────────

class TongBaoGia {
  const TongBaoGia({
    required this.tamTinh,
    required this.chietKhauDong,
    required this.chietKhauTong,
    required this.phiVanChuyen,
    required this.phiKhac,
    required this.truocThue,
    required this.vat,
    required this.tongCong,
    required this.datCoc,
    required this.conLai,
  });

  final double tamTinh;
  final double chietKhauDong;
  final double chietKhauTong;
  final double phiVanChuyen;
  final double phiKhac;
  final double truocThue;
  final double vat;
  final double tongCong;
  final double datCoc;
  final double conLai;
}

/// Giá hàng một đơn vị sau chiết khấu dòng, chưa cộng phí khác và chưa làm tròn.
double _giaHangSauCk(DongBaoGia d) => _max0(_so(d.donGia)) * (1 - _kep(_so(d.chietKhauPct), 0, 100) / 100);

double _max0(double x) => x < 0 ? 0 : x;

/// Thành tiền một dòng sau chiết khấu dòng, gồm phí khác, làm tròn tới đồng.
double thanhTienDong(DongBaoGia d) => jsRound(_max0(_so(d.soLuong)) * (_giaHangSauCk(d) + _max0(_so(d.phiKhac))));

/// Đơn giá từ gram × đ/gram + giờ in × đ/giờ. Chưa nhập gram lẫn giờ thì null — giữ đơn giá gõ tay.
double? donGiaTheoGramGio(DongBaoGia d) {
  final gram = _max0(_so(d.gram));
  final gio = _max0(_so(d.gioIn));
  if (gram == 0 && gio == 0) return null;
  return jsRound(gram * _max0(_so(d.giaGram ?? giaGramMacDinh)) + gio * _max0(_so(d.giaGio ?? giaGioMacDinh)));
}

/// Đơn giá một đơn vị sau chiết khấu dòng, gồm phí khác.
double donGiaSauCk(DongBaoGia d) => jsRound(_giaHangSauCk(d) + _max0(_so(d.phiKhac)));

/// Tiền / gr và tiền / giờ sau chiết khấu dòng: số đã căn tay, chưa căn thì tính từ CK %.
({double gram, double gio}) giaSauCk(DongBaoGia d) {
  final heSo = 1 - _kep(_so(d.chietKhauPct), 0, 100) / 100;
  return (
    gram: d.giaGramSauCk ?? jsRound(_max0(_so(d.giaGram ?? giaGramMacDinh)) * heSo),
    gio: d.giaGioSauCk ?? jsRound(_max0(_so(d.giaGio ?? giaGioMacDinh)) * heSo),
  );
}

/// Giá đã căn tay là chuẩn: CK % suy ngược từ đó. Hết giảm thì bỏ giá căn tay.
DongBaoGia tinhLaiCk(DongBaoGia d) {
  if (d.giaGramSauCk == null && d.giaGioSauCk == null) return d;
  final sau = giaSauCk(d);
  final gramSau = _min(sau.gram, _max0(_so(d.giaGram ?? giaGramMacDinh)));
  final gioSau = _min(sau.gio, _max0(_so(d.giaGio ?? giaGioMacDinh)));
  final donGiaSau = donGiaTheoGramGio(
    DongBaoGia(id: d.id, gram: d.gram, gioIn: d.gioIn, giaGram: gramSau, giaGio: gioSau),
  );
  final ck = donGiaSau == null || d.donGia == 0 ? d.chietKhauPct : _max0((1 - donGiaSau / d.donGia) * 100);
  if (ck <= 0) return d.copyWith(chietKhauPct: 0).boGiaCanTay();
  return d.copyWith(chietKhauPct: ck, giaGramSauCk: gramSau, giaGioSauCk: gioSau);
}

double _min(double a, double b) => a < b ? a : b;

/// Sửa tay một trong hai giá sau giảm: giá còn lại chốt theo số đang hiện, CK % tính lại.
DongBaoGia canGiaSauCk(DongBaoGia d, {double? gram, double? gio}) {
  final sau = giaSauCk(d);
  return tinhLaiCk(d.copyWith(giaGramSauCk: gram ?? sau.gram, giaGioSauCk: gio ?? sau.gio));
}

/// Sửa một trong 4 ô gram/giờ — đơn giá tính lại theo, trừ khi gram lẫn giờ đều trống.
DongBaoGia suaGramGio(DongBaoGia d, {double? gram, double? giaGram, double? gioIn, double? giaGio}) {
  final y = d.copyWith(gram: gram, giaGram: giaGram, gioIn: gioIn, giaGio: giaGio);
  final donGia = donGiaTheoGramGio(y);
  return donGia == null ? y : tinhLaiCk(y.copyWith(donGia: donGia));
}

/// CK % để hiện: chỉ giữ 2 số lẻ.
double lamTronPct(double x) => jsRound(_so(x) * 100) / 100;

/// Các mức tròn quanh giá sau giảm để bấm nhanh, không vượt giá trước giảm.
List<double> goiYGiaSauCk(double gia, double truocGiam, double buoc) {
  final tron = jsRound(gia / buoc) * buoc;
  return [
    for (var i = 0; i < 6; i++) tron + (i - 3) * buoc,
  ].where((v) => v > 0 && v <= truocGiam).toList();
}

/// Giá gốc một sản phẩm: gram × 150 + giờ × 1.500. Chưa có gram lẫn giờ thì null.
double? giaGocDong(DongBaoGia d) {
  final gram = _max0(_so(d.gram));
  final gio = _max0(_so(d.gioIn));
  if (gram == 0 && gio == 0) return null;
  return jsRound(gram * giaGocGram + gio * giaGocGio);
}

/// Tiền lãi và % lợi nhuận tính trên giá gốc. Giá gốc bằng 0 thì không có %.
({double tien, double? pct}) tinhLoiNhuan(double doanhThu, double giaGoc) {
  final tien = jsRound(doanhThu - giaGoc);
  return (tien: tien, pct: giaGoc > 0 ? tien / giaGoc * 100 : null);
}

/// Phần tiền hàng còn lại sau chiết khấu trên tổng: 1 = không có chiết khấu tổng.
double tyLeSauCkTong(TongBaoGia t) {
  final tienHang = t.tamTinh - t.chietKhauDong - t.phiKhac;
  return tienHang > 0 ? 1 - t.chietKhauTong / tienHang : 1;
}

/// Lãi một sản phẩm sau mọi chiết khấu, không tính phí khác.
({double tien, double? pct}) loiNhuanMotSp(DongBaoGia d, double giaGoc, double tyLeCkTong) =>
    tinhLoiNhuan(_giaHangSauCk(d) * tyLeCkTong, giaGoc);

class LoiNhuanPhieu {
  const LoiNhuanPhieu({
    required this.giaGoc,
    required this.doanhThu,
    required this.tien,
    required this.pct,
    required this.soDongChuaCoGoc,
  });

  final double giaGoc;
  final double doanhThu;
  final double tien;
  final double? pct;
  final int soDongChuaCoGoc;
}

/// Lợi nhuận cả phiếu, không tính vận chuyển, phí khác và VAT. Hạng mục chưa có gram / giờ bỏ ra.
LoiNhuanPhieu loiNhuanPhieu(PhieuBaoGia p) {
  final tyLe = tyLeSauCkTong(tinhTong(p));
  var giaGoc = 0.0;
  var doanhThu = 0.0;
  var chuaCoGoc = 0;
  for (final d in p.dong) {
    final goc = giaGocDong(d);
    if (goc == null) {
      if (thanhTienDong(d) > 0) chuaCoGoc++;
      continue;
    }
    giaGoc += jsRound(_max0(_so(d.soLuong)) * goc);
    doanhThu += _max0(_so(d.soLuong)) * _giaHangSauCk(d) * tyLe;
  }
  final lai = tinhLoiNhuan(doanhThu, giaGoc);
  return LoiNhuanPhieu(
    giaGoc: giaGoc,
    doanhThu: jsRound(doanhThu),
    tien: lai.tien,
    pct: lai.pct,
    soDongChuaCoGoc: chuaCoGoc,
  );
}

/// Mọi con số của phiếu. Tiền làm tròn tới đồng ở từng bước để cộng tay vẫn khớp.
TongBaoGia tinhTong(PhieuBaoGia p) {
  final tamTinh = p.dong
      .fold<double>(0, (t, d) => t + jsRound(_max0(_so(d.soLuong)) * (_max0(_so(d.donGia)) + _max0(_so(d.phiKhac)))));
  final sauDong = p.dong.fold<double>(0, (t, d) => t + thanhTienDong(d));
  final chietKhauDong = tamTinh - sauDong;
  final phiKhac = p.dong.fold<double>(0, (t, d) => t + jsRound(_max0(_so(d.soLuong)) * _max0(_so(d.phiKhac))));
  // Chiết khấu trên tổng chỉ tính trên tiền hàng: phí khác không được giảm.
  final tienHang = _max0(sauDong - phiKhac);

  final ck = p.chietKhauTong;
  final chietKhauTong =
      ck.theoPct ? jsRound(tienHang * _kep(_so(ck.giaTri), 0, 100) / 100) : jsRound(_kep(_so(ck.giaTri), 0, tienHang));

  final phiVanChuyen = _max0(jsRound(_so(p.phiVanChuyen)));
  final truocThue = sauDong - chietKhauTong + phiVanChuyen;
  final vat = jsRound(truocThue * _kep(_so(p.vatPct), 0, 100) / 100);
  final tongCong = truocThue + vat;
  final datCoc = jsRound(tongCong * _kep(_so(p.datCocPct), 0, 100) / 100);
  return TongBaoGia(
    tamTinh: tamTinh,
    chietKhauDong: chietKhauDong,
    chietKhauTong: chietKhauTong,
    phiVanChuyen: phiVanChuyen,
    phiKhac: phiKhac,
    truocThue: truocThue,
    vat: vat,
    tongCong: tongCong,
    datCoc: datCoc,
    conLai: tongCong - datCoc,
  );
}

enum KieuKhoanQr { coc, thanhToan, hoaDon }

/// Khoản tiền mã QR thu. `soTien` = 0 nghĩa là không có gì để thu.
({KieuKhoanQr kieu, double soTien, double daCoc, double conLai}) khoanQr(PhieuBaoGia p, TongBaoGia t) {
  if (p.layHoaDon) return (kieu: KieuKhoanQr.hoaDon, soTien: t.tongCong, daCoc: 0, conLai: 0);
  if (p.kieuQr == KieuQr.thanhToan) {
    final daCoc = _min(_max0(jsRound(_so(p.daCoc))), t.tongCong);
    return (kieu: KieuKhoanQr.thanhToan, soTien: t.tongCong - daCoc, daCoc: daCoc, conLai: 0);
  }
  final soTien = p.datCocPct > 0 ? t.datCoc : 0.0;
  return (kieu: KieuKhoanQr.coc, soTien: soTien, daCoc: 0, conLai: t.tongCong - soTien);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ngày & chữ
// ─────────────────────────────────────────────────────────────────────────────

/// yyyy-mm-dd theo giờ Việt Nam, cộng thêm [cong] ngày.
String ngayVN([int cong = 0, DateTime? tu]) {
  final d = (tu ?? DateTime.now()).toUtc().add(Duration(hours: 7, days: cong));
  return '${d.year.toString().padLeft(4, '0')}-${_hai(d.month)}-${_hai(d.day)}';
}

String _hai(int x) => x.toString().padLeft(2, '0');

/// "2026-11-07" → "07/11/2026".
String hienNgay(String? iso) {
  if (iso == null || iso.length < 10) return '—';
  final p = iso.substring(0, 10).split('-');
  return '${p[2]}/${p[1]}/${p[0]}';
}

bool hetHieuLuc(PhieuBaoGia p, [String? homNay]) =>
    p.trangThai != TrangThaiPhieu.chot &&
    p.trangThai != TrangThaiPhieu.huy &&
    p.hieuLucDen.isNotEmpty &&
    p.hieuLucDen.compareTo(homNay ?? ngayVN()) < 0;

/// "1.250.000 ₫" — giống `dinhDangVnd` của web.
String dinhDangVnd(num x) => '${nhomNghin(jsRound(x))} ₫';

/// Tiền rút gọn cho thẻ số liệu: "1,2 tr", "3 tỷ".
String rutGonTien(double x) {
  if (x >= 1e9) return '${soGon(jsRound(x / 1e8) / 10).replaceAll('.', ',')} tỷ';
  if (x >= 1e6) return '${soGon(jsRound(x / 1e5) / 10).replaceAll('.', ',')} tr';
  return dinhDangVnd(x);
}

/// Số nguyên có dấu chấm ngăn nghìn: 1250000 → "1.250.000".
String nhomNghin(num x) {
  final n = x.round();
  final am = n < 0;
  final chu = n.abs().toString();
  final ra = StringBuffer();
  for (var i = 0; i < chu.length; i++) {
    if (i > 0 && (chu.length - i) % 3 == 0) ra.write('.');
    ra.write(chu[i]);
  }
  return '${am ? '-' : ''}$ra';
}

/// Số gọn: 2.0 → "2", 2.5 → "2.5", 0.3333 → "0.33".
String soGon(num x) {
  final r = jsRound(x * 100) / 100;
  if (r == r.truncateToDouble()) return r.toInt().toString();
  return r.toString();
}

const _chuSo = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

String _docBaSo(int n, bool day) {
  final tram = n ~/ 100;
  final chuc = (n % 100) ~/ 10;
  final dv = n % 10;
  final ra = <String>[];
  if (tram > 0 || day) ra.add('${_chuSo[tram]} trăm');
  if (chuc > 1) {
    ra.add('${_chuSo[chuc]} mươi');
    if (dv == 1) {
      ra.add('mốt');
    } else if (dv == 4) {
      ra.add('tư');
    } else if (dv == 5) {
      ra.add('lăm');
    } else if (dv > 0) {
      ra.add(_chuSo[dv]);
    }
  } else if (chuc == 1) {
    ra.add('mười');
    if (dv == 5) {
      ra.add('lăm');
    } else if (dv > 0) {
      ra.add(_chuSo[dv]);
    }
  } else if (dv > 0) {
    if (tram > 0 || day) ra.add('lẻ');
    ra.add(_chuSo[dv]);
  }
  return ra.join(' ');
}

/// "1250000" → "Một triệu hai trăm năm mươi nghìn đồng".
String docSoTien(num soTien) {
  var n = jsRound(_so(soTien).abs()).toInt();
  if (n == 0) return 'Không đồng';
  const donVi = ['', 'nghìn', 'triệu', 'tỷ'];
  final nhom = <int>[];
  while (n > 0) {
    nhom.add(n % 1000);
    n ~/= 1000;
  }
  final ra = <String>[];
  for (var i = nhom.length - 1; i >= 0; i--) {
    if (nhom[i] == 0) {
      if (i > 0 && i % 3 == 0 && ra.isNotEmpty) ra.add('tỷ');
      continue;
    }
    ra.add(_docBaSo(nhom[i], ra.isNotEmpty));
    final dv = i % 3 == 0 && i > 0 ? 'tỷ' : donVi[i % 3];
    if (dv.isNotEmpty) ra.add(dv);
  }
  final chu = '${ra.join(' ').replaceAll(RegExp(r'\s+'), ' ').trim()} đồng';
  return chu[0].toUpperCase() + chu.substring(1);
}
