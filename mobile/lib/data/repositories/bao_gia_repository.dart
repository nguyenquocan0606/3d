import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/phien_admin.dart';
import '../models/bao_gia.dart';
import '../models/json.dart';

/// Phiếu báo giá — ánh xạ 1-1 với `/api/phieu-bao-gia/*` của bản web.
///
/// Mọi route ở đây đòi phiên admin. Server trả 401 (phiên hết hạn, đổi AUTH_SECRET…) thì xoá phiên
/// đã lưu để màn hình quay về ô đăng nhập thay vì báo lỗi mãi.
///
/// Không đi qua hàng đợi offline như cuộn nhựa: phiếu là văn bản soạn dần, server lưu nguyên
/// cả phiếu mỗi lần — ghi đè lúc có mạng lại có thể đè mất bản người khác vừa sửa trên web.
class BaoGiaRepository {
  BaoGiaRepository(this._ref);

  final Ref _ref;

  ApiClient get _api => _ref.read(apiClientProvider);

  Future<T> _goi<T>(Future<T> Function() viec) async {
    try {
      return await viec();
    } on ApiException catch (e) {
      if (e.statusCode == 401) await _ref.read(phienAdminProvider.notifier).dangXuat();
      rethrow;
    }
  }

  Future<List<PhieuBaoGia>> danhSach() => _goi(
        () => _api.get('/api/phieu-bao-gia', (data) => asList(data, PhieuBaoGia.fromJson)),
      );

  Future<PhieuBaoGia> lay(String id) => _goi(
        () => _api.get('/api/phieu-bao-gia/${Uri.encodeComponent(id)}', (data) => PhieuBaoGia.fromJson(asMap(data))),
      );

  /// Phiếu nháp mới — server điền sẵn số phiếu, điều khoản, VAT, cọc theo cài đặt xưởng.
  Future<PhieuBaoGia> tao({String? phanLoai}) => _goi(
        () => _api.post(
          '/api/phieu-bao-gia',
          (data) => PhieuBaoGia.fromJson(asMap(data)),
          body: {if (phanLoai != null && phanLoai.isNotEmpty) 'phanLoai': phanLoai},
        ),
      );

  /// Lưu nguyên phiếu (hoặc vài trường qua [truong]). Trả bản server vừa ghi — có mã đơn hàng nếu
  /// phiếu vừa chốt.
  Future<PhieuBaoGia> luu(String id, Map<String, dynamic> truong) => _goi(
        () => _api.put(
          '/api/phieu-bao-gia/${Uri.encodeComponent(id)}',
          (data) => PhieuBaoGia.fromJson(asMap(data)),
          body: truong,
        ),
      );

  Future<void> xoa(String id) => _goi(
        () => _api.delete<void>('/api/phieu-bao-gia/${Uri.encodeComponent(id)}', (_) {}),
      );

  Future<PhieuBaoGia> nhanBan(String id) => _goi(
        () => _api.post(
          '/api/phieu-bao-gia/${Uri.encodeComponent(id)}/nhan-ban',
          (data) => PhieuBaoGia.fromJson(asMap(data)),
        ),
      );

  /// Đổi link khách — link cũ chết ngay.
  Future<PhieuBaoGia> doiLink(String id) => _goi(
        () => _api.post(
          '/api/phieu-bao-gia/${Uri.encodeComponent(id)}/doi-link',
          (data) => PhieuBaoGia.fromJson(asMap(data)),
        ),
      );

  Future<CaiDatBaoGia> caiDat() => _goi(
        () => _api.get('/api/phieu-bao-gia/cai-dat', (data) => CaiDatBaoGia.fromJson(asMap(data))),
      );

  Future<List<LanTinhGia>> tuMayTinh() => _goi(
        () => _api.get('/api/phieu-bao-gia/tu-may-tinh', (data) => asList(data, LanTinhGia.fromJson)),
      );

  /// Tải ảnh sản phẩm của một hạng mục lên, trả mã ảnh. Server tự thu nhỏ và đổi sang WebP.
  Future<String> taiAnhLen(Uint8List bytes, String tenFile) => _goi(
        () => _api.post(
          '/api/phieu-bao-gia/anh',
          (data) => asString(asMap(data)['id']),
          body: FormData.fromMap({'anh': MultipartFile.fromBytes(bytes, filename: tenFile)}),
        ),
      );

  /// Ảnh PNG nét (gấp 3) của tờ phiếu, server chụp bằng Chromium — đúng như bản in / PDF của web.
  Future<Uint8List> anhPhieu(String id) => _goi(() async {
        final dio = _ref.read(dioProvider);
        final Response<List<int>> res;
        try {
          res = await dio.get<List<int>>(
            '/api/phieu-bao-gia/${Uri.encodeComponent(id)}/anh',
            options: Options(
              responseType: ResponseType.bytes,
              // Mở Chromium lần đầu + tải ảnh QR có thể mất vài giây.
              receiveTimeout: const Duration(seconds: 60),
            ),
          );
        } on DioException catch (e) {
          throw ApiException(e.message ?? 'Không tải được ảnh phiếu.');
        }
        final bytes = Uint8List.fromList(res.data ?? const []);
        final loai = res.headers.value('content-type') ?? '';
        if (res.statusCode == 200 && loai.startsWith('image/')) return bytes;
        // Lỗi thì server trả JSON `{ message }`.
        String? message;
        try {
          final j = jsonDecode(utf8.decode(bytes));
          if (j is Map) message = j['message'] as String?;
        } catch (_) {}
        throw ApiException(message ?? 'Không tạo được ảnh phiếu (mã ${res.statusCode}).', statusCode: res.statusCode);
      });
}

final baoGiaRepositoryProvider = Provider<BaoGiaRepository>(BaoGiaRepository.new);

/// Danh sách phiếu — tải lại khi đổi phiên đăng nhập. Chưa đăng nhập thì rỗng (màn hình tự hiện ô đăng nhập).
class DanhSachBaoGiaNotifier extends AsyncNotifier<List<PhieuBaoGia>> {
  @override
  Future<List<PhieuBaoGia>> build() {
    final phien = ref.watch(phienAdminProvider);
    if (phien == null) return Future.value(const []);
    return ref.read(baoGiaRepositoryProvider).danhSach();
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(() => ref.read(baoGiaRepositoryProvider).danhSach());
  }

  /// Cập nhật một phiếu trong danh sách ngay sau khi lưu ở màn soạn, khỏi tải lại cả danh sách.
  void capNhat(PhieuBaoGia p) {
    final ds = state.valueOrNull;
    if (ds == null) return;
    final co = ds.any((x) => x.id == p.id);
    state = AsyncData(co ? [for (final x in ds) x.id == p.id ? p : x] : [p, ...ds]);
  }

  void boDi(String id) {
    final ds = state.valueOrNull;
    if (ds == null) return;
    state = AsyncData(ds.where((x) => x.id != id).toList());
  }
}

final danhSachBaoGiaProvider =
    AsyncNotifierProvider<DanhSachBaoGiaNotifier, List<PhieuBaoGia>>(DanhSachBaoGiaNotifier.new);

/// Cài đặt xưởng (điều khoản mặc định, % cọc mặc định, tài khoản hoá đơn) — chỉ đọc.
final caiDatBaoGiaProvider = FutureProvider<CaiDatBaoGia>((ref) async {
  if (ref.watch(phienAdminProvider) == null) return const CaiDatBaoGia();
  return ref.read(baoGiaRepositoryProvider).caiDat();
});
