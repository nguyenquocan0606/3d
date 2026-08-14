import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../models/json.dart';
import '../models/printer.dart';

class PrinterRepository {
  PrinterRepository(this._api);

  final ApiClient _api;

  Future<List<Printer>> fetchPrinters() =>
      _api.get('/api/printers', (data) => asList(data, Printer.fromJson));

  Future<void> createPrinter({
    required String id,
    required String name,
    String? model,
  }) =>
      _api.post<void>(
        '/api/printers',
        (_) {},
        body: compact({'id': id, 'name': name, 'model': model}),
      );

  Future<void> updatePrinter(
    String id, {
    String? name,
    String? model,
    String? status,
  }) =>
      _api.put<void>(
        '/api/printers/$id',
        (_) {},
        body: compact({'name': name, 'model': model, 'status': status}),
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

  Future<List<CloudAccount>> fetchCloudAccounts() => _api.get(
        '/api/printers/cloud/accounts',
        (data) => asList(data, CloudAccount.fromJson),
      );

  Future<List<DiscoveredCloudPrinter>> discover(String accountId) => _api.get(
        '/api/printers/cloud/discover',
        (data) =>
            asList(asMap(data)['cloudPrinters'], DiscoveredCloudPrinter.fromJson),
        query: {'accountId': accountId},
      );
}

final printerRepositoryProvider = Provider<PrinterRepository>(
  (ref) => PrinterRepository(ref.watch(apiClientProvider)),
);
