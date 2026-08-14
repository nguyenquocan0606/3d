import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/order.dart';
import '../../data/providers.dart';
import '../../data/repositories/production_repository.dart';

Color colorForPrintItem(PrintItemStatus status) => switch (status) {
      PrintItemStatus.pending => AppColors.muted,
      PrintItemStatus.printing => AppColors.warning,
      PrintItemStatus.completed => AppColors.success,
    };

/// Bảng chi tiết + đổi trạng thái nhanh cho 1 tem miếng in.
///
/// Mở khi quét barcode 8 chữ số. Nút gợi ý mặc định là bước tiếp theo trong vòng
/// đời (pending → printing → completed) để 1 chạm là xong.
Future<void> showPrintItemSheet(BuildContext context, PrintItem item) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: AppColors.surfaceAlt,
    builder: (_) => _PrintItemSheet(item: item),
  );
}

class _PrintItemSheet extends ConsumerStatefulWidget {
  const _PrintItemSheet({required this.item});

  final PrintItem item;

  @override
  ConsumerState<_PrintItemSheet> createState() => _PrintItemSheetState();
}

class _PrintItemSheetState extends ConsumerState<_PrintItemSheet> {
  late PrintItem _item = widget.item;
  bool _busy = false;

  Future<void> _setStatus(PrintItemStatus status) async {
    setState(() => _busy = true);
    try {
      await ref.read(productionRepositoryProvider).updatePrintItem(
            _item.id,
            status: status,
          );
      ref.read(printItemsProvider.notifier).patchLocal(_item.id, status);
      ref.invalidate(ordersProvider);
      setState(() => _item = _item.copyWith(status: status));
      if (mounted) {
        showToast(context, 'Tem ${_item.id} → ${status.label}.');
      }
    } catch (error) {
      if (mounted) showToast(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _toggleChecked() async {
    final next = !_item.isChecked;
    setState(() => _busy = true);
    try {
      await ref
          .read(productionRepositoryProvider)
          .updatePrintItem(_item.id, isChecked: next);
      ref.invalidate(ordersProvider);
      setState(() => _item = _item.copyWith(isChecked: next));
    } catch (error) {
      if (mounted) showToast(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.qr_code_2_rounded, color: AppColors.indigoLight),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    _item.id,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      fontFamily: 'monospace',
                    ),
                  ),
                ),
                StatusChip(
                  label: _item.status.label,
                  color: colorForPrintItem(_item.status),
                ),
              ],
            ),
            const SizedBox(height: 16),
            SectionCard(
              child: Column(
                children: [
                  InfoRow(label: 'Tên miếng in', value: _item.name),
                  InfoRow(label: 'Sản phẩm', value: _item.productName ?? '—'),
                  InfoRow(label: 'Khách hàng', value: _item.customerName ?? 'Khách lẻ'),
                  InfoRow(label: 'Mã đơn', value: _item.orderCode ?? '—'),
                  InfoRow(label: 'Mâm PEI', value: _item.peiSheetName ?? 'Chưa xếp mâm'),
                  InfoRow(label: 'Máy in', value: _item.printerName ?? 'Chưa gán'),
                  InfoRow(
                    label: 'Kiểm hàng',
                    value: _item.isChecked ? 'Đã kiểm' : 'Chưa kiểm',
                    valueColor:
                        _item.isChecked ? AppColors.success : AppColors.warning,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _busy ? null : () => _setStatus(_item.status.next),
              icon: const Icon(Icons.arrow_forward_rounded),
              label: Text('Chuyển sang: ${_item.status.next.label}'),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                for (final status in PrintItemStatus.values) ...[
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: OutlinedButton(
                        onPressed: _busy || status == _item.status
                            ? null
                            : () => _setStatus(status),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(0, AppSize.touchTarget),
                          foregroundColor: colorForPrintItem(status),
                          padding: EdgeInsets.zero,
                        ),
                        child: Text(
                          status.label,
                          style: const TextStyle(fontSize: 12),
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 12),
            TextButton.icon(
              onPressed: _busy ? null : _toggleChecked,
              icon: Icon(
                _item.isChecked
                    ? Icons.check_box_rounded
                    : Icons.check_box_outline_blank_rounded,
              ),
              label: Text(_item.isChecked ? 'Bỏ đánh dấu đã kiểm' : 'Đánh dấu đã kiểm'),
            ),
          ],
        ),
      ),
    );
  }
}
