import 'json.dart';

/// Mức nghiêm trọng của một sự kiện máy in — quyết định màu sắc và độ ồn của thông báo.
enum MucDoSuKien {
  tin('tin', 'Thông tin'),
  canhBao('canhBao', 'Cảnh báo'),
  loi('loi', 'Sự cố');

  const MucDoSuKien(this.value, this.label);
  final String value;
  final String label;

  static MucDoSuKien from(String? raw) => MucDoSuKien.values.firstWhere(
        (e) => e.value == raw,
        orElse: () => MucDoSuKien.tin,
      );
}

/// Một hoạt động của máy in do máy chủ ghi nhận (`SuKienMayIn` bên backend).
///
/// Đây là nguồn sự thật chứ không phải cái thông báo hiện ra: push có thể trượt (máy tắt, hết pin,
/// mất mạng) nhưng danh sách này thì không mất, nên màn Hoạt động máy in luôn đọc từ API.
class PrinterEvent {
  const PrinterEvent({
    required this.id,
    required this.printerId,
    required this.tenMay,
    required this.loai,
    required this.mucDo,
    required this.tieuDe,
    required this.noiDung,
    required this.createdAt,
    this.tienDo,
    this.tenFile,
    this.daGui = false,
  });

  final String id;
  final String printerId;
  final String tenMay;

  /// batDau | inXong | tamDung | inTiep | huy | loi | mangMat | mangLai | dungYen | nhietBatThuong
  final String loai;

  final MucDoSuKien mucDo;
  final String tieuDe;
  final String noiDung;
  final DateTime createdAt;
  final int? tienDo;
  final String? tenFile;
  final bool daGui;

  /// Biểu tượng đi kèm — khớp với bảng bên backend (`LOAI_SU_KIEN`) để web và app nhìn giống nhau.
  String get icon => switch (loai) {
        'batDau' => '🖨️',
        'inXong' => '✅',
        'tamDung' => '⏸️',
        'inTiep' => '▶️',
        'huy' => '🛑',
        'loi' => '🚨',
        'mangMat' => '📵',
        'mangLai' => '📶',
        'dungYen' => '⚠️',
        'nhietBatThuong' => '🔥',
        _ => '🔔',
      };

  factory PrinterEvent.fromJson(Map<String, dynamic> json) => PrinterEvent(
        id: asString(json['id']),
        printerId: asString(json['printerId']),
        tenMay: asString(json['tenMay']),
        loai: asString(json['loai']),
        mucDo: MucDoSuKien.from(asStringOrNull(json['mucDo'])),
        tieuDe: asString(json['tieuDe']),
        noiDung: asString(json['noiDung']),
        createdAt: asDateOr(json['createdAt'], DateTime.now()),
        tienDo: asIntOrNull(json['tienDo']),
        tenFile: asStringOrNull(json['tenFile']),
        daGui: asBool(json['daGui']),
      );
}
