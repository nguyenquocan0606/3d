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
    this.printerId,
    this.startedAt,
    this.finishedAt,
  });

  final String id;
  final String orderId;
  final String? printerId;

  /// Tên máy chốt lúc chia lượt — vẫn đọc được kể cả khi máy đã bị xóa.
  final String printerName;

  final int seq;
  final int peiIndex;
  final int quantity;
  final BulkStatus status;
  final DateTime? startedAt;
  final DateTime? finishedAt;

  /// Thời gian in thực tế của lượt, null khi chưa quẹt đủ 2 đầu.
  Duration? get elapsed {
    if (startedAt == null || finishedAt == null) return null;
    final diff = finishedAt!.difference(startedAt!);
    return diff.isNegative ? null : diff;
  }

  factory BulkRun.fromJson(Map<String, dynamic> json) => BulkRun(
        id: asString(json['id']),
        orderId: asString(json['orderId']),
        printerId: asStringOrNull(json['printerId']),
        printerName: asString(json['printerName'], '—'),
        seq: asInt(json['seq']),
        peiIndex: asInt(json['peiIndex']),
        quantity: asInt(json['quantity']),
        status: BulkStatus.from(asStringOrNull(json['status'])),
        startedAt: asDate(json['startedAt']),
        finishedAt: asDate(json['finishedAt']),
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

  /// Chỉ lượt đã xong mới tính là hàng ra — khớp `soConDaXong()` bản web.
  int get doneQuantity => runs
      .where((r) => r.status == BulkStatus.completed)
      .fold(0, (sum, r) => sum + r.quantity);

  int get doneRuns => runs.where((r) => r.status == BulkStatus.completed).length;

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

/// Port `chiaLuotIn()` của `src/utils/bulk-production.ts`.
///
/// Chia vòng tròn cho các máy được chọn để không máy nào phải chờ máy khác xong;
/// lượt cuối nhận phần dư. Dùng ở app **chỉ để xem trước** — số lượt thật vẫn do
/// backend chia lúc tạo đơn.
List<PlannedRun> chiaLuotIn(int tongSoCon, int soConMoiMam, int soMay) {
  if (tongSoCon <= 0 || soConMoiMam <= 0 || soMay <= 0) return const [];

  final soLuot = (tongSoCon / soConMoiMam).ceil();
  return [
    for (var i = 0; i < soLuot; i++)
      PlannedRun(
        seq: i + 1,
        printerIndex: i % soMay,
        peiIndex: i ~/ soMay + 1,
        quantity: (tongSoCon - i * soConMoiMam) < soConMoiMam
            ? tongSoCon - i * soConMoiMam
            : soConMoiMam,
      ),
  ];
}
