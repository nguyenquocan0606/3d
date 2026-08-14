import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../models/json.dart';
import '../models/order.dart';

class ProductionRepository {
  ProductionRepository(this._api);

  final ApiClient _api;

  Future<List<Order>> fetchOrders() =>
      _api.get('/api/orders', (data) => asList(data, Order.fromJson));

  /// [idOrCode] nhận **cả `Order.id` (uuid) lẫn `orderCode`** — dùng cho màn kiểm hàng.
  Future<Order> fetchOrder(String idOrCode) => _api.get(
        '/api/orders/${Uri.encodeComponent(idOrCode)}',
        (data) => Order.fromJson(asMap(data)),
      );

  /// Backend chặn xóa nếu đơn đã có tem `status != pending`.
  Future<void> deleteOrder(String id) => _api.delete<void>('/api/orders/$id', (_) {});

  Future<List<PrintItem>> fetchPrintItems() =>
      _api.get('/api/print-items', (data) => asList(data, PrintItem.fromJson));

  Future<PrintItem> fetchPrintItem(String id) => _api.get(
        '/api/print-items/$id',
        (data) => PrintItem.fromJson(asMap(data)),
      );

  Future<void> updatePrintItem(
    String id, {
    PrintItemStatus? status,
    String? peiSheetId,
    String? printerId,
    bool? isChecked,
    bool clearPeiSheet = false,
    bool clearPrinter = false,
  }) {
    final body = compact({
      'status': status?.value,
      'peiSheetId': peiSheetId,
      'printerId': printerId,
      'isChecked': isChecked,
    });
    if (clearPeiSheet) body['peiSheetId'] = null;
    if (clearPrinter) body['printerId'] = null;
    return _api.patch<void>('/api/print-items/$id', (_) {}, body: body);
  }

  Future<void> updatePrintItemsBatch(
    List<String> itemIds, {
    PrintItemStatus? status,
    String? printerId,
    bool clearPrinter = false,
  }) {
    final body = <String, dynamic>{'itemIds': itemIds};
    if (status != null) body['status'] = status.value;
    if (printerId != null) body['printerId'] = printerId;
    if (clearPrinter) body['printerId'] = null;
    return _api.patch<void>('/api/print-items/batch', (_) {}, body: body);
  }

  Future<List<PeiSheet>> fetchPeiSheets() =>
      _api.get('/api/pei-sheets', (data) => asList(data, PeiSheet.fromJson));

  Future<void> createPeiSheet(String name) =>
      _api.post<void>('/api/pei-sheets', (_) {}, body: {'name': name});

  /// [clearPrinter] = true để tháo mâm khỏi máy in (gửi `printerId: null`).
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
  (ref) => ProductionRepository(ref.watch(apiClientProvider)),
);
