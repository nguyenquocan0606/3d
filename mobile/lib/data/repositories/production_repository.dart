import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../local/cache_reader.dart';
import '../local/cache_store.dart';
import '../local/outbox.dart';
import '../models/json.dart';
import '../models/order.dart';
import '../sync/sync_service.dart';

class ProductionRepository {
  ProductionRepository(this._api, this._cache, this._store, this._outbox);

  final ApiClient _api;
  final CacheReader _cache;
  final CacheStore _store;
  final Outbox _outbox;

  /// Danh sách đơn hàng — đọc từ **CSDL cục bộ**, không gọi mạng.
  Future<List<Order>> fetchOrders() async =>
      (await _cache.ordersKemSanPham()).map(Order.fromJson).toList();

  /// Tra 1 đơn hàng theo id hoặc orderCode — đọc từ cache.
  ///
  /// Thử id trước (nhanh hơn), không có thì quét tất cả để tìm theo orderCode.
  Future<Order> fetchOrder(String idOrCode) async {
    final raw = await _store.docMot(BangCache.orders, idOrCode);
    if (raw != null) {
      // Tìm thấy theo id — vẫn phải lắp sản phẩm + tem cho đầy đủ như fetchOrders.
      final all = await fetchOrders();
      for (final order in all) {
        if (order.id == idOrCode) return order;
      }
    }
    // Tìm theo orderCode
    final all = await fetchOrders();
    for (final order in all) {
      if (order.orderCode == idOrCode) return order;
    }
    // Không có trong cache — thử gọi API (ví dụ vừa tạo mà chưa đồng bộ)
    return _api.get(
      '/api/orders/${Uri.encodeComponent(idOrCode)}',
      (data) => Order.fromJson(asMap(data)),
    );
  }

  /// Xóa đơn — backend chặn nếu đã có tem `status != pending`.
  Future<void> deleteOrder(String id) => _api.delete<void>('/api/orders/$id', (_) {});

  /// Danh sách tem miếng in — đọc từ **CSDL cục bộ**, không gọi mạng.
  Future<List<PrintItem>> fetchPrintItems() async =>
      (await _cache.printItemsKemCha()).map(PrintItem.fromJson).toList();

  Future<PrintItem> fetchPrintItem(String id) async {
    final items = await fetchPrintItems();
    for (final item in items) {
      if (item.id == id) return item;
    }
    // Không có trong cache — thử API
    return _api.get('/api/print-items/$id', (data) => PrintItem.fromJson(asMap(data)));
  }

  /// Đổi trạng thái / kiểm tra / xếp mâm cho 1 tem — qua **hàng đợi offline** (Nhóm A).
  ///
  /// Mỗi loại thay đổi đi qua thao tác outbox riêng để server áp luật đúng:
  /// - `status` → `printItem.setStatus` (chỉ tiến, không lùi)
  /// - `isChecked` → `printItem.setChecked` (idempotent)
  /// - `peiSheetId` / `clearPeiSheet` → `printItem.assignSheet` (LWW)
  ///
  /// Các field khác (clearPrinter) không có trong §2.1 nên vẫn gọi API thẳng.
  Future<void> updatePrintItem(
    String id, {
    PrintItemStatus? status,
    String? peiSheetId,
    String? printerId,
    bool? isChecked,
    bool clearPeiSheet = false,
    bool clearPrinter = false,
  }) async {
    if (status != null) {
      await _outbox.them(
        loai: 'printItem.setStatus',
        payload: {'itemId': id, 'status': status.value},
        moTa: 'Tem $id → ${status.label}',
      );
      await _store.vaTamThoi(BangCache.printItems, id, {'status': status.value});
      return;
    }

    if (isChecked != null) {
      await _outbox.them(
        loai: 'printItem.setChecked',
        payload: {'itemId': id, 'isChecked': isChecked},
        moTa: isChecked ? 'Tem $id: đã kiểm hàng' : 'Tem $id: bỏ kiểm hàng',
      );
      await _store.vaTamThoi(BangCache.printItems, id, {'isChecked': isChecked});
      return;
    }

    if (peiSheetId != null || clearPeiSheet) {
      final mauMam = peiSheetId ?? 'tháo khỏi mâm';
      await _outbox.them(
        loai: 'printItem.assignSheet',
        payload: {
          'itemId': id,
          'peiSheetId': clearPeiSheet ? null : peiSheetId,
        },
        moTa: 'Tem $id: xếp vào $mauMam',
      );
      await _store.vaTamThoi(BangCache.printItems, id, {
        'peiSheetId': clearPeiSheet ? null : peiSheetId,
      });
      return;
    }

    // Các thay đổi khác (clearPrinter, printerId) không offline được — gọi API thẳng.
    final body = compact({'printerId': printerId});
    if (clearPrinter) body['printerId'] = null;
    await _api.patch<void>('/api/print-items/$id', (_) {}, body: body);
  }

  /// Đổi trạng thái hàng loạt — đẩy từng tem vào outbox riêng.
  Future<void> updatePrintItemsBatch(
    List<String> itemIds, {
    PrintItemStatus? status,
    String? printerId,
    bool clearPrinter = false,
  }) async {
    if (status != null) {
      for (final itemId in itemIds) {
        await _outbox.them(
          loai: 'printItem.setStatus',
          payload: {'itemId': itemId, 'status': status.value},
          moTa: 'Tem $itemId → ${status.label}',
        );
        await _store.vaTamThoi(BangCache.printItems, itemId, {'status': status.value});
      }
      return;
    }

    // Đổi máy in là Nhóm B — vẫn gọi API thẳng.
    final body = <String, dynamic>{'itemIds': itemIds};
    if (printerId != null) body['printerId'] = printerId;
    if (clearPrinter) body['printerId'] = null;
    await _api.patch<void>('/api/print-items/batch', (_) {}, body: body);
  }

  /// Danh sách mâm in PEI — đọc từ **CSDL cục bộ**, không gọi mạng.
  Future<List<PeiSheet>> fetchPeiSheets() async =>
      (await _cache.peiSheetsKemTem()).map(PeiSheet.fromJson).toList();

  Future<void> createPeiSheet(String name) =>
      _api.post<void>('/api/pei-sheets', (_) {}, body: {'name': name});

  Future<void> updatePeiSheet(
    String id, {
    String? name,
    String? printerId,
    bool clearPrinter = false,
  }) {
    final body = compact({'name': name, 'printerId': printerId});
    if (clearPrinter) body['printerId'] = null;
    return _api.patch<void>('/api/pei-sheets/$id', (_) {}, body: body);
  }

  Future<void> deletePeiSheet(String id) =>
      _api.delete<void>('/api/pei-sheets/$id', (_) {});
}

final productionRepositoryProvider = Provider<ProductionRepository>(
  (ref) => ProductionRepository(
    ref.watch(apiClientProvider),
    ref.watch(cacheReaderProvider),
    ref.watch(cacheStoreProvider),
    ref.watch(outboxProvider),
  ),
);
