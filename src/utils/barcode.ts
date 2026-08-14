import prisma from './db';

/**
 * Sinh mã vạch (Barcode) 8 chữ số ngẫu nhiên duy nhất cho PrintItem / BulkRun.
 *
 * Kiểm tra trùng trên CẢ 2 bảng: 2 chế độ sản xuất (theo con và theo lượt PEI) dùng chung
 * 1 ô quét mã ngoài xưởng, mã trùng nhau thì quẹt xong không biết đang cập nhật cái nào.
 *
 * @param taken - Tập các mã đã cấp trong cùng request (chưa insert vào DB).
 *                Bắt buộc truyền vào khi sinh nhiều mã trong 1 batch để
 *                tránh trùng lặp trước khi createMany.
 */
export async function generateUniqueBarcode(taken: Set<string>): Promise<string> {
  while (true) {
    const randomId = Math.floor(10000000 + Math.random() * 90000000).toString(); // Số từ 10000000 đến 99999999
    if (taken.has(randomId)) continue;

    const [printItem, bulkRun] = await Promise.all([
      prisma.printItem.findUnique({ where: { id: randomId }, select: { id: true } }),
      prisma.bulkRun.findUnique({ where: { id: randomId }, select: { id: true } }),
    ]);
    if (!printItem && !bulkRun) {
      taken.add(randomId);
      return randomId;
    }
  }
}
