import 'package:flutter_test/flutter_test.dart';
import 'package:manage3d/core/scan/hid_scan_buffer.dart';

void main() {
  final start = DateTime(2026, 8, 16, 9, 30);

  /// Bắn cả chuỗi như đầu đọc PDA: mỗi ký tự cách nhau [gapMs].
  String? typeCode(
    HidScanBuffer buffer,
    String text, {
    int gapMs = 10,
    bool enter = true,
    DateTime? from,
  }) {
    var now = from ?? start;
    for (final char in text.split('')) {
      now = now.add(Duration(milliseconds: gapMs));
      buffer.add(now: now, character: char);
    }
    if (!enter) return null;
    return buffer.add(now: now.add(Duration(milliseconds: gapMs)), isTerminator: true);
  }

  group('ghép mã từ phím máy PDA', () {
    test('bắn nhanh rồi Enter thì ra đúng mã', () {
      final buffer = HidScanBuffer();
      expect(typeCode(buffer, 'C-PLA-R-01'), 'C-PLA-R-01');
      expect(buffer.pending, isEmpty);
    });

    test('Enter xong là sạch buffer, quét cái tiếp theo không dính mã cũ', () {
      final buffer = HidScanBuffer();
      typeCode(buffer, 'PRT-BB-X1C');
      expect(
        typeCode(buffer, '12345678', from: start.add(const Duration(seconds: 5))),
        '12345678',
      );
    });

    test('chưa Enter thì chưa chốt, mã nằm ở pending', () {
      final buffer = HidScanBuffer();
      typeCode(buffer, 'LOC-01', enter: false);
      expect(buffer.pending, 'LOC-01');
    });

    test('gõ tay chậm hơn maxGap thì bỏ, không nhận nhầm là quét', () {
      final buffer = HidScanBuffer();
      // 300ms/phím: nhanh với ngón tay người, chậm gấp mấy lần đầu đọc.
      expect(typeCode(buffer, 'ABCDEF', gapMs: 300), isNull);
    });

    test('bỏ dở giữa chừng rồi quét lại thì chỉ lấy lần quét sau', () {
      final buffer = HidScanBuffer();
      typeCode(buffer, 'ABC', enter: false);
      final code = typeCode(
        buffer,
        'PEI-9',
        from: start.add(const Duration(seconds: 2)),
      );
      expect(code, 'PEI-9');
    });

    test('mã quá ngắn coi như phím lạc', () {
      final buffer = HidScanBuffer();
      expect(typeCode(buffer, 'AB'), isNull);
    });

    test('ký tự điều khiển không lọt vào mã', () {
      final buffer = HidScanBuffer();
      var now = start;
      for (final char in ['S', 'P', '\n', '0', '1', '\t']) {
        now = now.add(const Duration(milliseconds: 10));
        buffer.add(now: now, character: char);
      }
      expect(
        buffer.add(now: now.add(const Duration(milliseconds: 10)), isTerminator: true),
        'SP01',
      );
    });

    test('reset xóa sạch phần đang gõ dở', () {
      final buffer = HidScanBuffer();
      typeCode(buffer, 'ABC', enter: false);
      buffer.reset();
      expect(buffer.pending, isEmpty);
    });
  });
}
