import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import 'app_database.dart';

/// Tên bảng cache — phải khớp **đúng** key trong payload của `GET /api/sync`.
///
/// Lệch một chữ là dữ liệu bảng đó âm thầm không bao giờ được cập nhật, nên gom
/// vào một chỗ thay vì rải chuỗi khắp nơi.
class BangCache {
  static const locations = 'locations';
  static const filaments = 'filaments';
  static const printers = 'printers';
  static const spools = 'spools';
  static const peiSheets = 'peiSheets';
  static const orders = 'orders';
  static const orderProducts = 'orderProducts';
  static const printItems = 'printItems';
  static const bulkOrders = 'bulkOrders';
  static const bulkRuns = 'bulkRuns';
  static const storeProducts = 'storeProducts';

  static const tatCa = [
    locations, filaments, printers, spools, peiSheets,
    orders, orderProducts, printItems, bulkOrders, bulkRuns, storeProducts,
  ];

  /// Quan hệ cha → con, để dọn con khi cha bị xóa.
  ///
  /// Server **cố ý không** gửi bia mộ cho bản ghi bị xóa dây chuyền (xem
  /// `ghiBiaMo` bên backend) — nó chỉ báo cha biến mất, phần dọn con là việc ở
  /// đây. Đổi lại backend không phải sinh hàng nghìn dòng bia mộ khi xóa một đơn
  /// lớn.
  static const conCua = <String, List<({String bang, String khoaNgoai})>>{
    orders: [(bang: orderProducts, khoaNgoai: 'orderId')],
    orderProducts: [(bang: printItems, khoaNgoai: 'productId')],
    bulkOrders: [(bang: bulkRuns, khoaNgoai: 'orderId')],
  };
}

/// Bản sao dữ liệu server, lưu nguyên JSON.
class CacheStore {
  CacheStore(this._db);

  final AppDatabase _db;

  /// Ghi một mẻ thay đổi kéo về. Toàn bộ trong **một transaction**: nửa vời còn
  /// tệ hơn không ghi gì, vì mốc đồng bộ sẽ nhảy qua phần chưa ghi được.
  Future<void> ghiDelta({
    required Map<String, List<dynamic>> changes,
    required Map<String, List<String>> deleted,
  }) async {
    final d = await _db.db;
    await d.transaction((txn) async {
      for (final e in changes.entries) {
        for (final ban in e.value) {
          if (ban is! Map) continue;
          final id = ban['id'];
          if (id == null) continue;
          await txn.insert(
            'cache_ban_ghi',
            {'bang': e.key, 'id': '$id', 'du_lieu': jsonEncode(ban)},
            conflictAlgorithm: ConflictAlgorithm.replace,
          );
        }
      }

      for (final e in deleted.entries) {
        for (final id in e.value) {
          await _xoaCaCon(txn, e.key, id);
        }
      }
    });
  }

  /// Xóa một bản ghi và mọi con cháu của nó.
  Future<void> _xoaCaCon(Transaction txn, String bang, String id) async {
    await txn.delete('cache_ban_ghi', where: 'bang = ? AND id = ?', whereArgs: [bang, id]);

    for (final con in BangCache.conCua[bang] ?? const []) {
      // JSON lưu nguyên khối nên phải đọc ra lọc trong Dart. Chấp nhận được: xóa
      // là việc hiếm, còn số bản ghi mỗi bảng chỉ vài trăm.
      final rows = await txn.query('cache_ban_ghi',
          where: 'bang = ?', whereArgs: [con.bang]);
      for (final r in rows) {
        final m = jsonDecode(r['du_lieu'] as String) as Map<String, dynamic>;
        if ('${m[con.khoaNgoai]}' == id) {
          await _xoaCaCon(txn, con.bang, '${m['id']}');
        }
      }
    }
  }

  /// Toàn bộ bản ghi của một bảng.
  Future<List<Map<String, dynamic>>> doc(String bang) async {
    final d = await _db.db;
    final rows = await d.query('cache_ban_ghi', where: 'bang = ?', whereArgs: [bang]);
    return rows
        .map((r) => jsonDecode(r['du_lieu'] as String) as Map<String, dynamic>)
        .toList();
  }

  Future<Map<String, dynamic>?> docMot(String bang, String id) async {
    final d = await _db.db;
    final rows = await d.query('cache_ban_ghi',
        where: 'bang = ? AND id = ?', whereArgs: [bang, id], limit: 1);
    if (rows.isEmpty) return null;
    return jsonDecode(rows.first['du_lieu'] as String) as Map<String, dynamic>;
  }

  /// Sửa tại chỗ một bản ghi — dùng cho **cập nhật lạc quan**.
  ///
  /// Thợ quẹt xong phải thấy màn hình đổi ngay, không đợi mạng. Giá trị ghi ở đây
  /// là phỏng đoán; lần kéo delta kế tiếp sẽ đè lại bằng sự thật từ server.
  Future<void> vaTamThoi(String bang, String id, Map<String, dynamic> thayDoi) async {
    final hienTai = await docMot(bang, id);
    if (hienTai == null) return;
    final d = await _db.db;
    await d.insert(
      'cache_ban_ghi',
      {'bang': bang, 'id': id, 'du_lieu': jsonEncode({...hienTai, ...thayDoi})},
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Chèn bản ghi mới vào cache — dùng cho thao tác **tạo mới lạc quan**.
  ///
  /// Khác với [vaTamThoi] (chỉ sửa bản ghi đã tồn tại), phương thức này tạo luôn
  /// nếu chưa có. INSERT OR REPLACE nên an toàn nếu bản ghi đã được đồng bộ trước đó.
  Future<void> themTamThoi(String bang, String id, Map<String, dynamic> duLieu) async {
    final d = await _db.db;
    await d.insert(
      'cache_ban_ghi',
      {'bang': bang, 'id': id, 'du_lieu': jsonEncode(duLieu)},
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<bool> coDuLieu() async {
    final d = await _db.db;
    final n = Sqflite.firstIntValue(
      await d.rawQuery('SELECT COUNT(*) FROM cache_ban_ghi'),
    );
    return (n ?? 0) > 0;
  }
}
