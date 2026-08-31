import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../local/cache_reader.dart';
import '../local/cache_store.dart';
import '../local/outbox.dart';
import '../models/filament.dart';
import '../models/json.dart';
import '../sync/sync_service.dart';

class FilamentRepository {
  FilamentRepository(this._api, this._cache, this._store, this._outbox);

  final ApiClient _api;
  final CacheReader _cache;

  /// Cần cho **cập nhật lạc quan**: xếp thao tác vào hàng đợi xong phải vá luôn
  /// cache, nếu không màn hình vẫn hiện số cũ cho tới lần đồng bộ kế tiếp — thợ
  /// sẽ tưởng máy không nhận.
  final CacheStore _store;

  final Outbox _outbox;

  /// Đọc từ **CSDL cục bộ**, không gọi mạng.
  ///
  /// Đây là điểm mấu chốt của chế độ offline: mọi màn hình đọc dữ liệu đã có sẵn
  /// trong máy, nên mở app lúc mất sóng vẫn thấy đủ. Việc làm cho dữ liệu đó mới
  /// là của worker đồng bộ, không phải của màn hình.
  Future<List<Filament>> fetchFilaments() async =>
      (await _cache.filamentsKemCuon()).map(Filament.fromJson).toList();

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

  /// Tạo cuộn nhựa mới — **qua hàng đợi offline** (Nhóm A `spool.create`).
  ///
  /// Server áp luật "trùng mã → từ chối, báo thợ" (xem kế hoạch §2.1). Khi có
  /// [filamentId] đã biết, bản ghi được thêm vào cache ngay để danh sách hiển thị
  /// tức thì; trường hợp loại nhựa mới (chưa có id) phải đợi đồng bộ mới thấy.
  Future<void> createSpool({
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
  }) async {
    await _outbox.them(
      loai: 'spool.create',
      payload: compact({
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
      moTa: 'Tạo cuộn $id'
          '${type != null ? " ($type${colorName != null ? " $colorName" : ""})" : ""}',
    );

    // Cập nhật cache lạc quan chỉ khi biết filamentId (loại nhựa đã tồn tại).
    // Nếu không thì phải đợi đồng bộ — chấp nhận được vì cuộn mới chưa được in.
    if (filamentId != null) {
      await _store.themTamThoi(BangCache.spools, id, {
        'id': id,
        'filamentId': filamentId,
        'initialWeightG': initialWeightG,
        'emptySpoolWeightG': emptySpoolWeightG ?? 220,
        'remainingWeightG': remainingWeightG,
        'status': 'active',
        if (locationId != null) 'locationId': locationId,
        if (printerId != null) 'printerId': printerId,
      });
    }
  }

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

  /// Ghi khối lượng cân được — **qua hàng đợi, không gọi mạng**.
  ///
  /// Trả về ngay lập tức nên bảng cân phản hồi tức thì dù đang mất sóng. Worker
  /// đẩy lên sau; server áp luật ghi-đè-theo-giờ (kế hoạch §2.1).
  Future<void> updateSpoolWeight(String id, double remainingWeightG) async {
    if (remainingWeightG <= 0) {
      await _outbox.them(
        loai: 'spool.deleteWhenEmpty',
        payload: {'spoolId': id, 'remainingWeightG': 0},
        moTa: 'Xóa cuộn $id vì đã hết nhựa',
      );
      await _store.xoaTamThoi(BangCache.spools, id);
      return;
    }

    await _outbox.them(
      loai: 'spool.weigh',
      payload: {'spoolId': id, 'remainingWeightG': remainingWeightG},
      moTa: 'Cân cuộn $id: ${remainingWeightG.round()}g',
    );
    await _store.vaTamThoi(BangCache.spools, id, {
      'remainingWeightG': remainingWeightG,
      'status': 'active',
    });
  }

  /// Gán / tháo cuộn khỏi kho, máy in, slot AMS — qua hàng đợi.
  ///
  /// Tách khỏi [updateSpool] vì hai việc khác hẳn nhau về yêu cầu mạng: gán cuộn
  /// là thao tác quét tại kệ (phải chạy offline), còn sửa mã hay khối lượng ban
  /// đầu là việc quản trị (bắt buộc online, xem kế hoạch §2.2).
  Future<void> bindSpool(
    String id, {
    String? locationId,
    String? printerId,
    int? printerSlot,
    bool clearLocation = false,
    bool clearPrinter = false,
    bool clearSlot = false,
  }) async {
    final payload = <String, dynamic>{'spoolId': id};
    // Gửi `null` tường minh = tháo ra; không gửi field = giữ nguyên. Backend phân
    // biệt bằng có mặt khóa hay không nên không dùng `compact` được ở đây.
    if (locationId != null || clearLocation) payload['locationId'] = locationId;
    if (printerId != null || clearPrinter) payload['printerId'] = printerId;
    if (printerSlot != null || clearSlot) payload['printerSlot'] = printerSlot;

    final noi = clearLocation || clearPrinter
        ? 'tháo khỏi ${clearLocation ? 'kho' : 'máy in'}'
        : 'gắn vào ${locationId ?? printerId}';
    await _outbox.them(
      loai: 'spool.bind',
      payload: payload,
      moTa: 'Cuộn $id: $noi',
    );
    await _store.vaTamThoi(BangCache.spools, id, {
      for (final e in payload.entries)
        if (e.key != 'spoolId') e.key: e.value,
    });
  }

  Future<void> deleteSpool(String id) => _api.delete<void>('/api/spools/$id', (_) {});
}

final filamentRepositoryProvider = Provider<FilamentRepository>(
  (ref) => FilamentRepository(
    ref.watch(apiClientProvider),
    ref.watch(cacheReaderProvider),
    ref.watch(cacheStoreProvider),
    ref.watch(outboxProvider),
  ),
);
