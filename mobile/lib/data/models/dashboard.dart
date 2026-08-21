import 'json.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Tầng 1: Cảnh báo  (`GET /api/dashboard/canh-bao`)
// ─────────────────────────────────────────────────────────────────────────────

/// Mức độ nghiêm trọng — khớp với type `MucDoCanhBao` của backend.
enum MucDoCanhBao {
  loi('loi'),
  canhBao('canhBao'),
  tin('tin');

  const MucDoCanhBao(this.value);
  final String value;

  static MucDoCanhBao from(String? raw) => MucDoCanhBao.values.firstWhere(
        (e) => e.value == raw,
        orElse: () => MucDoCanhBao.tin,
      );
}

/// Một mục cảnh báo trả về từ `/api/dashboard/canh-bao`.
class CanhBao {
  const CanhBao({
    required this.ma,
    required this.mucDo,
    required this.tieuDe,
    required this.soLuong,
    this.dichDenApp,
  });

  /// Mã định danh (C1 … C20) — dùng để phân biệt C12 cần dẫn tới màn riêng.
  final String ma;
  final MucDoCanhBao mucDo;
  final String tieuDe;
  final int soLuong;

  /// Deep-link của app (field `dichDen.app` từ API). Có thể null nếu API chưa
  /// map cho nền tảng này. Xử lý điều hướng thực tế ở màn hình chứ không ở đây.
  final String? dichDenApp;

  factory CanhBao.fromJson(Map<String, dynamic> json) {
    final dichDen = asMap(json['dichDen']);
    return CanhBao(
      ma: asString(json['ma']),
      mucDo: MucDoCanhBao.from(asStringOrNull(json['mucDo'])),
      tieuDe: asString(json['tieuDe']),
      soLuong: asInt(json['soLuong']),
      dichDenApp: asStringOrNull(dichDen['app']),
    );
  }
}

/// Toàn bộ phản hồi từ `/api/dashboard/canh-bao`, đã parse xong.
class KetQuaCanhBao {
  const KetQuaCanhBao({
    required this.tinhLuc,
    required this.canhBao,
    required this.soLoi,
    required this.soCanhBao,
    required this.soTin,
  });

  final DateTime tinhLuc;
  final List<CanhBao> canhBao;
  final int soLoi;
  final int soCanhBao;
  final int soTin;

  bool get coGi => canhBao.isNotEmpty;

  factory KetQuaCanhBao.fromJson(Map<String, dynamic> json) {
    // API trả `{ "status": "success", "data": { ... } }` hoặc trực tiếp `data`.
    final data = json.containsKey('data') ? asMap(json['data']) : json;
    final tong = asMap(data['tongTheoMuc']);
    return KetQuaCanhBao(
      tinhLuc: asDate(data['tinhLuc']) ?? DateTime.now(),
      canhBao: asList(data['canhBao'], CanhBao.fromJson),
      soLoi: asInt(tong['loi']),
      soCanhBao: asInt(tong['canhBao']),
      soTin: asInt(tong['tin']),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tầng 2: Tổng quan  (`GET /api/dashboard/tong-quan?range=today`)
// ─────────────────────────────────────────────────────────────────────────────

/// Một lượt SLL đang in ngay lúc này.
class LuotDangIn {
  const LuotDangIn({
    required this.id,
    required this.may,
    required this.peiIndex,
    required this.soCon,
    required this.phutDaTroi,
  });

  final String id;
  final String may;
  final int peiIndex;
  final int soCon;
  final int phutDaTroi;

  factory LuotDangIn.fromJson(Map<String, dynamic> json) => LuotDangIn(
        id: asString(json['id']),
        may: asString(json['may']),
        peiIndex: asInt(json['peiIndex']),
        soCon: asInt(json['soCon']),
        phutDaTroi: asInt(json['phutDaTroi']),
      );
}

/// KPI sản xuất SLL trích từ `/api/dashboard/tong-quan`.
class SanXuatSLLKpi {
  const SanXuatSLLKpi({
    required this.conXong,
    required this.conLoi,
    this.tiLeLoi,
    required this.soMayDangIn,
    required this.luotDangIn,
  });

  final int conXong;
  final int conLoi;

  /// null khi chưa có lượt nào trong kỳ — phân biệt "0% lỗi" và "chưa sản xuất".
  /// ⚠ metric: tính từ BulkRun (lượt SLL), không phải số cân đo thực tế.
  final double? tiLeLoi;

  /// Số máy đang chạy lượt SLL (đọc từ `luot.dangIn`).
  final int soMayDangIn;

  final List<LuotDangIn> luotDangIn;

  factory SanXuatSLLKpi.fromJson(Map<String, dynamic> json) {
    final luot = asMap(json['luot']);
    return SanXuatSLLKpi(
      conXong: asInt(json['conXong']),
      conLoi: asInt(json['conLoi']),
      tiLeLoi: asDoubleOrNull(json['tiLeLoi']),
      soMayDangIn: asInt(luot['dangIn']),
      luotDangIn: asList(json['luotDangIn'], LuotDangIn.fromJson),
    );
  }
}

/// Toàn bộ phản hồi `/api/dashboard/tong-quan`, chỉ lấy trường app cần.
///
/// App không dùng biểu đồ nên không parse xu hướng hay bảng xếp hạng (§2.7).
class KetQuaTongQuan {
  const KetQuaTongQuan({
    required this.nhanKy,
    this.sll,
    required this.kgCon,
  });

  final String nhanKy;

  /// null nếu server báo nhóm SLL lỗi khi tính (`allSettled`).
  final SanXuatSLLKpi? sll;

  /// Tổng nhựa còn (kg) — từ `nhua.kgCon`.
  final double kgCon;

  /// Số máy đang in (đọc từ SLL, hoặc 0 nếu SLL null).
  int get soMayDangIn => sll?.soMayDangIn ?? 0;

  /// Con xong hôm nay.
  int get conXong => sll?.conXong ?? 0;

  /// Tỉ lệ lỗi — null = không có lượt SLL nào trong kỳ (⚠ metric).
  double? get tiLeLoi => sll?.tiLeLoi;

  /// Lượt đang in, sắp xếp theo thời gian đã trôi (lâu nhất lên đầu).
  List<LuotDangIn> get luotDangIn {
    final list = List<LuotDangIn>.from(sll?.luotDangIn ?? const []);
    list.sort((a, b) => b.phutDaTroi.compareTo(a.phutDaTroi));
    return list;
  }

  factory KetQuaTongQuan.fromJson(Map<String, dynamic> json) {
    final data = json.containsKey('data') ? asMap(json['data']) : json;
    final ky = asMap(data['ky']);
    final nhua = asMap(data['nhua']);
    final sllRaw = data['sanXuatSLL'];

    return KetQuaTongQuan(
      nhanKy: asString(ky['nhan'], 'Hôm nay'),
      sll: sllRaw != null && sllRaw is Map
          ? SanXuatSLLKpi.fromJson(asMap(sllRaw))
          : null,
      kgCon: asDouble(nhua['kgCon']),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wrapper để phân biệt "dữ liệu mới" và "dữ liệu từ cache"
// ─────────────────────────────────────────────────────────────────────────────

/// Bọc kết quả để màn hình biết có cần hiện nhãn "Số liệu lúc HH:mm" không.
class DashboardResult<T> {
  const DashboardResult(this.data, {this.cachedAt});

  final T data;

  /// null = lấy thẳng từ server · non-null = đọc từ cache (hiện nhãn thời gian).
  final DateTime? cachedAt;

  bool get laCache => cachedAt != null;
}
