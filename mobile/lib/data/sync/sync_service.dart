import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../local/app_database.dart';
import '../local/cache_reader.dart';
import '../local/cache_store.dart';
import '../local/outbox.dart';

/// Trạng thái đồng bộ, để vẽ chỉ báo trên thanh.
class TrangThaiDongBo {
  const TrangThaiDongBo({
    this.dangChay = false,
    this.choGui = 0,
    this.biTuChoi = 0,
    this.phienBanDuLieu = 0,
    this.lanCuoi,
    this.loi,
  });

  /// Tăng mỗi lần kéo về được thay đổi thật.
  ///
  /// Là cầu nối duy nhất giữa worker và giao diện: worker ghi thẳng vào SQLite,
  /// mà Riverpod không hề biết CSDL vừa đổi nên vẫn giữ dữ liệu đã đọc trước đó —
  /// kéo delta về xong màn hình vẫn hiện số cũ. Provider nào đọc cache thì `watch`
  /// số này để tự đọc lại.
  ///
  /// Chỉ tăng khi **thực sự có thay đổi**, nếu không mỗi nhịp poll 60s lại dựng
  /// lại toàn bộ danh sách một cách vô ích.
  final int phienBanDuLieu;

  final bool dangChay;

  /// Số thao tác chờ đẩy lên. Thợ cần thấy con số này — nó là thước đo "mình đã
  /// làm bao nhiêu việc mà máy chủ chưa biết".
  final int choGui;

  /// Số thao tác server đã từ chối, đang chờ thợ xử tay.
  final int biTuChoi;

  final DateTime? lanCuoi;
  final String? loi;

  bool get onKhoe => loi == null && lanCuoi != null;

  TrangThaiDongBo copyWith({
    bool? dangChay,
    int? choGui,
    int? biTuChoi,
    int? phienBanDuLieu,
    DateTime? lanCuoi,
    String? loi,
    bool xoaLoi = false,
  }) =>
      TrangThaiDongBo(
        dangChay: dangChay ?? this.dangChay,
        choGui: choGui ?? this.choGui,
        biTuChoi: biTuChoi ?? this.biTuChoi,
        phienBanDuLieu: phienBanDuLieu ?? this.phienBanDuLieu,
        lanCuoi: lanCuoi ?? this.lanCuoi,
        loi: xoaLoi ? null : (loi ?? this.loi),
      );
}

final appDatabaseProvider = Provider<AppDatabase>((_) => AppDatabase.instance);
final cacheStoreProvider =
    Provider<CacheStore>((ref) => CacheStore(ref.watch(appDatabaseProvider)));
final cacheReaderProvider =
    Provider<CacheReader>((ref) => CacheReader(ref.watch(cacheStoreProvider)));
final outboxProvider =
    Provider<Outbox>((ref) => Outbox(ref.watch(appDatabaseProvider)));

/// Điều phối đồng bộ: đẩy hàng đợi lên rồi kéo thay đổi về.
///
/// **Luôn đẩy trước, kéo sau.** Kéo trước thì delta sẽ đè lên cache những giá trị
/// mà thao tác đang chờ trong hàng đợi vừa sửa lạc quan — màn hình nhấp nháy về
/// giá trị cũ rồi mới nhảy lại. Đẩy trước thì delta kéo về đã bao gồm chính kết
/// quả của các thao tác đó.
class SyncNotifier extends Notifier<TrangThaiDongBo> {
  Timer? _dinhKy;

  /// Chu kỳ đồng bộ dự phòng.
  ///
  /// Là **đường lui** khi không nhận được thông báo MQTT (broker chết, máy vừa ra
  /// khỏi vùng phủ sóng). Có MQTT thì thay đổi về gần như tức thì, không phải chờ
  /// hết chu kỳ này.
  static const chuKyDuPhong = Duration(seconds: 60);

  StreamSubscription<List<ConnectivityResult>>? _theoDoiMang;

  /// Tự chạy ngay khi provider được tạo lần đầu — đặt ở đây chứ không bắt widget
  /// gọi hộ, vì gọi trong `build()` của widget là chạy lại mỗi lần rebuild.
  @override
  TrangThaiDongBo build() {
    _dinhKy = Timer.periodic(chuKyDuPhong, (_) => dongBo());

    // Có sóng trở lại thì đẩy hàng đợi **ngay**, không bắt chờ hết chu kỳ 60s.
    // Đây là lúc quan trọng nhất của cả cơ chế: thợ vừa đi từ góc khuất ra, trong
    // tay là cả xấp thao tác chưa lên, và họ đang đứng chờ xem máy chủ nhận chưa.
    _theoDoiMang = Connectivity().onConnectivityChanged.listen((cacKetNoi) {
      final coMang = cacKetNoi.any((k) => k != ConnectivityResult.none);
      if (coMang) unawaited(dongBo());
    });

    ref.onDispose(() {
      _dinhKy?.cancel();
      _theoDoiMang?.cancel();
    });

    // Không await: `build` phải trả trạng thái ngay, không chặn cây widget.
    unawaited(dongBo());
    return const TrangThaiDongBo();
  }

  Future<void> capNhatSoLieu() async {
    final d = await ref.read(outboxProvider).dem();
    state = state.copyWith(choGui: d.cho, biTuChoi: d.tuChoi);
  }

  /// Một vòng đồng bộ đầy đủ. An toàn khi gọi chồng — lần sau bỏ qua nếu đang chạy.
  Future<void> dongBo() async {
    if (state.dangChay) return;
    state = state.copyWith(dangChay: true);

    try {
      await _dayHangDoi();
      await _keoDelta();
      state = state.copyWith(lanCuoi: DateTime.now(), xoaLoi: true);
    } catch (error) {
      state = state.copyWith(loi: '$error');
    } finally {
      state = state.copyWith(dangChay: false);
      await capNhatSoLieu();
    }
  }

  // ── Đẩy lên ────────────────────────────────────────────────────────────────

  Future<void> _dayHangDoi() async {
    final outbox = ref.read(outboxProvider);
    final api = ref.read(apiClientProvider);

    while (true) {
      final lo = await outbox.loCho(toiDa: 100);
      if (lo.isEmpty) return;

      final List<dynamic> ketQua;
      try {
        ketQua = await api.post<List<dynamic>>(
          '/api/sync/actions',
          (data) => (data as Map)['results'] as List<dynamic>,
          body: {'actions': lo.map((t) => t.toGuiLen()).toList()},
        );
      } catch (error) {
        // Hỏng mạng: **giữ nguyên hàng đợi và dừng hẳn vòng lặp**. Không bỏ qua
        // lô này để đẩy lô sau — thao tác sau có thể phụ thuộc thao tác trước.
        await outbox.ghiLanThuHong(lo.map((t) => t.id), '$error');
        rethrow;
      }

      final xong = <String>[];
      for (final r in ketQua) {
        if (r is! Map) continue;
        final id = '${r['id']}';
        final trangThai = '${r['status']}';
        if (trangThai == 'applied' || trangThai == 'duplicate') {
          xong.add(id);
        } else {
          await outbox.danhDauTuChoi(id, r['message'] as String?);
        }
      }
      await outbox.xong(xong);

      // Lô nhỏ hơn giới hạn nghĩa là đã hết hàng chờ.
      if (lo.length < 100) return;
    }
  }

  // ── Kéo về ─────────────────────────────────────────────────────────────────

  Future<void> _keoDelta() async {
    final db = ref.read(appDatabaseProvider);
    final cache = ref.read(cacheStoreProvider);
    final api = ref.read(apiClientProvider);

    final moc = await db.mocDongBo();

    final goi = await api.get<Map<String, dynamic>>(
      '/api/sync',
      (data) => (data as Map).cast<String, dynamic>(),
      query: moc == null ? null : {'since': moc},
    );

    final changes = (goi['changes'] as Map?)?.cast<String, dynamic>() ?? {};
    final deleted = (goi['deleted'] as Map?)?.cast<String, dynamic>() ?? {};

    final soThayDoi = changes.values.fold<int>(
          0,
          (t, v) => t + ((v as List?)?.length ?? 0),
        ) +
        deleted.values.fold<int>(0, (t, v) => t + ((v as List?)?.length ?? 0));

    await cache.ghiDelta(
      changes: {
        for (final e in changes.entries)
          e.key: (e.value as List?) ?? const <dynamic>[],
      },
      deleted: {
        for (final e in deleted.entries)
          e.key: ((e.value as List?) ?? const []).map((x) => '$x').toList(),
      },
    );

    // Chỉ đẩy mốc **sau khi ghi cache thành công**. Đẩy trước mà ghi hỏng là mất
    // vĩnh viễn khoảng thay đổi đó — lần sau server sẽ không gửi lại nữa.
    final serverTime = goi['serverTime'];
    if (serverTime is String) await db.datMocDongBo(serverTime);

    // Báo cho giao diện biết cache vừa đổi — xem [TrangThaiDongBo.phienBanDuLieu].
    if (soThayDoi > 0) {
      state = state.copyWith(phienBanDuLieu: state.phienBanDuLieu + 1);
    }
  }
}

final syncProvider =
    NotifierProvider<SyncNotifier, TrangThaiDongBo>(SyncNotifier.new);
