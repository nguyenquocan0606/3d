/// Loại mã mà hệ thống nhận diện được (xem §4 tài liệu TAI-LIEU-HE-THONG.md).
enum ScanKind {
  spool,
  colorTag,
  location,
  printer,
  printerSlot,
  peiSheet,
  order,
  bulkOrder,
  printItem,
  storeProduct,
  command,
  unknown,
}

/// Kết quả phân loại 1 mã vừa quét.
class ScannedCode {
  const ScannedCode({
    required this.raw,
    required this.kind,
    this.id,
    this.slot,
    this.label,
  });

  final String raw;
  final ScanKind kind;

  /// Id thực tế trong hệ thống (đã khôi phục dấu gạch, VD `PLA-WHT-01`).
  final String? id;

  /// Slot AMS 1..4 khi [kind] là [ScanKind.printerSlot].
  final int? slot;

  /// Tên hiển thị kèm theo — hiện dùng cho tên màu đã khôi phục dấu tiếng Việt.
  final String? label;

  bool get isKnown => kind != ScanKind.unknown;
}

/// QR lệnh — quét thay cho bấm nút.
class ScanCommands {
  ScanCommands._();

  static const inventoryReset = 'CMD-INV-RESET';
  static const inventoryToggleAll = 'CMD-INV-TOGGLE-ALL';
  static const weightTab = 'CMD-WEIGHT-TAB';
  static const weightDone = 'CMD-WEIGHT-DONE';
}

/// Bỏ dấu tiếng Việt — port `removeDiacritics()` của `src/utils/tspl-printer.ts`.
///
/// Bắt buộc phải có: máy in tem không in được Unicode nên **nội dung QR khi in ra
/// đã bị bỏ dấu** (`CLR-Đỏ` → `CLR-DO`). Muốn quét tem màu rồi tìm lại đúng cuộn
/// trong DB (nơi vẫn lưu "Đỏ") thì phải so sánh ở dạng đã bỏ dấu như nhau.
String stripDiacritics(String input) {
  const from = 'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩ'
      'òóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ';
  const to = 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiii'
      'ooooooooooooooooouuuuuuuuuuuyyyyyd';

  final buffer = StringBuffer();
  for (final char in input.toLowerCase().split('')) {
    final index = from.indexOf(char);
    buffer.write(index == -1 ? char : to[index]);
  }
  return buffer.toString();
}

/// Chuẩn hóa & phân loại mã quét.
///
/// Port của `normalizeCode()` (print-qr-tab.tsx) + luồng nhận diện trong page.tsx:
/// mã được bỏ hết dấu `-` và viết hoa trước khi so khớp, nên `PLAWHT01` và
/// `PLA-WHT-01` là một.
class CodeNormalizer {
  const CodeNormalizer({
    this.locationIds = const {},
    this.printerIds = const {},
    this.spoolIds = const {},
    this.storeCodes = const {},
    this.peiSheetIds = const {},
    this.orderCodes = const {},
    this.bulkOrderCodes = const {},
    this.colorNames = const {},
  });

  final Set<String> locationIds;
  final Set<String> printerIds;
  final Set<String> spoolIds;

  /// `maQR` và `id` của hàng hóa cửa hàng (không bỏ dấu gạch — mã sinh sẵn dạng SP-...).
  final Set<String> storeCodes;

  /// Id (uuid) của mâm PEI. Mâm không có tiền tố riêng ở backend nên app quy ước
  /// tem in ra là `PEI-<id>`, đồng thời vẫn chấp nhận quét thẳng uuid.
  final Set<String> peiSheetIds;

  /// Mã đơn hàng (`orderCode`) và uuid đơn — dùng cho tem mã đơn dán trên thùng.
  final Set<String> orderCodes;

  /// Mã đơn sản xuất số lượng lớn (`SLL-001`) và uuid đơn.
  final Set<String> bulkOrderCodes;

  /// Tên màu nhựa có thật trong DB, để khôi phục dấu từ tem `CLR-` đã bị bỏ dấu.
  final Set<String> colorNames;

  static String normalize(String value) =>
      value.replaceAll('-', '').toUpperCase().trim();

  ScannedCode classify(String rawInput) {
    final raw = rawInput.trim();
    if (raw.isEmpty) return ScannedCode(raw: raw, kind: ScanKind.unknown);

    final upper = raw.toUpperCase();
    if (upper.startsWith('CMD-')) {
      return ScannedCode(raw: raw, kind: ScanKind.command, id: upper);
    }

    // Hàng hóa cửa hàng khớp nguyên văn (mã do client sinh, không chuẩn hóa).
    if (storeCodes.contains(raw)) {
      return ScannedCode(raw: raw, kind: ScanKind.storeProduct, id: raw);
    }

    final normalized = normalize(raw);

    final location = _match(locationIds, normalized);
    if (location != null) {
      return ScannedCode(raw: raw, kind: ScanKind.location, id: location);
    }

    final printer = _match(printerIds, normalized);
    if (printer != null) {
      return ScannedCode(raw: raw, kind: ScanKind.printer, id: printer);
    }

    final spool = _match(spoolIds, normalized);
    if (spool != null) {
      return ScannedCode(raw: raw, kind: ScanKind.spool, id: spool);
    }

    // Mâm PEI: `PEI-<uuid>` hoặc quét thẳng uuid.
    final peiCandidate =
        upper.startsWith('PEI-') ? raw.substring(4).trim() : raw;
    if (peiSheetIds.contains(peiCandidate)) {
      return ScannedCode(raw: raw, kind: ScanKind.peiSheet, id: peiCandidate);
    }

    // Slot AMS: <mã máy in>L1..L4 — chỉ hợp lệ khi phần đầu đúng là 1 máy in.
    final slotMatch = RegExp(r'^(.*)L([1-4])$').firstMatch(normalized);
    if (slotMatch != null) {
      final printerPart = _match(printerIds, slotMatch.group(1)!);
      if (printerPart != null) {
        return ScannedCode(
          raw: raw,
          kind: ScanKind.printerSlot,
          id: printerPart,
          slot: int.parse(slotMatch.group(2)!),
        );
      }
    }

    // Tem mã màu nhựa. Nội dung in ra đã bỏ dấu nên phải so ở dạng bỏ dấu.
    if (normalized.startsWith('CLR')) {
      final scannedColor = stripDiacritics(
        raw.toUpperCase().replaceFirst(RegExp(r'^CLR-?'), '').replaceAll('-', ' '),
      ).trim();
      for (final name in colorNames) {
        if (stripDiacritics(name).trim() == scannedColor) {
          return ScannedCode(
            raw: raw,
            kind: ScanKind.colorTag,
            id: name,
            label: name,
          );
        }
      }
      // Không khớp màu nào trong DB — vẫn nhận là tem màu để báo lỗi cho đúng.
      return ScannedCode(raw: raw, kind: ScanKind.colorTag, label: scannedColor);
    }

    // Tem miếng in luôn là barcode 8 chữ số — ưu tiên trước mã đơn hàng vì
    // orderCode do người dùng tự đặt, có thể trùng dạng số.
    if (RegExp(r'^\d{8}$').hasMatch(raw)) {
      return ScannedCode(raw: raw, kind: ScanKind.printItem, id: raw);
    }

    final order = _match(orderCodes, normalized);
    if (order != null) {
      return ScannedCode(raw: raw, kind: ScanKind.order, id: order);
    }

    final bulkOrder = _match(bulkOrderCodes, normalized);
    if (bulkOrder != null) {
      return ScannedCode(raw: raw, kind: ScanKind.bulkOrder, id: bulkOrder);
    }

    return ScannedCode(raw: raw, kind: ScanKind.unknown);
  }

  /// So khớp theo dạng đã bỏ gạch nối, trả về **id gốc** trong hệ thống.
  static String? _match(Set<String> ids, String normalized) {
    for (final id in ids) {
      if (normalize(id) == normalized) return id;
    }
    return null;
  }
}
