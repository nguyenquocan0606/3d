import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

/// CSDL cục bộ của máy — xem `KE-HOACH-DONG-BO-OFFLINE.md`.
///
/// Hai nhóm bảng, vai trò khác hẳn nhau:
///
///  - **Bảng cache** (`cache_*`): bản sao dữ liệu server gửi xuống. Có thể xóa
///    sạch bất cứ lúc nào rồi kéo lại từ đầu — không mất gì.
///  - **Bảng `outbox`**: thao tác của thợ chưa đẩy lên được. Đây là **dữ liệu
///    gốc, chỉ tồn tại ở máy này**. Xóa nhầm là mất công việc của thợ.
///
/// Cache lưu nguyên JSON của server thay vì tách từng cột: model trong app đã có
/// `fromJson` viết tay rồi, tách cột nữa là phải sửa hai chỗ mỗi lần backend thêm
/// trường. Đổi lại không lọc/sắp xếp bằng SQL được — chấp nhận được vì xưởng có
/// vài trăm bản ghi mỗi bảng, lọc trong Dart vẫn nhanh.
class AppDatabase {
  AppDatabase._();

  static final AppDatabase instance = AppDatabase._();

  Database? _db;

  Future<Database> get db async => _db ??= await _mo();

  Future<Database> _mo() async {
    final duongDan = p.join(await getDatabasesPath(), '3dmanage.db');
    return openDatabase(
      duongDan,
      version: 1,
      onConfigure: (d) => d.execute('PRAGMA foreign_keys = ON'),
      onCreate: (d, _) async {
        await d.execute('''
          CREATE TABLE cache_ban_ghi (
            bang    TEXT NOT NULL,
            id      TEXT NOT NULL,
            du_lieu TEXT NOT NULL,
            PRIMARY KEY (bang, id)
          )
        ''');

        await d.execute('''
          CREATE TABLE outbox (
            id          TEXT PRIMARY KEY,
            loai        TEXT NOT NULL,
            payload     TEXT NOT NULL,
            tao_luc     TEXT NOT NULL,
            trang_thai  TEXT NOT NULL DEFAULT 'cho',
            so_lan_thu  INTEGER NOT NULL DEFAULT 0,
            loi_cuoi    TEXT,
            mo_ta       TEXT NOT NULL DEFAULT ''
          )
        ''');
        // Worker luôn hỏi "còn cái nào đang chờ không", sắp theo thứ tự tạo.
        await d.execute(
          'CREATE INDEX idx_outbox_trang_thai ON outbox(trang_thai, tao_luc)',
        );

        await d.execute('''
          CREATE TABLE meta (
            khoa    TEXT PRIMARY KEY,
            gia_tri TEXT NOT NULL
          )
        ''');
      },
    );
  }

  // ── meta ───────────────────────────────────────────────────────────────────

  static const _khoaMocDongBo = 'moc_dong_bo';

  /// Mốc `since` cho lần kéo delta kế tiếp — **do server cấp**, không phải giờ máy.
  Future<String?> mocDongBo() async {
    final d = await db;
    final rows = await d.query('meta', where: 'khoa = ?', whereArgs: [_khoaMocDongBo]);
    return rows.isEmpty ? null : rows.first['gia_tri'] as String;
  }

  Future<void> datMocDongBo(String serverTime) async {
    final d = await db;
    await d.insert(
      'meta',
      {'khoa': _khoaMocDongBo, 'gia_tri': serverTime},
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Quên mốc để lần sau kéo lại toàn bộ. Dùng khi đổi máy chủ trong Cài đặt —
  /// dữ liệu đang cache thuộc máy chủ cũ, giữ lại là trộn hai nguồn.
  Future<void> xoaSachCache() async {
    final d = await db;
    await d.transaction((txn) async {
      await txn.delete('cache_ban_ghi');
      await txn.delete('meta', where: 'khoa = ?', whereArgs: [_khoaMocDongBo]);
    });
  }
}
