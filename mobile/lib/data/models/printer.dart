import 'filament.dart';
import 'json.dart';

/// Trạng thái máy in do backend lưu (`Printer.status`).
enum PrinterState {
  idle('idle', 'Rảnh'),
  printing('printing', 'Đang in'),
  maintenance('maintenance', 'Bảo trì');

  const PrinterState(this.value, this.label);
  final String value;
  final String label;

  static PrinterState from(String? raw) => PrinterState.values.firstWhere(
        (e) => e.value == raw,
        orElse: () => PrinterState.idle,
      );
}

/// Trạng thái realtime lấy từ provider cloud (`PrinterStatusData` của backend).
enum LiveState {
  idle('idle', 'Rảnh'),
  printing('printing', 'Đang in'),
  offline('offline', 'Mất kết nối'),
  maintenance('maintenance', 'Bảo trì'),
  error('error', 'Lỗi / tạm dừng');

  const LiveState(this.value, this.label);
  final String value;
  final String label;

  static LiveState from(String? raw) => LiveState.values.firstWhere(
        (e) => e.value == raw,
        orElse: () => LiveState.offline,
      );
}

/// Tài khoản cloud — API **không bao giờ trả field `token`** về client.
class CloudAccount {
  const CloudAccount({
    required this.id,
    required this.provider,
    this.email,
    this.isActive = true,
  });

  final String id;
  final String provider; // bambulab | moonraker
  final String? email; // thực chất là URL (HA hoặc Moonraker)
  final bool isActive;

  String get providerLabel => switch (provider) {
        'bambulab' => 'Bambu Lab (Home Assistant)',
        'moonraker' => 'Moonraker / Klipper',
        _ => provider,
      };

  factory CloudAccount.fromJson(Map<String, dynamic> json) => CloudAccount(
        id: asString(json['id']),
        provider: asString(json['provider']),
        email: asStringOrNull(json['email']),
        isActive: asBool(json['isActive'], true),
      );
}

class Printer {
  const Printer({
    required this.id,
    required this.name,
    required this.status,
    this.model,
    this.cloudAccountId,
    this.cloudPrinterId,
    this.cloudAccount,
    this.spools = const [],
    this.activeTask,
  });

  final String id;
  final String name;
  final PrinterState status;
  final String? model;
  final String? cloudAccountId;
  final String? cloudPrinterId;
  final CloudAccount? cloudAccount;
  final List<Spool> spools;

  /// Backend chỉ include 1 task `status = printing` mới nhất.
  final Map<String, dynamic>? activeTask;

  bool get isCloudLinked => cloudAccountId != null && cloudAccountId!.isNotEmpty;

  factory Printer.fromJson(Map<String, dynamic> json) {
    final name = asString(json['name']);
    final id = asString(json['id']);
    final tasks = asMapList(json['tasks']);
    final account = json['cloudAccount'];

    return Printer(
      id: id,
      name: name,
      status: PrinterState.from(asStringOrNull(json['status'])),
      model: asStringOrNull(json['model']),
      cloudAccountId: asStringOrNull(json['cloudAccountId']),
      cloudPrinterId: asStringOrNull(json['cloudPrinterId']),
      cloudAccount: account is Map ? CloudAccount.fromJson(asMap(account)) : null,
      spools: asMapList(json['spools'])
          .map((raw) => Spool.fromJson(raw).copyWith(printerId: id, printerName: name))
          .toList(),
      activeTask: tasks.isEmpty ? null : tasks.first,
    );
  }
}

/// 1 khay AMS. `null` trong mảng `materials` nghĩa là khay trống — phải giữ null
/// để không lệch thứ tự slot (UI map theo index 0..3 = Line 1..4).
class AmsTray {
  const AmsTray({required this.name, required this.color});

  final String name;
  final String color;

  factory AmsTray.fromJson(Map<String, dynamic> json) => AmsTray(
        name: asString(json['name']),
        color: asString(json['color'], '#FFFFFF'),
      );
}

/// Trạng thái realtime của 1 máy in — `GET /api/printers/cloud/status`.
class PrinterLiveStatus {
  const PrinterLiveStatus({
    required this.status,
    required this.nozzleTemp,
    required this.nozzleTargetTemp,
    required this.bedTemp,
    required this.bedTargetTemp,
    required this.progress,
    this.remainingTimeSeconds,
    this.fileName,
    this.previewUrl,
    this.materials = const [],
    this.extendedInfo = const {},
  });

  final LiveState status;
  final double nozzleTemp;
  final double nozzleTargetTemp;
  final double bedTemp;
  final double bedTargetTemp;
  final int progress; // 0..100
  final int? remainingTimeSeconds;
  final String? fileName;
  final String? previewUrl;
  final List<AmsTray?> materials;
  final Map<String, dynamic> extendedInfo;

  /// Payload chi tiết do provider bơm vào (`extendedInfo.payload`).
  Map<String, dynamic> get payload => asMap(extendedInfo['payload']);

  String get providerName => asString(extendedInfo['provider']);

  bool get isChamberLightOn => asBool(payload['chamber_light']);

  int? get currentLayer => asIntOrNull(payload['layer_num']);
  int? get totalLayers => asIntOrNull(payload['total_layers']);

  factory PrinterLiveStatus.fromJson(Map<String, dynamic> json) {
    final rawMaterials = json['materials'];
    final materials = <AmsTray?>[];
    if (rawMaterials is List) {
      for (final item in rawMaterials) {
        materials.add(item is Map ? AmsTray.fromJson(asMap(item)) : null);
      }
    }

    return PrinterLiveStatus(
      status: LiveState.from(asStringOrNull(json['status'])),
      nozzleTemp: asDouble(json['nozzleTemp']),
      nozzleTargetTemp: asDouble(json['nozzleTargetTemp']),
      bedTemp: asDouble(json['bedTemp']),
      bedTargetTemp: asDouble(json['bedTargetTemp']),
      progress: asInt(json['progress']).clamp(0, 100).toInt(),
      remainingTimeSeconds: asIntOrNull(json['remainingTimeSeconds']),
      fileName: asStringOrNull(json['fileName']),
      previewUrl: asStringOrNull(json['previewUrl']),
      materials: materials,
      extendedInfo: asMap(json['extendedInfo']),
    );
  }
}

/// Máy in tìm thấy trên cloud khi login/discover, kèm thông tin đã ghép hay chưa.
class DiscoveredCloudPrinter {
  const DiscoveredCloudPrinter({
    required this.id,
    required this.name,
    this.model,
    this.linkedLocalId,
  });

  final String id;
  final String name;
  final String? model;
  final String? linkedLocalId;

  factory DiscoveredCloudPrinter.fromJson(Map<String, dynamic> json) =>
      DiscoveredCloudPrinter(
        id: asString(json['id']),
        name: asString(json['name']),
        model: asStringOrNull(json['model']),
        linkedLocalId: asStringOrNull(json['linkedLocalId']),
      );
}
