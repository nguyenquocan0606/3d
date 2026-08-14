import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/order.dart';
import '../../data/repositories/production_repository.dart';
import '../scanner/scanner_screen.dart';

/// Kiểm hàng đóng gói.
///
/// Luồng: quét (hoặc nhập) mã đơn → quét từng tem trong thùng → thanh tiến độ chạy
/// tới 100%. Cảnh báo rõ 2 lỗi hay gặp: tem không thuộc đơn, và tem đã kiểm rồi.
class OrderCheckScreen extends ConsumerStatefulWidget {
  const OrderCheckScreen({super.key});

  @override
  ConsumerState<OrderCheckScreen> createState() => _OrderCheckScreenState();
}

class _OrderCheckScreenState extends ConsumerState<OrderCheckScreen> {
  final _codeController = TextEditingController();
  Order? _order;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _loadOrder(String code) async {
    if (code.trim().isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // Endpoint nhận cả uuid lẫn orderCode nên quét mã đơn in trên thùng là ra.
      final order = await ref.read(productionRepositoryProvider).fetchOrder(code.trim());
      setState(() => _order = order);
    } catch (error) {
      setState(() {
        _error = '$error';
        _order = null;
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<String?> _checkItem(String barcode) async {
    final order = _order;
    if (order == null) throw Exception('Chưa chọn đơn hàng.');

    PrintItem? target;
    for (final item in order.allItems) {
      if (item.id == barcode.trim()) target = item;
    }

    if (target == null) {
      throw Exception('Tem $barcode không thuộc đơn ${order.displayCode}!');
    }
    if (target.isChecked) {
      throw Exception('Tem $barcode đã được kiểm rồi.');
    }

    await ref
        .read(productionRepositoryProvider)
        .updatePrintItem(target.id, isChecked: true);

    // Cập nhật tại chỗ để tiến độ nhảy ngay, không phải tải lại cả đơn.
    setState(() {
      _order = Order(
        id: order.id,
        status: order.status,
        orderCode: order.orderCode,
        customerName: order.customerName,
        createdAt: order.createdAt,
        products: [
          for (final product in order.products)
            OrderProduct(
              id: product.id,
              name: product.name,
              quantity: product.quantity,
              price: product.price,
              items: [
                for (final item in product.items)
                  if (item.id == target!.id) item.copyWith(isChecked: true) else item,
              ],
            ),
        ],
      );
    });

    final updated = _order!;
    return '✔ ${target.name} — ${updated.checkedItems}/${updated.totalItems}';
  }

  @override
  Widget build(BuildContext context) {
    final order = _order;

    return Scaffold(
      appBar: AppBar(title: const Text('Kiểm hàng đóng gói')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _codeController,
                  textCapitalization: TextCapitalization.characters,
                  decoration: const InputDecoration(
                    hintText: 'Mã đơn hàng',
                    prefixIcon: Icon(Icons.receipt_long_rounded),
                    isDense: true,
                  ),
                  onSubmitted: _loadOrder,
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                tooltip: 'Quét mã đơn',
                onPressed: () async {
                  final code = await Navigator.of(context).push<String>(
                    MaterialPageRoute(
                      builder: (_) => const ScannerScreen(title: 'Quét mã đơn hàng'),
                    ),
                  );
                  if (code == null) return;
                  _codeController.text = code;
                  await _loadOrder(code);
                },
                icon: const Icon(Icons.qr_code_scanner_rounded),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (_loading) const Center(child: CircularProgressIndicator()),
          if (_error != null)
            SectionCard(
              borderColor: AppColors.danger.withValues(alpha: 0.4),
              child: Row(
                children: [
                  const Icon(Icons.error_outline_rounded, color: AppColors.danger),
                  const SizedBox(width: 10),
                  Expanded(child: Text(_error!)),
                ],
              ),
            ),
          if (order != null) ...[
            _ProgressCard(order: order),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => ScannerScreen(
                    title: 'Quét tem trong thùng',
                    hint: 'Quét liên tục cho tới khi đủ ${order.totalItems} tem',
                    continuous: true,
                    onCode: _checkItem,
                  ),
                ),
              ),
              icon: const Icon(Icons.qr_code_scanner_rounded),
              label: const Text('Bắt đầu quét kiểm'),
            ),
            const SizedBox(height: 20),
            for (final product in order.products) ...[
              _CheckProductBlock(product: product),
              const SizedBox(height: 14),
            ],
          ],
        ],
      ),
    );
  }
}

class _ProgressCard extends StatelessWidget {
  const _ProgressCard({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    final total = order.totalItems;
    final checked = order.checkedItems;
    final ratio = total == 0 ? 0.0 : checked / total;
    final done = ratio >= 1;

    return SectionCard(
      borderColor: (done ? AppColors.success : AppColors.warning).withValues(alpha: 0.4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            order.displayCustomer,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
          ),
          Text(
            'Mã đơn: ${order.displayCode}',
            style: const TextStyle(fontSize: 12, color: AppColors.muted),
          ),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                '$checked',
                style: TextStyle(
                  fontSize: 40,
                  fontWeight: FontWeight.w800,
                  color: done ? AppColors.success : AppColors.warning,
                ),
              ),
              Text(
                ' / $total mảnh',
                style: const TextStyle(fontSize: 16, color: AppColors.muted),
              ),
              const Spacer(),
              if (done)
                const StatusChip(
                  label: 'Đủ hàng',
                  color: AppColors.success,
                  icon: Icons.check_circle_rounded,
                ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: ratio,
              minHeight: 10,
              backgroundColor: AppColors.border,
              valueColor: AlwaysStoppedAnimation(
                done ? AppColors.success : AppColors.warning,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CheckProductBlock extends StatelessWidget {
  const _CheckProductBlock({required this.product});

  final OrderProduct product;

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
                  product.name,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
              StatusChip(
                label: '${product.checkedCount}/${product.items.length}',
                color: product.checkedCount == product.items.length
                    ? AppColors.success
                    : AppColors.muted,
                dense: true,
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final item in product.items)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                  decoration: BoxDecoration(
                    color: item.isChecked
                        ? AppColors.success.withValues(alpha: 0.16)
                        : AppColors.surfaceAlt,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: item.isChecked ? AppColors.success : AppColors.border,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        item.isChecked
                            ? Icons.check_circle_rounded
                            : Icons.radio_button_unchecked_rounded,
                        size: 12,
                        color: item.isChecked ? AppColors.success : AppColors.muted,
                      ),
                      const SizedBox(width: 5),
                      Text(
                        item.name,
                        style: const TextStyle(fontSize: 12.5),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
