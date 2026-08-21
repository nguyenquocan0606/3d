import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/scan/code_normalizer.dart';
import '../../core/scan/pda_scan.dart';
import '../../core/scan/scan_router.dart';
import '../../core/widgets/common.dart';
import '../../data/models/eshop_order.dart';
import '../../data/models/store.dart';
import '../../data/providers.dart';
import '../../data/repositories/eshop_repository.dart';

class EshopOrderDetailScreen extends ConsumerStatefulWidget {
  const EshopOrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  ConsumerState<EshopOrderDetailScreen> createState() =>
      _EshopOrderDetailScreenState();
}

class _EshopOrderDetailScreenState
    extends ConsumerState<EshopOrderDetailScreen> {
  bool _isSaving = false;

  /// Màn này mở ra từ mã quét, mà mã trên thùng hàng là **mã vận đơn của đơn vị
  /// vận chuyển** chứ không phải uuid đơn — nên phải dò cả 4 mã, không chỉ [id].
  /// So khớp theo dạng đã bỏ gạch nối giống lúc quét (`CodeNormalizer`).
  EshopOrder? _findOrder(List<EshopOrder> orders) {
    final wanted = CodeNormalizer.normalize(widget.orderId);
    for (final o in orders) {
      final codes = [o.id, o.deliveryCode, o.ecomOrderNo, o.refNo];
      for (final code in codes) {
        if (code != null && CodeNormalizer.normalize(code) == wanted) return o;
      }
    }
    return null;
  }

  EshopOrder? _getOrder() =>
      _findOrder(ref.read(eshopOrdersProvider).valueOrNull ?? const []);

  Future<String?> _handleScan(String code) async {
    final scanned = ref.read(codeNormalizerProvider).classify(code);
    if (scanned.kind != ScanKind.storeProduct || scanned.id == null) {
      throw ScanFailure('Vui lòng quét mã sản phẩm (Mã QR hàng hóa).');
    }

    final order = _getOrder();
    if (order == null) return null;

    if (order.pickStatus == 'picked') {
      throw ScanFailure('Đơn này đã nhặt xong!');
    }

    // Resolve scanned product and its parent if it's a child combo
    final storeSnapshot = ref.read(storeProvider).valueOrNull;
    if (storeSnapshot == null) return null;

    StoreProduct? scannedProduct;
    for (final p in storeSnapshot.sanPham) {
      if (p.id == scanned.id) {
        scannedProduct = p;
        break;
      }
    }

    if (scannedProduct == null) {
      throw ScanFailure('Không tìm thấy sản phẩm ${scanned.id} trong CSDL.');
    }

    // Find if any item in the order needs this physical product.
    // An item needs this physical product if:
    // 1. The item's skuCode == scannedProduct.maQR
    // 2. The item's skuCode == someComboProduct.maQR AND someComboProduct.parentId == scannedProduct.id
    // Wait, the physical product scanned usually is the base product (Sản phẩm mẹ).
    // So scannedProduct.maQR might be the base SKU.
    // In EshopOrderItem, the skuCode could be the base SKU or combo SKU (e.g. SP-A-5).
    // We need to resolve what base product an order item requires.

    final targetItems = <EshopOrderItem>[];
    for (final item in order.items) {
      if (item.skuCode == null) continue;

      // Find the store product for this order item
      StoreProduct? itemProduct;
      for (final p in storeSnapshot.sanPham) {
        if (p.maQR == item.skuCode) {
          itemProduct = p;
          break;
        }
      }

      if (itemProduct == null) continue;

      // If the scanned product is exactly the item product OR
      // the scanned product is the parent of the item product
      if (scannedProduct.id == itemProduct.id ||
          scannedProduct.id == itemProduct.parentId) {
        targetItems.add(item);
      }
    }

    if (targetItems.isEmpty) {
      throw ScanFailure('Sản phẩm ${scannedProduct.ten} không có trong đơn này.');
    }

    // Determine which item to increment. 
    // We increment the first one that is not fully picked yet.
    EshopOrderItem? itemToPick;
    for (final item in targetItems) {
      final requiredQty = _getRequiredPhysicalQty(item, storeSnapshot.sanPham);
      final pickedQty = order.pickedItems[item.skuCode] ?? 0;
      if (pickedQty < requiredQty) {
        itemToPick = item;
        break;
      }
    }

    if (itemToPick == null) {
      throw ScanFailure('Sản phẩm ${scannedProduct.ten} đã nhặt đủ số lượng!');
    }

    // Increment
    final newPickedItems = Map<String, int>.from(order.pickedItems);
    newPickedItems[itemToPick.skuCode!] = (newPickedItems[itemToPick.skuCode!] ?? 0) + 1;

    // Check if fully picked
    bool allPicked = true;
    for (final item in order.items) {
      if (item.skuCode == null) continue;
      final req = _getRequiredPhysicalQty(item, storeSnapshot.sanPham);
      final pck = newPickedItems[item.skuCode] ?? 0;
      if (pck < req) {
        allPicked = false;
      }
    }

    final newStatus = allPicked ? 'picked' : 'picking';

    await _saveProgress(order.id, newStatus, newPickedItems);
    final picked = newPickedItems[itemToPick.skuCode] ?? 0;
    final required = _getRequiredPhysicalQty(itemToPick, storeSnapshot.sanPham);
    return allPicked
        ? 'Đã nhặt xong đơn này.'
        : '${scannedProduct.ten}: $picked/$required';
  }

  int _getRequiredPhysicalQty(EshopOrderItem item, List<StoreProduct> allProducts) {
    if (item.skuCode == null) return 0;
    StoreProduct? p;
    for (final prod in allProducts) {
      if (prod.maQR == item.skuCode) {
        p = prod;
        break;
      }
    }
    if (p == null) return item.quantity.toInt();

    final multiplier = p.soLuongCombo != null && p.soLuongCombo! > 0 ? p.soLuongCombo! : 1;
    return item.quantity.toInt() * multiplier;
  }

  Future<void> _saveProgress(String orderId, String status, Map<String, int> pickedItems) async {
    setState(() => _isSaving = true);
    try {
      ref.read(eshopOrdersProvider.notifier).updateLocalPickProgress(orderId, status, pickedItems);
      await ref.read(eshopRepositoryProvider).updatePickProgress(orderId, status, pickedItems);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Lỗi cập nhật: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  void _reload() {
    ref.read(eshopOrdersProvider.notifier).refresh();
    ref.read(storeProvider.notifier).refresh();
  }

  @override
  Widget build(BuildContext context) {
    final ordersAsync = ref.watch(eshopOrdersProvider);
    final storeAsync = ref.watch(storeProvider);

    // Không để màn xoay vòng vĩnh viễn: tải lỗi hay không tìm thấy đơn đều phải
    // nói ra, vì người quét đang đứng cạnh kệ chờ biết nhặt gì.
    final error = ordersAsync.error ?? storeAsync.error;
    if (error != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Đơn sàn')),
        body: ErrorView(message: '$error', onRetry: _reload),
      );
    }

    final orders = ordersAsync.valueOrNull;
    final storeSnapshot = storeAsync.valueOrNull;
    if (orders == null || storeSnapshot == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final order = _findOrder(orders);
    if (order == null) {
      return Scaffold(
        appBar: AppBar(title: Text(widget.orderId)),
        body: ErrorView(
          message: 'Không tìm thấy đơn sàn nào có mã "${widget.orderId}".\n'
              'Đơn có thể đã giao xong hoặc chưa đồng bộ về máy.',
          onRetry: _reload,
        ),
      );
    }

    return PdaScanScope(
      onCode: _handleScan,
      child: Scaffold(
        appBar: AppBar(
          title: Text(order.deliveryCode ?? order.refNo ?? order.id),
        ),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_isSaving) const LinearProgressIndicator(),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Khách hàng: ${order.customerName ?? "Không rõ"}'),
                    Text('Mã sàn: ${order.ecomOrderNo ?? "-"}'),
                    Text('Vận đơn: ${order.deliveryCode ?? "-"}'),
                    Text('Trạng thái nhặt: ${_statusText(order.pickStatus)}',
                        style: TextStyle(
                          color: order.pickStatus == 'picked' ? Colors.green : Colors.orange,
                          fontWeight: FontWeight.bold,
                        )),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text('Danh sách cần nhặt', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            ...order.items.map((item) {
              final req = _getRequiredPhysicalQty(item, storeSnapshot.sanPham);
              final pck = order.pickedItems[item.skuCode] ?? 0;
              final isDone = pck >= req;
              
              StoreProduct? itemProduct;
              for (final p in storeSnapshot.sanPham) {
                if (p.maQR == item.skuCode) {
                  itemProduct = p;
                  break;
                }
              }

              return ListTile(
                title: Text(item.itemName),
                subtitle: Text(
                    'SKU: ${item.skuCode ?? "Trống"}\nSố lượng đặt: ${item.quantity.toInt()}'),
                trailing: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      '$pck / $req',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: isDone ? Colors.green : null,
                      ),
                    ),
                    if (itemProduct?.isCombo == true)
                      Text('(Combo x${itemProduct!.soLuongCombo})',
                          style: const TextStyle(fontSize: 12)),
                  ],
                ),
                tileColor: isDone ? Colors.green.withValues(alpha: 0.1) : null,
              );
            }),
          ],
        ),
      ),
    );
  }

  String _statusText(String status) {
    switch (status) {
      case 'picking':
        return 'Đang nhặt';
      case 'picked':
        return 'Đã nhặt xong';
      default:
        return 'Chưa nhặt';
    }
  }
}
