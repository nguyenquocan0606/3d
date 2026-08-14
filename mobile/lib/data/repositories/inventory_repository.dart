import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../models/inventory.dart';
import '../models/json.dart';

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
  InventoryRepository(this._api);

  final ApiClient _api;

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

  /// Quét lại cùng 1 cuộn chỉ cập nhật `scannedAt` (upsert), không tạo bản ghi trùng.
  Future<ScanResult> scanSpool(String spoolId) => _api.post(
        '/api/inventory/scan',
        (data) => ScanResult.fromJson(asMap(data)),
        body: {'spoolId': spoolId},
      );

  Future<List<PrintTask>> fetchTasks() =>
      _api.get('/api/tasks3d', (data) => asList(data, PrintTask.fromJson));

  /// Tạo lệnh in: trừ nhựa, chuyển cuộn từ kho lên máy in, đặt máy in sang `printing`.
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
  (ref) => InventoryRepository(ref.watch(apiClientProvider)),
);
