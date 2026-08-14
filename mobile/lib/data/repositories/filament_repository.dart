import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../models/filament.dart';
import '../models/json.dart';

class FilamentRepository {
  FilamentRepository(this._api);

  final ApiClient _api;

  /// `GET /api/filaments` — nguồn dữ liệu chính: backend chưa có endpoint danh sách
  /// cuộn nhựa riêng nên phải tải loại nhựa rồi làm phẳng `spools`.
  Future<List<Filament>> fetchFilaments() =>
      _api.get('/api/filaments', (data) => asList(data, Filament.fromJson));

  Future<void> createFilament({
    required String type,
    required String colorName,
    String? colorHex,
    String? brand,
  }) =>
      _api.post<void>(
        '/api/filaments',
        (_) {},
        body: compact({
          'type': type,
          'colorName': colorName,
          'colorHex': colorHex,
          'brand': brand,
        }),
      );

  /// Cẩn thận: backend Cascade xóa toàn bộ cuộn thuộc loại nhựa này.
  Future<void> deleteFilament(String id) =>
      _api.delete<void>('/api/filaments/$id', (_) {});

  Future<DashboardStats> fetchDashboardStats() => _api.get(
        '/api/dashboard/stats',
        (data) => DashboardStats.fromJson(asMap(data)),
      );

  Future<Spool> createSpool({
    required String id,
    required double initialWeightG,
    required double remainingWeightG,
    String? filamentId,
    String? type,
    String? colorName,
    String? colorHex,
    String? brand,
    String? locationId,
    String? printerId,
    double? emptySpoolWeightG,
  }) =>
      _api.post(
        '/api/spools',
        (data) => Spool.fromJson(asMap(data)),
        body: compact({
          'id': id,
          'initialWeightG': initialWeightG,
          'remainingWeightG': remainingWeightG,
          'emptySpoolWeightG': emptySpoolWeightG,
          'filamentId': filamentId,
          'type': type,
          'colorName': colorName,
          'colorHex': colorHex,
          'brand': brand,
          'locationId': locationId,
          'printerId': printerId,
        }),
      );

  /// `PUT /api/spools/[id]`.
  ///
  /// Backend phân biệt "không gửi field" (giữ nguyên) và "gửi null" (xóa) nên
  /// [clearLocation] / [clearPrinter] phải tường minh — không thể dùng null của Dart.
  Future<void> updateSpool(
    String id, {
    String? newId,
    String? brand,
    String? locationId,
    String? printerId,
    int? printerSlot,
    double? initialWeightG,
    double? emptySpoolWeightG,
    double? remainingWeightG,
    String? status,
    bool clearLocation = false,
    bool clearPrinter = false,
    bool clearSlot = false,
  }) {
    final body = compact({
      'newId': newId,
      'brand': brand,
      'locationId': locationId,
      'printerId': printerId,
      'printerSlot': printerSlot,
      'initialWeightG': initialWeightG,
      'emptySpoolWeightG': emptySpoolWeightG,
      'remainingWeightG': remainingWeightG,
      'status': status,
    });
    if (clearLocation) body['locationId'] = null;
    if (clearPrinter) body['printerId'] = null;
    if (clearSlot) body['printerSlot'] = null;
    return _api.put<void>('/api/spools/$id', (_) {}, body: body);
  }

  /// `PUT /api/spools/[id]/weight` — endpoint chuyên cho luồng cân.
  /// Backend tự chuyển active ↔ depleted, riêng `archived` giữ nguyên.
  Future<void> updateSpoolWeight(String id, double remainingWeightG) => _api.put<void>(
        '/api/spools/$id/weight',
        (_) {},
        body: {'remainingWeightG': remainingWeightG},
      );

  Future<void> deleteSpool(String id) => _api.delete<void>('/api/spools/$id', (_) {});
}

final filamentRepositoryProvider = Provider<FilamentRepository>(
  (ref) => FilamentRepository(ref.watch(apiClientProvider)),
);
