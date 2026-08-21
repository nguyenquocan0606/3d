import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../local/cache_reader.dart';
import '../local/cache_store.dart';
import '../local/outbox.dart';
import '../models/bulk_order.dart';
import '../models/json.dart';
import '../sync/sync_service.dart';

/// Sản xuất số lượng lớn (đơn SLL) — port `bulk-production-tab.tsx`.
class BulkRepository {
  BulkRepository(this._api, this._cache, this._store, this._outbox);

  final ApiClient _api;
  final CacheReader _cache;
  final CacheStore _store;
  final Outbox _outbox;

  /// Danh sách đơn SLL kèm lượt in — đọc từ **CSDL cục bộ**, không gọi mạng.
  Future<List<BulkOrder>> fetchOrders() async =>
      (await _cache.bulkOrdersKemLuot()).map(BulkOrder.fromJson).toList();

  Future<BulkOrder> fetchOrder(String id) => _api.get(
        '/api/bulk-orders/${Uri.encodeComponent(id)}',
        (data) => BulkOrder.fromJson(asMap(data)),
      );

  /// Tạo đơn + chia lượt — bắt buộc có mạng (Nhóm B §2.2).
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

  /// Sửa phần mô tả đơn — không đụng tới lượt đã chia.
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

  /// Chia lại lượt in, **giữ nguyên phần đã chạy** — bắt buộc có mạng (Nhóm B §2.2).
  Future<void> resplitOrder(
    String id, {
    required int totalQuantity,
    required int perSheetQty,
    required List<String> printerIds,
    Map<String, int> printerLimits = const {},
    bool suaLuotDaChay = true,
  }) =>
      _api.patch<void>(
        '/api/bulk-orders/${Uri.encodeComponent(id)}',
        (_) {},
        body: {
          'totalQuantity': totalQuantity,
          'perSheetQty': perSheetQty,
          'printerIds': printerIds,
          if (printerLimits.isNotEmpty) 'printerLimits': printerLimits,
          'suaLuotDaChay': suaLuotDaChay,
        },
      );

  /// "In miếng lỗi" — bắt buộc có mạng (Nhóm B §2.2).
  Future<BulkOrder> createRework(String id) => _api.post(
        '/api/bulk-orders/${Uri.encodeComponent(id)}/rework',
        (data) => BulkOrder.fromJson(asMap(data)),
      );

  Future<void> deleteOrder(String id) =>
      _api.delete<void>('/api/bulk-orders/${Uri.encodeComponent(id)}', (_) {});

  /// Bắt đầu 1 lượt in — **qua hàng đợi offline** (Nhóm A `bulkRun.checkIn`).
  ///
  /// [run] là lượt đang ở trạng thái `pending`.
  /// [printerId] là máy thật đang chạy lượt này (có thể khác máy được chia).
  ///
  /// Trả về [BulkScanResult] xây tại chỗ từ cache; server sẽ cập nhật khi đồng bộ.
  Future<BulkScanResult> checkInRun(BulkRun run, String printerId) async {
    final now = DateTime.now();
    await _outbox.them(
      loai: 'bulkRun.checkIn',
      payload: {'runId': run.id, 'printerId': printerId},
      moTa:
          'Bắt đầu in: ${run.printerName} · PEI ${run.peiIndex} (${run.quantity} con)',
      taoLuc: now,
    );
    await _store.vaTamThoi(BangCache.bulkRuns, run.id, {
      'status': BulkStatus.printing.value,
      'printerId': printerId,
      'startedAt': now.toUtc().toIso8601String(),
    });
    return BulkScanResult(
      run: BulkRun(
        id: run.id,
        orderId: run.orderId,
        printerName: run.printerName,
        seq: run.seq,
        peiIndex: run.peiIndex,
        quantity: run.quantity,
        status: BulkStatus.printing,
        printerId: printerId,
        startedAt: now,
      ),
      isCheckIn: true,
    );
  }

  /// Chốt in xong 1 lượt — **qua hàng đợi offline** (Nhóm A `bulkRun.checkOut`).
  ///
  /// [run] là lượt đang ở trạng thái `printing`.
  /// [defectQuantity] là số con lỗi thợ nhập khi chốt.
  Future<BulkScanResult> checkOutRun(BulkRun run, {int defectQuantity = 0}) async {
    final now = DateTime.now();
    await _outbox.them(
      loai: 'bulkRun.checkOut',
      payload: {'runId': run.id, 'defectQuantity': defectQuantity},
      moTa: 'In xong: ${run.printerName} · PEI ${run.peiIndex}'
          '${defectQuantity > 0 ? " ($defectQuantity con lỗi)" : ""}',
      taoLuc: now,
    );
    await _store.vaTamThoi(BangCache.bulkRuns, run.id, {
      'status': BulkStatus.completed.value,
      'defectQuantity': defectQuantity,
      'finishedAt': now.toUtc().toIso8601String(),
    });
    return BulkScanResult(
      run: BulkRun(
        id: run.id,
        orderId: run.orderId,
        printerName: run.printerName,
        seq: run.seq,
        peiIndex: run.peiIndex,
        quantity: run.quantity,
        status: BulkStatus.completed,
        defectQuantity: defectQuantity,
        printerId: run.printerId,
        startedAt: run.startedAt,
        finishedAt: now,
      ),
      isCheckIn: false,
    );
  }

  /// Kiểm hàng lại 1 mâm đã in xong — **qua hàng đợi offline** (`bulkRun.verify`).
  ///
  /// Chỉ ghi mốc kiểm, không đụng tới trạng thái/số lỗi của lượt: kiểm hàng là
  /// lượt quẹt đối soát, không phải sửa lại kết quả in.
  Future<BulkRun> verifyRun(BulkRun run) async {
    final now = DateTime.now();
    await _outbox.them(
      loai: 'bulkRun.verify',
      payload: {'runId': run.id},
      moTa: 'Kiểm hàng: ${run.printerName} · PEI ${run.peiIndex} (${run.quantity} con)',
      taoLuc: now,
    );
    await _store.vaTamThoi(BangCache.bulkRuns, run.id, {
      'verifiedAt': now.toUtc().toIso8601String(),
    });
    return run.copyWith(verifiedAt: now);
  }

  /// Bỏ đánh dấu đã kiểm (tick nhầm mâm) — bắt buộc có mạng (Nhóm B §2.2).
  Future<void> unverifyRun(String id) async {
    await _api.patch<void>(
      '/api/bulk-runs/${Uri.encodeComponent(id)}',
      (_) {},
      body: {'verifiedAt': null},
    );
    // Vá cache sau khi server nhận, để danh sách bỏ tick ngay chứ không phải đợi
    // lượt đồng bộ kéo về.
    await _store.vaTamThoi(BangCache.bulkRuns, id, {'verifiedAt': null});
  }

  /// Sửa tay 1 lượt — bắt buộc có mạng (Nhóm B §2.2).
  Future<void> updateRun(String id, {required BulkStatus status}) =>
      _api.patch<void>(
        '/api/bulk-runs/${Uri.encodeComponent(id)}',
        (_) {},
        body: {'status': status.value},
      );
}

final bulkRepositoryProvider = Provider<BulkRepository>(
  (ref) => BulkRepository(
    ref.watch(apiClientProvider),
    ref.watch(cacheReaderProvider),
    ref.watch(cacheStoreProvider),
    ref.watch(outboxProvider),
  ),
);
