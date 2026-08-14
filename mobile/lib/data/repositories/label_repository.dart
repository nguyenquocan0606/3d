import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';

/// In tem nhãn.
///
/// Máy in nhiệt XPrinter cắm USB vào **máy chủ**, không phải điện thoại — app chỉ
/// gửi yêu cầu, server sinh lệnh TSPL rồi ghi thẳng vào `/dev/usb/lp0`.
class LabelRepository {
  LabelRepository(this._api);

  final ApiClient _api;

  /// Tem QR 3 dòng (cuộn nhựa / kho / máy in / mã màu).
  Future<void> printQrLabel({
    required String qrCode,
    required String line1,
    required String line2,
    required String line3,
  }) =>
      _api.post<void>(
        '/api/print-jobs',
        (_) {},
        body: {
          'qrCode': qrCode,
          // Backend nhận `label` là **chuỗi JSON**, không phải object. Phải encode
          // đàng hoàng vì tên kho/màu do người dùng nhập, có thể chứa dấu nháy.
          'label': jsonEncode({'line1': line1, 'line2': line2, 'line3': line3}),
        },
      );

  /// Tem slot AMS — in 2 trang (QR to + số slot khổng lồ).
  Future<void> printPrinterSlotLabel({
    required String printerId,
    required int slotNumber,
  }) =>
      _api.post<void>(
        '/api/print-jobs',
        (_) {},
        body: {
          'qrCode': '$printerId-L$slotNumber',
          'label': jsonEncode({
            'line1': printerId,
            'line2': 'LINE',
            'line3': '$slotNumber',
          }),
          'layout': 'printerSlot',
          'slotNumber': slotNumber,
        },
      );

  /// In hàng loạt tem barcode Code 128 cho miếng in của đơn hàng.
  Future<void> printOrderBarcodes(
    List<({String barcode, String line1, String line2, String line3})> jobs,
  ) =>
      _api.post<void>(
        '/api/print-jobs/batch',
        (_) {},
        body: {
          'jobs': jobs
              .map((job) => {
                    'qrCode': job.barcode,
                    'labelData': {
                      'line1': job.line1,
                      'line2': job.line2,
                      'line3': job.line3,
                    },
                  })
              .toList(),
        },
      );
}

final labelRepositoryProvider = Provider<LabelRepository>(
  (ref) => LabelRepository(ref.watch(apiClientProvider)),
);
