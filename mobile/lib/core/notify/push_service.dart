import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/repositories/notify_repository.dart';
import '../config/app_settings.dart';

/// Nhận thông báo đẩy về hoạt động máy in.
///
/// Đường đi: vòng giám sát trên máy chủ phát hiện thay đổi → gọi FCM → Firebase đánh thức máy này.
/// App **không** tự đi hỏi máy chủ theo nhịp: hỏi nền liên tục thì hoặc tốn pin, hoặc bị Android
/// giết ngay khi màn hình tắt — tức là đúng lúc cần báo nhất thì không chạy.
///
/// Cả file này chịu được việc **chưa cấu hình Firebase**: nếu chưa có `google-services.json`
/// (Android) hay `GoogleService-Info.plist` (iOS) thì `Firebase.initializeApp()` ném lỗi, ta nuốt
/// lỗi và app chạy bình thường, chỉ là không có push. Không được để app chết vì chuyện này.
class PushService {
  PushService(this._ref);

  final Ref _ref;

  static const _kenhSuCo = 'may_in_su_co';
  static const _kenhHoatDong = 'may_in_hoat_dong';

  final FlutterLocalNotificationsPlugin _local = FlutterLocalNotificationsPlugin();

  bool _sanSang = false;
  String? _tokenHienTai;

  /// Sự kiện người dùng bấm vào thông báo — router lắng nghe để mở đúng màn.
  static void Function(Map<String, dynamic> duLieu)? onBamThongBao;

  /// Gọi một lần lúc app khởi động. Nuốt mọi lỗi: thiếu Firebase không được làm chết app.
  Future<void> khoiDong() async {
    try {
      await Firebase.initializeApp();
    } catch (e) {
      debugPrint('[Thông báo] Chưa cấu hình Firebase, bỏ qua push: $e');
      return;
    }

    try {
      await _dungKenh();
      await _xinQuyen();

      FirebaseMessaging.onMessage.listen(_hienKhiDangMoApp);
      FirebaseMessaging.onMessageOpenedApp.listen((m) => _moTu(m.data));

      // App đang tắt hẳn mà người dùng bấm thông báo: tin nằm sẵn ở đây lúc khởi động.
      final banDau = await FirebaseMessaging.instance.getInitialMessage();
      if (banDau != null) _moTu(banDau.data);

      // Firebase xoay token bất cứ lúc nào — không nghe cái này thì máy lặng lẽ ngừng nhận.
      FirebaseMessaging.instance.onTokenRefresh.listen((token) {
        _tokenHienTai = token;
        _dangKyLenMayChu(token);
      });

      _sanSang = true;
      await dongBoDangKy();
    } catch (e) {
      debugPrint('[Thông báo] Lỗi khởi động: $e');
    }
  }

  /// Đăng ký (hoặc hủy) token theo công tắc trong Cài đặt. Gọi lại mỗi lần công tắc đổi.
  Future<void> dongBoDangKy() async {
    if (!_sanSang) return;

    final settings = _ref.read(appSettingsProvider);
    final repo = _ref.read(notifyRepositoryProvider);

    if (!settings.thongBaoBat) {
      final token = _tokenHienTai ?? await _layToken();
      if (token != null) {
        // Hủy hẳn trên máy chủ chứ không chỉ im ở máy: server đỡ gửi vào hư không.
        await repo.huyDangKy(token).catchError((_) {});
      }
      return;
    }

    final token = await _layToken();
    if (token == null) return;
    _tokenHienTai = token;
    await _dangKyLenMayChu(token);
  }

  Future<String?> _layToken() async {
    try {
      // iOS chỉ cấp token FCM sau khi có APNs token; máy chưa cấp quyền thì trả null.
      return await FirebaseMessaging.instance.getToken();
    } catch (e) {
      debugPrint('[Thông báo] Không lấy được token: $e');
      return null;
    }
  }

  Future<void> _dangKyLenMayChu(String token) async {
    final settings = _ref.read(appSettingsProvider);
    if (!settings.thongBaoBat) return;
    try {
      await _ref.read(notifyRepositoryProvider).dangKyThietBi(
            token: token,
            nenTang: Platform.isIOS ? 'ios' : 'android',
            tenMay: settings.tenThietBi.isEmpty ? null : settings.tenThietBi,
          );
    } catch (e) {
      // Mất mạng lúc mở app là chuyện thường; lần mở sau đăng ký lại.
      debugPrint('[Thông báo] Chưa đăng ký được với máy chủ: $e');
    }
  }

  Future<void> _xinQuyen() async {
    await FirebaseMessaging.instance.requestPermission(alert: true, badge: true, sound: true);
    // iOS: mặc định app đang mở thì hệ thống nuốt thông báo. Bật lại để thợ đang cầm máy vẫn thấy.
    await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );
  }

  /// Hai kênh Android: sự cố kêu to (importance max), hoạt động thường thì nhẹ nhàng.
  /// Tên kênh phải khớp `channel_id` mà máy chủ gửi (xem `fcm.service.ts`).
  Future<void> _dungKenh() async {
    await _local.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(
          // Đã xin quyền qua firebase_messaging rồi, đừng hỏi lần hai.
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
      onDidReceiveNotificationResponse: (chiTiet) {
        final payload = chiTiet.payload;
        if (payload != null) _moTu(_taiPayload(payload));
      },
    );

    final android =
        _local.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    if (android == null) return;

    await android.createNotificationChannel(const AndroidNotificationChannel(
      _kenhSuCo,
      'Sự cố máy in',
      description: 'Máy báo lỗi, mất kết nối, kẹt nhựa, nhiệt bất thường.',
      importance: Importance.max,
    ));
    await android.createNotificationChannel(const AndroidNotificationChannel(
      _kenhHoatDong,
      'Hoạt động máy in',
      description: 'Bắt đầu in, in xong, tạm dừng.',
      importance: Importance.defaultImportance,
    ));
  }

  /// Android không tự hiện thông báo khi app đang mở — phải tự dựng bằng local notification.
  Future<void> _hienKhiDangMoApp(RemoteMessage message) async {
    final tieuDe = message.notification?.title ?? message.data['tieuDe'];
    final noiDung = message.notification?.body ?? message.data['noiDung'];
    if (tieuDe == null && noiDung == null) return;

    final nghiemTrong = message.data['mucDo'] == 'loi' || message.data['mucDo'] == 'canhBao';

    await _local.show(
      message.hashCode,
      tieuDe,
      noiDung,
      NotificationDetails(
        android: AndroidNotificationDetails(
          nghiemTrong ? _kenhSuCo : _kenhHoatDong,
          nghiemTrong ? 'Sự cố máy in' : 'Hoạt động máy in',
          importance: nghiemTrong ? Importance.max : Importance.defaultImportance,
          priority: nghiemTrong ? Priority.high : Priority.defaultPriority,
          styleInformation: BigTextStyleInformation(noiDung ?? ''),
        ),
        iOS: const DarwinNotificationDetails(),
      ),
      payload: _ghiPayload(message.data),
    );
  }

  void _moTu(Map<String, dynamic> duLieu) {
    final callback = onBamThongBao;
    if (callback != null) callback(duLieu);
  }

  /// Payload của local notification chỉ nhận String — gói/mở bằng cặp `key=value` ngăn bởi `\n`
  /// (dữ liệu FCM luôn là chuỗi phẳng nên không cần tới JSON).
  static String _ghiPayload(Map<String, dynamic> duLieu) =>
      duLieu.entries.map((e) => '${e.key}=${e.value}').join('\n');

  static Map<String, dynamic> _taiPayload(String payload) {
    final ketQua = <String, dynamic>{};
    for (final dong in payload.split('\n')) {
      final i = dong.indexOf('=');
      if (i > 0) ketQua[dong.substring(0, i)] = dong.substring(i + 1);
    }
    return ketQua;
  }
}

final pushServiceProvider = Provider<PushService>((ref) => PushService(ref));
