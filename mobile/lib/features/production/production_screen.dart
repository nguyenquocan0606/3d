import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format/formatters.dart';
import '../../core/routes.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/order.dart';
import '../../data/providers.dart';
import '../../data/repositories/production_repository.dart';
import '../scanner/scanner_screen.dart';
import '../shell/quick_menu.dart';
import 'order_check_screen.dart';
import 'print_item_sheet.dart';

/// Màn Sản xuất — 2 tab hợp nhất từ 4 sub-tab của bản web.
///
/// Bản web có: Đơn hàng / Miếng in / Mâm PEI / Kiểm hàng. Trên di động, tạo & sửa
/// đơn (form nhiều cấp) vẫn nên làm ở web, còn app tập trung vào việc **quét**:
/// cập nhật trạng thái tem và kiểm hàng đóng gói.
class ProductionScreen extends ConsumerWidget {
  const ProductionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Sản xuất'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Đơn hàng'),
              Tab(text: 'Miếng in'),
            ],
          ),
          actions: [
            IconButton(
              tooltip: 'Mâm in PEI',
              onPressed: () => context.push(Routes.pei),
              icon: const Icon(Icons.grid_view_rounded),
            ),
            IconButton(
              tooltip: 'Kiểm hàng đóng gói',
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const OrderCheckScreen()),
              ),
              icon: const Icon(Icons.fact_check_outlined),
            ),
          ],
        ),
        body: const TabBarView(
          children: [_OrdersTab(), _PrintItemsTab()],
        ),
      ),
    );
  }
}

class _OrdersTab extends ConsumerWidget {
  const _OrdersTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(ordersProvider);

    return AsyncView(
      value: orders,
      onRetry: () => ref.read(ordersProvider.notifier).refresh(),
      builder: (data) {
        if (data.isEmpty) {
          return const EmptyView(
            message: 'Chưa có đơn hàng nào.\nTạo đơn ở bản web.',
            icon: Icons.receipt_long_outlined,
          );
        }
        return RefreshIndicator(
          onRefresh: () => ref.read(ordersProvider.notifier).refresh(),
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, AppSize.listBottomInset),
            itemCount: data.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, index) => _OrderCard(order: data[index]),
          ),
        );
      },
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    final total = order.totalItems;
    final done = order.completedItems;
    final ratio = total == 0 ? 0.0 : done / total;

    return SectionCard(
      onTap: () => context.push(Routes.orderDetail(order.id)),
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
                      order.displayCustomer,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      'Mã: ${order.displayCode}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12, color: AppColors.muted),
                    ),
                  ],
                ),
              ),
              StatusChip(
                label: ratio >= 1 ? 'Đủ tem' : '$done/$total',
                color: ratio >= 1 ? AppColors.success : AppColors.warning,
                dense: true,
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: ratio,
              minHeight: 6,
              backgroundColor: AppColors.border,
              valueColor: AlwaysStoppedAnimation(
                ratio >= 1 ? AppColors.success : AppColors.warning,
              ),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Text(
                '${order.products.length} sản phẩm · $total tem',
                style: const TextStyle(fontSize: 12, color: AppColors.muted),
              ),
              const Spacer(),
              Text(
                Fmt.money(order.totalPrice),
                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Danh sách miếng in + quét đổi trạng thái nhanh.
class _PrintItemsTab extends ConsumerStatefulWidget {
  const _PrintItemsTab();

  @override
  ConsumerState<_PrintItemsTab> createState() => _PrintItemsTabState();
}

class _PrintItemsTabState extends ConsumerState<_PrintItemsTab> {
  PrintItemStatus? _filter;

  /// Quét liên tục: mỗi mã hợp lệ được đẩy sang trạng thái kế tiếp
  /// (pending → printing → completed) đúng như tab Miếng in bản web.
  Future<String?> _handleScan(String code) async {
    final items = ref.read(printItemsProvider).valueOrNull ?? const [];
    PrintItem? target;
    for (final item in items) {
      if (item.id == code.trim()) target = item;
    }
    if (target == null) {
      throw Exception('Không tìm thấy miếng in mã ${code.trim()}');
    }

    final next = target.status.next;
    await ref
        .read(productionRepositoryProvider)
        .updatePrintItem(target.id, status: next);
    ref.read(printItemsProvider.notifier).patchLocal(target.id, next);
    return '${target.name} (${target.id}) → ${next.label}';
  }

  @override
  Widget build(BuildContext context) {
    final itemsAsync = ref.watch(printItemsProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => ScannerScreen(
                        title: 'Quét miếng in',
                        hint: 'Mỗi lần quét đẩy tem sang trạng thái kế tiếp',
                        continuous: true,
                        onCode: _handleScan,
                      ),
                    ),
                  ),
                  icon: const Icon(Icons.qr_code_scanner_rounded),
                  label: const Text('Quét cập nhật'),
                ),
              ),
              const SizedBox(width: 10),
              IconButton.filledTonal(
                tooltip: 'Tải lại danh sách miếng in',
                onPressed: () => ref.read(printItemsProvider.notifier).refresh(),
                icon: const Icon(Icons.refresh_rounded),
              ),
            ],
          ),
        ),
        SizedBox(
          height: 40,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            children: [
              _StatusFilterChip(
                label: 'Tất cả',
                selected: _filter == null,
                onTap: () => setState(() => _filter = null),
              ),
              for (final status in PrintItemStatus.values) ...[
                const SizedBox(width: 8),
                _StatusFilterChip(
                  label: status.label,
                  color: colorForPrintItem(status),
                  selected: _filter == status,
                  onTap: () => setState(() => _filter = status),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: AsyncView(
            value: itemsAsync,
            onRetry: () => ref.read(printItemsProvider.notifier).refresh(),
            builder: (data) {
              final items =
                  _filter == null ? data : data.where((i) => i.status == _filter).toList();
              if (items.isEmpty) {
                return const EmptyView(message: 'Không có miếng in nào.');
              }
              return ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, AppSize.listBottomInset),
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (context, index) {
                  final item = items[index];
                  return SectionCard(
                    onTap: () => showPrintItemSheet(context, item),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
                                style: const TextStyle(fontWeight: FontWeight.w700),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '${item.id} · ${item.productName ?? ''}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 12.5,
                                  color: AppColors.muted,
                                  fontFamily: 'monospace',
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
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

class _StatusFilterChip extends StatelessWidget {
  const _StatusFilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
    this.color = AppColors.indigo,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
      selectedColor: color.withValues(alpha: 0.2),
      side: BorderSide(color: selected ? color : AppColors.border),
      labelStyle: TextStyle(
        fontSize: 12.5,
        fontWeight: FontWeight.w600,
        color: selected ? color : null,
      ),
    );
  }
}
