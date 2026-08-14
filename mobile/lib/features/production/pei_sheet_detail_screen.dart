import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/order.dart';
import '../../data/models/printer.dart';
import '../../data/providers.dart';
import '../../data/repositories/label_repository.dart';
import '../../data/repositories/production_repository.dart';
import '../scanner/scanner_screen.dart';
import 'print_item_sheet.dart';

/// Nội dung QR của tem mâm PEI.
///
/// Backend không có tiền tố riêng cho mâm (id là uuid), nên app tự quy ước `PEI-`
/// để phân biệt với các loại mã khác khi quét.
String peiSheetCode(String sheetId) => 'PEI-$sheetId';

/// Chi tiết một mâm in PEI — mở khi quét tem dán trên mâm.
///
/// Trả lời đúng câu hỏi lúc cầm mâm trên tay: mâm này đang có miếng nào, đã in
/// xong chưa, đang gắn máy nào.
class PeiSheetDetailScreen extends ConsumerWidget {
  const PeiSheetDetailScreen({super.key, required this.sheetId});

  final String sheetId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sheetsAsync = ref.watch(peiSheetsProvider);
    final printers = ref.watch(printersProvider).valueOrNull ?? const <Printer>[];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mâm in PEI'),
        actions: [
          IconButton(
            tooltip: 'In tem QR mâm',
            onPressed: () => _printTag(context, ref),
            icon: const Icon(Icons.print_rounded),
          ),
        ],
      ),
      body: AsyncView(
        value: sheetsAsync,
        onRetry: () => ref.invalidate(peiSheetsProvider),
        builder: (sheets) {
          PeiSheet? sheet;
          for (final item in sheets) {
            if (item.id == sheetId) sheet = item;
          }
          if (sheet == null) {
            return const EmptyView(
              message: 'Không tìm thấy mâm này.\nCó thể mâm đã bị xóa ở bản web.',
              icon: Icons.grid_off_rounded,
            );
          }

          final done = sheet.items
              .where((i) => i.status == PrintItemStatus.completed)
              .length;
          final ratio = sheet.items.isEmpty ? 0.0 : done / sheet.items.length;

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(peiSheetsProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                SectionCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              sheet.name,
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          StatusChip(
                            label: '$done/${sheet.items.length} xong',
                            color: ratio >= 1 && sheet.items.isNotEmpty
                                ? AppColors.success
                                : AppColors.warning,
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(999),
                        child: LinearProgressIndicator(
                          value: ratio,
                          minHeight: 8,
                          backgroundColor: AppColors.border,
                          valueColor: AlwaysStoppedAnimation(
                            ratio >= 1 && sheet.items.isNotEmpty
                                ? AppColors.success
                                : AppColors.warning,
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      InfoRow(
                        label: 'Đang gắn trên máy',
                        value: sheet.printerName ?? 'Chưa gắn máy nào',
                      ),
                      InfoRow(label: 'Số miếng in', value: '${sheet.items.length}'),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => ScannerScreen(
                              title: 'Quét miếng in vào mâm',
                              hint: 'Quét liên tục từng tem đặt lên ${sheet!.name}',
                              continuous: true,
                              onCode: (code) => _addItem(ref, code),
                            ),
                          ),
                        ),
                        icon: const Icon(Icons.qr_code_scanner_rounded),
                        label: const Text('Quét xếp vào'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => _assignPrinter(context, ref, sheet!, printers),
                        icon: const Icon(Icons.print_rounded),
                        label: const Text('Gắn máy in'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                const Text(
                  'Miếng in trên mâm',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                ),
                const SizedBox(height: 10),
                if (sheet.items.isEmpty)
                  const EmptyView(
                    message: 'Mâm đang trống.',
                    icon: Icons.inbox_rounded,
                  )
                else
                  for (final item in sheet.items)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: SectionCard(
                        padding:
                            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        onTap: () async {
                          await showPrintItemSheet(context, item);
                          ref.invalidate(peiSheetsProvider);
                        },
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    item.name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    '${item.id} · ${item.productName ?? ''}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      fontFamily: 'monospace',
                                      color: AppColors.muted,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            StatusChip(
                              label: item.status.label,
                              color: colorForPrintItem(item.status),
                              dense: true,
                            ),
                          ],
                        ),
                      ),
                    ),
                const SizedBox(height: 12),
                Center(
                  child: SectionCard(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      children: [
                        QrImageView(
                          data: peiSheetCode(sheetId),
                          size: 150,
                          backgroundColor: Colors.white,
                          padding: const EdgeInsets.all(10),
                        ),
                        const SizedBox(height: 10),
                        Text(
                          sheet.name,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<String?> _addItem(WidgetRef ref, String code) async {
    final items = ref.read(printItemsProvider).valueOrNull ?? const <PrintItem>[];
    PrintItem? target;
    for (final item in items) {
      if (item.id == code.trim()) target = item;
    }
    if (target == null) throw Exception('Không tìm thấy miếng in ${code.trim()}');

    await ref
        .read(productionRepositoryProvider)
        .updatePrintItem(target.id, peiSheetId: sheetId);
    ref.invalidate(peiSheetsProvider);
    await ref.read(printItemsProvider.notifier).refresh();
    return '✔ ${target.name} (${target.id}) đã vào mâm';
  }

  Future<void> _assignPrinter(
    BuildContext context,
    WidgetRef ref,
    PeiSheet sheet,
    List<Printer> printers,
  ) async {
    // Chuỗi rỗng = tháo khỏi máy; null = người dùng hủy, không đụng dữ liệu.
    final selected = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            ListTile(
              leading: const Icon(Icons.link_off_rounded),
              title: const Text('Tháo khỏi máy in'),
              onTap: () => Navigator.pop(context, ''),
            ),
            for (final printer in printers)
              ListTile(
                title: Text(printer.name),
                subtitle: Text(printer.id),
                onTap: () => Navigator.pop(context, printer.id),
              ),
          ],
        ),
      ),
    );
    if (selected == null) return;

    try {
      await ref.read(productionRepositoryProvider).updatePeiSheet(
            sheet.id,
            printerId: selected.isEmpty ? null : selected,
            clearPrinter: selected.isEmpty,
          );
      ref.invalidate(peiSheetsProvider);
      if (context.mounted) showToast(context, 'Đã cập nhật máy in của mâm.');
    } catch (error) {
      if (context.mounted) showToast(context, '$error', isError: true);
    }
  }

  Future<void> _printTag(BuildContext context, WidgetRef ref) async {
    final sheets = ref.read(peiSheetsProvider).valueOrNull ?? const <PeiSheet>[];
    final name = sheets.where((s) => s.id == sheetId).map((s) => s.name).firstOrNull;

    try {
      await ref.read(labelRepositoryProvider).printQrLabel(
            qrCode: peiSheetCode(sheetId),
            line1: 'PEI',
            line2: 'MAM IN PEI',
            line3: name ?? sheetId,
          );
      if (context.mounted) showToast(context, 'Đã gửi lệnh in tem mâm.');
    } catch (error) {
      if (context.mounted) showToast(context, '$error', isError: true);
    }
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull {
    final iterator = this.iterator;
    return iterator.moveNext() ? iterator.current : null;
  }
}
