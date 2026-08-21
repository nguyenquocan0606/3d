import 'json.dart';

/// Trạng thái 1 lượt in (và của cả đơn SLL — backend dùng chung 3 giá trị này).
enum BulkStatus {
  pending('pending', 'Chờ in'),
  printing('printing', 'Đang in'),
  completed('completed', 'Xong');

  const BulkStatus(this.value, this.label);
  final String value;
  final String label;

  static BulkStatus from(String? raw) => BulkStatus.values.firstWhere(
        (e) => e.value == raw,
        orElse: () => BulkStatus.pending,
      );
}

/// 1 lượt in = 1 mâm PEI đầy hàng trên 1 máy.
///
/// [id] là mã vạch 8 chữ số **cùng dạng với tem miếng in** nhưng khác kho mã
/// (xem `utils/barcode.ts` của backend) — quét xong không tìm thấy miếng in thì
/// mới tra sang đây.
class BulkRun {
  const BulkRun({
    required this.id,
    required this.orderId,
    required this.printerName,
    required this.seq,
    required this.peiIndex,
    required this.quantity,
    required this.status,
    this.defectQuantity = 0,
    this.isRework = false,
    this.printerId,
    this.startedAt,
    this.finishedAt,
    this.verifiedAt,
  });

  final String id;
  final String orderId;
  final String? printerId;

  /// Tên máy chốt lúc chia lượt — vẫn đọc được kể cả khi máy đã bị xóa.
  final String printerName;

  final int seq;
  final int peiIndex;
  final int quantity;

  /// Số con lỗi, nhập lúc quẹt "in xong".
  final int defectQuantity;

  /// Lượt in bù cho hàng lỗi — không nằm trong kế hoạch chia ban đầu.
  final bool isRework;

  final BulkStatus status;

  final DateTime? startedAt;
  final DateTime? finishedAt;

  /// Mốc quẹt kiểm hàng lại sau khi in xong — null là chưa ai kiểm mâm này.
  final DateTime? verifiedAt;

  bool get isVerified => verifiedAt != null;

  /// Hàng tốt của lượt này.
  int get goodQuantity =>
      quantity - defectQuantity < 0 ? 0 : quantity - defectQuantity;

  /// Thời gian in thực tế của lượt, null khi chưa quẹt đủ 2 đầu.
  Duration? get elapsed {
    if (startedAt == null || finishedAt == null) return null;
    final diff = finishedAt!.difference(startedAt!);
    return diff.isNegative ? null : diff;
  }

  /// Chỉ đủ dùng cho luồng kiểm hàng: `verifiedAt` là trường duy nhất màn hình
  /// tự vá tại chỗ, phần còn lại luôn đọc lại từ cache.
  BulkRun copyWith({DateTime? verifiedAt, bool xoaVerifiedAt = false}) => BulkRun(
        id: id,
        orderId: orderId,
        printerName: printerName,
        seq: seq,
        peiIndex: peiIndex,
        quantity: quantity,
        status: status,
        defectQuantity: defectQuantity,
        isRework: isRework,
        printerId: printerId,
        startedAt: startedAt,
        finishedAt: finishedAt,
        verifiedAt: xoaVerifiedAt ? null : (verifiedAt ?? this.verifiedAt),
      );

  factory BulkRun.fromJson(Map<String, dynamic> json) => BulkRun(
        id: asString(json['id']),
        orderId: asString(json['orderId']),
        printerId: asStringOrNull(json['printerId']),
        printerName: asString(json['printerName'], '—'),
        seq: asInt(json['seq']),
        peiIndex: asInt(json['peiIndex']),
        quantity: asInt(json['quantity']),
        defectQuantity: asInt(json['defectQuantity']),
        isRework: asBool(json['isRework']),
        status: BulkStatus.from(asStringOrNull(json['status'])),
        startedAt: asDate(json['startedAt']),
        finishedAt: asDate(json['finishedAt']),
        verifiedAt: asDate(json['verifiedAt']),
      );
}

/// Đơn sản xuất số lượng lớn (SLL) — đếm theo lượt PEI thay vì theo tem từng con.
class BulkOrder {
  const BulkOrder({
    required this.id,
    required this.productName,
    required this.totalQuantity,
    required this.perSheetQty,
    required this.status,
    this.orderCode,
    this.customerName,
    this.note,
    this.runs = const [],
    this.createdAt,
  });

  final String id;
  final String? orderCode;
  final String? customerName;
  final String productName;
  final int totalQuantity;
  final int perSheetQty;
  final String? note;
  final BulkStatus status;
  final List<BulkRun> runs;
  final DateTime? createdAt;

  String get displayCustomer => customerName ?? 'Khách lẻ';

  /// Chỉ lượt đã xong mới tính là hàng ra, và **trừ luôn số lỗi** — khớp
  /// `soHangTot()` bản web, để thanh tiến độ không nói dối.
  int get doneQuantity => runs
      .where((r) => r.status == BulkStatus.completed)
      .fold(0, (sum, r) => sum + r.goodQuantity);

  /// Tổng số con lỗi đã ghi trong đơn.
  int get defectQuantity => runs.fold(0, (sum, r) => sum + r.defectQuantity);

  /// Số miếng lỗi chưa được in bù.
  ///
  /// Lượt bù đã tạo (dù chưa in xong) coi như đã nhận phần lỗi đó, nếu không bấm
  /// "In miếng lỗi" hai lần sẽ đẻ thêm lượt cho cùng số lỗi cũ.
  int get pendingRework {
    final daBu = runs.where((r) => r.isRework).fold(0, (sum, r) => sum + r.quantity);
    final con = defectQuantity - daBu;
    return con < 0 ? 0 : con;
  }

  int get doneRuns => runs.where((r) => r.status == BulkStatus.completed).length;

  /// Các mâm đã in xong — đúng danh sách phải cầm lên kiểm lại, theo thứ tự lượt.
  List<BulkRun> get runsToVerify {
    final list = runs.where((r) => r.status == BulkStatus.completed).toList()
      ..sort((a, b) => a.seq.compareTo(b.seq));
    return list;
  }

  int get verifiedRuns => runs.where((r) => r.isVerified).length;

  /// Hàng tốt đã được kiểm lại — con số nói "chắc chắn có thật" khi giao khách.
  int get verifiedQuantity =>
      runs.where((r) => r.isVerified).fold(0, (sum, r) => sum + r.goodQuantity);

  /// Tiến độ kiểm hàng tính trên số mâm đã in xong (chưa in xong thì chưa kiểm được).
  double get verifyProgress {
    final can = runsToVerify.length;
    if (can == 0) return 0;
    return verifiedRuns / can;
  }

  double get progress {
    if (totalQuantity <= 0) return 0;
    final ratio = doneQuantity / totalQuantity;
    return ratio > 1 ? 1 : ratio;
  }

  /// Lượt gom theo máy, giữ thứ tự máy xuất hiện lần đầu (= thứ tự chọn lúc tạo đơn).
  List<BulkRunGroup> get runsByPrinter {
    final groups = <String, BulkRunGroup>{};
    for (final run in runs) {
      final key = run.printerId ?? run.printerName;
      groups.putIfAbsent(key, () => BulkRunGroup(key, run.printerName, []));
      groups[key]!.runs.add(run);
    }
    return groups.values.toList();
  }

  factory BulkOrder.fromJson(Map<String, dynamic> json) => BulkOrder(
        id: asString(json['id']),
        orderCode: asStringOrNull(json['orderCode']),
        customerName: asStringOrNull(json['customerName']),
        productName: asString(json['productName']),
        totalQuantity: asInt(json['totalQuantity']),
        perSheetQty: asInt(json['perSheetQty']),
        note: asStringOrNull(json['note']),
        status: BulkStatus.from(asStringOrNull(json['status'])),
        runs: asList(json['runs'], BulkRun.fromJson),
        createdAt: asDate(json['createdAt']),
      );
}

class BulkRunGroup {
  BulkRunGroup(this.key, this.printerName, this.runs);

  final String key;
  final String printerName;
  final List<BulkRun> runs;

  int get doneCount => runs.where((r) => r.status == BulkStatus.completed).length;
  int get quantity => runs.fold(0, (sum, r) => sum + r.quantity);
}

/// Kết quả 1 lần quẹt mã lượt in.
class BulkScanResult {
  const BulkScanResult({required this.run, required this.isCheckIn});

  final BulkRun run;

  /// true = vừa bấm giờ bắt đầu in, false = vừa chốt in xong.
  final bool isCheckIn;
}

/// 1 lượt in dự kiến khi xem trước lúc tạo đơn.
class PlannedRun {
  const PlannedRun({
    required this.seq,
    required this.printerIndex,
    required this.peiIndex,
    required this.quantity,
  });

  final int seq;
  final int printerIndex;
  final int peiIndex;
  final int quantity;
}

/// Port `chiaLuotInTheoMay()` của `src/utils/bulk-production.ts`.
///
/// `sucChuaMoiMay[i]` = số con xếp vừa 1 mâm PEI **của máy thứ i**: máy khổ bàn
/// khác nhau xếp được số con khác nhau, máy nào không khai riêng thì phía gọi
/// truyền sẵn số chung vào đây. Dùng ở app **chỉ để xem trước** — số lượt thật
/// vẫn do backend chia.
List<PlannedRun> chiaLuotInTheoMay(int tongSoCon, List<int> sucChuaMoiMay) {
  if (tongSoCon <= 0 || sucChuaMoiMay.isEmpty) return const [];
  // Máy khai sức chứa <= 0 sẽ làm vòng lặp chạy mãi mà không xếp được con nào.
  if (sucChuaMoiMay.any((n) => n <= 0)) return const [];

  final luots = <PlannedRun>[];
  final soMamDaXep = List<int>.filled(sucChuaMoiMay.length, 0);
  var daXep = 0;
  var luotThu = 0;

  while (daXep < tongSoCon) {
    final may = luotThu % sucChuaMoiMay.length;
    final quantity = sucChuaMoiMay[may] < (tongSoCon - daXep)
        ? sucChuaMoiMay[may]
        : tongSoCon - daXep;
    soMamDaXep[may] += 1;
    luots.add(PlannedRun(
      seq: luots.length + 1,
      printerIndex: may,
      peiIndex: soMamDaXep[may],
      quantity: quantity,
    ));
    daXep += quantity;
    luotThu += 1;
  }

  return luots;
}

/// Kết quả xem trước khi chia lại đơn mà vẫn giữ phần đã chạy.
class ResplitPlan {
  const ResplitPlan({
    required this.giuNguyen,
    required this.suaDaChay,
    required this.daKhoa,
    required this.dungLaiMa,
    required this.themMoi,
    required this.xoa,
    required this.luotMoi,
  });

  /// Số lượt bị khóa (đã quẹt hoặc lượt in bù) — không đụng tới.
  final int giuNguyen;

  /// Mâm ĐẦY đã in được sửa lại số con vì sức chứa mâm cũ khai nhầm: (cũ, mới).
  final List<({int cu, int moi})> suaDaChay;

  /// Số con đã nằm trong các lượt bị khóa.
  final int daKhoa;

  /// Số lượt chưa chạy được tính lại nhưng **giữ nguyên mã vạch cũ**.
  final int dungLaiMa;

  /// Số lượt phải cấp mã vạch mới (in tem mới).
  final int themMoi;

  /// Số lượt `pending` thừa sẽ bị xóa từ cuối.
  final int xoa;

  /// Toàn bộ phần chia lại (dungLaiMa + themMoi), để vẽ bảng theo máy.
  final List<PlannedRun> luotMoi;
}

/// Port `chiaLaiGiuTienDo()` của `src/utils/bulk-production.ts`.
///
/// Lượt đã quẹt và lượt in bù giữ nguyên; chỉ phần chưa ai đụng tới mới chia lại,
/// rồi ghép vào các mã vạch `pending` đang có theo thứ tự `seq` — thừa thì xóa từ
/// cuối, thiếu thì backend cấp mã mới. Dùng ở app **chỉ để xem trước**.
///
/// `suaLuotDaChay` (mặc định bật): sức chứa mâm cũ khai nhầm (34 mà thật ra 35) thì
/// mâm ĐẦY đã in cũng đổi theo, nếu không tổng số con của đơn đếm sai. Mâm lẻ cuối
/// và lượt in bù không phải mâm đầy nên giữ nguyên.
ResplitPlan chiaLaiGiuTienDo(
  List<BulkRun> runs,
  int tongMoi,
  List<String> printerIds,
  List<int> sucChuaMoiMay, {
  bool suaLuotDaChay = true,
}) {
  final khoa =
      runs.where((r) => r.isRework || r.status != BulkStatus.pending).toList();
  final thayDuoc = runs
      .where((r) => !r.isRework && r.status == BulkStatus.pending)
      .toList()
    ..sort((a, b) => a.seq.compareTo(b.seq));

  // Sức chứa mâm CŨ của từng máy = lượt đầy nhất của máy đó (lượt cuối có thể lẻ).
  final sucChuaCu = <String, int>{};
  for (final run in runs) {
    final id = run.printerId;
    if (id == null || run.isRework) continue;
    if ((sucChuaCu[id] ?? 0) < run.quantity) sucChuaCu[id] = run.quantity;
  }
  final sucChuaMoi = <String, int>{
    for (var i = 0; i < printerIds.length; i++) printerIds[i]: sucChuaMoiMay[i],
  };

  /// Số con của lượt đã chạy sau khi sửa nhầm (không bật thì giữ nguyên).
  int soConSauSua(BulkRun run) {
    final id = run.printerId;
    if (!suaLuotDaChay || run.isRework || id == null) return run.quantity;
    final cu = sucChuaCu[id];
    final moi = sucChuaMoi[id];
    // Máy bị bỏ khỏi đơn thì không biết sức chứa mới; mâm lẻ cuối không phải mâm đầy.
    if (moi == null || cu == null || run.quantity != cu) return run.quantity;
    return moi;
  }

  final suaDaChay = <({int cu, int moi})>[];
  for (final run in khoa) {
    final moi = soConSauSua(run);
    if (moi != run.quantity) suaDaChay.add((cu: run.quantity, moi: moi));
  }

  // Lượt bù không nằm trong kế hoạch gốc nên không trừ vào tổng số con của đơn.
  final daKhoa = khoa
      .where((r) => !r.isRework)
      .fold<int>(0, (s, r) => s + soConSauSua(r));
  final conLai = tongMoi - daKhoa < 0 ? 0 : tongMoi - daKhoa;

  var seqMax = 0;
  final peiMax = <String, int>{};
  for (final run in khoa) {
    if (run.seq > seqMax) seqMax = run.seq;
    final id = run.printerId;
    if (id == null) continue;
    if ((peiMax[id] ?? 0) < run.peiIndex) peiMax[id] = run.peiIndex;
  }

  final luotMoi = chiaLuotInTheoMay(conLai, sucChuaMoiMay)
      .map((l) => PlannedRun(
            seq: seqMax + l.seq,
            printerIndex: l.printerIndex,
            peiIndex: (peiMax[printerIds[l.printerIndex]] ?? 0) + l.peiIndex,
            quantity: l.quantity,
          ))
      .toList();

  final dungLaiMa =
      luotMoi.length < thayDuoc.length ? luotMoi.length : thayDuoc.length;

  return ResplitPlan(
    giuNguyen: khoa.length,
    suaDaChay: suaDaChay,
    daKhoa: daKhoa,
    dungLaiMa: dungLaiMa,
    themMoi: luotMoi.length - dungLaiMa,
    xoa: thayDuoc.length - dungLaiMa,
    luotMoi: luotMoi,
  );
}

/// Chia lượt khi mọi máy dùng chung một số con/mâm.
List<PlannedRun> chiaLuotIn(int tongSoCon, int soConMoiMam, int soMay) {
  if (soMay <= 0 || soConMoiMam <= 0) return const [];
  return chiaLuotInTheoMay(tongSoCon, List<int>.filled(soMay, soConMoiMam));
}
