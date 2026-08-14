import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/routes.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/bulk_order.dart';
import '../../data/providers.dart';
import 'bulk_scan.dart';

Color colorForBulkStatus(BulkStatus status) => switch (status) {
      BulkStatus.pending => AppColors.muted,
      BulkStatus.printing => AppColors.warning,
      BulkStatus.completed => AppColors.success,
    };

/// Màn "Đơn SLL" — port `bulk-production-tab.tsx`.
///
/// Khác đơn hàng thường: không có tem cho từng con, đơn vị sản xuất là **1 lượt =
/// 1 mâm PEI**. Việc chính ở xưởng là quẹt mã lượt (lần 1 bắt đầu in, lần 2 in
/// xong) nên nút quét nằm ngay đầu màn.
class BulkOrdersScreen extends ConsumerWidget {
  const BulkOrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(bulkOrdersProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Đơn SLL'),
        actions: [
          IconButton(
            tooltip: 'Tải lại',
            onPressed: () => ref.read(bulkOrdersProvider.notifier).refresh(),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push(Routes.createBulkOrder),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Tạo đơn'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: FilledButton.icon(
              onPressed: () => openBulkRunScanner(context, ref),
              icon: const Icon(Icons.qr_code_scanner_rounded),
              label: const Text('Quẹt mã lượt in'),
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(AppSize.touchTarget),
              ),
            ),
          ),
          Expanded(
            child: AsyncView(
              value: orders,
              onRetry: () => ref.read(bulkOrdersProvider.notifier).refresh(),
              builder: (data) {
                if (data.isEmpty) {
                  return const EmptyView(
                    message: 'Chưa có đơn sản xuất số lượng lớn nào.',
                    icon: Icons.inventory_rounded,
                  );
                }
                return RefreshIndicator(
                  onRefresh: () => ref.read(bulkOrdersProvider.notifier).refresh(),
                  child: ListView.separated(
                    padding:
                        const EdgeInsets.fromLTRB(16, 4, 16, AppSize.listBottomInset),
                    itemCount: data.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, index) =>
                        BulkOrderCard(order: data[index]),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class BulkOrderCard extends StatelessWidget {
  const BulkOrderCard({super.key, required this.order});

  final BulkOrder order;

  @override
  Widget build(BuildContext context) {
    final color = colorForBulkStatus(order.status);

    return SectionCard(
      onTap: () => context.push(Routes.bulkOrderDetail(order.id)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      order.productName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                    ),
                    Text(
                      [
                        if (order.orderCode != null) order.orderCode!,
                        order.displayCustomer,
                      ].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12, color: AppColors.muted),
                    ),
                  ],
                ),
              ),
              StatusChip(label: order.status.label, color: color, dense: true),
            ],
          ),
          const SizedBox(height: 10),
          Text.rich(
            TextSpan(
              text: '${order.runs.length} lượt · ${order.perSheetQty} con/mâm',
              children: [
                if (order.defectQuantity > 0)
                  TextSpan(
                    text: ' · lỗi ${order.defectQuantity}',
                    style: const TextStyle(color: AppColors.danger),
                  ),
              ],
            ),
            style: const TextStyle(fontSize: 12, color: AppColors.muted),
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: order.progress,
              minHeight: 6,
              backgroundColor: AppColors.border,
              valueColor: AlwaysStoppedAnimation(
                order.progress >= 1 ? AppColors.success : AppColors.indigoLight,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Text(
                '${order.doneQuantity} / ${order.totalQuantity} con',
                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
              ),
              const Spacer(),
              Text(
                '${(order.progress * 100).round()}%',
                style: const TextStyle(fontSize: 12, color: AppColors.muted),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
