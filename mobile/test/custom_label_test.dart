import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:manage3d/features/labels/custom_label.dart';

void main() {
  // Vẽ tem cần engine đồ họa của Flutter, không chạy được ở test Dart thuần.
  TestWidgetsFlutterBinding.ensureInitialized();

  group('renderCustomLabelBase64', () {
    /// Máy chủ từ chối thẳng bitmap sai kích thước (`/api/print-jobs/custom`),
    /// nên đây là hợp đồng phải giữ với mọi bố cục.
    const kichThuoc = 40 * 240; // 40 byte/dòng × 240 dòng = 9600

    for (final template in LabelTemplate.values) {
      test('bố cục ${template.label} cho ra đúng 9600 byte', () async {
        final base64Data = await renderCustomLabelBase64(
          CustomLabelSpec(
            template: template,
            line1: 'PLA-WHT-01',
            line2: 'Kệ điện thoại',
            line3: 'Màu trắng ngà',
            codeContent: 'PLA-WHT-01',
            fontSize: LabelFontSize.md,
          ),
        );

        expect(base64Decode(base64Data), hasLength(kichThuoc));
      });
    }

    test('tem trống vẫn là giấy trắng, không byte lạ', () async {
      final bytes = base64Decode(
        await renderCustomLabelBase64(
          const CustomLabelSpec(
            template: LabelTemplate.textOnly,
            line1: '',
            line2: '',
            line3: '',
            codeContent: '',
            fontSize: LabelFontSize.md,
          ),
        ),
      );

      // Bit 1 = không đốt nhiệt = để trắng.
      expect(bytes.every((byte) => byte == 0xFF), isTrue);
    });

    test('có chữ thì phải có chấm đen', () async {
      final bytes = base64Decode(
        await renderCustomLabelBase64(
          const CustomLabelSpec(
            template: LabelTemplate.textOnly,
            line1: 'HANG DE VO',
            line2: '',
            line3: '',
            codeContent: '',
            fontSize: LabelFontSize.xl,
          ),
        ),
      );

      expect(bytes.any((byte) => byte != 0xFF), isTrue);
    });
  });

  group('CustomLabelSpec', () {
    test('mã lấy từ dòng 1 khi ô nội dung mã bỏ trống', () {
      const spec = CustomLabelSpec(
        template: LabelTemplate.qrText,
        line1: 'PLA-WHT-01',
        line2: '',
        line3: '',
        codeContent: '   ',
        fontSize: LabelFontSize.md,
      );

      expect(spec.code, 'PLA-WHT-01');
    });

    test('mẫu có mã bị chặn trần cỡ chữ, mẫu chỉ chữ thì không', () {
      const to = LabelFontSize.xxl;

      const coMa = CustomLabelSpec(
        template: LabelTemplate.qrText,
        line1: 'A',
        line2: '',
        line3: '',
        codeContent: '',
        fontSize: to,
      );
      const chiChu = CustomLabelSpec(
        template: LabelTemplate.textOnly,
        line1: 'A',
        line2: '',
        line3: '',
        codeContent: '',
        fontSize: to,
      );

      expect(coMa.resolvedFontPx, 40);
      expect(chiChu.resolvedFontPx, to.px);
    });

    test('tem rỗng khi cả 3 dòng đều trống', () {
      const spec = CustomLabelSpec(
        template: LabelTemplate.textOnly,
        line1: '  ',
        line2: '',
        line3: '',
        codeContent: 'CO-MA-NHUNG-KHONG-CO-CHU',
        fontSize: LabelFontSize.md,
      );

      expect(spec.isEmpty, isTrue);
    });
  });
}
