import 'dart:convert';

import 'package:sqflite/sqflite.dart';
import 'package:uuid/uuid.dart';

import 'app_database.dart';

/// Trạng thái một thao tác trong hàng đợi.
enum TrangThaiOutbox {
  /// Chưa đẩy lên được, sẽ thử lại.
  cho('cho'),

  /// Server đã từ chối. **Không tự thử lại nữa** — gửi lại vẫn ra cùng kết quả,
  /// phải để thợ nhìn thấy và tự xử.
  tuChoi('tu_choi');

  const TrangThaiOutbox(this.giaTri);
  final String giaTri;

  static TrangThaiOutbox tu(String v) =>
      values.firstWhere((e) => e.giaTri == v, orElse: () => TrangThaiOutbox.cho);
}

/// Một thao tác của thợ đang chờ đẩy lên server.
class ThaoTacCho {
  const ThaoTacCho({
    required this.id,
    required this.loai,
    required this.payload,
    required this.taoLuc,
    required this.trangThai,
    required this.soLanThu,
    required this.moTa,
    this.loiCuoi,
  });

  /// uuid sinh tại máy — khóa chống gửi trùng, server dùng đúng giá trị này.
  final String id;
  final String loai;
  final Map<String, dynamic> payload;
  final DateTime taoLuc;
  final TrangThaiOutbox trangThai;
  final int soLanThu;

  /// Câu tiếng Việt mô tả việc đã làm, để hiện ở màn "Thao tác chưa đồng bộ".
  /// Dựng lại từ `loai` + `payload` thì thợ phải đọc mã kỹ thuật — vô nghĩa với họ.
  final String moTa;

  final String? loiCuoi;

  factory ThaoTacCho._tuHang(Map<String, Object?> r) => ThaoTacCho(
        id: r['id'] as String,
        loai: r['loai'] as String,
        payload: jsonDecode(r['payload'] as String) as Map<String, dynamic>,
        taoLuc: DateTime.parse(r['tao_luc'] as String),
        trangThai: TrangThaiOutbox.tu(r['trang_thai'] as String),
        soLanThu: r['so_lan_thu'] as int,
        moTa: (r['mo_ta'] as String?) ?? '',
        loiCuoi: r['loi_cuoi'] as String?,
      );

  Map<String, dynamic> toGuiLen() => {
        'id': id,
        'loai': loai,
        'payload': payload,
        'taoLuc': taoLuc.toUtc().toIso8601String(),
      };
}

/// Hàng đợi thao tác offline.
///
/// Mọi thao tác nhóm A (xem kế hoạch §2.1) đi qua đây thay vì gọi thẳng API. Nhờ
/// vậy app phản ứng **y hệt nhau dù có mạng hay không** — thợ không phải nhớ mình
/// đang online hay offline, mà trong xưởng thì họ không thể nhớ nổi.
class Outbox {
  Outbox(this._db);

  final AppDatabase _db;
  static const _sinhId = Uuid();

  /// Xếp một thao tác vào hàng đợi. Trả về uuid để nơi gọi ghi vào cache lạc quan.
  Future<String> them({
    required String loai,
    required Map<String, dynamic> payload,
    required String moTa,
    DateTime? taoLuc,
  }) async {
    final d = await _db.db;
    final id = _sinhId.v4();
    await d.insert('outbox', {
      'id': id,
      'loai': loai,
      'payload': jsonEncode(payload),
      // Giờ thợ thao tác, không phải giờ đẩy lên — server dùng nó làm mốc
      // `startedAt` của lượt in và làm căn cứ so sánh cho luật ghi-đè-theo-giờ.
      'tao_luc': (taoLuc ?? DateTime.now()).toUtc().toIso8601String(),
      'trang_thai': TrangThaiOutbox.cho.giaTri,
      'so_lan_thu': 0,
      'mo_ta': moTa,
    });
    return id;
  }

  /// Lô kế tiếp cần đẩy, **theo đúng thứ tự thợ thao tác**.
  ///
  /// Thứ tự là bắt buộc chứ không phải cho đẹp: quẹt tem máy in rồi mới chốt lượt,
  /// đảo lại là server từ chối cái sau.
  Future<List<ThaoTacCho>> loCho({int toiDa = 100}) async {
    final d = await _db.db;
    final rows = await d.query(
      'outbox',
      where: 'trang_thai = ?',
      whereArgs: [TrangThaiOutbox.cho.giaTri],
      orderBy: 'tao_luc ASC',
      limit: toiDa,
    );
    return rows.map(ThaoTacCho._tuHang).toList();
  }

  /// Thao tác server đã nhận (applied hoặc duplicate) — xóa khỏi hàng đợi.
  ///
  /// `duplicate` cũng là xong: nó nghĩa là lần gửi trước đã tới nơi, chỉ phản hồi
  /// bị mất giữa đường.
  Future<void> xong(Iterable<String> ids) async {
    if (ids.isEmpty) return;
    final d = await _db.db;
    final cho = List.filled(ids.length, '?').join(',');
    await d.delete('outbox', where: 'id IN ($cho)', whereArgs: ids.toList());
  }

  /// Server từ chối — giữ lại để thợ xem, không thử lại nữa.
  Future<void> danhDauTuChoi(String id, String? lyDo) async {
    final d = await _db.db;
    await d.update(
      'outbox',
      {'trang_thai': TrangThaiOutbox.tuChoi.giaTri, 'loi_cuoi': lyDo},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  /// Đẩy hụt vì mạng — tăng số lần thử, vẫn để ở trạng thái chờ.
  Future<void> ghiLanThuHong(Iterable<String> ids, String lyDo) async {
    if (ids.isEmpty) return;
    final d = await _db.db;
    final cho = List.filled(ids.length, '?').join(',');
    await d.rawUpdate(
      'UPDATE outbox SET so_lan_thu = so_lan_thu + 1, loi_cuoi = ? WHERE id IN ($cho)',
      [lyDo, ...ids],
    );
  }

  /// Bỏ hẳn một thao tác bị từ chối — thợ tự quyết ở màn chưa đồng bộ.
  Future<void> boQua(String id) async {
    final d = await _db.db;
    await d.delete('outbox', where: 'id = ?', whereArgs: [id]);
  }

  /// Cho thử lại một thao tác đã bị từ chối.
  ///
  /// Đổi luôn **uuid mới**: uuid cũ đã nằm trong nhật ký server nên gửi lại chỉ
  /// nhận `duplicate` và không bao giờ chạy. Muốn thử thật thì phải là thao tác mới.
  Future<void> thuLai(String id) async {
    final d = await _db.db;
    await d.update(
      'outbox',
      {
        'id': _sinhId.v4(),
        'trang_thai': TrangThaiOutbox.cho.giaTri,
        'so_lan_thu': 0,
        'loi_cuoi': null,
      },
      where: 'id = ?',
      whereArgs: [id],
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Đếm theo trạng thái, cho chỉ báo trên thanh và màn chưa đồng bộ.
  Future<({int cho, int tuChoi})> dem() async {
    final d = await _db.db;
    final rows = await d.rawQuery(
      'SELECT trang_thai, COUNT(*) AS n FROM outbox GROUP BY trang_thai',
    );
    var cho = 0, tuChoi = 0;
    for (final r in rows) {
      final n = (r['n'] as int?) ?? 0;
      if (r['trang_thai'] == TrangThaiOutbox.tuChoi.giaTri) {
        tuChoi = n;
      } else {
        cho = n;
      }
    }
    return (cho: cho, tuChoi: tuChoi);
  }

  /// Toàn bộ thao tác bị từ chối, mới nhất trước.
  Future<List<ThaoTacCho>> danhSachTuChoi() async {
    final d = await _db.db;
    final rows = await d.query(
      'outbox',
      where: 'trang_thai = ?',
      whereArgs: [TrangThaiOutbox.tuChoi.giaTri],
      orderBy: 'tao_luc DESC',
    );
    return rows.map(ThaoTacCho._tuHang).toList();
  }
}
