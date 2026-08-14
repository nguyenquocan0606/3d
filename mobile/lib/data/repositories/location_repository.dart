import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../models/json.dart';
import '../models/location.dart';

class LocationRepository {
  LocationRepository(this._api);

  final ApiClient _api;

  Future<List<StorageLocation>> fetchLocations() =>
      _api.get('/api/locations', (data) => asList(data, StorageLocation.fromJson));

  Future<void> createLocation({required String id, required String name}) =>
      _api.post<void>('/api/locations', (_) {}, body: {'id': id, 'name': name});

  Future<void> renameLocation(String id, String name) =>
      _api.put<void>('/api/locations/$id', (_) {}, body: {'name': name});

  /// Cuộn nhựa trong kho sẽ được set `locationId = null` (onDelete: SetNull).
  Future<void> deleteLocation(String id) =>
      _api.delete<void>('/api/locations/$id', (_) {});
}

final locationRepositoryProvider = Provider<LocationRepository>(
  (ref) => LocationRepository(ref.watch(apiClientProvider)),
);
