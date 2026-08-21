import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mqtt_client/mqtt_client.dart';
import 'package:mqtt_client/mqtt_server_client.dart';

import '../../core/config/app_settings.dart';
import 'sync_service.dart';

/// Topic server bắn tin "có thay đổi, kéo delta đi" — phải khớp
/// `TOPIC_DONG_BO` bên `src/services/sync-notify.service.ts`.
const topicDongBo = '3dmanage/sync';

/// Nghe thông báo thay đổi từ server để đồng bộ **gần như tức thì**.
///
/// Không có lớp này thì app chỉ kéo delta mỗi 60 giây — nghĩa là thợ ở máy A quẹt
/// xong, thợ ở máy B phải chờ tới một phút mới thấy. Trong xưởng thì một phút là
/// đủ để hai người cùng quẹt một mã.
///
/// Dùng **chung broker MQTT với trạm cân** (đã có sẵn, xem `mosquitto.conf`) thay
/// vì dựng WebSocket server riêng. Nhưng là **kết nối riêng biệt** với trạm cân:
/// gộp chung thì tắt cân trong Cài đặt sẽ tắt luôn đồng bộ, mà máy PDA ngoài kho
/// chính là máy vừa tắt cân vừa cần đồng bộ nhất.
class SyncNotifyListener extends Notifier<bool> {
  MqttServerClient? _client;
  StreamSubscription<List<MqttReceivedMessage<MqttMessage>>>? _sub;
  Timer? _thuLai;
  String? _dangNoiToi;

  /// true = đang nghe được thông báo đẩy; false = chỉ còn dựa vào poll định kỳ.
  @override
  bool build() {
    final settings = ref.watch(appSettingsProvider);
    ref.onDispose(_dong);

    // Đổi máy chủ trong Cài đặt thì broker cũng đổi theo → nối lại.
    Future.microtask(() => _noi(settings));
    return false;
  }

  Future<void> _noi(AppSettings settings) async {
    final url = settings.effectiveMqttUrl;
    if (url.isEmpty) return;
    if (_dangNoiToi == url &&
        _client?.connectionStatus?.state == MqttConnectionState.connected) {
      return;
    }

    _dong();
    _dangNoiToi = url;

    final uri = Uri.parse(url);
    final wsUrl = '${uri.scheme}://${uri.host}${uri.path}';
    final port = uri.hasPort ? uri.port : (uri.scheme == 'wss' ? 443 : 9001);

    final client = MqttServerClient.withPort(
      wsUrl,
      // Trùng clientId là broker đá client cũ ra — mỗi máy phải có id riêng, và
      // phải khác id của trạm cân vì hai kết nối cùng chạy song song.
      'manage3d-sync-${DateTime.now().microsecondsSinceEpoch}',
      port,
    )
      ..useWebSocket = true
      ..websocketProtocols = MqttClientConstants.protocolsSingleDefault
      ..logging(on: false)
      ..keepAlivePeriod = 30
      ..autoReconnect = true
      ..onDisconnected = _khiMatKetNoi;

    _client = client;

    try {
      await client.connect();
      client.subscribe(topicDongBo, MqttQos.atMostOnce);
      _sub = client.updates?.listen(_nhanTin);
      state = true;
    } catch (error) {
      // Không có thông báo đẩy thì vẫn còn poll 60s — hỏng ở đây không được làm
      // hỏng cả app, chỉ là chậm hơn.
      if (kDebugMode) debugPrint('[Đồng bộ] Không nghe được MQTT: $error');
      state = false;
      _henThuLai();
    }
  }

  void _nhanTin(List<MqttReceivedMessage<MqttMessage>> tin) {
    for (final t in tin) {
      final msg = t.payload;
      if (msg is! MqttPublishMessage) continue;

      // Nội dung tin chỉ để ghi log: server báo bảng nào đổi, nhưng app kéo delta
      // cho **tất cả** bảng trong một lượt nên không cần lọc theo đó.
      if (kDebugMode) {
        final raw = MqttPublishPayload.bytesToStringAsString(msg.payload.message);
        try {
          final m = jsonDecode(raw) as Map<String, dynamic>;
          debugPrint('[Đồng bộ] Server báo đổi: ${m['tables']}');
        } catch (_) {
          debugPrint('[Đồng bộ] Server báo đổi: $raw');
        }
      }

      unawaited(ref.read(syncProvider.notifier).dongBo());
    }
  }

  void _khiMatKetNoi() {
    state = false;
    _henThuLai();
  }

  /// `autoReconnect` của mqtt_client đôi khi không dậy nổi sau khi máy ngủ dài —
  /// hẹn giờ nối lại là lưới an toàn, giống cách trạm cân đang làm.
  void _henThuLai() {
    _thuLai?.cancel();
    _thuLai = Timer(const Duration(seconds: 15), () {
      if (_client?.connectionStatus?.state != MqttConnectionState.connected) {
        _noi(ref.read(appSettingsProvider));
      }
    });
  }

  void _dong() {
    _thuLai?.cancel();
    _thuLai = null;
    _sub?.cancel();
    _sub = null;
    _dangNoiToi = null;
    final c = _client;
    _client = null;
    if (c != null) {
      c.onDisconnected = null;
      c.autoReconnect = false;
      c.disconnect();
    }
  }
}

final syncNotifyProvider =
    NotifierProvider<SyncNotifyListener, bool>(SyncNotifyListener.new);
