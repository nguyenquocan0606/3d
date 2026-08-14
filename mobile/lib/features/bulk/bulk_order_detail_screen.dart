import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/bulk_order.dart';
import '../../data/providers.dart';
import '../../data/repositories/bulk_repository.dart';
import '../../data/repositories/label_repository.dart';
import 'bulk_orders_screen.dart';
import 'bulk_scan.dart';
import 'edit_bulk_order_sheet.dart';

/// Chi tiết 1 đơn SLL: lượt in gom theo máy, mỗi lượt quẹt được ngay tại chỗ.
class BulkOrderDetailScreen extends ConsumerWidget {
  const BulkOrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(bulkOrdersProvider);
    final order = ref.watch(bulkOrderByIdProvider(orderId));

    return Scaffold(
      appBar: AppBar(
        title: Text(order?.productName ?? 'Đơn SLL'),
        actions: [
          IconButton(
            tooltip: 'Quẹt mã lượt in',
            onPressed: () => openBulkRunScanner(context, ref),
            icon: const Icon(Icons.qr_code_scanner_rounded),
          ),
          if (order != null)
            PopupMenuButton<String>(
              onSelected: (value) async {
                if (value == 'edit') {
                  await showEditBulkOrderSheet(context, order);
                } else if (value == 'labels') {
                  await _printLabels(context, ref, order, order.runs);
                } else if (value == 'delete') {
                  await _deleteOrder(context, ref, order);
                }
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'edit', child: Text('Sửa thông tin đơn')),
                PopupMenuItem(value: 'labels', child: Text('In toàn bộ tem lượt')),
                PopupMenuItem(value: 'delete', child: Text('Xóa đơn')),
              ],
            ),
        ],
      ),
      body: AsyncView(
        value: orders,
        onRetry: () => ref.read(bulkOrdersProvider.notifier).refresh(),
        builder: (_) {
          if (order == null) {
            return const EmptyView(
              message: 'Đơn này không còn tồn tại.',
              icon: Icons.search_off_rounded,
            );
          }
          return RefreshIndicator(
            onRefresh: () => ref.read(bulkOrdersProvider.notifier).refresh(),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, AppSize.listBottomInset),
              children: [
                _Summary(order: order),
                const SizedBox(height: 14),
                for (final group in order.runsByPrinter) ...[
                  _PrinterGroup(order: order, group: group),
                  const SizedBox(height: 12),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.order});

  final BulkOrder order;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  order.productName,
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                ),
              ),
              StatusChip(
                label: order.status.label,
                color: colorForBulkStatus(order.status),
                dense: true,
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: order.progress,
              minHeight: 8,
              backgroundColor: AppColors.border,
              valueColor: AlwaysStoppedAnimation(
                order.progress >= 1 ? AppColors.success : AppColors.indigoLight,
              ),
            ),
          ),
          const SizedBox(height: 12),
          InfoRow(
            label: 'Đã xong',
            value: '${order.doneQuantity} / ${order.totalQuantity} con '
                '(${(order.progress * 100).round()}%)',
          ),
          InfoRow(
            label: 'Lượt in',
            value: '${order.doneRuns}/${order.runs.length} lượt · '
                '${order.perSheetQty} con/mâm',
          ),
          InfoRow(label: 'Mã đơn', value: order.orderCode ?? '—'),
          InfoRow(label: 'Khách hàng', value: order.displayCustomer),
          if (order.note != null) InfoRow(label: 'Ghi chú', value: order.note!),
          InfoRow(label: 'Tạo lúc', value: Fmt.dateTime(order.createdAt)),
        ],
      ),
    );
  }
}

class _PrinterGroup extends ConsumerWidget {
  const _PrinterGroup({required this.order, required this.group});

  final BulkOrder order;
  final BulkRunGroup group;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SectionCard(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.print_rounded, size: 18, color: AppColors.indigoLight),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      group.printerName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    Text(
                      '${group.doneCount}/${group.runs.length} lượt xong · '
                      '${group.quantity} con',
                      style: const TextStyle(fontSize: 12, color: AppColors.muted),
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'In tem các lượt của máy này',
                onPressed: () => _printLabels(context, ref, order, group.runs),
                icon: const Icon(Icons.local_offer_outlined, size: 20),
              ),
            ],
          ),
          const Divider(height: 18),
          for (final run in group.runs) _RunRow(run: run),
        ],
      ),
    );
  }
}

class _RunRow extends ConsumerStatefulWidget {
  const _RunRow({required this.run});

  final BulkRun run;

  @override
  ConsumerState<_RunRow> createState() => _RunRowState();
}

class _RunRowState extends ConsumerState<_RunRow> {
  bool _busy = false;

  /// Bấm nút = quẹt tay đúng mã lượt đó, dùng chung endpoint với camera nên
  /// vòng đời check-in/check-out không bao giờ lệch nhau. Riêng "bắt đầu in" vẫn
  /// phải quét tem máy in — chính chỗ đó quyết định lượt này chạy máy nào.
  Future<void> _scan() async {
    setState(() => _busy = true);
    try {
      final message = widget.run.status == BulkStatus.pending
          ? await startBulkRunByScanningPrinter(context, ref, widget.run)
          : await finishBulkRun(ref, widget.run.id);
      if (mounted && message != null) showToast(context, message);
    } catch (error) {
      if (mounted) showToast(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reset() async {
    final ok = await confirmAction(
      context,
      title: 'Đặt lại lượt ${widget.run.id}',
      message: 'Lượt này sẽ về "Chờ in" và mất mốc bắt đầu / kết thúc đã ghi.',
      confirmLabel: 'Đặt lại',
    );
    if (!ok) return;

    setState(() => _busy = true);
    try {
      await ref
          .read(bulkRepositoryProvider)
          .updateRun(widget.run.id, status: BulkStatus.pending);
      await ref.read(bulkOrdersProvider.notifier).refresh();
      if (mounted) showToast(context, 'Đã đặt lại lượt ${widget.run.id}.');
    } catch (error) {
      if (mounted) showToast(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final run = widget.run;
    final color = colorForBulkStatus(run.status);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      run.id,
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'PEI ${run.peiIndex} · ${run.quantity} con',
                      style: const TextStyle(fontSize: 12, color: AppColors.muted),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  switch (run.status) {
                    BulkStatus.pending => 'Chưa bắt đầu',
                    BulkStatus.printing =>
                      'Bắt đầu ${Fmt.dateTime(run.startedAt)}',
                    BulkStatus.completed =>
                      'Xong ${Fmt.dateTime(run.finishedAt)} · ${Fmt.duration(run.elapsed)}',
                  },
                  style: const TextStyle(fontSize: 11.5, color: AppColors.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          StatusChip(label: run.status.label, color: color, dense: true),
          if (_busy)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 12),
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          else ...[
            if (run.status != BulkStatus.completed)
              IconButton(
                tooltip: run.status == BulkStatus.pending
                    ? 'Ghi nhận bắt đầu in'
                    : 'Ghi nhận in xong',
                onPressed: _scan,
                color: run.status == BulkStatus.pending
                    ? AppColors.warning
                    : AppColors.success,
                icon: Icon(
                  run.status == BulkStatus.pending
                      ? Icons.play_arrow_rounded
                      : Icons.check_rounded,
                ),
              ),
            if (run.status != BulkStatus.pending)
              IconButton(
                tooltip: 'Đặt lại về chờ in',
                onPressed: _reset,
                icon: const Icon(Icons.restart_alt_rounded, size: 20),
              ),
          ],
        ],
      ),
    );
  }
}

/// In tem lượt in — cùng layout barcode với tem miếng in của đơn thường.
Future<void> _printLabels(
  BuildContext context,
  WidgetRef ref,
  BulkOrder order,
  List<BulkRun> runs,
) async {
  if (runs.isEmpty) return;
  try {
    await ref.read(labelRepositoryProvider).printOrderBarcodes([
      for (final run in runs)
        (
          barcode: run.id,
          line1: run.id,
          line2: order.productName,
          line3: '${run.printerName} PEI ${run.peiIndex} - ${run.quantity} con',
        ),
    ]);
    if (context.mounted) {
      showToast(context, 'Đã gửi lệnh in ${runs.length} tem.');
    }
  } catch (error) {
    if (context.mounted) showToast(context, '$error', isError: true);
  }
}

Future<void> _deleteOrder(
  BuildContext context,
  WidgetRef ref,
  BulkOrder order,
) async {
  final ok = await confirmAction(
    context,
    title: 'Xóa đơn SLL',
    message: 'Xóa "${order.productName}" cùng ${order.runs.length} lượt in? '
        'Toàn bộ mốc check-in/check-out đã ghi sẽ mất.',
    confirmLabel: 'Xóa',
  );
  if (!ok) return;

  try {
    await ref.read(bulkRepositoryProvider).deleteOrder(order.id);
    await ref.read(bulkOrdersProvider.notifier).refresh();
    if (context.mounted) {
      showToast(context, 'Đã xóa đơn.');
      Navigator.of(context).pop();
    }
  } catch (error) {
    if (context.mounted) showToast(context, '$error', isError: true);
  }
}
