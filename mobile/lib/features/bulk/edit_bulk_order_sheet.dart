import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/bulk_order.dart';
import '../../data/providers.dart';
import '../../data/repositories/bulk_repository.dart';

/// Sửa thông tin đơn SLL.
///
/// Chỉ phần mô tả: tổng số con / số con mỗi mâm / danh sách máy không sửa được vì
/// lượt in đã chia và tem mã vạch đã dán lên mâm — muốn chia lại thì xóa đơn rồi
/// tạo đơn mới.
Future<void> showEditBulkOrderSheet(BuildContext context, BulkOrder order) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: AppColors.surfaceAlt,
    builder: (_) => _EditBulkOrderSheet(order: order),
  );
}

class _EditBulkOrderSheet extends ConsumerStatefulWidget {
  const _EditBulkOrderSheet({required this.order});

  final BulkOrder order;

  @override
  ConsumerState<_EditBulkOrderSheet> createState() => _EditBulkOrderSheetState();
}

class _EditBulkOrderSheetState extends ConsumerState<_EditBulkOrderSheet> {
  late final _orderCode = TextEditingController(text: widget.order.orderCode ?? '');
  late final _customerName =
      TextEditingController(text: widget.order.customerName ?? '');
  late final _productName = TextEditingController(text: widget.order.productName);
  late final _note = TextEditingController(text: widget.order.note ?? '');
  late BulkStatus _status = widget.order.status;

  bool _saving = false;

  @override
  void dispose() {
    _orderCode.dispose();
    _customerName.dispose();
    _productName.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final productName = _productName.text.trim();
    if (productName.isEmpty) {
      showToast(context, 'Vui lòng nhập tên sản phẩm.', isError: true);
      return;
    }

    setState(() => _saving = true);
    try {
      await ref.read(bulkRepositoryProvider).updateOrder(
            widget.order.id,
            productName: productName,
            orderCode: _orderCode.text.trim(),
            customerName: _customerName.text.trim(),
            note: _note.text.trim(),
            status: _status,
          );
      await ref.read(bulkOrdersProvider.notifier).refresh();
      if (!mounted) return;
      showToast(context, 'Đã lưu thay đổi.');
      Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        setState(() => _saving = false);
        showToast(context, '$error', isError: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        16,
        18,
        16,
        MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Sửa đơn SLL',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 14),
          _field(_orderCode, 'Mã đơn', hint: 'VD: SLL-001'),
          _field(_customerName, 'Khách hàng', hint: 'Khách lẻ'),
          _field(_productName, 'Tên sản phẩm *'),
          _field(_note, 'Ghi chú', hint: 'Màu nhựa, yêu cầu riêng...'),
          const SizedBox(height: 10),
          const Text(
            'Trạng thái',
            style: TextStyle(fontSize: 12.5, color: AppColors.muted),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            children: [
              for (final status in BulkStatus.values)
                ChoiceChip(
                  label: Text(status.label),
                  selected: _status == status,
                  onSelected: (_) => setState(() => _status = status),
                ),
            ],
          ),
          const SizedBox(height: 14),
          const Text(
            'Tổng số con, số con mỗi mâm và danh sách máy không sửa được: lượt in đã '
            'chia và tem mã vạch đã in ra — muốn chia lại thì xóa đơn rồi tạo đơn mới. '
            'Trạng thái đơn cũng tự tính lại theo các lượt mỗi khi quẹt mã.',
            style: TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.5),
          ),
          const SizedBox(height: 18),
          FilledButton.icon(
            onPressed: _saving ? null : _save,
            icon: _saving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.save_rounded),
            label: Text(_saving ? 'Đang lưu...' : 'Lưu thay đổi'),
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(AppSize.touchTarget),
            ),
          ),
        ],
      ),
    );
  }

  Widget _field(TextEditingController controller, String label, {String? hint}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: TextField(
        controller: controller,
        decoration: InputDecoration(labelText: label, hintText: hint, isDense: true),
      ),
    );
  }
}
