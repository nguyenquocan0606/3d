import 'filament.dart';
import 'json.dart';

/// Kho lưu trữ (ô kệ chứa cuộn nhựa). Id do người dùng tự đặt, VD `LOC-01`.
class StorageLocation {
  const StorageLocation({
    required this.id,
    required this.name,
    this.spools = const [],
  });

  final String id;
  final String name;
  final List<Spool> spools;

  double get totalRemainingG =>
      spools.fold<double>(0, (sum, spool) => sum + spool.remainingWeightG);

  factory StorageLocation.fromJson(Map<String, dynamic> json) {
    final name = asString(json['name']);
    final id = asString(json['id']);
    return StorageLocation(
      id: id,
      name: name,
      // Backend include `filament` trong từng spool ở endpoint này, nhưng không
      // include `location` (thừa) — bổ sung tên kho để UI khỏi phải tra ngược.
      spools: asMapList(json['spools'])
          .map((raw) => Spool.fromJson(raw).copyWith(locationId: id, locationName: name))
          .toList(),
    );
  }
}
