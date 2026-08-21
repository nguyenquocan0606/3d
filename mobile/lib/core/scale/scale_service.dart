import 'dart:async';

// widgets.dart chứ không phải foundation.dart: AppLifecycleListener nằm ở tầng widgets.
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mqtt_client/mqtt_client.dart';
import 'package:mqtt_client/mqtt_server_client.dart';

import '../config/app_settings.dart';

enum ScaleConnection { disconnected, connecting, connected }

class ScaleState {
  const ScaleState({
    this.rawWeight = 0,
    this.offset = 0,
    this.connection = ScaleConnection.disconnected,
    this.lastError,
  });

  /// Số gram thô nhận từ ESP32.
  final double rawWeight;

  /// Bù trừ do người dùng hiệu chuẩn.
  final double offset;

  final ScaleConnection connection;
  final String? lastError;

  /// Khối lượng hiển thị = raw + offset (giống bản web).
  double get weight => rawWeight + offset;

  bool get isConnected => connection == ScaleConnection.connected;

  ScaleState copyWith({
    double? rawWeight,
    double? offset,
    ScaleConnection? connection,
    String? lastError,
    bool clearError = false,
  }) =>
      ScaleState(
        rawWeight: rawWeight ?? this.rawWeight,
        offset: offset ?? this.offset,
        connection: connection ?? this.connection,
        lastError: clearError ? null : (lastError ?? this.lastError),
      );
}

/// Kết nối MQTT tới trạm cân ESP32.
///
/// Bản web đi qua Next.js rewrite `/mqtt`; app nối thẳng broker WebSocket cho ổn
/// định. Hai điểm khác biệt quan trọng so với web:
///  1. iOS/Android đình chỉ socket khi app xuống nền → phải nối lại lúc resume.
///  2. Không bao giờ gọi `disconnect()` trong handler lỗi, nếu không cơ chế tự
///     reconnect sẽ chết luôn (đúng cái bẫy đã gặp ở `useScaleMqtt.ts`).
class ScaleNotifier extends Notifier<ScaleState> {
  MqttServerClient? _client;
  StreamSubscription<List<MqttReceivedMessage<MqttMessage>>>? _subscription;
  Timer? _retryTimer;
  AppLifecycleListener? _lifecycle;
  String? _connectedTo;

  @override
  ScaleState build() {
    final settings = ref.watch(appSettingsProvider);

    // iOS/Android đình chỉ socket khi app xuống nền → nối lại khi quay lại.
    _lifecycle?.dispose();
    _lifecycle = AppLifecycleListener(
      onResume: () {
        if (_client?.connectionStatus?.state != MqttConnectionState.connected) {
          _connect(ref.read(appSettingsProvider));
        }
      },
    );

    ref.onDispose(() {
      _lifecycle?.dispose();
      _lifecycle = null;
      _teardown();
    });

    // Đổi địa chỉ broker trong Cài đặt → nối lại từ đầu.
    Future.microtask(() => _connect(settings));

    return ScaleState(offset: settings.scaleOffset);
  }

  Future<void> reconnect() => _connect(ref.read(appSettingsProvider));

  Future<void> setOffset(double offset) async {
    await ref.read(appSettingsProvider.notifier).setScaleOffset(offset);
    state = state.copyWith(offset: offset);
  }

  /// Hiệu chuẩn: đặt số hiện tại về [target] (mặc định 0 = tare).
  Future<void> calibrateTo(double target) => setOffset(target - state.rawWeight);

  Future<void> _connect(AppSettings settings) async {
    // Máy không dùng cân (PDA ngoài kho) thì đóng hẳn socket thay vì để nó chạy
    // nền suốt ngày. Phải `_teardown` chứ không chỉ `return`: người dùng có thể
    // vừa tắt công tắc trong khi kết nối đang sống.
    if (!settings.scaleEnabled) {
      _teardown();
      state = state.copyWith(
        connection: ScaleConnection.disconnected,
        lastError: 'Đã tắt trạm cân trong Cài đặt.',
      );
      return;
    }

    final url = settings.effectiveMqttUrl;
    if (url.isEmpty) {
      state = state.copyWith(
        connection: ScaleConnection.disconnected,
        lastError: 'Chưa cấu hình địa chỉ broker MQTT.',
      );
      return;
    }

    // Đã nối đúng broker này rồi thì thôi.
    if (_connectedTo == url &&
        _client?.connectionStatus?.state == MqttConnectionState.connected) {
      return;
    }

    _teardown();
    _connectedTo = url;
    state = state.copyWith(
      connection: ScaleConnection.connecting,
      offset: settings.scaleOffset,
      clearError: true,
    );

    final uri = Uri.parse(url);
    final clientId = 'manage3d-${DateTime.now().millisecondsSinceEpoch}';
    // mqtt_client yêu cầu URL websocket không kèm cổng, cổng truyền riêng.
    final wsUrl = '${uri.scheme}://${uri.host}${uri.path}';
    final port = uri.hasPort ? uri.port : (uri.scheme == 'wss' ? 443 : 9001);

    final client = MqttServerClient.withPort(wsUrl, clientId, port)
      ..useWebSocket = true
      ..websocketProtocols = MqttClientConstants.protocolsSingleDefault
      ..logging(on: false)
      ..keepAlivePeriod = 30
      ..autoReconnect = true
      ..resubscribeOnAutoReconnect = true
      ..onDisconnected = _handleDisconnected
      ..onConnected = () => _handleConnected(settings.scaleTopic);

    _client = client;

    try {
      await client.connect();
    } catch (error) {
      state = state.copyWith(
        connection: ScaleConnection.disconnected,
        lastError: 'Không nối được trạm cân: $error',
      );
      _scheduleRetry();
      return;
    }

    _subscription = client.updates?.listen(_handleMessages);
  }

  void _handleConnected(String topic) {
    _retryTimer?.cancel();
    _client?.subscribe(topic, MqttQos.atMostOnce);
    state = state.copyWith(connection: ScaleConnection.connected, clearError: true);
  }

  void _handleDisconnected() {
    state = state.copyWith(connection: ScaleConnection.disconnected);
    // autoReconnect của mqtt_client lo phần lớn trường hợp; hẹn giờ này là lưới
    // an toàn cho lúc broker tắt hẳn rồi bật lại.
    _scheduleRetry();
  }

  void _handleMessages(List<MqttReceivedMessage<MqttMessage>> events) {
    for (final event in events) {
      final message = event.payload;
      if (message is! MqttPublishMessage) continue;
      final payload =
          MqttPublishPayload.bytesToStringAsString(message.payload.message);
      final value = double.tryParse(payload.trim());
      if (value != null) {
        state = state.copyWith(rawWeight: value, connection: ScaleConnection.connected);
      }
    }
  }

  void _scheduleRetry() {
    _retryTimer?.cancel();
    _retryTimer = Timer(const Duration(seconds: 5), () {
      if (_client?.connectionStatus?.state != MqttConnectionState.connected) {
        _connect(ref.read(appSettingsProvider));
      }
    });
  }

  void _teardown() {
    // Quên luôn broker đang nối: đóng xong mà còn nhớ thì lần bật lại có thể bị
    // hiểu nhầm là "đã nối rồi" và bỏ qua việc nối lại.
    _connectedTo = null;
    _retryTimer?.cancel();
    _retryTimer = null;
    _subscription?.cancel();
    _subscription = null;
    final client = _client;
    _client = null;
    if (client != null) {
      client.onDisconnected = null;
      client.autoReconnect = false;
      client.disconnect();
    }
  }
}

final scaleProvider = NotifierProvider<ScaleNotifier, ScaleState>(ScaleNotifier.new);
