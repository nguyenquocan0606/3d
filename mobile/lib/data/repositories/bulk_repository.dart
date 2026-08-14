import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../models/bulk_order.dart';
import '../models/json.dart';

/// Sản xuất số lượng lớn (đơn SLL) — port `bulk-production-tab.tsx`.
class BulkRepository {
  BulkRepository(this._api);

  final ApiClient _api;

  Future<List<BulkOrder>> fetchOrders() =>
      _api.get('/api/bulk-orders', (data) => asList(data, BulkOrder.fromJson));

  Future<BulkOrder> fetchOrder(String id) => _api.get(
        '/api/bulk-orders/${Uri.encodeComponent(id)}',
        (data) => BulkOrder.fromJson(asMap(data)),
      );

  /// Tạo đơn + chia lượt. Thứ tự [printerIds] quyết định máy nào nhận lượt PEI 1.
  Future<BulkOrder> createOrder({
    required String productName,
    required int totalQuantity,
    required int perSheetQty,
    required List<String> printerIds,
    String? orderCode,
    String? customerName,
    String? note,
  }) =>
      _api.post(
        '/api/bulk-orders',
        (data) => BulkOrder.fromJson(asMap(data)),
        body: {
          'productName': productName,
          'totalQuantity': totalQuantity,
          'perSheetQty': perSheetQty,
          'printerIds': printerIds,
          if (orderCode != null && orderCode.isNotEmpty) 'orderCode': orderCode,
          if (customerName != null && customerName.isNotEmpty)
            'customerName': customerName,
          if (note != null && note.isNotEmpty) 'note': note,
        },
      );

  /// Sửa phần thông tin của đơn.
  ///
  /// Backend **không** cho đổi tổng số con / số con mỗi mâm / danh sách máy: lượt
  /// in đã chia xong và tem mã vạch đã in ra, muốn chia lại thì xóa đơn tạo mới.
  Future<void> updateOrder(
    String id, {
    required String productName,
    String? orderCode,
    String? customerName,
    String? note,
    BulkStatus? status,
  }) =>
      _api.patch<void>(
        '/api/bulk-orders/${Uri.encodeComponent(id)}',
        (_) {},
        body: {
          'productName': productName,
          'orderCode': orderCode ?? '',
          'customerName': customerName?.isEmpty ?? true ? 'Khách lẻ' : customerName,
          'note': note?.isEmpty ?? true ? null : note,
          if (status != null) 'status': status.value,
        },
      );

  /// Xóa đơn kèm toàn bộ lượt (Cascade) — mốc check-in/out đã ghi sẽ mất.
  Future<void> deleteOrder(String id) =>
      _api.delete<void>('/api/bulk-orders/${Uri.encodeComponent(id)}', (_) {});

  /// Quẹt mã lượt in: lần 1 = bắt đầu in, lần 2 = in xong.
  ///
  /// Quẹt lượt đã xong thì backend trả lỗi kèm mốc giờ cũ — [ApiException] mang
  /// sẵn câu tiếng Việt nên cứ hiển thị thẳng.
  /// [printerId] chỉ dùng cho lần quẹt check-in: máy quẹt kèm là máy chạy thật,
  /// backend gán lại lượt về máy đó (có thể khác máy được chia lúc tạo đơn).
  Future<BulkScanResult> scanRun(String code, {String? printerId}) => _api.post(
        '/api/bulk-runs/scan',
        (data) {
          final map = asMap(data);
          return BulkScanResult(
            run: BulkRun.fromJson(asMap(map['run'])),
            isCheckIn: asString(map['action']) == 'check-in',
          );
        },
        body: {
          'code': code,
          if (printerId != null) 'printerId': printerId,
        },
      );

  /// Sửa tay 1 lượt — dùng khi quẹt nhầm. `status: pending` xóa luôn mốc giờ.
  Future<void> updateRun(String id, {required BulkStatus status}) =>
      _api.patch<void>(
        '/api/bulk-runs/${Uri.encodeComponent(id)}',
        (_) {},
        body: {'status': status.value},
      );
}

final bulkRepositoryProvider = Provider<BulkRepository>(
  (ref) => BulkRepository(ref.watch(apiClientProvider)),
);
