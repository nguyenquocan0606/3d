import 'json.dart';

/// Cột thông tin tùy biến của tab Hàng hóa cửa hàng (`StoreConfig.truongRieng`).
class StoreField {
  const StoreField({required this.id, required this.ten});

  final String id;
  final String ten;

  factory StoreField.fromJson(Map<String, dynamic> json) => StoreField(
        id: asString(json['id']),
        ten: asString(json['ten']),
      );

  Map<String, dynamic> toJson() => {'id': id, 'ten': ten};

  /// Bộ cột mặc định khi server trả `truongRieng = null`.
  static const defaults = <StoreField>[
    StoreField(id: 'viTri', ten: 'Vị trí kệ'),
    StoreField(id: 'hanDung', ten: 'Hạn dùng'),
    StoreField(id: 'kichThuoc', ten: 'Kích thước'),
  ];
}

/// Ảnh / file in đính kèm hàng hóa. `duLieu` là data URL base64 và **rỗng** khi
/// mới tải danh sách (server cố tình lược bỏ để danh sách không nặng hàng chục MB).
class StoreAttachment {
  const StoreAttachment({
    required this.id,
    required this.ten,
    required this.duLieu,
    required this.loai,
    required this.dungLuong,
  });

  final String id;
  final String ten;
  final String duLieu;
  final String loai;
  final int dungLuong;

  bool get hasData => duLieu.isNotEmpty;

  factory StoreAttachment.fromJson(Map<String, dynamic> json) => StoreAttachment(
        id: asString(json['id']),
        ten: asString(json['ten']),
        duLieu: asString(json['duLieu']),
        loai: asString(json['loai']),
        dungLuong: asInt(json['dungLuong']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'ten': ten,
        'duLieu': duLieu,
        'loai': loai,
        'dungLuong': dungLuong,
      };
}

class StoreHistoryEntry {
  const StoreHistoryEntry({
    required this.id,
    required this.thoiGian,
    required this.noiDung,
  });

  final String id;
  final String thoiGian; // ISO string — giữ nguyên dạng String như backend
  final String noiDung;

  DateTime? get time => DateTime.tryParse(thoiGian)?.toLocal();

  factory StoreHistoryEntry.fromJson(Map<String, dynamic> json) => StoreHistoryEntry(
        id: asString(json['id']),
        thoiGian: asString(json['thoiGian']),
        noiDung: asString(json['noiDung']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'thoiGian': thoiGian,
        'noiDung': noiDung,
      };
}

/// Hàng hóa cửa hàng.
///
/// Lưu ý khi làm việc với model này:
/// - `ngayTao` / `ngayCapNhat` là **String ISO** (backend cố tình để String).
/// - `gia`, `giaBanLe`, `giaKhuyenMai` do **server tự tính từ `giaVon`** — client
///   không được sửa tay (xem `lib/core/format/pricing.dart` để preview).
/// - Combo con (`parentId != null`) có `soLuong` tính "sống" từ sản phẩm mẹ.
class StoreProduct {
  const StoreProduct({
    required this.id,
    required this.maQR,
    required this.ten,
    required this.danhMuc,
    required this.giaVon,
    required this.gia,
    required this.giaBanLe,
    required this.giaKhuyenMai,
    required this.soLuong,
    required this.donVi,
    required this.nguongCanhBao,
    required this.nhaCungCap,
    required this.ghiChu,
    required this.thongTinRieng,
    required this.ngayTao,
    required this.ngayCapNhat,
    this.anhDaiDien,
    this.anh = const [],
    this.tepIn = const [],
    this.lichSu = const [],
    this.parentId,
    this.soLuongCombo,
  });

  final String id;
  final String maQR;
  final String ten;
  final String danhMuc;
  final double giaVon;
  final double gia;
  final double giaBanLe;
  final double giaKhuyenMai;
  final int soLuong;
  final String donVi;
  final int nguongCanhBao;
  final String nhaCungCap;
  final String ghiChu;
  final Map<String, String> thongTinRieng;
  final String ngayTao;
  final String ngayCapNhat;
  final String? anhDaiDien;
  final List<StoreAttachment> anh;
  final List<StoreAttachment> tepIn;
  final List<StoreHistoryEntry> lichSu;
  final String? parentId;
  final int? soLuongCombo;

  bool get isCombo => parentId != null && soLuongCombo != null;
  bool get isLowStock => soLuong <= nguongCanhBao;
  double get inventoryValue => soLuong * gia;

  String get searchText =>
      '$id $maQR $ten $danhMuc $nhaCungCap $ghiChu ${thongTinRieng.values.join(' ')}'
          .toLowerCase();

  factory StoreProduct.fromJson(Map<String, dynamic> json) {
    final custom = asMap(json['thongTinRieng'])
        .map((key, dynamic value) => MapEntry(key, asString(value)));

    return StoreProduct(
      id: asString(json['id']),
      maQR: asString(json['maQR']),
      ten: asString(json['ten']),
      danhMuc: asString(json['danhMuc'], 'Chưa phân loại'),
      giaVon: asDouble(json['giaVon']),
      gia: asDouble(json['gia']),
      giaBanLe: asDouble(json['giaBanLe']),
      giaKhuyenMai: asDouble(json['giaKhuyenMai']),
      soLuong: asInt(json['soLuong']),
      donVi: asString(json['donVi'], 'cái'),
      nguongCanhBao: asInt(json['nguongCanhBao'], 5),
      nhaCungCap: asString(json['nhaCungCap']),
      ghiChu: asString(json['ghiChu']),
      thongTinRieng: custom,
      ngayTao: asString(json['ngayTao']),
      ngayCapNhat: asString(json['ngayCapNhat']),
      anhDaiDien: asStringOrNull(json['anhDaiDien']),
      anh: asList(json['anh'], StoreAttachment.fromJson),
      tepIn: asList(json['tepIn'], StoreAttachment.fromJson),
      lichSu: asList(json['lichSu'], StoreHistoryEntry.fromJson),
      parentId: asStringOrNull(json['parentId']),
      soLuongCombo: asIntOrNull(json['soLuongCombo']),
    );
  }

  /// Payload gửi lên `PUT /api/store-products`.
  ///
  /// [includeAnh] / [includeTepIn] = false thì **bỏ hẳn field** khỏi payload —
  /// backend hiểu "không gửi" là giữ nguyên dữ liệu cũ, còn gửi mảng rỗng là xóa hết.
  Map<String, dynamic> toSyncJson({
    bool includeAnh = false,
    bool includeTepIn = false,
  }) {
    return {
      'id': id,
      'maQR': maQR,
      'ten': ten,
      'danhMuc': danhMuc,
      'giaVon': giaVon,
      'soLuong': soLuong,
      'donVi': donVi,
      'nguongCanhBao': nguongCanhBao,
      'nhaCungCap': nhaCungCap,
      'ghiChu': ghiChu,
      'thongTinRieng': thongTinRieng,
      'lichSu': lichSu.map((e) => e.toJson()).toList(),
      'ngayTao': ngayTao,
      'ngayCapNhat': ngayCapNhat,
      'parentId': parentId,
      'soLuongCombo': soLuongCombo,
      if (includeAnh) 'anh': anh.map((e) => e.toJson()).toList(),
      if (includeTepIn) 'tepIn': tepIn.map((e) => e.toJson()).toList(),
    };
  }

  StoreProduct copyWith({
    int? soLuong,
    String? ngayCapNhat,
    List<StoreAttachment>? anh,
    List<StoreAttachment>? tepIn,
    List<StoreHistoryEntry>? lichSu,
  }) {
    return StoreProduct(
      id: id,
      maQR: maQR,
      ten: ten,
      danhMuc: danhMuc,
      giaVon: giaVon,
      gia: gia,
      giaBanLe: giaBanLe,
      giaKhuyenMai: giaKhuyenMai,
      soLuong: soLuong ?? this.soLuong,
      donVi: donVi,
      nguongCanhBao: nguongCanhBao,
      nhaCungCap: nhaCungCap,
      ghiChu: ghiChu,
      thongTinRieng: thongTinRieng,
      ngayTao: ngayTao,
      ngayCapNhat: ngayCapNhat ?? this.ngayCapNhat,
      anhDaiDien: anhDaiDien,
      anh: anh ?? this.anh,
      tepIn: tepIn ?? this.tepIn,
      lichSu: lichSu ?? this.lichSu,
      parentId: parentId,
      soLuongCombo: soLuongCombo,
    );
  }
}

/// Kết quả `GET /api/store-products`.
class StoreSnapshot {
  const StoreSnapshot({required this.sanPham, required this.truongRieng});

  final List<StoreProduct> sanPham;
  final List<StoreField> truongRieng;

  factory StoreSnapshot.fromJson(Map<String, dynamic> json) {
    final rawFields = json['truongRieng'];
    return StoreSnapshot(
      sanPham: asList(json['sanPham'], StoreProduct.fromJson),
      // null = server chưa có cấu hình → dùng bộ cột mặc định của bản web.
      truongRieng: rawFields == null
          ? StoreField.defaults
          : asList(rawFields, StoreField.fromJson),
    );
  }
}
