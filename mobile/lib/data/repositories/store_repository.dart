import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../models/json.dart';
import '../models/store.dart';

class StoreRepository {
  StoreRepository(this._api);

  final ApiClient _api;

  /// Danh sách hàng hóa. `anh`/`tepIn` chỉ có metadata (`duLieu` rỗng) —
  /// dữ liệu gốc tải riêng qua [fetchImages] / [fetchPrintFiles].
  Future<StoreSnapshot> fetchAll() =>
      _api.get('/api/store-products', (data) => StoreSnapshot.fromJson(asMap(data)));

  Future<List<StoreAttachment>> fetchImages(String productId) => _api.get(
        '/api/store-products/$productId/anh',
        (data) => asList(asMap(data)['anh'], StoreAttachment.fromJson),
      );

  Future<List<StoreAttachment>> fetchPrintFiles(String productId) => _api.get(
        '/api/store-products/$productId/tep-in',
        (data) => asList(asMap(data)['tepIn'], StoreAttachment.fromJson),
      );

  /// `PUT /api/store-products` — **đồng bộ toàn bộ (full replace)**.
  ///
  /// Nguy hiểm nếu dùng sai: mọi hàng hóa không có trong [products] sẽ bị XÓA.
  /// Vì vậy app luôn gửi lại trọn danh sách vừa tải, và chỉ đính kèm `anh`/`tepIn`
  /// cho những hàng hóa đã thực sự tải đủ dữ liệu gốc ([idsWithImages] /
  /// [idsWithFiles]) — thiếu field nghĩa là "giữ nguyên", gửi mảng rỗng là "xóa hết".
  Future<void> syncAll({
    required List<StoreProduct> products,
    required List<StoreField> fields,
    required Set<String> idsWithImages,
    required Set<String> idsWithFiles,
  }) =>
      _api.put<void>(
        '/api/store-products',
        (_) {},
        body: {
          'sanPham': products
              .map((p) => p.toSyncJson(
                    includeAnh: idsWithImages.contains(p.id),
                    includeTepIn: idsWithFiles.contains(p.id),
                  ))
              .toList(),
          'truongRieng': fields.map((f) => f.toJson()).toList(),
        },
      );

  /// Ping thử API MISA bằng credential đã lưu trên server (chỉ đọc).
  Future<({bool ok, String message})> checkMisaToken() => _api.post(
        '/api/misa/check-token',
        (data) {
          final map = asMap(data);
          return (ok: asBool(map['ok']), message: asString(map['message']));
        },
      );
}

final storeRepositoryProvider = Provider<StoreRepository>(
  (ref) => StoreRepository(ref.watch(apiClientProvider)),
);
