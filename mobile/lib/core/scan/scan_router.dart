import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/models/bulk_order.dart';
import '../../data/models/filament.dart';
import '../../data/models/order.dart';
import '../../data/models/eshop_order.dart';
import '../../data/providers.dart';
import '../../data/repositories/filament_repository.dart';
import '../../data/repositories/production_repository.dart';
import '../../features/bulk/bulk_run_sheet.dart';
import '../../features/bulk/bulk_scan.dart';
import '../../features/production/print_item_sheet.dart';
import '../../features/scanner/scanner_screen.dart';
import '../routes.dart';
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
  final eshopOrders = ref.watch(eshopOrdersProvider).valueOrNull ?? const <EshopOrder>[];
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
    eshopOrderCodes: {
      for (final order in eshopOrders) ...[
        if (order.ecomOrderNo != null) order.ecomOrderNo!,
        if (order.deliveryCode != null) order.deliveryCode!,
        if (order.refNo != null) order.refNo!,
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
/// | Barcode 8 số | Bảng đổi trạng thái miếng in — hoặc quẹt lượt in SLL |
/// | Mã hàng hóa `SP-` | Chi tiết hàng hóa + nhập/xuất kho |
/// | QR lệnh `CMD-` | Chạy lệnh (chỉ `CMD-INV-RESET` dùng được ngoài màn của nó) |
///
/// **Quét là vào thẳng việc, không hỏi lại.** Trước đây mọi mã đều dừng ở một
/// bảng "đây là mã gì, bạn muốn làm gì" — nhưng gần như loại nào cũng chỉ có đúng
/// một việc để làm, nên bảng đó chỉ tốn thêm một cú chạm. Người cầm máy quét là
/// người đang làm việc, không phải đang tra cứu.
class ScanRouter {
  const ScanRouter(this._ref, {this.onOpen});

  final WidgetRef _ref;

  /// Nơi nhận đường dẫn cần mở. Màn quét toàn cục truyền vào để **mở sau khi màn
  /// quét đã đóng** — push rồi pop ngay sau đó sẽ pop mất chính màn vừa mở.
  final void Function(String route)? onOpen;

  /// Trả về thông báo để hiển thị, hoặc null nếu không có gì để báo.
  Future<String?> handle(BuildContext context, String rawCode) async {
    var scanned = _ref.read(codeNormalizerProvider).classify(rawCode);

    // Không nhận ra thì **chưa vội kết luận**: từ khi app tra mã trong CSDL cục
    // bộ, một tem vừa in ở web mấy giây trước là máy này chưa kịp biết. Đồng bộ
    // một nhịp rồi tra lại — thà chậm nửa giây còn hơn bắt thợ đi hỏi tại sao
    // tem mới in lại báo mã lạ.
    //
    // Chỉ làm ở nhánh hỏng nên không ảnh hưởng tốc độ của mọi lần quét bình thường.
    if (scanned.kind == ScanKind.unknown) {
      try {
        // `refreshCoreData` chứ không chỉ `dongBo()`: đồng bộ mới ghi vào SQLite,
        // còn provider thì vẫn giữ dữ liệu đã đọc từ trước. Không đợi provider nạp
        // lại xong thì câu tra ngay sau đây vẫn đọc đúng dữ liệu cũ và vô nghĩa.
        await refreshCoreData(_ref);
        await _ref.read(bulkOrdersProvider.notifier).refresh();
        scanned = _ref.read(codeNormalizerProvider).classify(rawCode);
      } catch (_) {
        // Mất mạng: giữ nguyên kết luận cũ và báo lỗi bên dưới.
      }
    }

    if (scanned.kind == ScanKind.unknown) {
      throw ScanFailure(
        'Không nhận ra mã "${scanned.raw}".\n'
        'Đã thử đồng bộ lại nhưng máy chủ cũng không có mã này — kiểm tra xem tem '
        'có thuộc hệ thống khác không.',
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

    final open = _open(context);

    switch (scanned.kind) {
      case ScanKind.spool:
        open(Routes.spoolDetail(scanned.id!));
        return null;

      case ScanKind.colorTag:
        open(Routes.colorDetail(scanned.id!));
        return null;

      case ScanKind.location:
        open(Routes.locationDetail(scanned.id!));
        return null;

      case ScanKind.printer:
        open(Routes.printerDetail(scanned.id!));
        return null;

      // Tem dán trên khay AMS chỉ có một công dụng: gán cuộn vào đúng line đó.
      // Muốn xem máy in thì đã có tem máy in riêng dán ngay trên thân máy.
      case ScanKind.printerSlot:
        return _startSlotAssign(scanned);

      case ScanKind.peiSheet:
        open(Routes.peiSheetDetail(scanned.id!));
        return null;

      case ScanKind.order:
        open(Routes.orderDetail(scanned.id!));
        return null;

      case ScanKind.eshopOrder:
        open(Routes.eshopOrderDetail(scanned.id!));
        return null;

      case ScanKind.bulkOrder:
        open(Routes.bulkOrderDetail(scanned.id!));
        return null;

      case ScanKind.bulkRun:
        return _handleBulkRun(context, scanned.id!);

      case ScanKind.storeProduct:
        return _openStoreProduct(open, scanned.id!);

      case ScanKind.printItem:
        return _handlePrintItem(context, scanned.id!);

      case ScanKind.command:
        return _runCommand(scanned.id!);

      // Đã chặn ngay đầu hàm.
      case ScanKind.unknown:
        return null;
    }
  }

  void Function(String route) _open(BuildContext context) =>
      onOpen ?? (route) => context.push(route);

  /// Tem khay AMS `PRT-xx-L1..4`: bật chế độ gán để quét cuộn liên tiếp vào line.
  Future<String?> _startSlotAssign(ScannedCode scanned) async {
    final printers = _ref.read(printersProvider).valueOrNull ?? const [];
    var name = scanned.id!;
    for (final printer in printers) {
      if (printer.id == scanned.id) name = printer.name;
    }

    _ref.read(scanModeProvider.notifier).start(
          ScanMode(
            target: ScanTarget.printer,
            targetId: scanned.id!,
            targetName: name,
            action: ScanAction.add,
            slot: scanned.slot,
          ),
        );
    return 'Đã bật chế độ gán cuộn vào $name · Line ${scanned.slot}. '
        'Quét tiếp mã cuộn nhựa.';
  }

  /// Hàng hóa cửa hàng: tem dán mã `maQR`, còn route đi theo id.
  Future<String?> _openStoreProduct(
    void Function(String route) open,
    String code,
  ) async {
    final products = _ref.read(storeProvider).valueOrNull?.sanPham ?? const [];
    String? productId;
    for (final product in products) {
      if (product.maQR == code || product.id == code) productId = product.id;
    }
    if (productId == null) {
      throw ScanFailure('Không tìm thấy hàng hóa mã $code trong dữ liệu đã tải.');
    }
    open(Routes.storeDetail(productId));
    return null;
  }

  /// QR lệnh — quét thay cho bấm nút.
  ///
  /// Các lệnh còn lại chỉ có nghĩa trong đúng màn của nó (Kiểm kho, Cân), nên quét
  /// ở ngoài chỉ có thể nói cho người quét biết là đang đứng nhầm chỗ.
  Future<String?> _runCommand(String command) async {
    if (command == ScanCommands.inventoryReset) {
      await _ref.read(inventorySessionProvider.notifier).reset();
      return 'Đã bắt đầu phiên kiểm kho mới.';
    }
    throw ScanFailure(switch (command) {
      ScanCommands.inventoryToggleAll => 'Lệnh này chỉ dùng trong màn Kiểm kho.',
      ScanCommands.weightTab ||
      ScanCommands.weightDone =>
        'Lệnh này chỉ dùng trong màn Cân cuộn nhựa.',
      _ => 'Lệnh QR "$command" không hỗ trợ.',
    });
  }

  /// Gán / tháo cuộn theo chế độ quét hàng loạt đang bật.
  Future<String?> _assignSpool(String spoolId, ScanMode mode) async {
    final repo = _ref.read(filamentRepositoryProvider);
    final isAdd = mode.action == ScanAction.add;

    // `bindSpool` chứ không phải `updateSpool`: gán cuộn là thao tác quét tại kệ,
    // phải chạy được cả khi mất sóng nên đi qua hàng đợi.
    if (mode.target == ScanTarget.location) {
      await repo.bindSpool(
        spoolId,
        locationId: isAdd ? mode.targetId : null,
        clearLocation: !isAdd,
      );
    } else {
      await repo.bindSpool(
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

  /// Quẹt lượt in SLL — mở bảng chi tiết, y hệt quẹt ngay trong màn Đơn SLL.
  ///
  /// [findBulkRun] tự tải lại một lần khi chưa thấy — lượt vừa tạo ở máy khác.
  Future<String?> _handleBulkRun(BuildContext context, String barcode) async {
    final run = await findBulkRun(_ref, barcode);
    if (run == null) {
      throw ScanFailure('Không tìm thấy miếng in hay lượt in mã $barcode.');
    }
    if (!context.mounted) return null;
    // Truyền `onOpen` xuống để nút "Mở đơn SLL" mở được sau khi màn quét đã đóng.
    return showBulkRunSheet(context, _ref, run, onOpen: onOpen);
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
