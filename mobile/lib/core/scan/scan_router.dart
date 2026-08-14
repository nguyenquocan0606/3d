import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/models/bulk_order.dart';
import '../../data/models/filament.dart';
import '../../data/models/order.dart';
import '../../data/providers.dart';
import '../../data/repositories/filament_repository.dart';
import '../../data/repositories/production_repository.dart';
import '../../features/production/print_item_sheet.dart';
import '../../features/scanner/scan_result_sheet.dart';
import '../../features/scanner/scanner_screen.dart';
import 'code_normalizer.dart';
import 'scan_mode.dart';

/// Bộ chuẩn hóa mã dựng từ dữ liệu đang có trong app.
///
/// Mỗi nguồn dữ liệu ở đây tương ứng một loại tem đang dán trong xưởng — thiếu
/// nguồn nào thì loại tem đó quét sẽ báo "không nhận ra mã".
final codeNormalizerProvider = Provider<CodeNormalizer>((ref) {
  final locations = ref.watch(locationsProvider).valueOrNull ?? const [];
  final printers = ref.watch(printersProvider).valueOrNull ?? const [];
  final spools = ref.watch(spoolsProvider).valueOrNull ?? const <Spool>[];
  final store = ref.watch(storeProvider).valueOrNull;
  final sheets = ref.watch(peiSheetsProvider).valueOrNull ?? const <PeiSheet>[];
  final orders = ref.watch(ordersProvider).valueOrNull ?? const <Order>[];
  final bulkOrders = ref.watch(bulkOrdersProvider).valueOrNull ?? const <BulkOrder>[];

  return CodeNormalizer(
    locationIds: locations.map((e) => e.id).toSet(),
    printerIds: printers.map((e) => e.id).toSet(),
    spoolIds: spools.map((e) => e.id).toSet(),
    storeCodes: {
      for (final product in store?.sanPham ?? const []) ...[product.maQR, product.id],
    },
    peiSheetIds: sheets.map((e) => e.id).toSet(),
    orderCodes: {
      for (final order in orders) ...[
        if (order.orderCode != null) order.orderCode!,
        order.id,
      ],
    },
    bulkOrderCodes: {
      for (final order in bulkOrders) ...[
        if (order.orderCode != null) order.orderCode!,
        order.id,
      ],
    },
    bulkRunIds: {
      for (final order in bulkOrders)
        for (final run in order.runs) run.id,
    },
    colorNames: spools.map((e) => e.filamentColorName).where((e) => e.isNotEmpty).toSet(),
  );
});

/// Lỗi hiển thị được cho người dùng khi quét.
class ScanFailure implements Exception {
  ScanFailure(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Điều phối mã vừa quét.
///
/// | Tem quét | Kết quả |
/// |---|---|
/// | Cuộn nhựa | Mở chi tiết cuộn (có nút cân ngay đầu màn) |
/// | Tem màu `CLR-` | Danh sách mọi cuộn cùng màu + tổng tồn |
/// | Kho `LOC-` | Chi tiết kho + cuộn đang chứa |
/// | Máy in `PRT-` | Chi tiết máy in + trạng thái realtime |
/// | Slot AMS `PRT-xx-L1..4` | Bật chế độ gán cuộn vào line đó |
/// | Mâm `PEI-<id>` | Chi tiết mâm + miếng in trên mâm |
/// | Mã đơn hàng | Chi tiết đơn + tiến độ tem |
/// | Mã đơn SLL `SLL-xxx` | Chi tiết đơn số lượng lớn + các lượt PEI |
/// | Barcode 8 số | Bảng đổi trạng thái miếng in, hoặc lượt in SLL |
/// | Mã hàng hóa `SP-` | Chi tiết hàng hóa + nhập/xuất kho |
///
/// **Quét ở màn toàn cục không tự ý làm gì.** Mọi loại mã đều dừng lại ở bảng
/// [showScanResultSheet] để người quét đọc xem đó là mã gì rồi tự chọn việc —
/// quét ở đây thường chỉ là "soi xem tem này là cái gì". Việc làm-ngay chỉ xảy ra
/// khi quét từ trong màn nghiệp vụ tương ứng (Miếng in, Đơn SLL, Kiểm kho, Kiểm
/// hàng, Cân) vì lúc đó chủ đích đã rõ.
///
/// Ngoại lệ duy nhất là **chế độ gán hàng loạt** (scanMode): người dùng đã bấm
/// "gán cuộn" ở màn kho/máy in trước đó, nên mã cuộn quét tiếp được xử lý ngay để
/// quét liên tiếp cho nhanh tay.
class ScanRouter {
  const ScanRouter(this._ref, {this.onOpen});

  final WidgetRef _ref;

  /// Nơi nhận đường dẫn cần mở. Màn quét toàn cục truyền vào để **mở sau khi màn
  /// quét đã đóng** — push rồi pop ngay sau đó sẽ pop mất chính màn vừa mở.
  final void Function(String route)? onOpen;

  /// Trả về thông báo để hiển thị, hoặc null nếu không có gì để báo.
  Future<String?> handle(BuildContext context, String rawCode) async {
    final scanned = _ref.read(codeNormalizerProvider).classify(rawCode);

    if (scanned.kind == ScanKind.unknown) {
      throw ScanFailure(
        'Không nhận ra mã "${scanned.raw}".\n'
        'Kiểm tra xem dữ liệu đã tải xong chưa, hoặc tem này thuộc hệ thống khác.',
      );
    }

    // Tem màu quét ra màu không có trong DB thì chẳng mở được gì.
    if (scanned.kind == ScanKind.colorTag && scanned.id == null) {
      throw ScanFailure(
        'Không có cuộn nhựa nào màu "${scanned.label ?? scanned.raw}".',
      );
    }

    // Đang bật chế độ gán/tháo hàng loạt: mã cuộn xử lý ngay, không hỏi lại.
    if (scanned.kind == ScanKind.spool) {
      final mode = _ref.read(scanModeProvider);
      if (mode != null) return _assignSpool(scanned.id!, mode);
    }

    // Bảng đổi trạng thái tem tự nó đã là bảng lựa chọn rồi.
    if (scanned.kind == ScanKind.printItem) {
      return _handlePrintItem(context, scanned.id!);
    }

    if (!context.mounted) return null;
    return showScanResultSheet(context, _ref, scanned, onOpen: _open(context));
  }

  void Function(String route) _open(BuildContext context) =>
      onOpen ?? (route) => context.push(route);

  /// Gán / tháo cuộn theo chế độ quét hàng loạt đang bật.
  Future<String?> _assignSpool(String spoolId, ScanMode mode) async {
    final repo = _ref.read(filamentRepositoryProvider);
    final isAdd = mode.action == ScanAction.add;

    if (mode.target == ScanTarget.location) {
      await repo.updateSpool(
        spoolId,
        locationId: isAdd ? mode.targetId : null,
        clearLocation: !isAdd,
      );
    } else {
      await repo.updateSpool(
        spoolId,
        printerId: isAdd ? mode.targetId : null,
        printerSlot: isAdd ? mode.slot : null,
        clearPrinter: !isAdd,
        clearSlot: !isAdd,
      );
    }

    await refreshCoreData(_ref);

    final verb = isAdd ? 'Đã gắn' : 'Đã tháo';
    final preposition = isAdd ? 'vào' : 'khỏi';
    return '$verb cuộn $spoolId $preposition ${mode.targetName}.';
  }

  /// Tem miếng in: mở bảng đổi trạng thái nhanh (pending → printing → completed).
  ///
  /// Lượt in của đơn SLL dùng **cùng dạng mã 8 chữ số** nhưng nằm ở bảng khác, nên
  /// tra không ra miếng in thì thử tiếp sang lượt in trước khi báo lỗi.
  Future<String?> _handlePrintItem(BuildContext context, String barcode) async {
    final PrintItem item;
    try {
      item = await _ref.read(productionRepositoryProvider).fetchPrintItem(barcode);
    } catch (_) {
      return _handleBulkRun(context, barcode);
    }
    if (!context.mounted) return null;
    await showPrintItemSheet(context, item);
    return null;
  }

  /// Mã 8 số không phải miếng in: có thể là lượt in SLL mà danh sách đơn trong
  /// app chưa kịp có (vừa tạo ở máy khác). Tải lại rồi mở bảng lựa chọn — vẫn
  /// **không** tự quẹt check-in/check-out hộ người dùng.
  Future<String?> _handleBulkRun(BuildContext context, String barcode) async {
    await _ref.read(bulkOrdersProvider.notifier).refresh();

    final orders = _ref.read(bulkOrdersProvider).valueOrNull ?? const <BulkOrder>[];
    final found = orders.any((order) => order.runs.any((r) => r.id == barcode));
    if (!found) {
      throw ScanFailure('Không tìm thấy miếng in hay lượt in mã $barcode.');
    }

    if (!context.mounted) return null;
    return showScanResultSheet(
      context,
      _ref,
      ScannedCode(raw: barcode, kind: ScanKind.bulkRun, id: barcode),
      onOpen: _open(context),
    );
  }
}

/// Mở màn quét toàn cục (nút tròn giữa thanh điều hướng, menu nhanh, Trang chính).
///
/// Màn nào cần mở sau khi quét thì được ghi vào [pending] rồi mở ở đây — mở ngay
/// lúc còn đứng trong màn quét sẽ bị chính cú `pop` của nó đóng lại.
Future<void> openGlobalScanner(BuildContext context, WidgetRef ref) async {
  // Đang ở chế độ gán/tháo hàng loạt thì quét liên tục cho nhanh tay.
  final continuous = ref.read(scanModeProvider) != null;
  String? pending;

  await Navigator.of(context, rootNavigator: true).push<void>(
    MaterialPageRoute(
      builder: (_) => Consumer(
        builder: (context, ref, _) => ScannerScreen(
          title: 'Quét mã',
          hint: 'Cuộn nhựa · Tem màu · Kho · Máy in · Mâm PEI · Đơn hàng · '
              'Lượt in SLL · Hàng hóa',
          continuous: continuous,
          onCode: (code) => ScanRouter(
            ref,
            onOpen: (route) => pending = route,
          ).handle(context, code),
        ),
      ),
    ),
  );

  final route = pending;
  if (route != null && context.mounted) context.push(route);
}
