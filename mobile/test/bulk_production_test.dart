import 'package:flutter_test/flutter_test.dart';
import 'package:manage3d/data/models/bulk_order.dart';

/// Bản xem trước lúc tạo đơn phải khớp đúng cách backend chia lượt
/// (`src/utils/bulk-production.ts`), nếu lệch thì người dùng thấy một đằng, hệ
/// thống sinh mã một nẻo.
void main() {
  group('chiaLuotIn', () {
    test('chia tròn, round-robin theo thứ tự máy', () {
      final luots = chiaLuotIn(240, 60, 2);
      expect(luots.length, 4);
      expect(luots.map((l) => l.printerIndex), [0, 1, 0, 1]);
      expect(luots.map((l) => l.peiIndex), [1, 1, 2, 2]);
      expect(luots.every((l) => l.quantity == 60), isTrue);
    });

    test('lượt cuối nhận phần dư', () {
      final luots = chiaLuotIn(250, 60, 2);
      expect(luots.length, 5);
      expect(luots.last.quantity, 10);
      expect(luots.last.seq, 5);
      expect(luots.last.printerIndex, 0);
      expect(luots.last.peiIndex, 3);
    });

    test('số không hợp lệ trả về danh sách rỗng', () {
      expect(chiaLuotIn(0, 60, 2), isEmpty);
      expect(chiaLuotIn(100, 0, 2), isEmpty);
      expect(chiaLuotIn(100, 60, 0), isEmpty);
    });
  });

  group('chiaLuotInTheoMay', () {
    test('mỗi máy xếp theo sức chứa mâm riêng của nó', () {
      // Máy 1 khổ to (100 con/mâm), máy 2 khổ nhỏ (40 con/mâm).
      final luots = chiaLuotInTheoMay(280, [100, 40]);
      expect(luots.map((l) => l.quantity), [100, 40, 100, 40]);
      expect(luots.map((l) => l.printerIndex), [0, 1, 0, 1]);
      expect(
        luots.where((l) => l.printerIndex == 1).map((l) => l.peiIndex),
        [1, 2],
      );
    });

    test('lượt cuối vẫn nhận phần dư', () {
      expect(chiaLuotInTheoMay(150, [100, 40]).map((l) => l.quantity), [100, 40, 10]);
    });

    test('sức chứa <= 0 trả rỗng thay vì lặp vô hạn', () {
      expect(chiaLuotInTheoMay(100, [50, 0]), isEmpty);
      expect(chiaLuotInTheoMay(100, const []), isEmpty);
    });
  });

  group('BulkOrder', () {
    BulkRun run(
      String id,
      int quantity,
      BulkStatus status, {
      int defects = 0,
      bool isRework = false,
    }) =>
        BulkRun(
          id: id,
          orderId: 'o1',
          printerName: 'PRT-01',
          seq: 1,
          peiIndex: 1,
          quantity: quantity,
          defectQuantity: defects,
          isRework: isRework,
          status: status,
        );

    test('miếng lỗi bị trừ khỏi hàng tốt và gom lại để in bù', () {
      final order = BulkOrder(
        id: 'o1',
        productName: 'Móc khóa rồng',
        totalQuantity: 100,
        perSheetQty: 50,
        status: BulkStatus.printing,
        runs: [
          run('1', 50, BulkStatus.completed, defects: 3),
          run('2', 50, BulkStatus.completed, defects: 2),
        ],
      );

      expect(order.doneQuantity, 95);
      expect(order.defectQuantity, 5);
      expect(order.pendingRework, 5);
    });

    test('lượt bù đã tạo thì không còn cần in bù nữa', () {
      final order = BulkOrder(
        id: 'o1',
        productName: 'X',
        totalQuantity: 100,
        perSheetQty: 50,
        status: BulkStatus.printing,
        runs: [
          run('1', 50, BulkStatus.completed, defects: 5),
          run('2', 5, BulkStatus.pending, isRework: true),
        ],
      );

      expect(order.pendingRework, 0);
    });

    test('chỉ lượt đã xong mới tính vào tiến độ', () {
      final order = BulkOrder(
        id: 'o1',
        productName: 'Móc khóa rồng',
        totalQuantity: 200,
        perSheetQty: 50,
        status: BulkStatus.printing,
        runs: [
          run('1', 50, BulkStatus.completed),
          run('2', 50, BulkStatus.printing),
          run('3', 50, BulkStatus.pending),
          run('4', 50, BulkStatus.completed),
        ],
      );

      expect(order.doneQuantity, 100);
      expect(order.doneRuns, 2);
      expect(order.progress, 0.5);
    });

    test('gom lượt theo máy giữ thứ tự máy xuất hiện lần đầu', () {
      const base = BulkRun(
        id: '0',
        orderId: 'o1',
        printerName: 'A',
        seq: 1,
        peiIndex: 1,
        quantity: 10,
        status: BulkStatus.pending,
      );
      final order = BulkOrder(
        id: 'o1',
        productName: 'X',
        totalQuantity: 30,
        perSheetQty: 10,
        status: BulkStatus.pending,
        runs: const [
          base,
          BulkRun(
            id: '1',
            orderId: 'o1',
            printerName: 'B',
            seq: 2,
            peiIndex: 1,
            quantity: 10,
            status: BulkStatus.pending,
          ),
          BulkRun(
            id: '2',
            orderId: 'o1',
            printerName: 'A',
            seq: 3,
            peiIndex: 2,
            quantity: 10,
            status: BulkStatus.pending,
          ),
        ],
      );

      final groups = order.runsByPrinter;
      expect(groups.map((g) => g.printerName), ['A', 'B']);
      expect(groups.first.runs.length, 2);
      expect(groups.first.quantity, 20);
    });
  });
}
