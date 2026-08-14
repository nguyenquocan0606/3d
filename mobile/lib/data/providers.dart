import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'models/bulk_order.dart';
import 'models/filament.dart';
import 'models/inventory.dart';
import 'models/location.dart';
import 'models/order.dart';
import 'models/printer.dart';
import 'models/store.dart';
import 'repositories/bulk_repository.dart';
import 'repositories/filament_repository.dart';
import 'repositories/inventory_repository.dart';
import 'repositories/location_repository.dart';
import 'repositories/printer_repository.dart';
import 'repositories/production_repository.dart';
import 'repositories/store_repository.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Nhựa & cuộn nhựa
// ─────────────────────────────────────────────────────────────────────────────

class FilamentsNotifier extends AsyncNotifier<List<Filament>> {
  @override
  Future<List<Filament>> build() =>
      ref.watch(filamentRepositoryProvider).fetchFilaments();

  Future<void> refresh() async {
    state = await AsyncValue.guard(
      () => ref.read(filamentRepositoryProvider).fetchFilaments(),
    );
  }
}

final filamentsProvider =
    AsyncNotifierProvider<FilamentsNotifier, List<Filament>>(FilamentsNotifier.new);

/// Danh sách cuộn nhựa đã làm phẳng + bổ sung tên kho/máy in.
///
/// Backend chưa có endpoint cuộn nhựa riêng nên phải ghép từ 3 nguồn; làm ở đây
/// một lần để mọi màn hình dùng chung.
final spoolsProvider = Provider<AsyncValue<List<Spool>>>((ref) {
  final filaments = ref.watch(filamentsProvider);
  final locations = ref.watch(locationsProvider).valueOrNull ?? const [];
  final printers = ref.watch(printersProvider).valueOrNull ?? const [];

  return filaments.whenData((list) {
    final locationNames = {for (final l in locations) l.id: l.name};
    final printerNames = {for (final p in printers) p.id: p.name};

    return list
        .expand((filament) => filament.spools)
        .map((spool) => spool.copyWith(
              locationName: spool.locationId == null
                  ? null
                  : locationNames[spool.locationId!],
              printerName:
                  spool.printerId == null ? null : printerNames[spool.printerId!],
            ))
        .toList();
  });
});

/// Tra nhanh 1 cuộn theo id (dùng cho màn chi tiết và luồng quét).
final spoolByIdProvider = Provider.family<Spool?, String>((ref, id) {
  final spools = ref.watch(spoolsProvider).valueOrNull ?? const [];
  for (final spool in spools) {
    if (spool.id == id) return spool;
  }
  return null;
});

final dashboardStatsProvider = FutureProvider<DashboardStats>(
  (ref) => ref.watch(filamentRepositoryProvider).fetchDashboardStats(),
);

// ─────────────────────────────────────────────────────────────────────────────
// Kho lưu trữ
// ─────────────────────────────────────────────────────────────────────────────

class LocationsNotifier extends AsyncNotifier<List<StorageLocation>> {
  @override
  Future<List<StorageLocation>> build() =>
      ref.watch(locationRepositoryProvider).fetchLocations();

  Future<void> refresh() async {
    state = await AsyncValue.guard(
      () => ref.read(locationRepositoryProvider).fetchLocations(),
    );
  }
}

final locationsProvider =
    AsyncNotifierProvider<LocationsNotifier, List<StorageLocation>>(
  LocationsNotifier.new,
);

// ─────────────────────────────────────────────────────────────────────────────
// Máy in
// ─────────────────────────────────────────────────────────────────────────────

class PrintersNotifier extends AsyncNotifier<List<Printer>> {
  @override
  Future<List<Printer>> build() => ref.watch(printerRepositoryProvider).fetchPrinters();

  Future<void> refresh() async {
    state = await AsyncValue.guard(
      () => ref.read(printerRepositoryProvider).fetchPrinters(),
    );
  }
}

final printersProvider =
    AsyncNotifierProvider<PrintersNotifier, List<Printer>>(PrintersNotifier.new);

/// Polling trạng thái máy in cloud.
///
/// Bản web poll 5s khi đang mở tab Máy in và 5 phút khi ở tab khác. Trên di động
/// pin quý hơn nên chỉ poll khi có màn hình đang `watch` provider này
/// (autoDispose) — rời màn là dừng.
final livePrinterStatusProvider =
    StreamProvider.autoDispose<Map<String, PrinterLiveStatus>>((ref) async* {
  final repo = ref.watch(printerRepositoryProvider);

  while (true) {
    try {
      yield await repo.fetchLiveStatuses();
    } catch (_) {
      // Máy in cloud là tùy chọn — lỗi ở đây không được làm hỏng cả màn hình.
      yield const {};
    }
    await Future<void>.delayed(const Duration(seconds: 5));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Sản xuất
// ─────────────────────────────────────────────────────────────────────────────

class OrdersNotifier extends AsyncNotifier<List<Order>> {
  @override
  Future<List<Order>> build() => ref.watch(productionRepositoryProvider).fetchOrders();

  Future<void> refresh() async {
    state = await AsyncValue.guard(
      () => ref.read(productionRepositoryProvider).fetchOrders(),
    );
  }
}

final ordersProvider =
    AsyncNotifierProvider<OrdersNotifier, List<Order>>(OrdersNotifier.new);

class PrintItemsNotifier extends AsyncNotifier<List<PrintItem>> {
  @override
  Future<List<PrintItem>> build() =>
      ref.watch(productionRepositoryProvider).fetchPrintItems();

  Future<void> refresh() async {
    state = await AsyncValue.guard(
      () => ref.read(productionRepositoryProvider).fetchPrintItems(),
    );
  }

  /// Cập nhật lạc quan để danh sách phản hồi ngay khi quét, không đợi round-trip.
  void patchLocal(String id, PrintItemStatus status) {
    final current = state.valueOrNull;
    if (current == null) return;
    state = AsyncValue.data([
      for (final item in current)
        if (item.id == id) item.copyWith(status: status) else item,
    ]);
  }
}

final printItemsProvider =
    AsyncNotifierProvider<PrintItemsNotifier, List<PrintItem>>(
  PrintItemsNotifier.new,
);

final peiSheetsProvider = FutureProvider<List<PeiSheet>>(
  (ref) => ref.watch(productionRepositoryProvider).fetchPeiSheets(),
);

/// Đơn sản xuất số lượng lớn (SLL). Backend trả kèm toàn bộ lượt in nên màn chi
/// tiết đọc thẳng từ đây, không cần gọi lại API.
class BulkOrdersNotifier extends AsyncNotifier<List<BulkOrder>> {
  @override
  Future<List<BulkOrder>> build() => ref.watch(bulkRepositoryProvider).fetchOrders();

  Future<void> refresh() async {
    state = await AsyncValue.guard(
      () => ref.read(bulkRepositoryProvider).fetchOrders(),
    );
  }
}

final bulkOrdersProvider =
    AsyncNotifierProvider<BulkOrdersNotifier, List<BulkOrder>>(
  BulkOrdersNotifier.new,
);

/// Tra 1 đơn SLL trong danh sách đã tải (màn chi tiết bám theo id).
final bulkOrderByIdProvider = Provider.family<BulkOrder?, String>((ref, id) {
  final orders = ref.watch(bulkOrdersProvider).valueOrNull ?? const [];
  for (final order in orders) {
    if (order.id == id) return order;
  }
  return null;
});

// ─────────────────────────────────────────────────────────────────────────────
// Kiểm kho & lệnh in
// ─────────────────────────────────────────────────────────────────────────────

class InventorySessionNotifier extends AsyncNotifier<InventorySession> {
  @override
  Future<InventorySession> build() =>
      ref.watch(inventoryRepositoryProvider).fetchActiveSession();

  Future<void> refresh() async {
    state = await AsyncValue.guard(
      () => ref.read(inventoryRepositoryProvider).fetchActiveSession(),
    );
  }

  Future<ScanResult> scan(String spoolId) async {
    final result = await ref.read(inventoryRepositoryProvider).scanSpool(spoolId);
    await refresh();
    return result;
  }

  Future<void> reset() async {
    state = await AsyncValue.guard(
      () => ref.read(inventoryRepositoryProvider).resetSession(),
    );
  }
}

final inventorySessionProvider =
    AsyncNotifierProvider<InventorySessionNotifier, InventorySession>(
  InventorySessionNotifier.new,
);

final printTasksProvider = FutureProvider<List<PrintTask>>(
  (ref) => ref.watch(inventoryRepositoryProvider).fetchTasks(),
);

// ─────────────────────────────────────────────────────────────────────────────
// Hàng hóa cửa hàng
// ─────────────────────────────────────────────────────────────────────────────

class StoreNotifier extends AsyncNotifier<StoreSnapshot> {
  /// Id các hàng hóa đã tải đủ ảnh/file gốc — quyết định có đính kèm `anh`/`tepIn`
  /// vào payload đồng bộ hay không (xem [StoreRepository.syncAll]).
  final Set<String> _idsWithImages = {};
  final Set<String> _idsWithFiles = {};

  @override
  Future<StoreSnapshot> build() => ref.watch(storeRepositoryProvider).fetchAll();

  Future<void> refresh() async {
    _idsWithImages.clear();
    _idsWithFiles.clear();
    state = await AsyncValue.guard(() => ref.read(storeRepositoryProvider).fetchAll());
  }

  Future<List<StoreAttachment>> loadImages(String productId) async {
    final snapshot = state.valueOrNull;
    final cached = snapshot?.sanPham
        .firstWhere((p) => p.id == productId, orElse: () => _empty)
        .anh;
    if (cached != null && cached.isNotEmpty && cached.every((a) => a.hasData)) {
      return cached;
    }

    final images = await ref.read(storeRepositoryProvider).fetchImages(productId);
    _idsWithImages.add(productId);
    _replaceProduct(productId, (product) => product.copyWith(anh: images));
    return images;
  }

  Future<List<StoreAttachment>> loadPrintFiles(String productId) async {
    final files = await ref.read(storeRepositoryProvider).fetchPrintFiles(productId);
    _idsWithFiles.add(productId);
    _replaceProduct(productId, (product) => product.copyWith(tepIn: files));
    return files;
  }

  /// Nhập / xuất / đặt lại tồn kho — ghi lịch sử bằng tiếng Việt giống bản web.
  ///
  /// Tồn kho combo con tính tự động từ sản phẩm mẹ nên không sửa trực tiếp được.
  Future<void> adjustStock(
    String productId, {
    required StockAction action,
    required int amount,
  }) async {
    final snapshot = state.valueOrNull;
    if (snapshot == null) return;

    final product = snapshot.sanPham.firstWhere((p) => p.id == productId);
    if (product.isCombo) {
      throw StateError(
        'Tồn kho combo tự tính từ sản phẩm mẹ — vào sản phẩm mẹ để nhập/xuất kho.',
      );
    }

    final newQuantity = switch (action) {
      StockAction.add => product.soLuong + amount,
      StockAction.subtract =>
        (product.soLuong - amount) < 0 ? 0 : product.soLuong - amount,
      StockAction.set => amount < 0 ? 0 : amount,
    };

    final note = switch (action) {
      StockAction.add => 'Nhập thêm $amount, tồn kho mới $newQuantity.',
      StockAction.subtract => 'Xuất/bán $amount, tồn kho mới $newQuantity.',
      StockAction.set => 'Đặt lại tồn kho thành $newQuantity.',
    };

    final now = DateTime.now().toUtc().toIso8601String();
    final updated = product.copyWith(
      soLuong: newQuantity,
      ngayCapNhat: now,
      lichSu: [
        StoreHistoryEntry(
          id: '${DateTime.now().microsecondsSinceEpoch}',
          thoiGian: now,
          noiDung: note,
        ),
        ...product.lichSu,
      ],
    );

    _replaceProduct(productId, (_) => updated);
    await _sync();
  }

  Future<void> _sync() async {
    final snapshot = state.valueOrNull;
    if (snapshot == null) return;
    await ref.read(storeRepositoryProvider).syncAll(
          products: snapshot.sanPham,
          fields: snapshot.truongRieng,
          idsWithImages: _idsWithImages,
          idsWithFiles: _idsWithFiles,
        );
  }

  void _replaceProduct(
    String productId,
    StoreProduct Function(StoreProduct product) transform,
  ) {
    final snapshot = state.valueOrNull;
    if (snapshot == null) return;
    state = AsyncValue.data(
      StoreSnapshot(
        sanPham: [
          for (final product in snapshot.sanPham)
            if (product.id == productId) transform(product) else product,
        ],
        truongRieng: snapshot.truongRieng,
      ),
    );
  }

  static const _empty = StoreProduct(
    id: '',
    maQR: '',
    ten: '',
    danhMuc: '',
    giaVon: 0,
    gia: 0,
    giaBanLe: 0,
    giaKhuyenMai: 0,
    soLuong: 0,
    donVi: '',
    nguongCanhBao: 0,
    nhaCungCap: '',
    ghiChu: '',
    thongTinRieng: {},
    ngayTao: '',
    ngayCapNhat: '',
  );
}

enum StockAction { add, subtract, set }

final storeProvider =
    AsyncNotifierProvider<StoreNotifier, StoreSnapshot>(StoreNotifier.new);

/// Hàng hóa với tồn kho combo đã tính lại "sống" từ sản phẩm mẹ.
final storeProductsProvider = Provider<AsyncValue<List<StoreProduct>>>((ref) {
  return ref.watch(storeProvider).whenData((snapshot) {
    final parents = {
      for (final p in snapshot.sanPham)
        if (!p.isCombo) p.id: p,
    };
    return snapshot.sanPham.map((product) {
      if (!product.isCombo) return product;
      final parent = parents[product.parentId];
      if (parent == null) return product;
      final quantity = parent.soLuong ~/ product.soLuongCombo!;
      return product.copyWith(soLuong: quantity < 0 ? 0 : quantity);
    }).toList();
  });
});

/// Tải lại toàn bộ dữ liệu nền — dùng cho pull-to-refresh ở các màn hình chính.
Future<void> refreshCoreData(WidgetRef ref) async {
  await Future.wait([
    ref.read(filamentsProvider.notifier).refresh(),
    ref.read(locationsProvider.notifier).refresh(),
    ref.read(printersProvider.notifier).refresh(),
  ]);
  ref.invalidate(dashboardStatsProvider);
}
