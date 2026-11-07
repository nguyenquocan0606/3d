import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/phien_admin.dart';
import '../config/app_settings.dart';

/// Lỗi nghiệp vụ trả về từ API — `message` luôn là tiếng Việt nên hiển thị thẳng được.
class ApiException implements Exception {
  ApiException(this.message, {this.statusCode, this.code});

  final String message;
  final int? statusCode;
  final String? code;

  @override
  String toString() => message;
}

/// Client cho backend 3D Manage.
///
/// Backend luôn trả `{ status: 'success' | 'error', data, message }` và **không**
/// đáng tin ở HTTP status code (một số route trả 500 kèm data hợp lệ), nên mọi
/// phản hồi đều được kiểm tra qua field `status`.
class ApiClient {
  ApiClient(this._dio);

  final Dio _dio;

  Future<T> get<T>(String path, T Function(dynamic data) parse,
          {Map<String, dynamic>? query}) =>
      _send(path, 'GET', parse, query: query);

  /// [receiveTimeout]: chỉ cho route biết trước là chậm (VD thêm nhóm Facebook — mỗi link một lần
  /// hỏi Facebook, làm lần lượt); mặc định theo `dioProvider`.
  Future<T> post<T>(String path, T Function(dynamic data) parse,
          {Object? body, Duration? receiveTimeout}) =>
      _send(path, 'POST', parse, body: body, receiveTimeout: receiveTimeout);

  Future<T> put<T>(String path, T Function(dynamic data) parse, {Object? body}) =>
      _send(path, 'PUT', parse, body: body);

  Future<T> patch<T>(String path, T Function(dynamic data) parse, {Object? body}) =>
      _send(path, 'PATCH', parse, body: body);

  Future<T> delete<T>(String path, T Function(dynamic data) parse, {Object? body}) =>
      _send(path, 'DELETE', parse, body: body);

  Future<T> _send<T>(
    String path,
    String method,
    T Function(dynamic data) parse, {
    Object? body,
    Map<String, dynamic>? query,
    Duration? receiveTimeout,
  }) async {
    Response<dynamic> response;
    try {
      response = await _dio.request<dynamic>(
        path,
        data: body,
        queryParameters: query,
        options: Options(method: method, receiveTimeout: receiveTimeout),
      );
    } on DioException catch (error) {
      // Backend trả lỗi nghiệp vụ kèm body JSON — ưu tiên message tiếng Việt của nó.
      final data = error.response?.data;
      if (data is Map && data['message'] is String) {
        throw ApiException(
          data['message'] as String,
          statusCode: error.response?.statusCode,
          code: (data['error'] is Map) ? data['error']['code'] as String? : null,
        );
      }
      throw ApiException(_networkMessage(error), statusCode: error.response?.statusCode);
    }

    final data = response.data;
    if (data is! Map) {
      throw ApiException('Máy chủ trả về dữ liệu không hợp lệ.');
    }
    if (data['status'] != 'success') {
      throw ApiException(
        (data['message'] as String?) ?? 'Yêu cầu thất bại.',
        statusCode: response.statusCode,
        code: (data['error'] is Map) ? data['error']['code'] as String? : null,
      );
    }
    return parse(data['data']);
  }

  static String _networkMessage(DioException error) {
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return 'Máy chủ phản hồi quá chậm. Kiểm tra kết nối tới xưởng.';
      case DioExceptionType.connectionError:
        return 'Không kết nối được máy chủ. Kiểm tra địa chỉ trong Cài đặt và VPN/Wi-Fi.';
      case DioExceptionType.badCertificate:
        return 'Chứng chỉ HTTPS không hợp lệ.';
      case DioExceptionType.cancel:
        return 'Yêu cầu đã bị hủy.';
      default:
        return error.message ?? 'Lỗi kết nối không xác định.';
    }
  }
}

/// Dio được tạo lại mỗi khi người dùng đổi baseUrl / apiKey trong Cài đặt.
final dioProvider = Provider<Dio>((ref) {
  final settings = ref.watch(appSettingsProvider);
  final dio = Dio(
    BaseOptions(
      baseUrl: settings.baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 30),
      sendTimeout: const Duration(seconds: 60), // upload ảnh/file hàng hóa có thể lâu
      headers: {
        'Content-Type': 'application/json',
        if (settings.apiKey.isNotEmpty) 'X-API-Key': settings.apiKey,
      },
      // Tự xử lý status code ở tầng trên (backend trả 4xx/5xx kèm body hợp lệ).
      validateStatus: (_) => true,
      responseType: ResponseType.json,
    ),
  );
  // Đã đăng nhập admin (để dùng báo giá) thì gửi kèm cookie phiên ở mọi request. Đọc lúc gửi thay vì
  // `watch`, để đăng nhập / đăng xuất không dựng lại Dio và mọi repository phía sau.
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        final phien = ref.read(phienAdminProvider);
        if (phien != null) options.headers['Cookie'] = '$tenCookiePhien=${phien.token}';
        handler.next(options);
      },
    ),
  );
  ref.onDispose(dio.close);
  return dio;
});

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(ref.watch(dioProvider)));
