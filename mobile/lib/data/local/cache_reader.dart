import 'cache_store.dart';

/// Ghép dữ liệu phẳng trong cache về đúng hình dạng JSON mà các model đang đợi.
///
/// `GET /api/sync` trả **bảng phẳng** (bắt buộc, nếu không delta sẽ bỏ sót — xem
/// kế hoạch §3.1), trong khi các endpoint cũ trả dữ liệu lồng nhau và toàn bộ
/// `fromJson` trong app viết theo dạng lồng đó.
///
/// Lớp này là chỗ duy nhất biết hai hình dạng ấy khác nhau. Nhờ vậy model, provider
/// và màn hình không phải sửa gì — đổi lại mỗi khi backend đổi hình dạng lồng thì
/// phải sửa ở đây cho khớp.
class CacheReader {
  CacheReader(this._cache);

  final CacheStore _cache;

  // ── Loại nhựa + cuộn ───────────────────────────────────────────────────────

  /// Dạng của `GET /api/filaments`: loại nhựa kèm mảng `spools` lồng bên trong.
  Future<List<Map<String, dynamic>>> filamentsKemCuon() async {
    final filaments = await _cache.doc(BangCache.filaments);
    final spools = await _cache.doc(BangCache.spools);

    final theoLoai = <String, List<Map<String, dynamic>>>{};
    for (final s in spools) {
      (theoLoai['${s['filamentId']}'] ??= []).add(s);
    }

    return [
      for (final f in filaments) {...f, 'spools': theoLoai['${f['id']}'] ?? const []},
    ];
  }

  // ── Kho & máy in ───────────────────────────────────────────────────────────

  /// Dạng của `GET /api/locations`: kho kèm cuộn đang chứa, mỗi cuộn kèm loại nhựa.
  Future<List<Map<String, dynamic>>> locationsKemCuon() async {
    final locations = await _cache.doc(BangCache.locations);
    final spools = await _cache.doc(BangCache.spools);
    final filaments = await _khoaTheoId(BangCache.filaments);

    return [
      for (final l in locations)
        {
          ...l,
          'spools': [
            for (final s in spools)
              if ('${s['locationId']}' == '${l['id']}')
                {...s, 'filament': filaments['${s['filamentId']}']},
          ],
        },
    ];
  }

  /// Dạng của `GET /api/printers`.
  Future<List<Map<String, dynamic>>> printersKemCuon() async {
    final printers = await _cache.doc(BangCache.printers);
    final spools = await _cache.doc(BangCache.spools);
    final filaments = await _khoaTheoId(BangCache.filaments);

    return [
      for (final p in printers)
        {
          ...p,
          'spools': [
            for (final s in spools)
              if ('${s['printerId']}' == '${p['id']}')
                {...s, 'filament': filaments['${s['filamentId']}']},
          ],
        },
    ];
  }

  // ── Sản xuất ───────────────────────────────────────────────────────────────

  /// Dạng của `GET /api/orders`: đơn → sản phẩm → miếng in.
  Future<List<Map<String, dynamic>>> ordersKemSanPham() async {
    final orders = await _cache.doc(BangCache.orders);
    final products = await _cache.doc(BangCache.orderProducts);
    final items = await _cache.doc(BangCache.printItems);

    final temTheoSanPham = <String, List<Map<String, dynamic>>>{};
    for (final i in items) {
      (temTheoSanPham['${i['productId']}'] ??= []).add(i);
    }

    final sanPhamTheoDon = <String, List<Map<String, dynamic>>>{};
    for (final p in products) {
      (sanPhamTheoDon['${p['orderId']}'] ??= []).add({
        ...p,
        'items': temTheoSanPham['${p['id']}'] ?? const [],
      });
    }

    return [
      for (final o in orders) {...o, 'products': sanPhamTheoDon['${o['id']}'] ?? const []},
    ];
  }

  /// Dạng của `GET /api/print-items`: tem kèm ngược lên sản phẩm và đơn.
  ///
  /// Màn Miếng in hiển thị tên đơn và tên sản phẩm cạnh mỗi tem, nên phải bơm
  /// ngược quan hệ cha vào — đó là lý do bảng phẳng không dùng thẳng được.
  Future<List<Map<String, dynamic>>> printItemsKemCha() async {
    final items = await _cache.doc(BangCache.printItems);
    final products = await _khoaTheoId(BangCache.orderProducts);
    final orders = await _khoaTheoId(BangCache.orders);
    final sheets = await _khoaTheoId(BangCache.peiSheets);
    final printers = await _khoaTheoId(BangCache.printers);

    return [
      for (final i in items)
        {
          ...i,
          'product': () {
            final sp = products['${i['productId']}'];
            if (sp == null) return null;
            return {...sp, 'order': orders['${sp['orderId']}']};
          }(),
          'peiSheet': sheets['${i['peiSheetId']}'],
          'printer': printers['${i['printerId']}'],
        },
    ];
  }

  /// Dạng của `GET /api/pei-sheets`: mâm kèm miếng in đang nằm trên nó.
  Future<List<Map<String, dynamic>>> peiSheetsKemTem() async {
    final sheets = await _cache.doc(BangCache.peiSheets);
    final items = await _cache.doc(BangCache.printItems);
    final printers = await _khoaTheoId(BangCache.printers);

    return [
      for (final s in sheets)
        {
          ...s,
          'printer': printers['${s['printerId']}'],
          'items': [
            for (final i in items)
              if ('${i['peiSheetId']}' == '${s['id']}') i,
          ],
        },
    ];
  }

  /// Dạng của `GET /api/bulk-orders`: đơn SLL kèm toàn bộ lượt in, sắp theo `seq`.
  Future<List<Map<String, dynamic>>> bulkOrdersKemLuot() async {
    final orders = await _cache.doc(BangCache.bulkOrders);
    final runs = await _cache.doc(BangCache.bulkRuns);

    final theoDon = <String, List<Map<String, dynamic>>>{};
    for (final r in runs) {
      (theoDon['${r['orderId']}'] ??= []).add(r);
    }
    for (final ds in theoDon.values) {
      // Thứ tự lượt là thông tin nghiệp vụ (PEI 1, PEI 2...), không phải thứ tự
      // ngẫu nhiên của SQLite.
      ds.sort((a, b) => ((a['seq'] as num?) ?? 0).compareTo((b['seq'] as num?) ?? 0));
    }

    return [
      for (final o in orders) {...o, 'runs': theoDon['${o['id']}'] ?? const []},
    ];
  }

  // ── Hàng hóa ───────────────────────────────────────────────────────────────

  Future<List<Map<String, dynamic>>> storeProducts() =>
      _cache.doc(BangCache.storeProducts);

  // ── Tiện ích ───────────────────────────────────────────────────────────────

  Future<Map<String, Map<String, dynamic>>> _khoaTheoId(String bang) async {
    final rows = await _cache.doc(bang);
    return {for (final r in rows) '${r['id']}': r};
  }
}
