/// Ghép chuỗi phím do máy PDA "gõ" thành một mã hoàn chỉnh.
///
/// Đầu đọc của PDA ở chế độ HID hoạt động y hệt bàn phím ngoài: bắn từng ký tự
/// của mã thật nhanh rồi kết thúc bằng Enter (hoặc Tab). Cùng cách làm với bộ bắt
/// `keydown` toàn cục của bản web (`src/app/page.tsx`), nhưng nới khoảng cách
/// giữa hai phím lên [maxGap] vì PDA Android bắn chậm hơn súng quét USB cắm PC.
///
/// Tách riêng phần logic thuần (không đụng Flutter) để test được mà không cần có
/// máy thật trong tay.
class HidScanBuffer {
  HidScanBuffer({
    this.maxGap = const Duration(milliseconds: 200),
    this.minLength = 3,
  });

  /// Quá khoảng này chưa thấy phím kế tiếp thì chuỗi đang gõ coi như bỏ dở.
  ///
  /// Ngưỡng này là thứ phân biệt máy quét với ngón tay người: đầu đọc bắn cả mã
  /// trong vài chục ms, người gõ nhanh nhất cũng cách nhau hơn 100ms.
  final Duration maxGap;

  /// Mã ngắn hơn ngần này là phím lạc, không phải tem.
  final int minLength;

  String _pending = '';
  DateTime? _lastAt;

  /// Phần đang gõ dở — dùng cho ô thử máy quét trong màn Cài đặt.
  String get pending => _pending;

  /// Nạp một phím. Trả về mã hoàn chỉnh khi gặp phím kết thúc, ngược lại null.
  ///
  /// [now] truyền vào thay vì gọi `DateTime.now()` bên trong để test điều khiển
  /// được thời gian.
  String? add({
    required DateTime now,
    String? character,
    bool isTerminator = false,
  }) {
    final last = _lastAt;
    if (last != null && now.difference(last) > maxGap) _pending = '';
    _lastAt = now;

    if (isTerminator) {
      final code = _pending.trim();
      _pending = '';
      return code.length >= minLength ? code : null;
    }

    if (character == null) return null;

    // Ký tự điều khiển (\n, \t, ESC...) không thuộc nội dung tem.
    final clean = character.replaceAll(RegExp(r'[\x00-\x1F\x7F]'), '');
    if (clean.isEmpty) return null;

    _pending += clean;
    return null;
  }

  void reset() {
    _pending = '';
    _lastAt = null;
  }
}
