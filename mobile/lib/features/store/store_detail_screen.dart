import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/format/formatters.dart';
import '../../core/format/pricing.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/store.dart';
import '../../data/providers.dart';
import 'store_image.dart';

class StoreDetailScreen extends ConsumerStatefulWidget {
  const StoreDetailScreen({super.key, required this.productId});

  final String productId;

  @override
  ConsumerState<StoreDetailScreen> createState() => _StoreDetailScreenState();
}

class _StoreDetailScreenState extends ConsumerState<StoreDetailScreen> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final products = ref.watch(storeProductsProvider).valueOrNull ?? const [];
    final fields = ref.watch(storeProvider).valueOrNull?.truongRieng ?? const [];

    StoreProduct? product;
    for (final item in products) {
      if (item.id == widget.productId) product = item;
    }

    if (product == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Hàng hóa')),
        body: const EmptyView(message: 'Không tìm thấy hàng hóa này.'),
      );
    }

    final combos = products.where((p) => p.parentId == product!.id).toList()
      ..sort((a, b) => (a.soLuongCombo ?? 0).compareTo(b.soLuongCombo ?? 0));

    return Scaffold(
      appBar: AppBar(title: Text(product.ten)),
      body: DefaultTabController(
        length: 3,
        child: Column(
          children: [
            const TabBar(
              tabs: [
                Tab(text: 'Thông tin'),
                Tab(text: 'Ảnh'),
                Tab(text: 'Lịch sử'),
              ],
            ),
            Expanded(
              child: TabBarView(
                children: [
                  _InfoTab(
                    product: product,
                    combos: combos,
                    fields: fields,
                    busy: _busy,
                    onAdjust: _adjustStock,
                  ),
                  _ImagesTab(product: product),
                  _HistoryTab(product: product),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Nhập / xuất / đặt lại tồn kho.
  ///
  /// Mỗi thao tác đẩy **toàn bộ** danh sách hàng hóa lên server (API hiện là
  /// full-replace), nên chặn thao tác chồng nhau bằng cờ [_busy].
  Future<void> _adjustStock(StockAction action, int amount) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(storeProvider.notifier)
          .adjustStock(widget.productId, action: action, amount: amount);
      if (mounted) {
        HapticFeedback.selectionClick();
        showToast(context, 'Đã cập nhật tồn kho.');
      }
    } catch (error) {
      if (mounted) showToast(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _InfoTab extends StatelessWidget {
  const _InfoTab({
    required this.product,
    required this.combos,
    required this.fields,
    required this.busy,
    required this.onAdjust,
  });

  final StoreProduct product;
  final List<StoreProduct> combos;
  final List<StoreField> fields;
  final bool busy;
  final void Function(StockAction action, int amount) onAdjust;

  @override
  Widget build(BuildContext context) {
    // Giá trên server luôn được tính lại từ giá vốn. Nếu lệch nghĩa là bản ghi này
    // còn là dữ liệu cũ (từ trước khi có công thức) — vào bản web bấm
    // "Chuyển giá cũ → giá vốn" để chuẩn hóa.
    final expected = tinhToanBoGia(product.giaVon);
    final priceOutOfSync = product.giaVon > 0 && product.gia != expected.gia;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        SectionCard(
          child: Column(
            children: [
              Row(
                children: [
                  StoreThumbnail(dataUrl: product.anhDaiDien, size: 60),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          product.ten,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          product.danhMuc,
                          style: const TextStyle(color: AppColors.muted, fontSize: 12.5),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Text(
                    Fmt.number(product.soLuong),
                    style: TextStyle(
                      fontSize: 40,
                      fontWeight: FontWeight.w800,
                      color: product.isLowStock ? AppColors.warning : AppColors.success,
                    ),
                  ),
                  Text(
                    ' ${product.donVi}',
                    style: const TextStyle(color: AppColors.muted, fontSize: 15),
                  ),
                  const Spacer(),
                  if (product.isLowStock)
                    const StatusChip(
                      label: 'Sắp hết',
                      color: AppColors.warning,
                      icon: Icons.warning_amber_rounded,
                    ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        if (product.isCombo)
          const SectionCard(
            child: Row(
              children: [
                Icon(Icons.info_outline_rounded, color: AppColors.muted, size: 20),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Đây là sản phẩm combo. Tồn kho và giá vốn tự tính từ sản phẩm mẹ — '
                    'muốn nhập/xuất kho hãy mở sản phẩm mẹ.',
                    style: TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.4),
                  ),
                ),
              ],
            ),
          )
        else
          _StockActions(busy: busy, unit: product.donVi, onAdjust: onAdjust),
        const SizedBox(height: 18),
        SectionCard(
          child: Column(
            children: [
              InfoRow(label: 'Giá vốn', value: Fmt.money(product.giaVon)),
              InfoRow(
                label: 'Giá bán sàn',
                value: Fmt.money(product.gia),
                valueColor: AppColors.success,
              ),
              InfoRow(label: 'Giá bán lẻ', value: Fmt.money(product.giaBanLe)),
              InfoRow(label: 'Giá niêm yết (KM 25%)', value: Fmt.money(product.giaKhuyenMai)),
              if (priceOutOfSync)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Row(
                    children: [
                      const Icon(Icons.warning_amber_rounded,
                          size: 15, color: AppColors.warning),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'Giá bán đang lệch công thức (đúng phải là '
                          '${Fmt.money(expected.gia)}). Mở bản web để chuẩn hóa giá vốn.',
                          style: const TextStyle(
                            fontSize: 12.5,
                            color: AppColors.warning,
                            height: 1.35,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              const Divider(height: 20),
              InfoRow(label: 'Mã QR', value: product.maQR),
              InfoRow(label: 'Ngưỡng cảnh báo', value: '${product.nguongCanhBao}'),
              InfoRow(
                label: 'Nhà cung cấp',
                value: product.nhaCungCap.isEmpty ? '—' : product.nhaCungCap,
              ),
              InfoRow(label: 'Giá trị tồn', value: Fmt.money(product.inventoryValue)),
              for (final field in fields)
                InfoRow(
                  label: field.ten,
                  value: product.thongTinRieng[field.id]?.trim().isNotEmpty == true
                      ? product.thongTinRieng[field.id]!
                      : '—',
                ),
              if (product.ghiChu.isNotEmpty) ...[
                const Divider(height: 20),
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    product.ghiChu,
                    style: const TextStyle(fontSize: 13, height: 1.4),
                  ),
                ),
              ],
            ],
          ),
        ),
        if (combos.isNotEmpty) ...[
          const SizedBox(height: 18),
          const Text(
            'Sản phẩm combo',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
          ),
          const SizedBox(height: 10),
          SectionCard(
            child: Column(
              children: [
                for (final combo in combos)
                  InfoRow(
                    label: '${combo.maQR} (gộp ${combo.soLuongCombo})',
                    value: '${Fmt.number(combo.soLuong)} bộ · ${Fmt.money(combo.gia)}',
                  ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 18),
        Center(
          child: SectionCard(
            padding: const EdgeInsets.all(18),
            child: Column(
              children: [
                QrImageView(
                  data: product.maQR,
                  size: 170,
                  backgroundColor: Colors.white,
                  padding: const EdgeInsets.all(10),
                ),
                const SizedBox(height: 10),
                Text(
                  product.maQR,
                  style: const TextStyle(
                    fontFamily: 'monospace',
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _StockActions extends StatefulWidget {
  const _StockActions({
    required this.busy,
    required this.unit,
    required this.onAdjust,
  });

  final bool busy;
  final String unit;
  final void Function(StockAction action, int amount) onAdjust;

  @override
  State<_StockActions> createState() => _StockActionsState();
}

class _StockActionsState extends State<_StockActions> {
  final _controller = TextEditingController(text: '1');

  int get _amount => int.tryParse(_controller.text.trim()) ?? 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _run(StockAction action) {
    if (_amount <= 0 && action != StockAction.set) {
      showToast(context, 'Nhập số lượng lớn hơn 0.', isError: true);
      return;
    }
    widget.onAdjust(action, _amount);
  }

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Nhập / xuất kho', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          Row(
            children: [
              IconButton.filledTonal(
                tooltip: 'Giảm số lượng',
                onPressed: widget.busy
                    ? null
                    : () => setState(() {
                          final next = (_amount - 1).clamp(0, 999999);
                          _controller.text = '$next';
                        }),
                icon: const Icon(Icons.remove_rounded),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _controller,
                  keyboardType: TextInputType.number,
                  textAlign: TextAlign.center,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                  decoration: InputDecoration(suffixText: widget.unit, isDense: true),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filledTonal(
                tooltip: 'Tăng số lượng',
                onPressed: widget.busy
                    ? null
                    : () => setState(() => _controller.text = '${_amount + 1}'),
                icon: const Icon(Icons.add_rounded),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: widget.busy ? null : () => _run(StockAction.add),
                  icon: const Icon(Icons.download_rounded, size: 18),
                  label: const Text('Nhập'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(backgroundColor: AppColors.warning),
                  onPressed: widget.busy ? null : () => _run(StockAction.subtract),
                  icon: const Icon(Icons.upload_rounded, size: 18),
                  label: const Text('Xuất'),
                ),
              ),
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: widget.busy ? null : () => _run(StockAction.set),
                child: const Text('Đặt'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ImagesTab extends ConsumerStatefulWidget {
  const _ImagesTab({required this.product});

  final StoreProduct product;

  @override
  ConsumerState<_ImagesTab> createState() => _ImagesTabState();
}

class _ImagesTabState extends ConsumerState<_ImagesTab> {
  late Future<List<StoreAttachment>> _future =
      ref.read(storeProvider.notifier).loadImages(widget.product.id);

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<StoreAttachment>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return ErrorView(
            message: '${snapshot.error}',
            onRetry: () => setState(
              () => _future =
                  ref.read(storeProvider.notifier).loadImages(widget.product.id),
            ),
          );
        }

        final images = snapshot.data ?? const [];
        if (images.isEmpty) {
          return const EmptyView(
            message: 'Hàng hóa này chưa có ảnh.\nThêm ảnh ở bản web.',
            icon: Icons.image_outlined,
          );
        }

        return GridView.builder(
          padding: const EdgeInsets.all(16),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
          ),
          itemCount: images.length,
          itemBuilder: (context, index) {
            final image = images[index];
            final bytes = decodeDataUrl(image.duLieu);
            return InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => StoreImageViewer(
                    dataUrl: image.duLieu,
                    title: image.ten,
                  ),
                ),
              ),
              child: Container(
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.border),
                ),
                child: bytes == null
                    ? const Center(child: Icon(Icons.broken_image_outlined))
                    : Image.memory(bytes, fit: BoxFit.cover),
              ),
            );
          },
        );
      },
    );
  }
}

class _HistoryTab extends StatelessWidget {
  const _HistoryTab({required this.product});

  final StoreProduct product;

  @override
  Widget build(BuildContext context) {
    if (product.lichSu.isEmpty) {
      return const EmptyView(
        message: 'Chưa có lịch sử kho.',
        icon: Icons.history_rounded,
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: product.lichSu.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        final entry = product.lichSu[index];
        return SectionCard(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(entry.noiDung, style: const TextStyle(fontSize: 13.5)),
              const SizedBox(height: 4),
              Text(
                Fmt.dateTime(entry.time),
                style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
              ),
            ],
          ),
        );
      },
    );
  }
}
