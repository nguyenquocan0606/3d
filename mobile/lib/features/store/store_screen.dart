import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format/formatters.dart';
import '../../core/routes.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/store.dart';
import '../../data/providers.dart';
import '../scanner/scanner_screen.dart';
import 'store_image.dart';

enum StoreSort {
  recent('Mới cập nhật'),
  nameAsc('Tên A → Z'),
  lowStock('Tồn ít nhất'),
  highValue('Giá trị kho cao');

  const StoreSort(this.label);
  final String label;
}

/// Hàng hóa cửa hàng — bản di động tập trung vào **tra cứu và nhập/xuất kho**.
///
/// Tạo/sửa hàng hóa (kèm upload ảnh, file in vài chục MB) vẫn nên làm ở bản web:
/// API đồng bộ hiện là full-replace, gửi lại toàn bộ danh sách qua 4G là không nên.
class StoreScreen extends ConsumerStatefulWidget {
  const StoreScreen({super.key});

  @override
  ConsumerState<StoreScreen> createState() => _StoreScreenState();
}

class _StoreScreenState extends ConsumerState<StoreScreen> {
  String _query = '';
  String _category = 'Tất cả';
  bool _onlyLowStock = false;
  bool _hideCombo = true;
  StoreSort _sort = StoreSort.recent;

  List<StoreProduct> _apply(List<StoreProduct> source) {
    final query = _query.trim().toLowerCase();

    final result = source.where((product) {
      if (_hideCombo && product.isCombo) return false;
      if (_category != 'Tất cả' && product.danhMuc != _category) return false;
      if (_onlyLowStock && !product.isLowStock) return false;
      if (query.isNotEmpty && !product.searchText.contains(query)) return false;
      return true;
    }).toList();

    result.sort((a, b) => switch (_sort) {
          StoreSort.recent => b.ngayCapNhat.compareTo(a.ngayCapNhat),
          StoreSort.nameAsc => a.ten.toLowerCase().compareTo(b.ten.toLowerCase()),
          StoreSort.lowStock => a.soLuong.compareTo(b.soLuong),
          StoreSort.highValue => b.inventoryValue.compareTo(a.inventoryValue),
        });
    return result;
  }

  @override
  Widget build(BuildContext context) {
    final productsAsync = ref.watch(storeProductsProvider);
    final all = productsAsync.valueOrNull ?? const <StoreProduct>[];
    // Thống kê chỉ tính sản phẩm mẹ — combo dùng chung tồn kho vật lý với mẹ.
    final parents = all.where((p) => !p.isCombo).toList();
    final categories = <String>{'Tất cả', ...parents.map((p) => p.danhMuc)}.toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Hàng hóa cửa hàng'),
        actions: [
          IconButton(
            tooltip: 'Quét mã hàng hóa',
            onPressed: _scanProduct,
            icon: const Icon(Icons.qr_code_scanner_rounded),
          ),
        ],
      ),
      body: AsyncView(
        value: productsAsync,
        onRetry: () => ref.read(storeProvider.notifier).refresh(),
        builder: (data) {
          final visible = _apply(data);

          return RefreshIndicator(
            onRefresh: () => ref.read(storeProvider.notifier).refresh(),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                Row(
                  children: [
                    Expanded(
                      child: StatTile(
                        label: 'Mặt hàng',
                        value: Fmt.number(parents.length),
                        icon: Icons.category_rounded,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: StatTile(
                        label: 'Giá trị kho',
                        value: Fmt.money(
                          parents.fold<double>(0, (sum, p) => sum + p.inventoryValue),
                        ),
                        icon: Icons.payments_rounded,
                        color: AppColors.success,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                StatTile(
                  label: 'Sắp hết hàng',
                  value: Fmt.number(parents.where((p) => p.isLowStock).length),
                  icon: Icons.warning_amber_rounded,
                  color: AppColors.warning,
                  caption: _onlyLowStock
                      ? 'Đang lọc — chạm để bỏ lọc'
                      : 'Chạm để chỉ xem hàng sắp hết',
                  onTap: () => setState(() => _onlyLowStock = !_onlyLowStock),
                ),
                const SizedBox(height: 16),
                TextField(
                  onChanged: (value) => setState(() => _query = value),
                  decoration: const InputDecoration(
                    hintText: 'Tìm tên, mã, nhà cung cấp...',
                    prefixIcon: Icon(Icons.search_rounded),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    ActionChip(
                      avatar: const Icon(Icons.filter_list_rounded, size: 16),
                      label: Text(_category),
                      onPressed: () => _pickCategory(categories),
                    ),
                    ActionChip(
                      avatar: const Icon(Icons.sort_rounded, size: 16),
                      label: Text(_sort.label),
                      onPressed: _pickSort,
                    ),
                    FilterChip(
                      label: const Text('Ẩn combo'),
                      selected: _hideCombo,
                      onSelected: (value) => setState(() => _hideCombo = value),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                if (visible.isEmpty)
                  const EmptyView(message: 'Không có hàng hóa nào khớp bộ lọc.')
                else
                  for (final product in visible)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: StoreProductTile(product: product),
                    ),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _scanProduct() async {
    final code = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => const ScannerScreen(
          title: 'Quét mã hàng hóa',
          hint: 'Mã QR dán trên kệ hoặc trên sản phẩm',
        ),
      ),
    );
    if (code == null || !mounted) return;

    final products = ref.read(storeProvider).valueOrNull?.sanPham ?? const [];
    StoreProduct? found;
    for (final product in products) {
      if (product.maQR == code.trim() || product.id == code.trim()) found = product;
    }

    if (found == null) {
      showToast(context, 'Không tìm thấy hàng hóa mã $code.', isError: true);
      return;
    }
    if (mounted) context.push(Routes.storeDetail(found.id));
  }

  Future<void> _pickCategory(List<String> categories) async {
    final result = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            for (final category in categories)
              ListTile(
                title: Text(category),
                onTap: () => Navigator.pop(context, category),
              ),
          ],
        ),
      ),
    );
    if (result != null) setState(() => _category = result);
  }

  Future<void> _pickSort() async {
    final result = await showModalBottomSheet<StoreSort>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final sort in StoreSort.values)
              ListTile(
                title: Text(sort.label),
                onTap: () => Navigator.pop(context, sort),
              ),
          ],
        ),
      ),
    );
    if (result != null) setState(() => _sort = result);
  }
}

class StoreProductTile extends StatelessWidget {
  const StoreProductTile({super.key, required this.product});

  final StoreProduct product;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      onTap: () => context.push(Routes.storeDetail(product.id)),
      padding: const EdgeInsets.all(12),
      borderColor: product.isLowStock
          ? AppColors.warning.withValues(alpha: 0.4)
          : null,
      child: Row(
        children: [
          StoreThumbnail(dataUrl: product.anhDaiDien, size: 48),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        product.ten,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                    if (product.isCombo) ...[
                      const SizedBox(width: 6),
                      StatusChip(
                        label: 'Combo x${product.soLuongCombo}',
                        color: AppColors.indigoLight,
                        dense: true,
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  '${product.danhMuc} · ${product.maQR}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                Fmt.money(product.gia),
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
              ),
              const SizedBox(height: 3),
              Text(
                '${Fmt.number(product.soLuong)} ${product.donVi}',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: product.isLowStock ? AppColors.warning : AppColors.muted,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
