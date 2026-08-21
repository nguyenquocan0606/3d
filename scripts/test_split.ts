import { PrismaClient } from '@prisma/client';
import { chiaLaiGiuTienDo } from '../src/utils/bulk-production';

const prisma = new PrismaClient();

async function main() {
  const order = await prisma.bulkOrder.findFirst({
    where: { runs: { some: { quantity: 34 } } },
    include: { runs: { orderBy: { seq: 'asc' } } }
  });
  
  if (!order) {
    console.log("No order found with 34 items");
    return;
  }
  
  console.log("Order:", order.productName, "Total:", order.totalQuantity);
  
  // Find printer IDs
  const printerIds = [...new Set(order.runs.map(r => r.printerId).filter(Boolean))] as string[];
  console.log("Printers:", printerIds);
  
  const sucChua = printerIds.map(() => 35);
  
  const keHoach = chiaLaiGiuTienDo(order.runs, 3000, printerIds, sucChua, true);
  
  console.log("Sửa đã chạy:", keHoach.suaDaChay.length);
  console.log(keHoach.suaDaChay.slice(0, 5));
}

main().catch(console.error).finally(() => prisma.$disconnect());
