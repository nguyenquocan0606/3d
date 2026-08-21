import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../local/cache_store.dart';
import '../local/outbox.dart';
import '../models/inventory.dart';
import '../models/json.dart';
import '../sync/sync_service.dart';

/// Kết quả quét 1 cuộn trong phiên kiểm kho — backend trả kèm thông tin cuộn
/// để app hiện ngay mà không phải gọi thêm request.
class ScanResult {
  const ScanResult({
    required this.spoolId,
    required this.filamentType,
    required this.colorName,
    required this.remainingWeightG,
    this.colorHex,
    this.brand,
  });

  final String spoolId;
  final String filamentType;
  final String colorName;
  final double remainingWeightG;
  final String? colorHex;
  final String? brand;

  factory ScanResult.fromJson(Map<String, dynamic> json) {
    final spool = asMap(json['spool']);
    return ScanResult(
      spoolId: asString(spool['id']),
      filamentType: asString(spool['filamentType']),
      colorName: asString(spool['filamentColorName']),
      remainingWeightG: asDouble(spool['remainingWeightG']),
      colorHex: asStringOrNull(spool['filamentColorHex']),
      brand: asStringOrNull(spool['filamentBrand']),
    );
  }
}

class InventoryRepository {
  InventoryRepository(this._api, this._store, this._outbox);

  final ApiClient _api;
  final CacheStore _store;
  final Outbox _outbox;

  /// Backend tự tạo phiên mới nếu chưa có phiên active nào.
  Future<InventorySession> fetchActiveSession() => _api.get(
        '/api/inventory/session',
        (data) => InventorySession.fromJson(asMap(data)),
      );

  /// Kết thúc phiên hiện tại và mở phiên mới (tương ứng QR lệnh `CMD-INV-RESET`).
  Future<InventorySession> resetSession() => _api.delete(
        '/api/inventory/session',
        (data) => InventorySession.fromJson(asMap(data)),
      );

  /// Quét kiểm kho — **qua hàng đợi offline** (Nhóm A `inventory.scanSpool`).
  ///
  /// Đọc thông tin cuộn từ cache để dựng [ScanResult] ngay lập tức, không cần mạng.
  /// Server sẽ ghi nhận lượt quét khi hàng đợi được đẩy lên.
  Future<ScanResult> scanSpool(String spoolId) async {
    // Tra cuộn trong cache
    final spoolData = await _store.docMot(BangCache.spools, spoolId);

    await _outbox.them(
      loai: 'inventory.scanSpool',
      payload: {'spoolId': spoolId},
      moTa: 'Kiểm kho: quét cuộn $spoolId',
    );

    if (spoolData != null) {
      // Dựng ScanResult từ dữ liệu cache, kể cả khi mất mạng
      final filamentId = asStringOrNull(spoolData['filamentId']);
      final filamentData = filamentId != null
          ? await _store.docMot(BangCache.filaments, filamentId)
          : null;
      // Một số deployment cache spool kèm filament lồng bên trong
      final nestedFilament = asMap(spoolData['filament']);

      return ScanResult(
        spoolId: spoolId,
        filamentType: filamentData != null
            ? asString(filamentData['type'])
            : asString(nestedFilament['type']),
        colorName: filamentData != null
            ? asString(filamentData['colorName'])
            : asString(nestedFilament['colorName']),
        remainingWeightG: asDouble(spoolData['remainingWeightG']),
        colorHex: filamentData != null
            ? asStringOrNull(filamentData['colorHex'])
            : asStringOrNull(nestedFilament['colorHex']),
        brand: filamentData != null
            ? asStringOrNull(filamentData['brand'])
            : asStringOrNull(nestedFilament['brand']),
      );
    }

    // Cache chưa có cuộn này (mã mới chưa đồng bộ) — gọi API
    return _api.post(
      '/api/inventory/scan',
      (data) => ScanResult.fromJson(asMap(data)),
      body: {'spoolId': spoolId},
    );
  }

  /// Bỏ ghi nhận 1 cuộn khỏi phiên đang chạy — bắt buộc có mạng (Nhóm B §2.2).
  Future<ScanResult> unscanSpool({String? spoolId}) => _api.delete(
        '/api/inventory/scan',
        (data) => ScanResult.fromJson(asMap(data)),
        body: {if (spoolId != null) 'spoolId': spoolId},
      );

  Future<List<PrintTask>> fetchTasks() =>
      _api.get('/api/tasks3d', (data) => asList(data, PrintTask.fromJson));

  /// Tạo lệnh in — bắt buộc có mạng (Nhóm B §2.2).
  Future<void> createTask({
    required String printerId,
    required int durationMinutes,
    required List<({String spoolId, double weightG})> spools,
    String? name,
  }) =>
      _api.post<void>(
        '/api/tasks3d',
        (_) {},
        body: compact({
          'printerId': printerId,
          'durationMinutes': durationMinutes,
          'name': name,
          'spools': spools
              .map((e) => {'id': e.spoolId, 'weightG': e.weightG})
              .toList(),
        }),
      );
}

final inventoryRepositoryProvider = Provider<InventoryRepository>(
  (ref) => InventoryRepository(
    ref.watch(apiClientProvider),
    ref.watch(cacheStoreProvider),
    ref.watch(outboxProvider),
  ),
);
