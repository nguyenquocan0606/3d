import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/bulk_order.dart';
import '../../data/providers.dart';
import '../../data/repositories/bulk_repository.dart';
import 'printer_picker.dart';

/// Sửa đơn SLL.
///
/// Hai việc tách bạch: **Lưu thay đổi** chỉ đụng phần mô tả, còn **Chia lại lượt
/// in** (đổi tổng số con / số con mỗi mâm / máy chạy) xóa sạch lượt cũ và cấp mã
/// vạch mới — tem đã in thành rác, mốc check-in/out mất hết, nên phải hỏi lại.
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

  // ── Khối chia lại lượt: tách riêng vì nó xóa sạch lượt cũ + mã vạch cũ ──
  bool _chiaLai = false;
  late final _totalQuantity =
      TextEditingController(text: '${widget.order.totalQuantity}');
  late final _perSheetQty = TextEditingController(text: '${widget.order.perSheetQty}');
  late final List<String> _printerIds = _thuTuMayCu();
  late final Map<String, String> _limits = _sucChuaCu();

  bool _saving = false;

  /// Thứ tự máy suy từ chính các lượt: máy xuất hiện lần đầu ở đâu là thứ tự đó.
  List<String> _thuTuMayCu() {
    final ids = <String>[];
    for (final run in widget.order.runs) {
      final id = run.printerId;
      if (id != null && !ids.contains(id)) ids.add(id);
    }
    return ids;
  }

  /// Sức chứa mâm từng máy không được lưu riêng ở DB nhưng suy lại được: lượt đầy
  /// nhất của máy chính là số con/mâm của nó (lượt cuối có thể lẻ nên phải lấy max).
  Map<String, String> _sucChuaCu() {
    final result = <String, String>{};
    for (final run in widget.order.runs) {
      final id = run.printerId;
      if (id == null) continue;
      final cu = int.tryParse(result[id] ?? '') ?? 0;
      if (run.quantity > cu) result[id] = '${run.quantity}';
    }
    return result;
  }

  @override
  void dispose() {
    _orderCode.dispose();
    _customerName.dispose();
    _productName.dispose();
    _note.dispose();
    _totalQuantity.dispose();
    _perSheetQty.dispose();
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

  Future<void> _resplit() async {
    final total = int.tryParse(_totalQuantity.text.trim()) ?? 0;
    final perSheet = int.tryParse(_perSheetQty.text.trim()) ?? 0;
    if (total <= 0 || perSheet <= 0) {
      showToast(context, 'Nhập tổng số con và số con mỗi mâm.', isError: true);
      return;
    }
    if (_printerIds.isEmpty) {
      showToast(context, 'Chọn ít nhất 1 máy in.', isError: true);
      return;
    }

    final daChay =
        widget.order.runs.where((r) => r.status != BulkStatus.pending).length;
    final ok = await confirmAction(
      context,
      title: 'Chia lại lượt in',
      message: 'Toàn bộ ${widget.order.runs.length} lượt hiện tại sẽ bị xóa và cấp mã '
          'vạch mới. Tem đã in ra thành rác, phải in lại'
          '${daChay > 0 ? ' — kể cả $daChay lượt đã quẹt (mốc giờ mất hết).' : '.'}',
      confirmLabel: 'Chia lại',
    );
    if (!ok) return;

    setState(() => _saving = true);
    try {
      await ref.read(bulkRepositoryProvider).resplitOrder(
            widget.order.id,
            totalQuantity: total,
            perSheetQty: perSheet,
            printerIds: _printerIds,
            printerLimits: {
              for (final id in _printerIds)
                if ((int.tryParse(_limits[id] ?? '') ?? 0) > 0)
                  id: int.parse(_limits[id]!),
            },
          );
      await ref.read(bulkOrdersProvider.notifier).refresh();
      if (!mounted) return;
      showToast(context, 'Đã chia lại lượt in — nhớ in lại tem.');
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
            'Trạng thái đơn tự tính lại theo các lượt mỗi khi quẹt mã.',
            style: TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.5),
          ),
          const SizedBox(height: 18),
          _buildResplit(context),
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

  Widget _buildResplit(BuildContext context) {
    if (!_chiaLai) {
      return TextButton.icon(
        onPressed: () => setState(() => _chiaLai = true),
        icon: const Icon(Icons.restart_alt_rounded, size: 18),
        label: const Text('Đổi số lượng / máy in (chia lại lượt in)'),
        style: TextButton.styleFrom(foregroundColor: AppColors.warning),
      );
    }

    final printers = ref.watch(printersProvider).valueOrNull ?? const [];
    final total = int.tryParse(_totalQuantity.text.trim()) ?? 0;
    final perSheet = int.tryParse(_perSheetQty.text.trim()) ?? 0;
    final capacities = sucChuaTheoMay(_printerIds, _limits, perSheet);
    final planned = chiaLuotInTheoMay(total, capacities);

    return SectionCard(
      borderColor: AppColors.warning,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Chia lại sẽ xóa toàn bộ ${widget.order.runs.length} lượt hiện tại và cấp '
            'mã vạch mới: tem đã in ra thành rác, mốc check-in/check-out mất hết.',
            style: const TextStyle(fontSize: 12.5, color: AppColors.danger, height: 1.5),
          ),
          const SizedBox(height: 10),
          _field(_totalQuantity, 'Tổng số con *', numeric: true),
          _field(_perSheetQty, 'Số con mỗi mâm PEI (dùng chung) *', numeric: true),
          const SizedBox(height: 10),
          const Text(
            'Máy chạy đơn — ô bên phải là số con/mâm riêng của máy đó',
            style: TextStyle(fontSize: 12, color: AppColors.muted),
          ),
          const SizedBox(height: 10),
          PrinterPicker(
            printers: printers,
            selectedIds: _printerIds,
            limits: _limits,
            perSheetHint: _perSheetQty.text.trim(),
            onToggle: (id) => setState(() {
              if (_printerIds.contains(id)) {
                _printerIds.remove(id);
                _limits.remove(id);
              } else {
                _printerIds.add(id);
              }
            }),
            onLimit: (id, value) => setState(() => _limits[id] = value),
          ),
          if (planned.isNotEmpty) ...[
            const SizedBox(height: 6),
            SplitPreview(
              printers: printers,
              selectedIds: _printerIds,
              planned: planned,
              capacities: capacities,
              title: 'Sẽ chia lại thành',
            ),
          ],
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: FilledButton(
                  onPressed: _saving ? null : _resplit,
                  style: FilledButton.styleFrom(backgroundColor: AppColors.warning),
                  child: const Text('Chia lại lượt in'),
                ),
              ),
              const SizedBox(width: 10),
              TextButton(
                onPressed: () => setState(() => _chiaLai = false),
                child: const Text('Bỏ'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    String? hint,
    bool numeric = false,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: TextField(
        controller: controller,
        keyboardType: numeric ? TextInputType.number : TextInputType.text,
        inputFormatters: numeric ? [FilteringTextInputFormatter.digitsOnly] : null,
        onChanged: numeric ? (_) => setState(() {}) : null,
        decoration: InputDecoration(labelText: label, hintText: hint, isDense: true),
      ),
    );
  }
}
