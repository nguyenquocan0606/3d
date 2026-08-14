import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/models/order.dart';
import '../../data/providers.dart';
import '../../data/repositories/filament_repository.dart';
import '../../data/repositories/production_repository.dart';
import '../../features/production/print_item_sheet.dart';
import '../../features/scanner/scanner_screen.dart';
import '../../features/spools/weigh_sheet.dart';
import '../routes.dart';
import 'code_normalizer.dart';
import 'scan_mode.dart';

/// Bộ chuẩn hóa mã dựng từ dữ liệu đang có trong app.
final codeNormalizerProvider = Provider<CodeNormalizer>((ref) {
  final locations = ref.watch(locationsProvider).valueOrNull ?? const [];
  final printers = ref.watch(printersProvider).valueOrNull ?? const [];
  final spools = ref.watch(spoolsProvider).valueOrNull ?? const [];
  final store = ref.watch(storeProvider).valueOrNull;

  return CodeNormalizer(
    locationIds: locations.map((e) => e.id).toSet(),
    printerIds: printers.map((e) => e.id).toSet(),
    spoolIds: spools.map((e) => e.id).toSet(),
    storeCodes: {
      for (final product in store?.sanPham ?? const []) ...[product.maQR, product.id],
    },
  );
});

/// Lỗi hiển thị được cho người dùng khi quét.
class ScanFailure implements Exception {
  ScanFailure(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Điều phối mã vừa quét — port của luồng trong `src/app/page.tsx`.
///
/// Thứ tự ưu tiên bám đúng bản web: đang bật chế độ gán/tháo (scanMode) thì mã
/// cuộn nhựa được xử lý trước; sau đó mới tới kho → máy in → cuộn → tem → hàng hóa.
class ScanRouter {
  const ScanRouter(this._ref);

  final WidgetRef _ref;

  /// Trả về thông báo để hiển thị (dùng cho chế độ quét liên tục), hoặc null nếu
  /// đã điều hướng sang màn khác.
  Future<String?> handle(BuildContext context, String rawCode) async {
    final scanned = _ref.read(codeNormalizerProvider).classify(rawCode);

    switch (scanned.kind) {
      case ScanKind.command:
        return _handleCommand(scanned.id!);

      case ScanKind.spool:
        return _handleSpool(context, scanned.id!);

      case ScanKind.printerSlot:
        final printers = _ref.read(printersProvider).valueOrNull ?? const [];
        final printer = _firstWhereOrNull(printers, (p) => p.id == scanned.id);
        _ref.read(scanModeProvider.notifier).start(
              ScanMode(
                target: ScanTarget.printer,
                targetId: scanned.id!,
                targetName: printer?.name ?? scanned.id!,
                action: ScanAction.add,
                slot: scanned.slot,
              ),
            );
        return 'Đã bật chế độ gán cuộn vào Line ${scanned.slot}. Quét tiếp mã cuộn nhựa.';

      case ScanKind.location:
        if (context.mounted) context.push(Routes.locationDetail(scanned.id!));
        return null;

      case ScanKind.printer:
        if (context.mounted) context.push(Routes.printerDetail(scanned.id!));
        return null;

      case ScanKind.storeProduct:
        final products = _ref.read(storeProvider).valueOrNull?.sanPham ?? const [];
        final product = _firstWhereOrNull(
          products,
          (p) => p.maQR == scanned.id || p.id == scanned.id,
        );
        if (product != null && context.mounted) {
          context.push(Routes.storeDetail(product.id));
        }
        return null;

      case ScanKind.printItem:
        return _handlePrintItem(context, scanned.id!);

      case ScanKind.colorTag:
        // Tem mã màu chỉ để in/dán, không có màn riêng — đưa về danh sách cuộn nhựa
        // đã lọc sẵn theo tên màu.
        final color = scanned.id!.replaceFirst('CLR-', '').replaceAll('-', ' ');
        // `go` chứ không `push`: đây là tab Cuộn nhựa, chuyển hẳn sang tab đó.
        if (context.mounted) context.go(Routes.spoolsWithQuery(color));
        return null;

      case ScanKind.unknown:
        throw ScanFailure('Không nhận ra mã "${scanned.raw}" trong hệ thống.');
    }
  }

  Future<String?> _handleCommand(String command) async {
    switch (command) {
      case ScanCommands.inventoryReset:
        await _ref.read(inventorySessionProvider.notifier).reset();
        return 'Đã bắt đầu phiên kiểm kho mới.';
      case ScanCommands.inventoryToggleAll:
        return 'Lệnh này chỉ dùng trong màn Kiểm kho.';
      case ScanCommands.weightTab:
      case ScanCommands.weightDone:
        return 'Lệnh này chỉ dùng trong màn Cân cuộn nhựa.';
      default:
        throw ScanFailure('Lệnh QR không hỗ trợ: $command');
    }
  }

  /// Cuộn nhựa: đang bật scanMode thì gán/tháo, ngược lại mở màn cân.
  Future<String?> _handleSpool(BuildContext context, String spoolId) async {
    final mode = _ref.read(scanModeProvider);

    if (mode != null) {
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

    final spool = _ref.read(spoolByIdProvider(spoolId));
    if (spool == null) {
      throw ScanFailure('Không tìm thấy cuộn nhựa $spoolId.');
    }
    if (!context.mounted) return null;
    await showWeighSheet(context, spool);
    return null;
  }

  /// Tem miếng in: mở bảng đổi trạng thái nhanh (pending → printing → completed).
  Future<String?> _handlePrintItem(BuildContext context, String barcode) async {
    final PrintItem item;
    try {
      item = await _ref.read(productionRepositoryProvider).fetchPrintItem(barcode);
    } catch (_) {
      throw ScanFailure('Không tìm thấy miếng in mã $barcode.');
    }
    if (!context.mounted) return null;
    await showPrintItemSheet(context, item);
    return null;
  }
}

/// Mở màn quét toàn cục (nút tròn giữa thanh điều hướng).
Future<void> openGlobalScanner(BuildContext context, WidgetRef ref) async {
  // Đang ở chế độ gán/tháo hàng loạt thì quét liên tục cho nhanh tay.
  final continuous = ref.read(scanModeProvider) != null;

  await Navigator.of(context, rootNavigator: true).push<void>(
    MaterialPageRoute(
      builder: (_) => Consumer(
        builder: (context, ref, _) => ScannerScreen(
          title: 'Quét mã',
          hint: 'Cuộn nhựa · Kho · Máy in · Tem đơn hàng · Hàng hóa',
          continuous: continuous,
          onCode: (code) => ScanRouter(ref).handle(context, code),
        ),
      ),
    ),
  );
}

T? _firstWhereOrNull<T>(Iterable<T> items, bool Function(T) test) {
  for (final item in items) {
    if (test(item)) return item;
  }
  return null;
}
