import 'package:flutter_test/flutter_test.dart';
import 'package:manage3d/core/scan/code_normalizer.dart';

void main() {
  const normalizer = CodeNormalizer(
    locationIds: {'LOC-01', 'LOC-02'},
    printerIds: {'PRT-ENDER3', 'PRT-BB-X1C'},
    spoolIds: {'PLA-WHT-01', 'C-PLA-R-01'},
    storeCodes: {'SP-260814-A3F2K'},
    peiSheetIds: {'8f14e45f-ceea-467a-9575-1f0f3e2a9b10'},
    orderCodes: {'DH001', 'b3c1a2d4-0000-4000-8000-000000000001'},
    bulkOrderCodes: {'SLL-001'},
    colorNames: {'Đỏ', 'Trắng', 'Xanh dương'},
  );

  group('stripDiacritics', () {
    test('bỏ dấu tiếng Việt và chữ đ', () {
      expect(stripDiacritics('Đỏ'), 'do');
      expect(stripDiacritics('Xanh dương'), 'xanh duong');
      expect(stripDiacritics('TRẮNG'), 'trang');
    });
  });

  group('phân loại mã quét', () {
    test('bỏ dấu gạch vẫn khớp đúng cuộn nhựa', () {
      // Súng quét / camera có thể trả về mã đã mất gạch nối.
      expect(normalizer.classify('PLAWHT01').kind, ScanKind.spool);
      expect(normalizer.classify('PLAWHT01').id, 'PLA-WHT-01');
      expect(normalizer.classify('pla-wht-01').id, 'PLA-WHT-01');
    });

    test('kho và máy in', () {
      expect(normalizer.classify('LOC-01').kind, ScanKind.location);
      expect(normalizer.classify('PRT-ENDER3').kind, ScanKind.printer);
    });

    test('slot AMS tách được mã máy in và số line', () {
      final result = normalizer.classify('PRT-ENDER3-L3');
      expect(result.kind, ScanKind.printerSlot);
      expect(result.id, 'PRT-ENDER3');
      expect(result.slot, 3);
    });

    test('slot chỉ hợp lệ khi phần đầu đúng là máy in có thật', () {
      expect(normalizer.classify('PRT-KHONGCO-L1').kind, ScanKind.unknown);
    });

    test('tem màu in ra đã mất dấu vẫn tìm lại đúng màu trong DB', () {
      // Máy in tem không in được Unicode nên QR chứa "CLR-DO", còn DB lưu "Đỏ".
      final result = normalizer.classify('CLR-DO');
      expect(result.kind, ScanKind.colorTag);
      expect(result.id, 'Đỏ');
    });

    test('tem màu nhiều từ', () {
      expect(normalizer.classify('CLR-XANH-DUONG').id, 'Xanh dương');
    });

    test('tem màu không có trong DB vẫn nhận đúng loại để báo lỗi rõ ràng', () {
      final result = normalizer.classify('CLR-VANG');
      expect(result.kind, ScanKind.colorTag);
      expect(result.id, isNull);
    });

    test('mâm PEI theo quy ước PEI- và cả uuid trần', () {
      const uuid = '8f14e45f-ceea-467a-9575-1f0f3e2a9b10';
      expect(normalizer.classify('PEI-$uuid').kind, ScanKind.peiSheet);
      expect(normalizer.classify('PEI-$uuid').id, uuid);
      expect(normalizer.classify(uuid).kind, ScanKind.peiSheet);
    });

    test('barcode 8 số mặc định là miếng in', () {
      expect(normalizer.classify('48120593').kind, ScanKind.printItem);
    });

    test('barcode 8 số nằm trong danh sách lượt SLL thì là lượt in', () {
      // Hai bảng dùng chung dạng mã 8 số; chỉ danh sách lượt đã tải mới phân biệt
      // được, khỏi phải hỏi API.
      const withRuns = CodeNormalizer(bulkRunIds: {'48120593'});
      expect(withRuns.classify('48120593').kind, ScanKind.bulkRun);
      expect(withRuns.classify('48120593').id, '48120593');
      expect(withRuns.classify('99999999').kind, ScanKind.printItem);
    });

    test('mã đơn hàng', () {
      expect(normalizer.classify('DH001').kind, ScanKind.order);
      expect(normalizer.classify('DH001').id, 'DH001');
    });

    test('mã đơn sản xuất số lượng lớn', () {
      expect(normalizer.classify('SLL-001').kind, ScanKind.bulkOrder);
      expect(normalizer.classify('SLL001').id, 'SLL-001');
    });

    test('hàng hóa cửa hàng khớp nguyên văn', () {
      final result = normalizer.classify('SP-260814-A3F2K');
      expect(result.kind, ScanKind.storeProduct);
      expect(result.id, 'SP-260814-A3F2K');
    });

    test('QR lệnh', () {
      final result = normalizer.classify('cmd-inv-reset');
      expect(result.kind, ScanKind.command);
      expect(result.id, ScanCommands.inventoryReset);
    });

    test('QR số con lỗi vẫn là QR lệnh', () {
      final result = normalizer.classify('cmd-loi-7');
      expect(result.kind, ScanKind.command);
      expect(ScanCommands.defectQuantityOf(result.id!), 7);
    });

    test('mã lạ và chuỗi rỗng', () {
      expect(normalizer.classify('KHONG-BIET-LA-GI').kind, ScanKind.unknown);
      expect(normalizer.classify('   ').kind, ScanKind.unknown);
    });

    test('cuộn nhựa được ưu tiên trước mã đơn hàng khi cả hai cùng khớp', () {
      // PLA-WHT-01 vừa là cuộn; nếu ai đó đặt orderCode trùng thì cuộn vẫn thắng
      // vì thao tác quét cuộn xảy ra thường xuyên hơn nhiều.
      const conflict = CodeNormalizer(
        spoolIds: {'PLA-WHT-01'},
        orderCodes: {'PLA-WHT-01'},
      );
      expect(conflict.classify('PLA-WHT-01').kind, ScanKind.spool);
    });
  });

  group('ScanCommands.defectQuantityOf', () {
    test('đọc số con lỗi từ QR số', () {
      expect(ScanCommands.defectQuantityOf('CMD-LOI-1'), 1);
      expect(ScanCommands.defectQuantityOf('CMD-LOI-30'), 30);
      // Tờ QR in ra chỉ có 1..30, nhưng mã gõ tay lớn hơn vẫn đọc được — chặn
      // theo số con trên mâm là việc của màn chốt lượt, không phải của bộ đọc mã.
      expect(ScanCommands.defectQuantityOf('CMD-LOI-99'), 99);
    });

    test('chấp nhận chữ thường và khoảng trắng thừa', () {
      expect(ScanCommands.defectQuantityOf('  cmd-loi-12  '), 12);
    });

    test('trả null với mã không phải QR số', () {
      expect(ScanCommands.defectQuantityOf('CMD-INV-RESET'), isNull);
      expect(ScanCommands.defectQuantityOf('CMD-LOI-'), isNull);
      expect(ScanCommands.defectQuantityOf('CMD-LOI-BA'), isNull);
      expect(ScanCommands.defectQuantityOf('CMD-LOI--3'), isNull);
      expect(ScanCommands.defectQuantityOf('12345678'), isNull);
    });

    test('sinh đúng mã cho tờ QR in ra', () {
      expect(ScanCommands.defect(5), 'CMD-LOI-5');
      expect(ScanCommands.defectQuantityOf(ScanCommands.defect(30)), 30);
    });
  });
}
