import 'json.dart';

/// 1 lần quét cuộn nhựa trong phiên kiểm kho.
class InventoryItem {
  const InventoryItem({
    required this.id,
    required this.spoolId,
    required this.scannedAt,
  });

  final String id;
  final String spoolId;
  final DateTime scannedAt;

  factory InventoryItem.fromJson(Map<String, dynamic> json) => InventoryItem(
        id: asString(json['id']),
        spoolId: asString(json['spoolId']),
        scannedAt: asDateOr(json['scannedAt'], DateTime.now()),
      );
}

/// Phiên kiểm kho đang hoạt động. Backend tự tạo phiên mới nếu chưa có.
class InventorySession {
  const InventorySession({
    required this.id,
    required this.active,
    this.items = const [],
  });

  final String id;
  final bool active;
  final List<InventoryItem> items;

  /// Map spoolId → đã quét, dùng cho lọc/sắp xếp phía client.
  Map<String, bool> get scannedMap => {for (final item in items) item.spoolId: true};

  factory InventorySession.fromJson(Map<String, dynamic> json) => InventorySession(
        id: asString(json['id']),
        active: asBool(json['active'], true),
        items: asList(json['items'], InventoryItem.fromJson),
      );
}

/// Lệnh in 3D (Task3D) + lượng nhựa đã dùng.
class PrintTask {
  const PrintTask({
    required this.id,
    required this.status,
    this.name,
    this.printerId,
    this.printerName,
    this.durationMinutes,
    this.estimatedEndTime,
    this.createdAt,
    this.usages = const [],
  });

  final String id;
  final String status; // printing | completed | failed | cancelled
  final String? name;
  final String? printerId;
  final String? printerName;
  final int? durationMinutes;
  final DateTime? estimatedEndTime;
  final DateTime? createdAt;
  final List<TaskSpoolUsage> usages;

  /// Backend không có endpoint kết thúc task, nên "đã quá giờ dự kiến" được suy ra
  /// ở client giống hệt bản web (`print-histories.tsx`).
  bool get isOverdue =>
      status == 'printing' &&
      estimatedEndTime != null &&
      estimatedEndTime!.isBefore(DateTime.now());

  Duration? get remaining {
    if (estimatedEndTime == null) return null;
    final diff = estimatedEndTime!.difference(DateTime.now());
    return diff.isNegative ? Duration.zero : diff;
  }

  double get totalUsedG => usages.fold<double>(0, (sum, u) => sum + u.usedWeightG);

  factory PrintTask.fromJson(Map<String, dynamic> json) {
    final printer = asMap(json['printer']);
    return PrintTask(
      id: asString(json['id']),
      status: asString(json['status'], 'printing'),
      name: asStringOrNull(json['name']),
      printerId: asStringOrNull(json['printerId']),
      printerName: asStringOrNull(printer['name']),
      durationMinutes: asIntOrNull(json['durationMinutes']),
      estimatedEndTime: asDate(json['estimatedEndTime']),
      createdAt: asDate(json['createdAt']),
      usages: asList(json['usages'], TaskSpoolUsage.fromJson),
    );
  }
}

class TaskSpoolUsage {
  const TaskSpoolUsage({
    required this.id,
    required this.usedWeightG,
    this.spoolId,
    this.filamentType,
    this.colorName,
    this.colorHex,
  });

  final String id;
  final double usedWeightG;
  final String? spoolId;
  final String? filamentType;
  final String? colorName;
  final String? colorHex;

  factory TaskSpoolUsage.fromJson(Map<String, dynamic> json) {
    final spool = asMap(json['spool']);
    final filament = asMap(spool['filament']);
    return TaskSpoolUsage(
      id: asString(json['id']),
      usedWeightG: asDouble(json['usedWeightG']),
      spoolId: asStringOrNull(json['spoolId']),
      filamentType: asStringOrNull(filament['type']),
      colorName: asStringOrNull(filament['colorName']),
      colorHex: asStringOrNull(filament['colorHex']),
    );
  }
}
