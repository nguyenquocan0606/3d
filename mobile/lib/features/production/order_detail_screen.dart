import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/order.dart';
import '../../data/repositories/label_repository.dart';
import '../../data/repositories/production_repository.dart';
import 'print_item_sheet.dart';

class OrderDetailScreen extends ConsumerStatefulWidget {
  const OrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  ConsumerState<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends ConsumerState<OrderDetailScreen> {
  late Future<Order> _future = _load();

  Future<Order> _load() =>
      ref.read(productionRepositoryProvider).fetchOrder(widget.orderId);

  void _reload() => setState(() => _future = _load());

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Chi tiết đơn hàng')),
      body: FutureBuilder<Order>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return ErrorView(message: '${snapshot.error}', onRetry: _reload);
          }
          final order = snapshot.data!;

          return RefreshIndicator(
            onRefresh: () async => _reload(),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [
                SectionCard(
                  child: Column(
                    children: [
                      InfoRow(label: 'Khách hàng', value: order.displayCustomer),
                      InfoRow(label: 'Mã đơn', value: order.displayCode),
                      InfoRow(label: 'Ngày tạo', value: Fmt.dateTime(order.createdAt)),
                      InfoRow(
                        label: 'Tem hoàn thành',
                        value: '${order.completedItems}/${order.totalItems}',
                      ),
                      InfoRow(
                        label: 'Đã kiểm hàng',
                        value: '${order.checkedItems}/${order.totalItems}',
                      ),
                      InfoRow(label: 'Tổng tiền', value: Fmt.money(order.totalPrice)),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                OutlinedButton.icon(
                  onPressed: () => _printAll(order),
                  icon: const Icon(Icons.print_rounded),
                  label: Text('In lại toàn bộ ${order.totalItems} tem'),
                ),
                const SizedBox(height: 20),
                for (final product in order.products) ...[
                  _ProductBlock(product: product, onChanged: _reload),
                  const SizedBox(height: 16),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  /// In lại toàn bộ tem của đơn — nội dung 3 dòng khớp bản web:
  /// line2 = "Sản phẩm - Tên miếng", line3 = số thứ tự "sản phẩm-miếng".
  Future<void> _printAll(Order order) async {
    final ok = await confirmAction(
      context,
      title: 'In lại tem',
      message: 'Gửi lệnh in ${order.totalItems} tem tới máy in nhãn của xưởng?',
      confirmLabel: 'In',
      destructive: false,
    );
    if (!ok) return;

    final jobs = <({String barcode, String line1, String line2, String line3})>[];
    for (var p = 0; p < order.products.length; p++) {
      final product = order.products[p];
      for (var i = 0; i < product.items.length; i++) {
        final item = product.items[i];
        jobs.add((
          barcode: item.id,
          line1: '',
          line2: '${product.name} - ${item.name}',
          line3: '${p + 1}-${i + 1}',
        ));
      }
    }

    try {
      await ref.read(labelRepositoryProvider).printOrderBarcodes(jobs);
      if (mounted) showToast(context, 'Đã gửi ${jobs.length} tem tới máy in.');
    } catch (error) {
      if (mounted) showToast(context, '$error', isError: true);
    }
  }
}

class _ProductBlock extends ConsumerWidget {
  const _ProductBlock({required this.product, required this.onChanged});

  final OrderProduct product;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Gom tem theo tên miếng để không đổ ra hàng trăm dòng rời rạc.
    final grouped = <String, List<PrintItem>>{};
    for (final item in product.items) {
      grouped.putIfAbsent(item.name, () => []).add(item);
    }

    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  product.name,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                ),
              ),
              StatusChip(
                label: '${product.completedCount}/${product.items.length}',
                color: product.completedCount == product.items.length
                    ? AppColors.success
                    : AppColors.warning,
                dense: true,
              ),
            ],
          ),
          Text(
            'SL ${product.quantity} · ${Fmt.money(product.price)}/cái',
            style: const TextStyle(fontSize: 12, color: AppColors.muted),
          ),
          const SizedBox(height: 12),
          for (final entry in grouped.entries) ...[
            Text(
              entry.key,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final item in entry.value)
                  InkWell(
                    onTap: () async {
                      await showPrintItemSheet(context, item);
                      onChanged();
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
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            item.id,
                            style: TextStyle(
                              fontSize: 12.5,
                              fontFamily: 'monospace',
                              fontWeight: FontWeight.w600,
                              color: colorForPrintItem(item.status),
                            ),
                          ),
                          if (item.isChecked) ...[
                            const SizedBox(width: 4),
                            const Icon(Icons.check_rounded,
                                size: 12, color: AppColors.success),
                          ],
                        ],
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 10),
          ],
        ],
      ),
    );
  }
}
