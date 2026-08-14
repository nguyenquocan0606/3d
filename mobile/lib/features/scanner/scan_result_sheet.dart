import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/formatters.dart';
import '../../core/routes.dart';
import '../../core/scan/code_normalizer.dart';
import '../../core/scan/scan_mode.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/bulk_order.dart';
import '../../data/models/store.dart';
import '../../data/providers.dart';
import '../bulk/bulk_scan.dart';

/// Một lựa chọn trong bảng kết quả quét.
class ScanOption {
  const ScanOption({
    required this.icon,
    required this.label,
    required this.run,
    this.color = AppColors.indigo,
    this.detail,
  });

  final IconData icon;
  final String label;
  final String? detail;
  final Color color;

  /// Trả về thông báo để hiện sau khi bảng đóng (null nếu không cần).
  final Future<String?> Function() run;
}

/// Mô tả mã vừa quét: quét ra cái gì và làm được những gì với nó.
class ScanTargetInfo {
  const ScanTargetInfo({
    required this.kindLabel,
    required this.title,
    required this.icon,
    required this.options,
    this.subtitle,
    this.color = AppColors.indigo,
    this.note,
  });

  final String kindLabel;
  final String title;
  final String? subtitle;
  final IconData icon;
  final Color color;

  /// Câu giải thích khi mã hợp lệ nhưng không làm gì được ở đây.
  final String? note;

  final List<ScanOption> options;
}

/// Bảng "kết quả quét" của màn quét toàn cục.
///
/// Quét ở Trang chính / nút quét giữa thanh điều hướng là hành động **mò**: người
/// dùng cầm tem lên soi xem nó là gì. Vì vậy ở đây app chỉ báo mã đó là gì rồi để
/// người dùng tự chọn việc, không tự ý đổi dữ liệu. Ngược lại, quét từ trong một
/// màn nghiệp vụ cụ thể (Miếng in, Đơn SLL, Kiểm kho, Kiểm hàng) là hành động có
/// chủ đích nên vẫn làm ngay, không hỏi lại.
///
/// [onOpen] nhận đường dẫn cần mở — phải mở **sau khi màn quét đã đóng**, vì
/// `push` rồi `pop` ngay sau đó sẽ pop mất chính màn vừa mở.
Future<String?> showScanResultSheet(
  BuildContext context,
  WidgetRef ref,
  ScannedCode scanned, {
  required void Function(String route) onOpen,
}) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: AppColors.surfaceAlt,
    builder: (_) => _ScanResultSheet(scanned: scanned, onOpen: onOpen),
  );
}

class _ScanResultSheet extends ConsumerStatefulWidget {
  const _ScanResultSheet({required this.scanned, required this.onOpen});

  final ScannedCode scanned;
  final void Function(String route) onOpen;

  @override
  ConsumerState<_ScanResultSheet> createState() => _ScanResultSheetState();
}

class _ScanResultSheetState extends ConsumerState<_ScanResultSheet> {
  bool _busy = false;

  Future<void> _select(ScanOption option) async {
    setState(() => _busy = true);
    try {
      final message = await option.run();
      if (!mounted) return;
      // Màn quét 1 lần đóng ngay sau đó nên thông báo trả về bị bỏ qua — bắn
      // toast ở tầng ScaffoldMessenger để kết quả không biến mất theo.
      if (message != null) showToast(context, message);
      Navigator.pop(context, message);
    } catch (error) {
      if (mounted) {
        setState(() => _busy = false);
        showToast(context, '$error', isError: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final info = scanTargetInfo(ref, widget.scanned, widget.onOpen);

    return Padding(
      padding: EdgeInsets.fromLTRB(
        16,
        14,
        16,
        MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: info.color.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(info.icon, color: info.color),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      info.kindLabel.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 11.5,
                        letterSpacing: 0.8,
                        fontWeight: FontWeight.w700,
                        color: AppColors.muted,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      info.title,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (info.subtitle != null) ...[
            const SizedBox(height: 10),
            Text(
              info.subtitle!,
              style: const TextStyle(fontSize: 13, color: AppColors.muted, height: 1.4),
            ),
          ],
          if (info.note != null) ...[
            const SizedBox(height: 12),
            Text(
              info.note!,
              style: const TextStyle(fontSize: 12.5, color: AppColors.warning, height: 1.4),
            ),
          ],
          const SizedBox(height: 18),
          for (final option in info.options) ...[
            _OptionButton(
              option: option,
              enabled: !_busy,
              onTap: () => _select(option),
            ),
            const SizedBox(height: 10),
          ],
          TextButton(
            onPressed: _busy ? null : () => Navigator.pop(context),
            child: const Text('Đóng'),
          ),
        ],
      ),
    );
  }
}

class _OptionButton extends StatelessWidget {
  const _OptionButton({
    required this.option,
    required this.enabled,
    required this.onTap,
  });

  final ScanOption option;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      onTap: enabled ? onTap : null,
      borderColor: option.color.withValues(alpha: 0.5),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      child: Row(
        children: [
          Icon(option.icon, color: option.color, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  option.label,
                  style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700),
                ),
                if (option.detail != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    option.detail!,
                    style: const TextStyle(fontSize: 12, color: AppColors.muted),
                  ),
                ],
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded, color: AppColors.muted),
        ],
      ),
    );
  }
}

/// Dựng nội dung bảng theo loại mã. Tách rời widget để test được.
ScanTargetInfo scanTargetInfo(
  WidgetRef ref,
  ScannedCode scanned,
  void Function(String route) onOpen,
) {
  ScanOption open(String label, IconData icon, String route, {String? detail}) =>
      ScanOption(
        icon: icon,
        label: label,
        detail: detail,
        run: () async {
          onOpen(route);
          return null;
        },
      );

  switch (scanned.kind) {
    case ScanKind.spool:
      return ScanTargetInfo(
        kindLabel: 'Cuộn nhựa',
        title: scanned.id!,
        subtitle: _spoolSubtitle(ref, scanned.id!),
        icon: Icons.inventory_2_rounded,
        color: AppColors.success,
        options: [
          open('Mở chi tiết cuộn', Icons.open_in_new_rounded,
              Routes.spoolDetail(scanned.id!),
              detail: 'Xem tồn, vị trí, lịch sử — và cân lại tại chỗ'),
        ],
      );

    case ScanKind.colorTag:
      return ScanTargetInfo(
        kindLabel: 'Tem màu nhựa',
        title: scanned.id ?? scanned.label ?? scanned.raw,
        icon: Icons.palette_rounded,
        color: AppColors.success,
        options: [
          open('Xem mọi cuộn cùng màu', Icons.open_in_new_rounded,
              Routes.colorDetail(scanned.id!)),
        ],
      );

    case ScanKind.location:
      return ScanTargetInfo(
        kindLabel: 'Kho lưu trữ',
        title: scanned.id!,
        icon: Icons.warehouse_rounded,
        color: AppColors.success,
        options: [
          open('Mở kho', Icons.open_in_new_rounded,
              Routes.locationDetail(scanned.id!),
              detail: 'Xem cuộn đang chứa, gán/tháo hàng loạt'),
        ],
      );

    case ScanKind.printer:
      return ScanTargetInfo(
        kindLabel: 'Máy in',
        title: scanned.id!,
        icon: Icons.print_rounded,
        color: AppColors.warning,
        options: [
          open('Mở máy in', Icons.open_in_new_rounded,
              Routes.printerDetail(scanned.id!),
              detail: 'Trạng thái realtime, điều khiển, khay AMS'),
        ],
      );

    case ScanKind.printerSlot:
      final printers = ref.read(printersProvider).valueOrNull ?? const [];
      String? name;
      for (final printer in printers) {
        if (printer.id == scanned.id) name = printer.name;
      }
      return ScanTargetInfo(
        kindLabel: 'Khay AMS',
        title: '${name ?? scanned.id!} · Line ${scanned.slot}',
        icon: Icons.grid_goldenratio_rounded,
        color: AppColors.warning,
        options: [
          ScanOption(
            icon: Icons.link_rounded,
            label: 'Bật chế độ gán cuộn vào Line ${scanned.slot}',
            detail: 'Sau đó quét liên tiếp mã cuộn nhựa để gán',
            run: () async {
              ref.read(scanModeProvider.notifier).start(
                    ScanMode(
                      target: ScanTarget.printer,
                      targetId: scanned.id!,
                      targetName: name ?? scanned.id!,
                      action: ScanAction.add,
                      slot: scanned.slot,
                    ),
                  );
              return 'Đã bật chế độ gán cuộn vào Line ${scanned.slot}. '
                  'Quét tiếp mã cuộn nhựa.';
            },
          ),
          open('Mở máy in', Icons.open_in_new_rounded,
              Routes.printerDetail(scanned.id!)),
        ],
      );

    case ScanKind.peiSheet:
      return ScanTargetInfo(
        kindLabel: 'Mâm in PEI',
        title: scanned.id!,
        icon: Icons.grid_view_rounded,
        color: AppColors.info,
        options: [
          open('Mở mâm PEI', Icons.open_in_new_rounded,
              Routes.peiSheetDetail(scanned.id!),
              detail: 'Miếng in trên mâm, gắn mâm lên máy'),
        ],
      );

    case ScanKind.order:
      return ScanTargetInfo(
        kindLabel: 'Đơn hàng',
        title: scanned.id!,
        icon: Icons.receipt_long_rounded,
        color: AppColors.info,
        options: [
          open('Mở đơn hàng', Icons.open_in_new_rounded,
              Routes.orderDetail(scanned.id!),
              detail: 'Tiến độ tem, in lại tem miếng in'),
        ],
      );

    case ScanKind.bulkOrder:
      return ScanTargetInfo(
        kindLabel: 'Đơn sản xuất số lượng lớn',
        title: scanned.id!,
        icon: Icons.inventory_rounded,
        color: AppColors.info,
        options: [
          open('Mở đơn SLL', Icons.open_in_new_rounded,
              Routes.bulkOrderDetail(scanned.id!),
              detail: 'Các lượt PEI, tiến độ theo con'),
        ],
      );

    case ScanKind.bulkRun:
      return _bulkRunInfo(ref, scanned, open);

    case ScanKind.storeProduct:
      final products = ref.read(storeProvider).valueOrNull?.sanPham ?? const [];
      StoreProduct? product;
      for (final candidate in products) {
        if (candidate.maQR == scanned.id || candidate.id == scanned.id) {
          product = candidate;
        }
      }
      return ScanTargetInfo(
        kindLabel: 'Hàng hóa cửa hàng',
        title: product?.ten ?? scanned.id!,
        subtitle: product == null ? null : 'Tồn kho: ${product.soLuong} ${product.donVi}',
        icon: Icons.storefront_rounded,
        color: AppColors.indigoLight,
        note: product == null ? 'Không tìm thấy hàng hóa này trong dữ liệu đã tải.' : null,
        options: [
          if (product != null)
            open('Mở hàng hóa', Icons.open_in_new_rounded,
                Routes.storeDetail(product.id),
                detail: 'Giá, tồn kho, nhập/xuất'),
        ],
      );

    case ScanKind.command:
      return _commandInfo(ref, scanned);

    // Hai loại này không bao giờ tới đây: mã lạ bị chặn từ ScanRouter, còn tem
    // miếng in đã có bảng đổi trạng thái riêng.
    case ScanKind.printItem:
    case ScanKind.unknown:
      return ScanTargetInfo(
        kindLabel: 'Mã quét',
        title: scanned.raw,
        icon: Icons.qr_code_rounded,
        options: const [],
      );
  }
}

ScanTargetInfo _bulkRunInfo(
  WidgetRef ref,
  ScannedCode scanned,
  ScanOption Function(String, IconData, String, {String? detail}) open,
) {
  final orders = ref.read(bulkOrdersProvider).valueOrNull ?? const <BulkOrder>[];
  BulkOrder? parent;
  BulkRun? run;
  for (final order in orders) {
    for (final candidate in order.runs) {
      if (candidate.id == scanned.id) {
        parent = order;
        run = candidate;
      }
    }
  }

  if (run == null || parent == null) {
    return ScanTargetInfo(
      kindLabel: 'Lượt in SLL',
      title: scanned.id!,
      icon: Icons.play_circle_rounded,
      color: AppColors.info,
      note: 'Không tìm thấy lượt in này trong dữ liệu đã tải. Kéo làm mới ở màn '
          'Đơn SLL rồi quét lại.',
      options: const [],
    );
  }

  final xong = run.status == BulkStatus.completed;
  final batDau = run.status == BulkStatus.pending;

  return ScanTargetInfo(
    kindLabel: 'Lượt in SLL · ${parent.productName}',
    title: '${run.printerName} · PEI ${run.peiIndex}',
    subtitle: '${run.quantity} con · ${run.status.label}'
        '${batDau ? '' : ' · bắt đầu ${_shortTime(run.startedAt)}'}',
    icon: Icons.play_circle_rounded,
    color: AppColors.info,
    note: xong ? 'Lượt này đã in xong — muốn quẹt lại thì đặt lại ở màn đơn.' : null,
    options: [
      if (!xong)
        ScanOption(
          icon: batDau ? Icons.play_arrow_rounded : Icons.check_rounded,
          label: batDau ? 'Ghi nhận bắt đầu in' : 'Ghi nhận in xong',
          detail: batDau
              ? 'Bấm giờ bắt đầu cho lượt ${run.quantity} con này'
              : 'Chốt giờ kết thúc và tính thời lượng',
          color: batDau ? AppColors.warning : AppColors.success,
          run: () => scanBulkRun(ref, scanned.id!),
        ),
      open('Mở đơn SLL', Icons.open_in_new_rounded,
          Routes.bulkOrderDetail(parent.id),
          detail: 'Xem toàn bộ lượt của đơn'),
    ],
  );
}

ScanTargetInfo _commandInfo(WidgetRef ref, ScannedCode scanned) {
  final command = scanned.id!;
  return ScanTargetInfo(
    kindLabel: 'QR lệnh',
    title: command,
    icon: Icons.terminal_rounded,
    options: [
      if (command == ScanCommands.inventoryReset)
        ScanOption(
          icon: Icons.restart_alt_rounded,
          label: 'Bắt đầu phiên kiểm kho mới',
          detail: 'Xóa kết quả phiên đang mở và đếm lại từ đầu',
          color: AppColors.danger,
          run: () async {
            await ref.read(inventorySessionProvider.notifier).reset();
            return 'Đã bắt đầu phiên kiểm kho mới.';
          },
        ),
    ],
    note: switch (command) {
      ScanCommands.inventoryToggleAll => 'Lệnh này chỉ dùng trong màn Kiểm kho.',
      ScanCommands.weightTab ||
      ScanCommands.weightDone =>
        'Lệnh này chỉ dùng trong màn Cân cuộn nhựa.',
      ScanCommands.inventoryReset => null,
      _ => 'Lệnh QR không hỗ trợ.',
    },
  );
}

String? _spoolSubtitle(WidgetRef ref, String spoolId) {
  final spool = ref.read(spoolByIdProvider(spoolId));
  if (spool == null) return null;
  return '${spool.materialLabel} · ${spool.filamentColorName} · '
      '${Fmt.grams(spool.remainingWeightG)}';
}

String _shortTime(DateTime? value) {
  if (value == null) return '—';
  final hh = value.hour.toString().padLeft(2, '0');
  final mm = value.minute.toString().padLeft(2, '0');
  return '$hh:$mm';
}
