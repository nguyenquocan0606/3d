import 'json.dart';

/// Trạng thái cuộn nhựa — khớp `Spool.status` của backend.
enum SpoolStatus {
  active('active', 'Đang dùng'),
  depleted('depleted', 'Hết nhựa'),
  archived('archived', 'Lưu trữ');

  const SpoolStatus(this.value, this.label);
  final String value;
  final String label;

  static SpoolStatus from(String? raw) => SpoolStatus.values.firstWhere(
        (e) => e.value == raw,
        orElse: () => SpoolStatus.active,
      );
}

/// Loại nhựa (type + màu + hãng). UNIQUE(type, colorName, brand) ở DB.
class Filament {
  const Filament({
    required this.id,
    required this.type,
    required this.colorName,
    this.colorHex,
    this.brand,
    this.spools = const [],
  });

  final String id;
  final String type;
  final String colorName;
  final String? colorHex;
  final String? brand;
  final List<Spool> spools;

  String get displayName => [brand, type].where((e) => e != null && e.isNotEmpty).join(' ');

  double get totalRemainingG =>
      spools.fold<double>(0, (sum, spool) => sum + spool.remainingWeightG);

  factory Filament.fromJson(Map<String, dynamic> json) {
    final filament = Filament(
      id: asString(json['id']),
      type: asString(json['type']),
      colorName: asString(json['colorName']),
      colorHex: asStringOrNull(json['colorHex']),
      brand: asStringOrNull(json['brand']),
    );
    // Spool lồng trong filament không có sẵn thông tin loại nhựa — bơm ngược vào
    // để mọi nơi trong app dùng chung một model "cuộn nhựa đã đủ thông tin".
    final spools = asMapList(json['spools'])
        .map((raw) => Spool.fromJson(raw, filament: filament))
        .toList();
    return filament.copyWith(spools: spools);
  }

  Filament copyWith({List<Spool>? spools}) => Filament(
        id: id,
        type: type,
        colorName: colorName,
        colorHex: colorHex,
        brand: brand,
        spools: spools ?? this.spools,
      );
}

/// Cuộn nhựa — thực thể trung tâm của hệ thống.
///
/// Backend trả cuộn ở 2 dạng: lồng trong `/api/filaments` (không kèm filament) và
/// lồng trong `/api/locations` hoặc `/api/printers` (có kèm `filament`). Model này
/// làm phẳng cả hai về cùng một dạng "đã đủ thông tin hiển thị".
class Spool {
  const Spool({
    required this.id,
    required this.filamentId,
    required this.initialWeightG,
    required this.emptySpoolWeightG,
    required this.remainingWeightG,
    required this.status,
    this.locationId,
    this.locationName,
    this.printerId,
    this.printerName,
    this.printerSlot,
    this.filamentType = '',
    this.filamentColorName = '',
    this.filamentColorHex,
    this.filamentBrand,
    this.updatedAt,
  });

  final String id;
  final String filamentId;
  final double initialWeightG;
  final double emptySpoolWeightG;
  final double remainingWeightG;
  final SpoolStatus status;

  final String? locationId;
  final String? locationName;
  final String? printerId;
  final String? printerName;
  final int? printerSlot;

  final String filamentType;
  final String filamentColorName;
  final String? filamentColorHex;
  final String? filamentBrand;

  final DateTime? updatedAt;

  /// Tỉ lệ nhựa còn lại 0..1 — dùng cho thanh tiến trình và cảnh báo sắp hết.
  double get remainingRatio =>
      initialWeightG <= 0 ? 0.0 : (remainingWeightG / initialWeightG).clamp(0.0, 1.0);

  /// Ngưỡng "sắp hết" của Dashboard backend: active && còn dưới 20%.
  bool get isLow => status == SpoolStatus.active && remainingRatio < 0.2;

  /// Cuộn đang ở kho hay trên máy in — hai thứ này loại trừ lẫn nhau ở backend.
  String get placeLabel {
    if (locationId != null) return locationName ?? locationId!;
    if (printerId != null) {
      final base = printerName ?? printerId!;
      return printerSlot != null ? '$base · Line $printerSlot' : base;
    }
    return 'Chưa xếp chỗ';
  }

  String get materialLabel =>
      [filamentBrand, filamentType].where((e) => e != null && e.isNotEmpty).join(' ');

  /// Text dùng cho tìm kiếm phía client (backend chưa có filter).
  String get searchText =>
      '$id $filamentType $filamentColorName ${filamentBrand ?? ''} ${status.value}'
          .toLowerCase();

  factory Spool.fromJson(Map<String, dynamic> json, {Filament? filament}) {
    final nestedFilament = asMap(json['filament']);
    final location = asMap(json['location']);
    final printer = asMap(json['printer']);

    return Spool(
      id: asString(json['id']),
      filamentId: asString(json['filamentId']),
      initialWeightG: asDouble(json['initialWeightG']),
      emptySpoolWeightG: asDouble(json['emptySpoolWeightG'], 220),
      remainingWeightG: asDouble(json['remainingWeightG']),
      status: SpoolStatus.from(asStringOrNull(json['status'])),
      locationId: asStringOrNull(json['locationId']),
      locationName: asStringOrNull(location['name']),
      printerId: asStringOrNull(json['printerId']),
      printerName: asStringOrNull(printer['name']),
      printerSlot: asIntOrNull(json['printerSlot']),
      filamentType: filament?.type ?? asString(nestedFilament['type']),
      filamentColorName: filament?.colorName ?? asString(nestedFilament['colorName']),
      filamentColorHex:
          filament?.colorHex ?? asStringOrNull(nestedFilament['colorHex']),
      filamentBrand: filament?.brand ?? asStringOrNull(nestedFilament['brand']),
      updatedAt: asDate(json['updatedAt']),
    );
  }

  Spool copyWith({
    double? remainingWeightG,
    double? emptySpoolWeightG,
    SpoolStatus? status,
    String? locationId,
    String? locationName,
    String? printerId,
    String? printerName,
    int? printerSlot,
    bool clearLocation = false,
    bool clearPrinter = false,
  }) {
    return Spool(
      id: id,
      filamentId: filamentId,
      initialWeightG: initialWeightG,
      emptySpoolWeightG: emptySpoolWeightG ?? this.emptySpoolWeightG,
      remainingWeightG: remainingWeightG ?? this.remainingWeightG,
      status: status ?? this.status,
      locationId: clearLocation ? null : (locationId ?? this.locationId),
      locationName: clearLocation ? null : (locationName ?? this.locationName),
      printerId: clearPrinter ? null : (printerId ?? this.printerId),
      printerName: clearPrinter ? null : (printerName ?? this.printerName),
      printerSlot: clearPrinter ? null : (printerSlot ?? this.printerSlot),
      filamentType: filamentType,
      filamentColorName: filamentColorName,
      filamentColorHex: filamentColorHex,
      filamentBrand: filamentBrand,
      updatedAt: updatedAt,
    );
  }
}

/// Thống kê Dashboard — `GET /api/dashboard/stats`.
class DashboardStats {
  const DashboardStats({
    required this.totalSpools,
    required this.activeSpools,
    required this.depletedSpools,
    required this.lowSpools,
    required this.totalRemainingWeightG,
    required this.spoolsByMaterialType,
    required this.spoolsByColor,
  });

  final int totalSpools;
  final int activeSpools;
  final int depletedSpools;
  final int lowSpools;
  final double totalRemainingWeightG;
  final Map<String, int> spoolsByMaterialType;
  final Map<String, int> spoolsByColor;

  factory DashboardStats.fromJson(Map<String, dynamic> json) {
    Map<String, int> counts(dynamic value) => asMap(value)
        .map((key, dynamic count) => MapEntry(key, asInt(count)));

    return DashboardStats(
      totalSpools: asInt(json['totalSpools']),
      activeSpools: asInt(json['activeSpools']),
      depletedSpools: asInt(json['depletedSpools']),
      lowSpools: asInt(json['lowSpools']),
      totalRemainingWeightG: asDouble(json['totalRemainingWeightG']),
      spoolsByMaterialType: counts(json['spoolsByMaterialType']),
      spoolsByColor: counts(json['spoolsByColor']),
    );
  }
}
