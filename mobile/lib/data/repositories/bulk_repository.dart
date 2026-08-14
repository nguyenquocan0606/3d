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
  ///
  /// [printerLimits] khai số con/mâm riêng cho từng máy (`printerId` → số con);
  /// máy không có trong map thì dùng [perSheetQty] chung.
  Future<BulkOrder> createOrder({
    required String productName,
    required int totalQuantity,
    required int perSheetQty,
    required List<String> printerIds,
    Map<String, int> printerLimits = const {},
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
          if (printerLimits.isNotEmpty) 'printerLimits': printerLimits,
          if (orderCode != null && orderCode.isNotEmpty) 'orderCode': orderCode,
          if (customerName != null && customerName.isNotEmpty)
            'customerName': customerName,
          if (note != null && note.isNotEmpty) 'note': note,
        },
      );

  /// Sửa phần mô tả của đơn — không đụng tới lượt đã chia.
  ///
  /// Muốn đổi số lượng / máy chạy thì dùng [resplitOrder], vì việc đó chia lại
  /// toàn bộ lượt.
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

  /// Chia lại lượt in từ đầu.
  ///
  /// **Phá hủy dữ liệu**: mọi lượt cũ bị xóa và cấp mã vạch mới, nên tem đã in
  /// thành rác và mốc check-in/check-out đã ghi mất sạch. Luôn hỏi lại người dùng
  /// trước khi gọi.
  Future<void> resplitOrder(
    String id, {
    required int totalQuantity,
    required int perSheetQty,
    required List<String> printerIds,
    Map<String, int> printerLimits = const {},
  }) =>
      _api.patch<void>(
        '/api/bulk-orders/${Uri.encodeComponent(id)}',
        (_) {},
        body: {
          'totalQuantity': totalQuantity,
          'perSheetQty': perSheetQty,
          'printerIds': printerIds,
          if (printerLimits.isNotEmpty) 'printerLimits': printerLimits,
        },
      );

  /// "In miếng lỗi": gom số lỗi chưa bù của đơn rồi sinh lượt in bù, trả về đơn
  /// đã cập nhật để phía gọi biết lượt nào vừa sinh mà in tem.
  Future<BulkOrder> createRework(String id) => _api.post(
        '/api/bulk-orders/${Uri.encodeComponent(id)}/rework',
        (data) => BulkOrder.fromJson(asMap(data)),
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
  /// [defectQuantity] chỉ dùng cho lần chốt "in xong".
  Future<BulkScanResult> scanRun(
    String code, {
    String? printerId,
    int defectQuantity = 0,
  }) =>
      _api.post(
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
          if (defectQuantity > 0) 'defectQuantity': defectQuantity,
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
