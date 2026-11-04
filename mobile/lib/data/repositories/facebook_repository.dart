import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../models/facebook.dart';
import '../models/json.dart';

/// Tính năng Khách Facebook — cùng API với tab trên web (`src/app/api/facebook`).
///
/// Máy chủ không có phiên Facebook: bình luận và nhắn tin ở đây chỉ **xếp việc**, agent đang chạy
/// nhận việc rồi đăng bằng nick của nó trong khoảng 1 phút.
///
/// Dữ liệu từ Facebook và nhật ký máy chủ hay có chuỗi đứt giữa emoji nên đều qua `jsonHopLe`.
class FacebookRepository {
  FacebookRepository(this._api);

  final ApiClient _api;

  static String _bai(String id) => '/api/facebook/khach/${Uri.encodeComponent(id)}';
  static String _nhom(String id) => '/api/facebook/nhom/${Uri.encodeComponent(id)}';

  /// Thêm nhiều nhóm một lúc rất chậm: máy chủ hỏi Facebook lần lượt từng link cho khỏi bị chặn IP.
  static const _choThemNhom = Duration(minutes: 5);

  Future<DuLieuKhach> fetchKhach(String loc) => _api.get(
        '/api/facebook/khach',
        (data) => DuLieuKhach.fromJson(asMap(jsonHopLe(data))),
        query: {'loc': loc},
      );

  Future<DuLieuKhach> fetchDem() => _api.get(
        '/api/facebook/khach',
        (data) => DuLieuKhach.fromJson(asMap(jsonHopLe(data))),
        query: {'chiDem': '1'},
      );

  Future<CaiDatFacebook> fetchCaiDat() => _api.get(
        '/api/facebook/cai-dat',
        (data) => CaiDatFacebook.fromJson(asMap(jsonHopLe(data))),
      );

  Future<void> doiTrangThai(String id, String trangThai) =>
      _api.patch<void>(_bai(id), (_) {}, body: {'trangThai': trangThai});

  Future<void> ghiDaMoLink(String id) =>
      _api.patch<void>(_bai(id), (_) {}, body: {'daMoLink': true});

  Future<void> binhLuan(String id, String noiDung) =>
      _api.post<void>('${_bai(id)}/binh-luan', (_) {}, body: {'noiDung': noiDung});

  Future<void> huyBinhLuan(String id) =>
      _api.delete<void>('${_bai(id)}/binh-luan', (_) {});

  Future<void> nhanTin(String id, String noiDung) =>
      _api.post<void>('${_bai(id)}/tin-nhan', (_) {}, body: {'noiDung': noiDung});

  Future<void> huyTinNhan(String id, String tinId) => _api.delete<void>(
        '${_bai(id)}/tin-nhan?tin=${Uri.encodeQueryComponent(tinId)}',
        (_) {},
      );

  Future<void> timLaiViTri(String id) =>
      _api.post<void>('${_bai(id)}/vi-tri', (_) {});

  /// Thêm người đăng vào danh sách đen; trả các khoá đã chặn (ID, tên người dùng).
  Future<List<String>> chan(String id) => _api.post(
        '${_bai(id)}/chan',
        (data) => [
          for (final k in (asMap(data)['khoa'] as List? ?? const [])) asString(k),
        ],
      );

  /// Khởi động vòng chấm bù rồi về ngay; kết quả hiện dần trong nhật ký.
  Future<({int dangCho, String? loi})> chamLai() => _api.post(
        '/api/facebook/khach/cham-lai',
        (data) {
          final m = asMap(data);
          return (dangCho: asInt(m['dangCho']), loi: asStringOrNull(m['loi']));
        },
      );

  /// `lenh`: `chay` | `dung`.
  Future<void> guiLenhAgent(String agent, String lenh) => _api.post<void>(
        '/api/facebook/agent-lenh',
        (_) {},
        body: {'agent': agent, 'lenh': lenh},
      );

  Future<List<NhomFacebook>> fetchNhom() => _api.get(
        '/api/facebook/nhom',
        (data) => asList(jsonHopLe(data), NhomFacebook.fromJson),
      );

  Future<List<KetQuaThemNhom>> themNhom(String links, int ngayLui) => _api.post(
        '/api/facebook/nhom',
        (data) => asList(data, KetQuaThemNhom.fromJson),
        body: {'links': links, 'ngayLui': ngayLui},
        receiveTimeout: _choThemNhom,
      );

  Future<void> batTatNhom(String id, bool bat) =>
      _api.patch<void>(_nhom(id), (_) {}, body: {'bat': bat});

  /// Quên các bài đã quét, lùi mốc về [ngayLui] ngày trước.
  Future<void> quetLaiNhom(String id, int ngayLui) =>
      _api.patch<void>(_nhom(id), (_) {}, body: {'quetLaiTuDau': ngayLui});

  /// [hang]: `cao` · `vua` · `thap`; null = trả về tự xếp (phải gửi null chứ không bỏ khoá).
  Future<void> ghimHangNhom(String id, String? hang) =>
      _api.patch<void>(_nhom(id), (_) {}, body: {'hangCoDinh': hang});

  Future<void> xoaNhom(String id) => _api.delete<void>(_nhom(id), (_) {});

  Future<TrangNhatKy> nhatKySau(int sau) => _api.get(
        '/api/facebook/nhat-ky',
        (data) => TrangNhatKy.fromJson(asMap(jsonHopLe(data))),
        query: {'sau': sau},
      );
}

final facebookRepositoryProvider = Provider<FacebookRepository>(
  (ref) => FacebookRepository(ref.watch(apiClientProvider)),
);
