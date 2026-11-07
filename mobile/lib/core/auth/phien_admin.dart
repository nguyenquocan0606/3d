import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../config/app_settings.dart';

/// Phiên đăng nhập admin của bản web, dùng cho những API giữ dữ liệu khách (phiếu báo giá, đơn hàng).
///
/// Phần lớn `/api/*` vẫn mở cho app gọi thẳng (xem `src/middleware.ts`), nhưng route nào gọi
/// `yeuCauAdmin` thì đòi cookie `phien_3d` của tài khoản admin. App đăng nhập bằng đúng route của
/// web (`POST /api/auth/dang-nhap`), giữ lại giá trị cookie rồi tự gửi kèm header `Cookie` ở mọi
/// request (xem [dioProvider]). Không cần sửa gì ở backend.
///
/// Phiên sống 30 ngày như trên web; hết hạn hoặc bị từ chối (401) thì app hỏi đăng nhập lại.
class PhienAdmin {
  const PhienAdmin({
    required this.token,
    required this.tenDangNhap,
    required this.hoTen,
    required this.hetHan,
  });

  /// Giá trị cookie `phien_3d` (`<payload>.<chữ ký>`).
  final String token;
  final String tenDangNhap;
  final String hoTen;
  final DateTime? hetHan;

  bool get conHan => hetHan == null || hetHan!.isAfter(DateTime.now());

  String get tenHien => hoTen.trim().isNotEmpty ? hoTen.trim() : tenDangNhap;

  Map<String, dynamic> toJson() => {
        'token': token,
        'tenDangNhap': tenDangNhap,
        'hoTen': hoTen,
        'hetHan': hetHan?.toIso8601String(),
      };

  static PhienAdmin? fromJson(Map<String, dynamic> j) {
    final token = j['token'];
    if (token is! String || token.isEmpty) return null;
    return PhienAdmin(
      token: token,
      tenDangNhap: (j['tenDangNhap'] as String?) ?? '',
      hoTen: (j['hoTen'] as String?) ?? '',
      hetHan: DateTime.tryParse((j['hetHan'] as String?) ?? ''),
    );
  }
}

const tenCookiePhien = 'phien_3d';
const _kPhienAdmin = 'phien_admin';

/// Hạn của token: payload là JSON base64url có `exp` (giây). Đọc không được thì null.
DateTime? hanCuaToken(String token) {
  try {
    final payload = token.split('.').first;
    final chuan = base64Url.normalize(payload);
    final j = jsonDecode(utf8.decode(base64Url.decode(chuan)));
    final exp = j is Map ? j['exp'] : null;
    if (exp is num) return DateTime.fromMillisecondsSinceEpoch(exp.toInt() * 1000);
  } catch (_) {
    // Token lạ: coi như không biết hạn, để server tự từ chối khi hết.
  }
  return null;
}

/// Lấy giá trị cookie phiên từ các header `Set-Cookie`.
String? tokenTuSetCookie(List<String>? setCookie) {
  for (final dong in setCookie ?? const <String>[]) {
    final dau = dong.split(';').first.trim();
    if (dau.startsWith('$tenCookiePhien=')) {
      final giaTri = Uri.decodeComponent(dau.substring(tenCookiePhien.length + 1));
      if (giaTri.isNotEmpty) return giaTri;
    }
  }
  return null;
}

class PhienAdminNotifier extends Notifier<PhienAdmin?> {
  @override
  PhienAdmin? build() {
    final raw = ref.watch(sharedPreferencesProvider).getString(_kPhienAdmin);
    if (raw == null) return null;
    try {
      final phien = PhienAdmin.fromJson((jsonDecode(raw) as Map).cast<String, dynamic>());
      return phien != null && phien.conHan ? phien : null;
    } catch (_) {
      return null;
    }
  }

  /// Đăng nhập bằng tài khoản web. Chỉ nhận tài khoản admin — nhân viên không xem được báo giá.
  Future<PhienAdmin> dangNhap(String tenDangNhap, String matKhau) async {
    final dio = ref.read(dioProvider);
    final Response<dynamic> res;
    try {
      res = await dio.post<dynamic>(
        '/api/auth/dang-nhap',
        data: {'tenDangNhap': tenDangNhap.trim(), 'matKhau': matKhau},
      );
    } on DioException catch (e) {
      throw ApiException(
        e.type == DioExceptionType.connectionError || e.type == DioExceptionType.connectionTimeout
            ? 'Không kết nối được máy chủ. Kiểm tra địa chỉ trong Cài đặt và VPN/Wi-Fi.'
            : (e.message ?? 'Không đăng nhập được.'),
      );
    }
    final body = res.data;
    if (body is! Map || body['status'] != 'success') {
      throw ApiException(
        (body is Map ? body['message'] as String? : null) ?? 'Không đăng nhập được.',
        statusCode: res.statusCode,
      );
    }
    final nguoiDung = (body['data'] as Map?)?.cast<String, dynamic>() ?? const {};
    if (nguoiDung['vaiTro'] != 'admin') {
      throw ApiException('Tài khoản này không phải admin — báo giá chỉ dành cho admin.');
    }
    final token = tokenTuSetCookie(res.headers['set-cookie']);
    if (token == null) {
      throw ApiException('Máy chủ không trả phiên đăng nhập (thiếu cookie). Kiểm tra AUTH_SECRET trên máy chủ.');
    }
    final phien = PhienAdmin(
      token: token,
      tenDangNhap: (nguoiDung['tenDangNhap'] as String?) ?? tenDangNhap.trim(),
      hoTen: (nguoiDung['hoTen'] as String?) ?? '',
      hetHan: hanCuaToken(token),
    );
    await ref.read(sharedPreferencesProvider).setString(_kPhienAdmin, jsonEncode(phien.toJson()));
    state = phien;
    return phien;
  }

  Future<void> dangXuat() async {
    await ref.read(sharedPreferencesProvider).remove(_kPhienAdmin);
    state = null;
  }
}

final phienAdminProvider = NotifierProvider<PhienAdminNotifier, PhienAdmin?>(PhienAdminNotifier.new);
