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

  group('BulkOrder', () {
    BulkRun run(String id, int quantity, BulkStatus status) => BulkRun(
          id: id,
          orderId: 'o1',
          printerName: 'PRT-01',
          seq: 1,
          peiIndex: 1,
          quantity: quantity,
          status: status,
        );

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
