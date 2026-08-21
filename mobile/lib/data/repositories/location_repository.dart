import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../local/cache_reader.dart';
import '../models/location.dart';
import '../sync/sync_service.dart';

class LocationRepository {
  LocationRepository(this._api, this._cache);

  final ApiClient _api;
  final CacheReader _cache;

  /// Đọc danh sách kho từ **CSDL cục bộ** — không gọi mạng.
  Future<List<StorageLocation>> fetchLocations() async =>
      (await _cache.locationsKemCuon()).map(StorageLocation.fromJson).toList();

  /// Tạo kho mới — bắt buộc có mạng (Nhóm B §2.2).
  Future<void> createLocation({required String id, required String name}) =>
      _api.post<void>('/api/locations', (_) {}, body: {'id': id, 'name': name});

  /// Đổi tên kho — bắt buộc có mạng (Nhóm B §2.2).
  Future<void> renameLocation(String id, String name) =>
      _api.put<void>('/api/locations/$id', (_) {}, body: {'name': name});

  /// Xóa kho — cuộn trong kho sẽ được set `locationId = null` (onDelete: SetNull).
  Future<void> deleteLocation(String id) =>
      _api.delete<void>('/api/locations/$id', (_) {});
}

final locationRepositoryProvider = Provider<LocationRepository>(
  (ref) => LocationRepository(
    ref.watch(apiClientProvider),
    ref.watch(cacheReaderProvider),
  ),
);
