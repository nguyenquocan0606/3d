import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../local/cache_reader.dart';
import '../models/json.dart';
import '../models/printer.dart';
import '../sync/sync_service.dart';

class PrinterRepository {
  PrinterRepository(this._api, this._cache);

  final ApiClient _api;
  final CacheReader _cache;

  /// Đọc danh sách máy in từ **CSDL cục bộ** — không gọi mạng.
  Future<List<Printer>> fetchPrinters() async =>
      (await _cache.printersKemCuon()).map(Printer.fromJson).toList();

  /// Máy chủ **dò MQTT thật** trước khi lưu nếu có đủ IP + Access Code + ID máy, nên lời gọi này
  /// có thể mất tới ~15 giây. Sai Access Code sẽ trả lỗi ngay thay vì im lặng chấp nhận.
  Future<void> createPrinter({
    required String id,
    required String name,
    String? model,
    String? lanIp,
    String? lanAccessCode,
    String? lanSerial,
    String? cloudPrinterId,
  }) =>
      _api.post<void>(
        '/api/printers',
        (_) {},
        body: compact({
          'id': id,
          'name': name,
          'model': model,
          'lanIp': lanIp,
          'lanAccessCode': lanAccessCode,
          'lanSerial': lanSerial,
          'cloudPrinterId': cloudPrinterId,
        }),
      );

  /// `lanAccessCode` để null nghĩa là **giữ mã cũ** — máy chủ không trả mã đã lưu về nên không thể
  /// điền sẵn vào ô, bắt gõ lại mỗi lần sửa tên máy thì quá phiền.
  Future<void> updatePrinter(
    String id, {
    String? name,
    String? model,
    String? status,
    String? lanIp,
    String? lanAccessCode,
    String? lanSerial,
    String? cloudPrinterId,
  }) =>
      _api.put<void>(
        '/api/printers/$id',
        (_) {},
        body: compact({
          'name': name,
          'model': model,
          'status': status,
          'lanIp': lanIp,
          'lanAccessCode': lanAccessCode,
          'lanSerial': lanSerial,
          'cloudPrinterId': cloudPrinterId,
        }),
      );

  Future<void> deletePrinter(String id) =>
      _api.delete<void>('/api/printers/$id', (_) {});

  /// Trạng thái realtime của **mọi** máy in đã ghép cloud.
  /// Backend gọi các provider song song nên 1 request là đủ cho cả màn hình.
  Future<Map<String, PrinterLiveStatus>> fetchLiveStatuses() =>
      _api.get('/api/printers/cloud/status', (data) {
        final result = <String, PrinterLiveStatus>{};
        asMap(data).forEach((printerId, dynamic raw) {
          if (raw is Map) {
            result[printerId] = PrinterLiveStatus.fromJson(asMap(raw));
          }
        });
        return result;
      });

  Future<PrinterLiveStatus> fetchLiveStatus(String printerId) => _api.get(
        '/api/printers/cloud/status',
        (data) => PrinterLiveStatus.fromJson(asMap(data)),
        query: {'printerId': printerId},
      );

  /// `POST /api/printers/cloud/control`.
  ///
  /// action: light | temp-nozzle | temp-bed | fan | pause | resume | stop | sync-ams
  Future<void> sendCommand(
    String printerId,
    String action, {
    Map<String, dynamic>? value,
  }) =>
      _api.post<void>(
        '/api/printers/cloud/control',
        (_) {},
        body: compact({'printerId': printerId, 'action': action, 'value': value}),
      );

  Future<void> setLight(String printerId, bool on) =>
      sendCommand(printerId, 'light', value: {'on': on});

  Future<void> setNozzleTemp(String printerId, int target) =>
      sendCommand(printerId, 'temp-nozzle', value: {'target': target});

  Future<void> setBedTemp(String printerId, int target) =>
      sendCommand(printerId, 'temp-bed', value: {'target': target});

  Future<void> setFanSpeed(String printerId, int percent) =>
      sendCommand(printerId, 'fan', value: {'speed': percent});

  /// Đẩy thông tin cuộn nhựa đang gắn trên máy lên khay AMS.
  /// Backend cần đúng shape spool có `printerSlot` và `filament.{type,colorHex}`.
  Future<void> syncAms(String printerId, List<Map<String, dynamic>> spools) =>
      sendCommand(printerId, 'sync-ams', value: {'spools': spools});

  /// Danh sách máy Home Assistant nhìn thấy, để form tự điền IP và ID máy.
  Future<List<GoiYTuHa>> goiYTuHa() => _api.get(
        '/api/printers/ha-goi-y',
        (data) => asList(data, GoiYTuHa.fromJson),
      );
}

final printerRepositoryProvider = Provider<PrinterRepository>(
  (ref) => PrinterRepository(
    ref.watch(apiClientProvider),
    ref.watch(cacheReaderProvider),
  ),
);
