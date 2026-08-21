import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/scan/code_normalizer.dart';
import '../../core/scan/scan_router.dart';
import '../../data/models/filament.dart';
import '../../data/models/order.dart';
import '../../data/providers.dart';
import '../../data/repositories/label_repository.dart';
import '../production/pei_sheet_detail_screen.dart';
import '../spools/color_detail_screen.dart';

/// Nội dung một tem 40×30mm: QR + 3 dòng chữ.
///
/// [slot] chỉ khác null với tem khay AMS — loại đó in bằng layout riêng 2 trang
/// (QR to + số line khổng lồ) nên phải phân biệt ở chỗ gọi máy in.
typedef LabelPayload = ({
  String qr,
  String line1,
  String line2,
  String line3,
  int? slot,
});

/// Dựng nội dung tem từ một mã vừa quét — để in lại đúng cái tem đã mờ/rách.
///
/// Nội dung phải **khớp từng dòng** với lúc in lần đầu ở các màn chi tiết, nếu
/// không thì tem in lại trông khác tem cũ dán bên cạnh. Ném [ScanFailure] khi mã
/// hợp lệ nhưng không thuộc loại có tem QR để in lại.
LabelPayload labelPayloadFor(WidgetRef ref, ScannedCode scanned) {
  switch (scanned.kind) {
    case ScanKind.spool:
      final spools = ref.read(spoolsProvider).valueOrNull ?? const <Spool>[];
      for (final spool in spools) {
        if (spool.id == scanned.id) {
          return (
            qr: spool.id,
            line1: spool.id,
            line2: spool.filamentType,
            line3: spool.filamentColorName,
            slot: null,
          );
        }
      }
      throw ScanFailure('Không tìm thấy cuộn nhựa ${scanned.id}.');

    case ScanKind.colorTag:
      final name = scanned.id;
      if (name == null) {
        throw ScanFailure(
          'Không có cuộn nhựa nào màu "${scanned.label ?? scanned.raw}".',
        );
      }
      return (
        qr: colorTagCode(name),
        line1: colorTagCode(name),
        line2: 'MÃ MÀU NHỰA',
        line3: name,
        slot: null,
      );

    case ScanKind.location:
      final locations = ref.read(locationsProvider).valueOrNull ?? const [];
      for (final location in locations) {
        if (location.id == scanned.id) {
          return (
            qr: location.id,
            line1: location.id,
            line2: 'VỊ TRÍ KHO',
            line3: location.name,
            slot: null,
          );
        }
      }
      throw ScanFailure('Không tìm thấy kho ${scanned.id}.');

    case ScanKind.printer:
    case ScanKind.printerSlot:
      final printers = ref.read(printersProvider).valueOrNull ?? const [];
      for (final printer in printers) {
        if (printer.id != scanned.id) continue;
        if (scanned.kind == ScanKind.printerSlot) {
          return (
            qr: '${printer.id}-L${scanned.slot}',
            line1: printer.id,
            line2: 'LINE',
            line3: '${scanned.slot}',
            slot: scanned.slot,
          );
        }
        return (
          qr: printer.id,
          line1: printer.id,
          line2: 'MÁY IN 3D',
          line3: printer.name,
          slot: null,
        );
      }
      throw ScanFailure('Không tìm thấy máy in ${scanned.id}.');

    case ScanKind.peiSheet:
      final sheets = ref.read(peiSheetsProvider).valueOrNull ?? const <PeiSheet>[];
      var name = scanned.id!;
      for (final sheet in sheets) {
        if (sheet.id == scanned.id) name = sheet.name;
      }
      return (
        qr: peiSheetCode(scanned.id!),
        line1: 'PEI',
        line2: 'MAM IN PEI',
        line3: name,
        slot: null,
      );

    // Tem miếng in là barcode Code 128 in hàng loạt theo đơn, không phải tem QR —
    // in lại ở màn chi tiết đơn để còn chọn in cả đơn hay từng miếng.
    case ScanKind.printItem:
    case ScanKind.bulkRun:
      throw ScanFailure(
        'Tem miếng in / lượt in in lại ở màn chi tiết đơn, không in lẻ ở đây.',
      );

    case ScanKind.order:
    case ScanKind.bulkOrder:
    case ScanKind.eshopOrder:
    case ScanKind.storeProduct:
    case ScanKind.command:
    case ScanKind.unknown:
      throw ScanFailure('Mã "${scanned.raw}" không có tem QR để in lại.');
  }
}

/// Gửi lệnh in một tem đã dựng sẵn.
Future<void> printLabelPayload(WidgetRef ref, LabelPayload payload) {
  final repo = ref.read(labelRepositoryProvider);
  final slot = payload.slot;
  if (slot != null) {
    return repo.printPrinterSlotLabel(printerId: payload.line1, slotNumber: slot);
  }
  return repo.printQrLabel(
    qrCode: payload.qr,
    line1: payload.line1,
    line2: payload.line2,
    line3: payload.line3,
  );
}
