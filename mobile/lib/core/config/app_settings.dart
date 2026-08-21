import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../scan/scan_input_mode.dart';

/// Cấu hình kết nối tới máy chủ 3D Manage.
///
/// Địa chỉ mặc định trỏ thẳng máy chủ xưởng ([AppSettings.serverAddress]) để cài
/// xong là dùng được ngay, nhưng vẫn cho sửa trong màn Cài đặt vì khi ra khỏi
/// xưởng phải đi qua VPN/domain khác.
class AppSettings {
  const AppSettings({
    required this.baseUrl,
    required this.mqttUrl,
    required this.scaleTopic,
    required this.apiKey,
    required this.scaleOffset,
    required this.scanInputMode,
    required this.scaleEnabled,
    required this.tenThietBi,
    required this.thongBaoBat,
  });

  /// Mặc định là máy chủ xưởng: http://192.168.99.152:3000
  final String baseUrl;

  /// URL WebSocket của broker MQTT trạm cân.
  /// Mặc định suy ra từ baseUrl: ws://<host>:9001
  /// (bản web đi qua Next.js rewrite `/mqtt`, app nối thẳng broker cho ổn định).
  final String mqttUrl;

  /// Topic ESPHome publish khối lượng (gram).
  final String scaleTopic;

  /// Gửi kèm header `X-API-Key` — backend hiện chưa kiểm tra, để sẵn cho lúc bật auth.
  final String apiKey;

  /// Bù trừ cân: weight = rawWeight + scaleOffset (giống localStorage `scale_offset` bản web).
  final double scaleOffset;

  /// Máy này có nối trạm cân không.
  ///
  /// Tắt được là cần thiết: máy PDA ngoài kho không bao giờ đứng cạnh cân, mà kết
  /// nối MQTT vẫn chạy nền suốt ngày — tốn pin và giữ một socket vô ích. Cấu hình
  /// theo từng máy, giống [scanInputMode].
  final bool scaleEnabled;

  /// Máy này quét bằng camera hay bằng đầu đọc của máy PDA.
  ///
  /// Là cấu hình **của từng máy**, không đồng bộ lên server: cùng lúc trong xưởng
  /// có điện thoại chỉ có camera và PDA chỉ dùng cò cứng.
  final ScanInputMode scanInputMode;

  /// Tên máy này hiện trong danh sách thiết bị nhận thông báo trên web (VD "PDA kho 1").
  ///
  /// Để trống thì web chỉ thấy đuôi token — không biết cái nào là cái nào lúc muốn gỡ bớt.
  final String tenThietBi;

  /// Máy này có nhận thông báo đẩy về hoạt động máy in không.
  ///
  /// Theo từng máy, giống [scaleEnabled]: máy của thợ đứng cạnh máy in thì không cần bị réo,
  /// máy của quản lý thì cần. Tắt = app hủy đăng ký token với máy chủ, không phải chỉ ẩn đi.
  final bool thongBaoBat;

  /// Địa chỉ máy chủ 3D Manage trong LAN xưởng.
  ///
  /// Để ở đây (thay vì bắt nhập lần đầu) để cài xong là chạy được ngay. Vẫn đổi
  /// được trong Cài đặt khi ra khỏi xưởng (VPN/domain) hoặc khi máy chủ đổi IP.
  static const serverAddress = 'http://192.168.99.152:3000';

  static const defaults = AppSettings(
    baseUrl: serverAddress,
    mqttUrl: '',
    scaleTopic: 'esp-can/sensor/c__n_n___ng/state',
    apiKey: '',
    scaleOffset: 0,
    scanInputMode: ScanInputMode.camera,
    scaleEnabled: true,
    tenThietBi: '',
    thongBaoBat: true,
  );

  /// MQTT URL thực tế dùng để kết nối (tự suy ra nếu người dùng để trống).
  String get effectiveMqttUrl {
    if (mqttUrl.trim().isNotEmpty) return mqttUrl.trim();
    final uri = Uri.tryParse(baseUrl);
    if (uri == null || uri.host.isEmpty) return '';
    final scheme = uri.scheme == 'https' ? 'wss' : 'ws';
    return '$scheme://${uri.host}:9001';
  }

  AppSettings copyWith({
    String? baseUrl,
    String? mqttUrl,
    String? scaleTopic,
    String? apiKey,
    double? scaleOffset,
    ScanInputMode? scanInputMode,
    bool? scaleEnabled,
    String? tenThietBi,
    bool? thongBaoBat,
  }) {
    return AppSettings(
      baseUrl: baseUrl ?? this.baseUrl,
      mqttUrl: mqttUrl ?? this.mqttUrl,
      scaleTopic: scaleTopic ?? this.scaleTopic,
      apiKey: apiKey ?? this.apiKey,
      scaleOffset: scaleOffset ?? this.scaleOffset,
      scanInputMode: scanInputMode ?? this.scanInputMode,
      scaleEnabled: scaleEnabled ?? this.scaleEnabled,
      tenThietBi: tenThietBi ?? this.tenThietBi,
      thongBaoBat: thongBaoBat ?? this.thongBaoBat,
    );
  }
}

const _kBaseUrl = 'base_url';
const _kMqttUrl = 'mqtt_url';
const _kScaleTopic = 'scale_topic';
const _kApiKey = 'api_key';
const _kScaleOffset = 'scale_offset';
const _kScanInputMode = 'scan_input_mode';
const _kScaleEnabled = 'scale_enabled';
const _kTenThietBi = 'ten_thiet_bi';
const _kThongBaoBat = 'thong_bao_bat';

/// Được override trong main() sau khi SharedPreferences khởi tạo xong.
final sharedPreferencesProvider = Provider<SharedPreferences>(
  (ref) => throw UnimplementedError('sharedPreferencesProvider chưa được override'),
);

class AppSettingsNotifier extends Notifier<AppSettings> {
  @override
  AppSettings build() {
    final prefs = ref.watch(sharedPreferencesProvider);
    return AppSettings(
      baseUrl: prefs.getString(_kBaseUrl) ?? AppSettings.defaults.baseUrl,
      mqttUrl: prefs.getString(_kMqttUrl) ?? AppSettings.defaults.mqttUrl,
      scaleTopic: prefs.getString(_kScaleTopic) ?? AppSettings.defaults.scaleTopic,
      apiKey: prefs.getString(_kApiKey) ?? AppSettings.defaults.apiKey,
      scaleOffset: prefs.getDouble(_kScaleOffset) ?? 0,
      scanInputMode: ScanInputMode.fromName(prefs.getString(_kScanInputMode)),
      // Mặc định BẬT để máy đang dùng cân không bị mất tính năng sau khi cập nhật.
      scaleEnabled: prefs.getBool(_kScaleEnabled) ?? true,
      tenThietBi: prefs.getString(_kTenThietBi) ?? '',
      // Mặc định BẬT: tính năng sinh ra để kịp phát hiện lỗi, mặc định tắt thì coi như không có.
      thongBaoBat: prefs.getBool(_kThongBaoBat) ?? true,
    );
  }

  Future<void> update({
    String? baseUrl,
    String? mqttUrl,
    String? scaleTopic,
    String? apiKey,
  }) async {
    final prefs = ref.read(sharedPreferencesProvider);
    if (baseUrl != null) {
      await prefs.setString(_kBaseUrl, _normalizeBaseUrl(baseUrl));
    }
    if (mqttUrl != null) await prefs.setString(_kMqttUrl, mqttUrl.trim());
    if (scaleTopic != null) await prefs.setString(_kScaleTopic, scaleTopic.trim());
    if (apiKey != null) await prefs.setString(_kApiKey, apiKey.trim());

    state = state.copyWith(
      baseUrl: baseUrl == null ? null : _normalizeBaseUrl(baseUrl),
      mqttUrl: mqttUrl?.trim(),
      scaleTopic: scaleTopic?.trim(),
      apiKey: apiKey?.trim(),
    );
  }

  /// Đưa địa chỉ máy chủ về mặc định của xưởng.
  ///
  /// Cần thiết vì giá trị đã lưu trong SharedPreferences sẽ đè lên mặc định mới
  /// mỗi khi app cập nhật — không có nút này thì máy cũ mãi trỏ vào IP cũ.
  Future<void> resetServerAddress() => update(baseUrl: AppSettings.serverAddress, mqttUrl: '');

  Future<void> setScanInputMode(ScanInputMode mode) async {
    final prefs = ref.read(sharedPreferencesProvider);
    await prefs.setString(_kScanInputMode, mode.name);
    state = state.copyWith(scanInputMode: mode);
  }

  Future<void> setScaleEnabled(bool bat) async {
    final prefs = ref.read(sharedPreferencesProvider);
    await prefs.setBool(_kScaleEnabled, bat);
    state = state.copyWith(scaleEnabled: bat);
  }

  Future<void> setTenThietBi(String ten) async {
    final prefs = ref.read(sharedPreferencesProvider);
    await prefs.setString(_kTenThietBi, ten.trim());
    state = state.copyWith(tenThietBi: ten.trim());
  }

  Future<void> setThongBaoBat(bool bat) async {
    final prefs = ref.read(sharedPreferencesProvider);
    await prefs.setBool(_kThongBaoBat, bat);
    state = state.copyWith(thongBaoBat: bat);
  }

  Future<void> setScaleOffset(double offset) async {
    final prefs = ref.read(sharedPreferencesProvider);
    await prefs.setDouble(_kScaleOffset, offset);
    state = state.copyWith(scaleOffset: offset);
  }

  /// Bỏ dấu `/` cuối để nối đường dẫn API không bị `//`.
  static String _normalizeBaseUrl(String value) {
    var url = value.trim();
    while (url.endsWith('/')) {
      url = url.substring(0, url.length - 1);
    }
    return url;
  }
}

final appSettingsProvider =
    NotifierProvider<AppSettingsNotifier, AppSettings>(AppSettingsNotifier.new);
