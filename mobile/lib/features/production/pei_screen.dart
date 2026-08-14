import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/order.dart';
import '../../data/models/printer.dart';
import '../../data/providers.dart';
import '../../data/repositories/production_repository.dart';
import '../../core/routes.dart';
import '../scanner/scanner_screen.dart';
import 'print_item_sheet.dart';

/// Mâm in PEI.
///
/// App chỉ **vận hành**: gom miếng in vào mâm (quét hoặc chọn), gắn mâm lên máy in,
/// tháo miếng ra. Việc tạo/xóa mâm giữ ở bản web theo đúng phân vai web-quản trị.
class PeiScreen extends ConsumerStatefulWidget {
  const PeiScreen({super.key});

  @override
  ConsumerState<PeiScreen> createState() => _PeiScreenState();
}

class _PeiScreenState extends ConsumerState<PeiScreen> {
  String? _targetSheetId;
  final Set<String> _selected = {};
  bool _busy = false;

  Future<void> _reload() async {
    ref.invalidate(peiSheetsProvider);
    await ref.read(printItemsProvider.notifier).refresh();
  }

  Future<void> _assignSelected() async {
    if (_targetSheetId == null || _selected.isEmpty) return;
    setState(() => _busy = true);
    try {
      final repo = ref.read(productionRepositoryProvider);
      // Backend chưa có endpoint gán mâm hàng loạt — PATCH lần lượt như bản web.
      for (final itemId in _selected) {
        await repo.updatePrintItem(itemId, peiSheetId: _targetSheetId);
      }
      final count = _selected.length;
      _selected.clear();
      await _reload();
      if (mounted) showToast(context, 'Đã xếp $count miếng vào mâm.');
    } catch (error) {
      if (mounted) showToast(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Quét liên tục để xếp miếng in vào mâm đang chọn — nhanh hơn tick từng ô.
  Future<String?> _scanIntoSheet(String code) async {
    if (_targetSheetId == null) {
      throw Exception('Chưa chọn mâm đích.');
    }
    final items = ref.read(printItemsProvider).valueOrNull ?? const <PrintItem>[];
    PrintItem? target;
    for (final item in items) {
      if (item.id == code.trim()) target = item;
    }
    if (target == null) throw Exception('Không tìm thấy miếng in ${code.trim()}');

    await ref
        .read(productionRepositoryProvider)
        .updatePrintItem(target.id, peiSheetId: _targetSheetId);
    await _reload();
    return '✔ ${target.name} (${target.id}) đã vào mâm';
  }

  @override
  Widget build(BuildContext context) {
    final sheetsAsync = ref.watch(peiSheetsProvider);
    final items = ref.watch(printItemsProvider).valueOrNull ?? const <PrintItem>[];
    final printers = ref.watch(printersProvider).valueOrNull ?? const <Printer>[];

    // Miếng in "rảnh": chưa xếp mâm và còn chờ in — đúng bộ lọc của bản web.
    final unassigned = items
        .where((i) => i.peiSheetId == null && i.status == PrintItemStatus.pending)
        .toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mâm in PEI'),
        actions: [
          IconButton(
            tooltip: 'Tải lại',
            onPressed: _reload,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      floatingActionButton: _selected.isEmpty
          ? null
          : FloatingActionButton.extended(
              onPressed: _busy ? null : _assignSelected,
              icon: const Icon(Icons.playlist_add_check_rounded),
              label: Text('Xếp ${_selected.length} miếng'),
            ),
      body: AsyncView(
        value: sheetsAsync,
        onRetry: () => ref.invalidate(peiSheetsProvider),
        builder: (sheets) {
          if (sheets.isEmpty) {
            return const EmptyView(
              message: 'Chưa có mâm PEI nào.\nTạo mâm ở bản web rồi quay lại đây để xếp.',
              icon: Icons.grid_view_rounded,
            );
          }

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
            children: [
              const Text(
                'Mâm đích',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 4),
              const Text(
                'Chọn mâm rồi quét hoặc tick miếng in để xếp vào.',
                style: TextStyle(fontSize: 12.5, color: AppColors.muted),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final sheet in sheets)
                    ChoiceChip(
                      label: Text('${sheet.name} (${sheet.items.length})'),
                      selected: _targetSheetId == sheet.id,
                      onSelected: (value) => setState(
                        () => _targetSheetId = value ? sheet.id : null,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: _targetSheetId == null
                    ? null
                    : () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => ScannerScreen(
                              title: 'Quét miếng in vào mâm',
                              hint: 'Quét liên tục từng tem đặt lên mâm',
                              continuous: true,
                              onCode: _scanIntoSheet,
                            ),
                          ),
                        ),
                icon: const Icon(Icons.qr_code_scanner_rounded),
                label: const Text('Quét xếp vào mâm'),
              ),
              const SizedBox(height: 22),

              // ── Miếng in chờ xếp ──
              Row(
                children: [
                  const Text(
                    'Miếng in chờ xếp',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(width: 8),
                  StatusChip(
                    label: '${unassigned.length}',
                    color: AppColors.muted,
                    dense: true,
                  ),
                  const Spacer(),
                  if (unassigned.isNotEmpty)
                    TextButton(
                      onPressed: () => setState(() {
                        if (_selected.length == unassigned.length) {
                          _selected.clear();
                        } else {
                          _selected
                            ..clear()
                            ..addAll(unassigned.map((i) => i.id));
                        }
                      }),
                      child: Text(
                        _selected.length == unassigned.length
                            ? 'Bỏ chọn'
                            : 'Chọn tất cả',
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              if (unassigned.isEmpty)
                const EmptyView(
                  message: 'Không còn miếng in nào chờ xếp mâm.',
                  icon: Icons.done_all_rounded,
                )
              else
                for (final item in unassigned)
                  CheckboxListTile(
                    value: _selected.contains(item.id),
                    onChanged: (value) => setState(() {
                      if (value == true) {
                        _selected.add(item.id);
                      } else {
                        _selected.remove(item.id);
                      }
                    }),
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      item.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 14),
                    ),
                    subtitle: Text(
                      '${item.id} · ${item.productName ?? ''}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        fontFamily: 'monospace',
                        color: AppColors.muted,
                      ),
                    ),
                  ),
              const SizedBox(height: 24),

              // ── Danh sách mâm ──
              const Text(
                'Các mâm hiện có',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 10),
              for (final sheet in sheets)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _SheetCard(
                    sheet: sheet,
                    printers: printers,
                    busy: _busy,
                    onChanged: _reload,
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _SheetCard extends ConsumerWidget {
  const _SheetCard({
    required this.sheet,
    required this.printers,
    required this.busy,
    required this.onChanged,
  });

  final PeiSheet sheet;
  final List<Printer> printers;
  final bool busy;
  final Future<void> Function() onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SectionCard(
      onTap: () => context.push(Routes.peiSheetDetail(sheet.id)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  sheet.name,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                ),
              ),
              StatusChip(
                label: '${sheet.items.length} miếng',
                color: AppColors.muted,
                dense: true,
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (sheet.items.isEmpty)
            const Text(
              'Mâm đang trống',
              style: TextStyle(fontSize: 12, color: AppColors.muted),
            )
          else
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final item in sheet.items)
                  InkWell(
                    onTap: () async {
                      await showPrintItemSheet(context, item);
                      await onChanged();
                    },
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                      decoration: BoxDecoration(
                        color: colorForPrintItem(item.status).withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: colorForPrintItem(item.status).withValues(alpha: 0.4),
                        ),
                      ),
                      child: Text(
                        '${item.name} · ${item.id}',
                        style: TextStyle(
                          fontSize: 12,
                          color: colorForPrintItem(item.status),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          const Divider(height: 22),
          Row(
            children: [
              const Icon(Icons.print_rounded, size: 15, color: AppColors.muted),
              const SizedBox(width: 8),
              const Text('Gắn trên máy', style: TextStyle(fontSize: 12.5)),
              const Spacer(),
              TextButton(
                onPressed: busy
                    ? null
                    : () async {
                        // Chuỗi rỗng = chọn "tháo khỏi máy in"; null = người dùng
                        // vuốt xuống hủy, không đụng gì tới dữ liệu.
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
                          await ref
                              .read(productionRepositoryProvider)
                              .updatePeiSheet(
                                sheet.id,
                                printerId: selected.isEmpty ? null : selected,
                                clearPrinter: selected.isEmpty,
                              );
                          await onChanged();
                          if (context.mounted) {
                            showToast(context, 'Đã cập nhật máy in của mâm.');
                          }
                        } catch (error) {
                          if (context.mounted) {
                            showToast(context, '$error', isError: true);
                          }
                        }
                      },
                child: Text(sheet.printerName ?? 'Chưa gắn'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
