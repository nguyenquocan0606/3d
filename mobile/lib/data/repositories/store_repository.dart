import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../local/cache_reader.dart';
import '../local/cache_store.dart';
import '../local/outbox.dart';
import '../models/json.dart';
import '../models/store.dart';
import '../sync/sync_service.dart';

class StoreRepository {
  StoreRepository(this._api, this._cache, this._store, this._outbox);

  final ApiClient _api;
  final CacheReader _cache;
  final CacheStore _store;
  final Outbox _outbox;

  /// Danh sách hàng hóa — đọc từ **CSDL cục bộ**, không gọi mạng.
  ///
  /// `anh`/`tepIn` chỉ có metadata (`duLieu` rỗng) — dữ liệu gốc tải riêng qua
  /// [fetchImages] / [fetchPrintFiles]. Hai endpoint đó còn phụ thuộc mạng.
  Future<StoreSnapshot> fetchAll() async {
    final rows = await _cache.storeProducts();
    if (rows.isEmpty) {
      // Cache chưa có (lần đầu hoặc đã xóa) — thử gọi API fallback.
      return _api.get('/api/store-products', (data) => StoreSnapshot.fromJson(asMap(data)));
    }
    return StoreSnapshot(
      sanPham: rows.map(StoreProduct.fromJson).toList(),
      truongRieng: StoreField.defaults,
    );
  }

  Future<List<StoreAttachment>> fetchImages(String productId) => _api.get(
        '/api/store-products/$productId/anh',
        (data) => asList(asMap(data)['anh'], StoreAttachment.fromJson),
      );

  Future<List<StoreAttachment>> fetchPrintFiles(String productId) => _api.get(
        '/api/store-products/$productId/tep-in',
        (data) => asList(asMap(data)['tepIn'], StoreAttachment.fromJson),
      );

  /// `PUT /api/store-products` — **full replace, bắt buộc có mạng**.
  ///
  /// Chỉ dùng cho các thay đổi Nhóm B (sửa tên, giá, thông tin sản phẩm). Nhập/xuất
  /// kho phải dùng [adjustStockOutbox] để chạy offline được.
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

  /// Nhập / xuất kho — **qua hàng đợi offline** (Nhóm A `store.adjustStock`).
  ///
  /// Server áp luật cộng dồn (+N/-N), không phải phép gán — an toàn khi nhiều máy
  /// cùng nhập/xuất lúc mất mạng (xem kế hoạch §2.1).
  ///
  /// [delta] dương = nhập, âm = xuất. [newQuantity] dùng cho cập nhật cache lạc quan.
  Future<void> adjustStockOutbox(
    String productId,
    int delta,
    int newQuantity,
    String moTa,
  ) async {
    await _outbox.them(
      loai: 'store.adjustStock',
      payload: {'productId': productId, 'delta': delta},
      moTa: moTa,
    );
    // Vá cache ngay để rebuild từ cache vẫn thấy đúng giá trị
    await _store.vaTamThoi(BangCache.storeProducts, productId, {'soLuong': newQuantity});
  }

  Future<({bool ok, String message})> checkMisaToken() => _api.post(
        '/api/misa/check-token',
        (data) {
          final map = asMap(data);
          return (ok: asBool(map['ok']), message: asString(map['message']));
        },
      );
}

final storeRepositoryProvider = Provider<StoreRepository>(
  (ref) => StoreRepository(
    ref.watch(apiClientProvider),
    ref.watch(cacheReaderProvider),
    ref.watch(cacheStoreProvider),
    ref.watch(outboxProvider),
  ),
);
