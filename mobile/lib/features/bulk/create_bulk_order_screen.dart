import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/routes.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/bulk_order.dart';
import '../../data/providers.dart';
import '../../data/repositories/bulk_repository.dart';
import 'printer_picker.dart';

/// Tạo đơn SLL + chia lượt.
///
/// Đây là ngoại lệ thứ hai (sau thêm cuộn nhựa) cho nguyên tắc "web tạo dữ liệu,
/// app vận hành": đơn SLL chỉ có 6 ô nhập và danh sách máy, mà lại thường phát
/// sinh ngay lúc đứng cạnh máy in nên làm luôn trên điện thoại tiện hơn.
class CreateBulkOrderScreen extends ConsumerStatefulWidget {
  const CreateBulkOrderScreen({super.key});

  @override
  ConsumerState<CreateBulkOrderScreen> createState() =>
      _CreateBulkOrderScreenState();
}

class _CreateBulkOrderScreenState extends ConsumerState<CreateBulkOrderScreen> {
  final _orderCode = TextEditingController();
  final _customerName = TextEditingController();
  final _productName = TextEditingController();
  final _totalQuantity = TextEditingController();
  final _perSheetQty = TextEditingController();
  final _note = TextEditingController();

  /// Thứ tự bấm chọn = thứ tự nhận lượt, nên phải giữ list chứ không dùng Set.
  final List<String> _printerIds = [];

  /// printerId → số con mỗi mâm riêng của máy đó (bỏ trống = dùng số chung).
  final Map<String, String> _limits = {};

  bool _saving = false;

  @override
  void dispose() {
    _orderCode.dispose();
    _customerName.dispose();
    _productName.dispose();
    _totalQuantity.dispose();
    _perSheetQty.dispose();
    _note.dispose();
    super.dispose();
  }

  int get _total => int.tryParse(_totalQuantity.text.trim()) ?? 0;
  int get _perSheet => int.tryParse(_perSheetQty.text.trim()) ?? 0;

  Future<void> _submit() async {
    final productName = _productName.text.trim();
    if (productName.isEmpty) {
      showToast(context, 'Vui lòng nhập tên sản phẩm.', isError: true);
      return;
    }
    if (_total <= 0) {
      showToast(context, 'Tổng số con phải lớn hơn 0.', isError: true);
      return;
    }
    if (_perSheet <= 0) {
      showToast(context, 'Số con mỗi mâm PEI phải lớn hơn 0.', isError: true);
      return;
    }
    if (_printerIds.isEmpty) {
      showToast(context, 'Chọn ít nhất 1 máy in.', isError: true);
      return;
    }

    setState(() => _saving = true);
    try {
      final order = await ref.read(bulkRepositoryProvider).createOrder(
            productName: productName,
            totalQuantity: _total,
            perSheetQty: _perSheet,
            printerIds: _printerIds,
            printerLimits: {
              for (final id in _printerIds)
                if ((int.tryParse(_limits[id] ?? '') ?? 0) > 0)
                  id: int.parse(_limits[id]!),
            },
            orderCode: _orderCode.text.trim(),
            customerName: _customerName.text.trim(),
            note: _note.text.trim(),
          );
      await ref.read(bulkOrdersProvider.notifier).refresh();
      if (!mounted) return;
      showToast(context, 'Đã tạo đơn với ${order.runs.length} lượt in.');
      context.pushReplacement(Routes.bulkOrderDetail(order.id));
    } catch (error) {
      if (mounted) showToast(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final printers = ref.watch(printersProvider).valueOrNull ?? const [];
    final capacities = sucChuaTheoMay(_printerIds, _limits, _perSheet);
    final planned = chiaLuotInTheoMay(_total, capacities);

    return Scaffold(
      appBar: AppBar(title: const Text('Tạo đơn SLL')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          SectionCard(
            child: Column(
              children: [
                _Field(controller: _orderCode, label: 'Mã đơn (tùy chọn)', hint: 'VD: SLL-001'),
                _Field(
                  controller: _customerName,
                  label: 'Khách hàng',
                  hint: 'Khách lẻ',
                ),
                _Field(
                  controller: _productName,
                  label: 'Tên sản phẩm *',
                  hint: 'VD: Móc khóa rồng',
                ),
                _Field(
                  controller: _totalQuantity,
                  label: 'Tổng số con *',
                  hint: 'VD: 5000',
                  numeric: true,
                  onChanged: () => setState(() {}),
                ),
                _Field(
                  controller: _perSheetQty,
                  label: 'Số con mỗi mâm PEI *',
                  hint: 'VD: 50',
                  numeric: true,
                  onChanged: () => setState(() {}),
                ),
                _Field(
                  controller: _note,
                  label: 'Ghi chú',
                  hint: 'Màu nhựa, yêu cầu riêng...',
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          const Text(
            'MÁY IN CHẠY ĐƠN NÀY *',
            style: TextStyle(
              fontSize: 12,
              letterSpacing: 0.6,
              fontWeight: FontWeight.w700,
              color: AppColors.muted,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Số trên nút là thứ tự nhận lượt — máy số 1 nhận PEI 1. Ô bên phải là số '
            'con/mâm riêng của máy đó, bỏ trống thì dùng số chung ở trên.',
            style: TextStyle(fontSize: 12, color: AppColors.muted, height: 1.4),
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
            const SizedBox(height: 14),
            SectionCard(
              borderColor: AppColors.indigo,
              child: SplitPreview(
                printers: printers,
                selectedIds: _printerIds,
                planned: planned,
                capacities: capacities,
              ),
            ),
          ],
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: _saving ? null : _submit,
            icon: _saving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.playlist_add_check_rounded),
            label: Text(_saving ? 'Đang tạo...' : 'Tạo đơn & chia lượt'),
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(AppSize.touchTarget),
            ),
          ),
        ],
      ),
    );
  }

}

class _Field extends StatelessWidget {
  const _Field({
    required this.controller,
    required this.label,
    this.hint,
    this.numeric = false,
    this.onChanged,
  });

  final TextEditingController controller;
  final String label;
  final String? hint;
  final bool numeric;
  final VoidCallback? onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: TextField(
        controller: controller,
        keyboardType: numeric ? TextInputType.number : TextInputType.text,
        inputFormatters: numeric ? [FilteringTextInputFormatter.digitsOnly] : null,
        onChanged: onChanged == null ? null : (_) => onChanged!(),
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          isDense: true,
        ),
      ),
    );
  }
}
