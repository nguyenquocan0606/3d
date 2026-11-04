import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'models/bulk_order.dart';
import 'models/dashboard.dart';
import 'models/filament.dart';
import 'models/inventory.dart';
import 'models/location.dart';
import 'models/order.dart';
import 'models/eshop_order.dart';
import 'models/facebook.dart';
import 'models/printer.dart';
import 'models/printer_event.dart';
import 'models/store.dart';
import 'repositories/bulk_repository.dart';
import 'repositories/dashboard_repository.dart';
import 'repositories/facebook_repository.dart';
import 'repositories/filament_repository.dart';
import 'repositories/inventory_repository.dart';
import 'repositories/location_repository.dart';
import 'repositories/notify_repository.dart';
import 'repositories/printer_repository.dart';
import 'repositories/production_repository.dart';
import 'repositories/eshop_repository.dart';
import 'repositories/store_repository.dart';
import 'sync/sync_service.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Nhựa & cuộn nhựa
// ─────────────────────────────────────────────────────────────────────────────

class FilamentsNotifier extends AsyncNotifier<List<Filament>> {
  @override
  Future<List<Filament>> build() {
    // Đọc lại mỗi khi worker kéo về thay đổi mới. Không có dòng này thì worker
    // ghi vào SQLite xong màn hình vẫn hiện dữ liệu cũ cho tới khi người dùng tự
    // kéo làm mới — đúng cái làm cho đồng bộ trông như không chạy.
    ref.watch(syncProvider.select((s) => s.phienBanDuLieu));
    return ref.watch(filamentRepositoryProvider).fetchFilaments();
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(
      () => ref.read(filamentRepositoryProvider).fetchFilaments(),
    );
  }
}

final filamentsProvider =
    AsyncNotifierProvider<FilamentsNotifier, List<Filament>>(
        FilamentsNotifier.new);

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
              printerName: spool.printerId == null
                  ? null
                  : printerNames[spool.printerId!],
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
  Future<List<StorageLocation>> build() {
    // Đọc lại khi worker kéo về thay đổi — giống FilamentsNotifier.
    ref.watch(syncProvider.select((s) => s.phienBanDuLieu));
    return ref.watch(locationRepositoryProvider).fetchLocations();
  }

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
  Future<List<Printer>> build() {
    ref.watch(syncProvider.select((s) => s.phienBanDuLieu));
    return ref.watch(printerRepositoryProvider).fetchPrinters();
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(
      () => ref.read(printerRepositoryProvider).fetchPrinters(),
    );
  }
}

final printersProvider = AsyncNotifierProvider<PrintersNotifier, List<Printer>>(
    PrintersNotifier.new);

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

/// Nhật ký hoạt động máy in do máy chủ ghi (nguồn của thông báo đẩy).
///
/// `autoDispose` + đọc lại mỗi lần mở màn: danh sách này thay đổi liên tục ở nền nên cache dài
/// chỉ tổ hiện dữ liệu cũ. Tham số là printerId, null = mọi máy.
final printerEventsProvider =
    FutureProvider.autoDispose.family<List<PrinterEvent>, String?>(
  (ref, printerId) =>
      ref.watch(notifyRepositoryProvider).fetchSuKien(printerId: printerId),
);

// ─────────────────────────────────────────────────────────────────────────────
// Khách Facebook
// ─────────────────────────────────────────────────────────────────────────────

/// Danh sách bài theo bộ lọc. Dữ liệu chỉ có trên máy chủ (không vào SQLite) vì agent gửi bài về
/// liên tục, và mọi thao tác trên bài đều cần mạng để agent nhận việc.
class KhachFacebookNotifier
    extends AutoDisposeFamilyAsyncNotifier<DuLieuKhach, LocKhach> {
  /// Đổi bộ lọc là provider cũ bị huỷ trong khi lượt tải có thể còn đang chạy.
  bool _conDung = false;

  @override
  Future<DuLieuKhach> build(LocKhach arg) {
    _conDung = true;
    ref.onDispose(() => _conDung = false);
    return ref.watch(facebookRepositoryProvider).fetchKhach(arg.khoa);
  }

  /// Tải lại ngầm: rớt mạng một nhịp thì giữ nguyên danh sách đang xem thay vì bật màn lỗi.
  Future<void> taiLai() async {
    final repo = ref.read(facebookRepositoryProvider);
    try {
      final moi = await repo.fetchKhach(arg.khoa);
      if (_conDung) state = AsyncData(moi);
    } catch (error, stack) {
      if (_conDung && !state.hasValue) state = AsyncError(error, stack);
    }
  }

  /// Sửa ngay trên màn hình một bài (nhãn "chờ agent", "đã mở link"…), không đợi lượt tải lại.
  void suaBai(String id, Map<String, dynamic> thayDoi) {
    final dl = state.valueOrNull;
    if (dl == null) return;
    state = AsyncData(dl.voi(bai: [
      for (final b in dl.bai) b.id == id ? b.voi(thayDoi) : b,
    ]));
  }

  /// Gỡ ngay khỏi danh sách cho nhanh tay; lỗi thì lượt tải lại đưa bài về chỗ cũ.
  void boBai(String id) {
    final dl = state.valueOrNull;
    if (dl == null) return;
    state = AsyncData(dl.voi(bai: dl.bai.where((b) => b.id != id).toList()));
  }

  void suaLenhAgent(String ten, String lenh) {
    final dl = state.valueOrNull;
    if (dl == null) return;
    state = AsyncData(dl.voi(agent: [
      for (final a in dl.agent) a.ten == ten ? a.voiLenh(lenh) : a,
    ]));
  }
}

final khachFacebookProvider = AsyncNotifierProvider.autoDispose
    .family<KhachFacebookNotifier, DuLieuKhach, LocKhach>(
  KhachFacebookNotifier.new,
);

/// Số khách mới + agent, cho nút ở màn Tổng quan — không kéo cả trăm bài chỉ để hiện một con số.
final demKhachFacebookProvider = FutureProvider.autoDispose<DuLieuKhach>(
  (ref) => ref.watch(facebookRepositoryProvider).fetchDem(),
);

final nhomFacebookProvider = FutureProvider.autoDispose<List<NhomFacebook>>(
  (ref) => ref.watch(facebookRepositoryProvider).fetchNhom(),
);

/// Phần cài đặt app cần đọc (mẫu bình luận, mẫu tin nhắn…). Sửa cài đặt vẫn làm trên web.
final caiDatFacebookProvider = FutureProvider.autoDispose<CaiDatFacebook>(
  (ref) => ref.watch(facebookRepositoryProvider).fetchCaiDat(),
);

// ─────────────────────────────────────────────────────────────────────────────
// Sản xuất
// ─────────────────────────────────────────────────────────────────────────────

class OrdersNotifier extends AsyncNotifier<List<Order>> {
  @override
  Future<List<Order>> build() {
    ref.watch(syncProvider.select((s) => s.phienBanDuLieu));
    return ref.watch(productionRepositoryProvider).fetchOrders();
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(
      () => ref.read(productionRepositoryProvider).fetchOrders(),
    );
  }
}

final ordersProvider =
    AsyncNotifierProvider<OrdersNotifier, List<Order>>(OrdersNotifier.new);

class EshopOrdersNotifier extends AsyncNotifier<List<EshopOrder>> {
  @override
  Future<List<EshopOrder>> build() =>
      ref.watch(eshopRepositoryProvider).fetchOrders();

  Future<void> refresh() async {
    state = await AsyncValue.guard(
      () => ref.read(eshopRepositoryProvider).fetchOrders(),
    );
  }

  void updateLocalPickProgress(
      String orderId, String status, Map<String, int> pickedItems) {
    final current = state.valueOrNull;
    if (current == null) return;

    state = AsyncValue.data([
      for (final order in current)
        if (order.id == orderId)
          EshopOrder(
            id: order.id,
            refNo: order.refNo,
            ecomOrderNo: order.ecomOrderNo,
            channelName: order.channelName,
            customerName: order.customerName,
            partnerOrderStatus: order.partnerOrderStatus,
            deliveryCode: order.deliveryCode,
            pickStatus: status,
            pickedItems: pickedItems,
            items: order.items,
          )
        else
          order,
    ]);
  }
}

final eshopOrdersProvider =
    AsyncNotifierProvider<EshopOrdersNotifier, List<EshopOrder>>(
        EshopOrdersNotifier.new);

class PrintItemsNotifier extends AsyncNotifier<List<PrintItem>> {
  @override
  Future<List<PrintItem>> build() {
    ref.watch(syncProvider.select((s) => s.phienBanDuLieu));
    return ref.watch(productionRepositoryProvider).fetchPrintItems();
  }

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

class PeiSheetsNotifier extends AsyncNotifier<List<PeiSheet>> {
  @override
  Future<List<PeiSheet>> build() {
    ref.watch(syncProvider.select((s) => s.phienBanDuLieu));
    return ref.watch(productionRepositoryProvider).fetchPeiSheets();
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(
      () => ref.read(productionRepositoryProvider).fetchPeiSheets(),
    );
  }
}

final peiSheetsProvider =
    AsyncNotifierProvider<PeiSheetsNotifier, List<PeiSheet>>(
        PeiSheetsNotifier.new);

/// Đơn sản xuất số lượng lớn (SLL). Backend trả kèm toàn bộ lượt in nên màn chi
/// tiết đọc thẳng từ đây, không cần gọi lại API.
class BulkOrdersNotifier extends AsyncNotifier<List<BulkOrder>> {
  @override
  Future<List<BulkOrder>> build() {
    ref.watch(syncProvider.select((s) => s.phienBanDuLieu));
    return ref.watch(bulkRepositoryProvider).fetchOrders();
  }

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
    // Giữ dữ liệu cũ nếu mất mạng — không để màn hình trắng chỉ vì offline.
    final result = await AsyncValue.guard(
      () => ref.read(inventoryRepositoryProvider).fetchActiveSession(),
    );
    // Chỉ cập nhật state khi có dữ liệu mới hoặc state hiện tại đang lỗi.
    if (result is! AsyncError || state is AsyncError || state is AsyncLoading) {
      state = result;
    }
  }

  Future<ScanResult> scan(String spoolId) async {
    final result =
        await ref.read(inventoryRepositoryProvider).scanSpool(spoolId);

    // Cập nhật lạc quan ngay tại máy. Luồng quét kiểm kho đi qua outbox offline,
    // nên nếu gọi refresh() ngay thì có thể kéo phiên cũ từ server về trước khi
    // outbox kịp đẩy lên, làm số đếm đứng im tới vòng polling kế tiếp.
    final current = state.valueOrNull;
    if (current != null && !current.scannedMap.containsKey(result.spoolId)) {
      state = AsyncValue.data(
        InventorySession(
          id: current.id,
          active: current.active,
          items: [
            InventoryItem(
              id: 'local-${result.spoolId}-${DateTime.now().microsecondsSinceEpoch}',
              spoolId: result.spoolId,
              scannedAt: DateTime.now(),
            ),
            ...current.items,
          ],
        ),
      );
    }

    unawaited(ref.read(syncProvider.notifier).dongBo());
    return result;
  }

  /// Hoàn tác lượt quét gần nhất — quét nhầm cuộn bên cạnh là chuyện thường khi
  /// đứng sát kệ. Ai là "gần nhất" do backend quyết theo `scannedAt` để không lệch
  /// khi có người khác cùng kiểm trên máy khác. Bắt buộc có mạng (Nhóm B §2.2).
  Future<ScanResult> undoLastScan() async {
    final result = await ref.read(inventoryRepositoryProvider).unscanSpool();
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
  Future<StoreSnapshot> build() {
    ref.watch(syncProvider.select((s) => s.phienBanDuLieu));
    return ref.watch(storeRepositoryProvider).fetchAll();
  }

  Future<void> refresh() async {
    _idsWithImages.clear();
    _idsWithFiles.clear();
    state = await AsyncValue.guard(
        () => ref.read(storeRepositoryProvider).fetchAll());
  }

  Future<List<StoreAttachment>> loadImages(String productId) async {
    final snapshot = state.valueOrNull;
    final cached = snapshot?.sanPham
        .firstWhere((p) => p.id == productId, orElse: () => _empty)
        .anh;
    if (cached != null && cached.isNotEmpty && cached.every((a) => a.hasData)) {
      return cached;
    }

    final images =
        await ref.read(storeRepositoryProvider).fetchImages(productId);
    _idsWithImages.add(productId);
    _replaceProduct(productId, (product) => product.copyWith(anh: images));
    return images;
  }

  Future<List<StoreAttachment>> loadPrintFiles(String productId) async {
    final files =
        await ref.read(storeRepositoryProvider).fetchPrintFiles(productId);
    _idsWithFiles.add(productId);
    _replaceProduct(productId, (product) => product.copyWith(tepIn: files));
    return files;
  }

  /// Nhập / xuất / đặt lại tồn kho — **qua hàng đợi offline** (Nhóm A).
  ///
  /// Server áp dụng phép cộng dồn, không phải phép gán — an toàn khi nhiều máy
  /// cùng nhập/xuất khi mất mạng. Ghi lịch sử bằng tiếng Việt giống bản web.
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

    // Delta gửi lên server: dương = nhập, âm = xuất
    final delta = switch (action) {
      StockAction.add => amount,
      StockAction.subtract => -amount,
      StockAction.set => newQuantity - product.soLuong, // best-effort offline
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

    // Cập nhật trạng thái lạc quan + cache + outbox cùng lúc
    _replaceProduct(productId, (_) => updated);
    await ref.read(storeRepositoryProvider).adjustStockOutbox(
          productId,
          delta,
          newQuantity,
          note,
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

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard mới (đợt 6)
// ─────────────────────────────────────────────────────────────────────────────

/// Cảnh báo hiện hành — poll 30 s, dừng khi widget không còn lắng nghe.
///
/// Nếu API lỗi (mất mạng) thì repository trả bản cache kèm `cachedAt`; nếu
/// cả cache cũng trống thì stream báo lỗi để UI hiện ErrorView.
final canhBaoProvider =
    StreamProvider.autoDispose<DashboardResult<KetQuaCanhBao>>((ref) async* {
  final repo = ref.watch(dashboardRepositoryProvider);
  while (true) {
    try {
      yield await repo.fetchCanhBao();
    } catch (e, st) {
      yield* Stream.error(e, st);
      // Dừng 30 s rồi thử lại — không vòng lặp điên.
    }
    await Future<void>.delayed(const Duration(seconds: 30));
  }
});

/// Tổng quan hôm nay — poll 60 s.
final tongQuanProvider =
    StreamProvider.autoDispose<DashboardResult<KetQuaTongQuan>>((ref) async* {
  final repo = ref.watch(dashboardRepositoryProvider);
  while (true) {
    try {
      yield await repo.fetchTongQuan();
    } catch (e, st) {
      yield* Stream.error(e, st);
    }
    await Future<void>.delayed(const Duration(seconds: 60));
  }
});

/// Tải lại toàn bộ dữ liệu nền — dùng cho pull-to-refresh ở các màn hình chính.
///
/// Phải **đồng bộ trước rồi mới đọc lại**: từ khi repository đọc từ CSDL cục bộ,
/// đọc lại mà không đồng bộ chỉ là đọc lại đúng dữ liệu cũ — thợ kéo màn hình
/// xuống mà chẳng có gì mới, tưởng hỏng.
///
/// Lỗi mạng ở bước đồng bộ **không chặn** bước đọc: mất sóng thì vẫn phải hiện
/// được dữ liệu đang có trong máy.
Future<void> refreshCoreData(WidgetRef ref) async {
  try {
    await ref.read(syncProvider.notifier).dongBo();
  } catch (_) {
    // Đã ghi vào trạng thái đồng bộ để chỉ báo trên thanh hiện; ở đây nuốt đi.
  }

  await Future.wait([
    ref.read(filamentsProvider.notifier).refresh(),
    ref.read(locationsProvider.notifier).refresh(),
    ref.read(printersProvider.notifier).refresh(),
    ref.read(ordersProvider.notifier).refresh(),
    ref.read(printItemsProvider.notifier).refresh(),
    ref.read(peiSheetsProvider.notifier).refresh(),
    ref.read(bulkOrdersProvider.notifier).refresh(),
    ref.read(eshopOrdersProvider.notifier).refresh(),
    ref.read(storeProvider.notifier).refresh(),
  ]);
  ref.invalidate(dashboardStatsProvider);
  ref.invalidate(canhBaoProvider);
  ref.invalidate(tongQuanProvider);
}
