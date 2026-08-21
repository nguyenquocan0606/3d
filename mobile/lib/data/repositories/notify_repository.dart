import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../models/json.dart';
import '../models/printer_event.dart';

/// Đăng ký nhận thông báo + đọc lịch sử hoạt động máy in.
class NotifyRepository {
  NotifyRepository(this._api);

  final ApiClient _api;

  /// Báo cho máy chủ biết token FCM của máy này.
  ///
  /// Gọi lại nhiều lần vô hại (backend khóa theo token) — và **phải** gọi lại mỗi lần mở app, vì
  /// Firebase có thể xoay token bất cứ lúc nào mà không báo trước.
  Future<void> dangKyThietBi({
    required String token,
    required String nenTang,
    String? tenMay,
  }) =>
      _api.post<void>(
        '/api/thong-bao/thiet-bi',
        (_) {},
        body: compact({'token': token, 'nenTang': nenTang, 'tenMay': tenMay}),
      );

  Future<void> huyDangKy(String token) =>
      _api.delete<void>('/api/thong-bao/thiet-bi?token=$token', (_) {});

  Future<List<PrinterEvent>> fetchSuKien({int limit = 100, String? printerId}) =>
      _api.get(
        '/api/thong-bao/su-kien',
        (data) => asList(data, PrinterEvent.fromJson),
        query: compact({'limit': limit, 'printerId': printerId}),
      );
}

final notifyRepositoryProvider = Provider<NotifyRepository>(
  (ref) => NotifyRepository(ref.watch(apiClientProvider)),
);
