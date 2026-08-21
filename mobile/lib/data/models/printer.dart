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

/// Nguồn dữ liệu đang dùng cho một máy in.
enum NguonDuLieu {
  mqtt('mqtt', 'MQTT trực tiếp'),
  ha('ha', 'Qua Home Assistant'),
  mat('mat', 'Mất kết nối');

  const NguonDuLieu(this.value, this.label);
  final String value;
  final String label;

  static NguonDuLieu from(String? raw) => NguonDuLieu.values.firstWhere(
        (e) => e.value == raw,
        orElse: () => NguonDuLieu.mat,
      );
}

/// Một lỗi HMS máy đang báo. **Không sinh thông báo** — chỉ hiện ra để người sửa máy biết đường mò.
class LoiHms {
  const LoiHms({
    required this.ma,
    required this.mucDo,
    required this.nang,
    required this.wiki,
    this.moTa,
  });

  final String ma;
  final String mucDo;

  /// Nặng = fatal/serious. Chỉ dùng để xếp thứ tự và tô màu.
  final bool nang;
  final String wiki;

  /// Mô tả tiếng Anh của Bambu. Chỉ có khi dữ liệu đi đường Home Assistant.
  final String? moTa;

  factory LoiHms.fromJson(Map<String, dynamic> json) => LoiHms(
        ma: asString(json['ma']),
        mucDo: asString(json['mucDo']),
        nang: asBool(json['nang']),
        wiki: asString(json['wiki']),
        moTa: asStringOrNull(json['moTa']),
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
    this.lanIp,
    this.lanSerial,
    this.coAccessCode = false,
    this.spools = const [],
    this.activeTask,
  });

  final String id;
  final String name;
  final PrinterState status;
  final String? model;
  final String? cloudAccountId;
  final String? cloudPrinterId;
  final String? lanIp;
  final String? lanSerial;

  /// Máy chủ **không bao giờ** trả Access Code về client — chỉ cho biết đã lưu hay chưa.
  final bool coAccessCode;
  final List<Spool> spools;

  /// Backend chỉ include 1 task `status = printing` mới nhất.
  final Map<String, dynamic>? activeTask;

  bool get isCloudLinked => cloudAccountId != null && cloudAccountId!.isNotEmpty;

  /// Đủ ba thứ mới nối thẳng MQTT được; thiếu thì máy chỉ đọc qua Home Assistant.
  bool get coKetNoiTrucTiep =>
      (lanIp?.isNotEmpty ?? false) && (lanSerial?.isNotEmpty ?? false) && coAccessCode;

  factory Printer.fromJson(Map<String, dynamic> json) {
    final name = asString(json['name']);
    final id = asString(json['id']);
    final tasks = asMapList(json['tasks']);

    return Printer(
      id: id,
      name: name,
      status: PrinterState.from(asStringOrNull(json['status'])),
      model: asStringOrNull(json['model']),
      cloudAccountId: asStringOrNull(json['cloudAccountId']),
      cloudPrinterId: asStringOrNull(json['cloudPrinterId']),
      lanIp: asStringOrNull(json['lanIp']),
      lanSerial: asStringOrNull(json['lanSerial']),
      coAccessCode: asBool(json['coAccessCode']),
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

  /// Dữ liệu đang lấy từ đâu — MQTT thẳng tới máy, hay mượn Home Assistant.
  NguonDuLieu get nguon => NguonDuLieu.from(asStringOrNull(payload['nguon']));

  /// Máy có cấu hình MQTT nhưng đang phải chạy đường dự phòng — cái này đáng để ý.
  bool get mqttRoi => asBool(payload['mqtt_roi']);

  /// Lý do máy dừng, VD "tắc đầu phun". null nghĩa là không phải đang dừng.
  String? get lyDoDung => asStringOrNull(payload['ly_do_dung']);

  /// Dừng do hỏng hóc (true) hay do người/G-code chủ động (false).
  bool get dungDoSuCo => asBool(payload['dung_do_su_co']);

  String? get maLoiIn => asStringOrNull(payload['print_error']);

  /// Toàn bộ lỗi HMS máy đang báo, nặng xếp trước.
  List<LoiHms> get loiHms => asList(payload['hms'], LoiHms.fromJson);

  /// URL ảnh preview đã ghép đủ để `Image.network` tải được.
  ///
  /// Ảnh lấy thẳng từ máy in đi qua một route của máy chủ nên backend trả đường dẫn **tương đối**;
  /// còn ảnh từ Home Assistant vốn đã là URL tuyệt đối. Nhận cả hai dạng.
  String? anhDayDu(String baseUrl) {
    final u = previewUrl;
    if (u == null || u.isEmpty) return null;
    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    return '${baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl}$u';
  }

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

/// Một máy in mà Home Assistant nhìn thấy — dùng để tự điền form thêm/sửa.
/// HA cho sẵn IP và serial, nhưng **không** có Access Code (nằm trong config entry, không thành
/// entity) nên ô đó vẫn phải gõ từ màn hình máy in.
class GoiYTuHa {
  const GoiYTuHa({
    required this.haId,
    required this.ten,
    required this.daGhep,
    this.ip,
    this.serial,
  });

  final String haId;
  final String ten;
  final bool daGhep;
  final String? ip;
  final String? serial;

  factory GoiYTuHa.fromJson(Map<String, dynamic> json) => GoiYTuHa(
        haId: asString(json['haId']),
        ten: asString(json['ten']),
        daGhep: asBool(json['daGhep']),
        ip: asStringOrNull(json['ip']),
        serial: asStringOrNull(json['serial']),
      );
}
