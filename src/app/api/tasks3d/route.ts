import prisma from '@/utils/db';
import { ok, fail } from '@/utils/api-response';

// Lấy danh sách lịch sử in (GET)
export async function GET() {
  try {
    const tasks = await prisma.task3D.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        printer: true,
        usages: {
          include: {
            spool: {
              include: {
                filament: true
              }
            }
          }
        }
      }
    });
    return ok(tasks);
  } catch (error: unknown) {
    console.error('Lỗi khi lấy danh sách Task3D:', error);
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}

// Tạo lệnh in mới (POST)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { printerId, durationMinutes, spools, name } = body;

    // spools là mảng: { id: string, weightG: number }

    if (!printerId || !durationMinutes || !spools || !Array.isArray(spools) || spools.length === 0) {
      return fail('Thiếu thông tin yêu cầu', 400);
    }

    // Tính toán thời gian dự kiến xong
    const estimatedEndTime = new Date(Date.now() + durationMinutes * 60000);

    // Mở transaction để đảm bảo toàn vẹn dữ liệu
    const result = await prisma.$transaction(async (tx) => {
      // 1. Cập nhật trạng thái máy in thành printing
      await tx.printer.update({
        where: { id: printerId },
        data: { status: 'printing' }
      });

      // 2. Tạo Task3D
      const task = await tx.task3D.create({
        data: {
          printerId,
          durationMinutes: Number(durationMinutes),
          estimatedEndTime,
          status: 'printing',
          name: name || null
        }
      });

      // 3. Xử lý từng cuộn nhựa
      for (const item of spools) {
        const spoolId = item.id;
        const usedWeight = Number(item.weightG);

        // Trừ khối lượng và chuyển vị trí sang máy in
        const currentSpool = await tx.spool.findUnique({ where: { id: spoolId } });
        if (!currentSpool) {
          throw new Error(`Không tìm thấy cuộn nhựa: ${spoolId}`);
        }

        const newWeight = Math.max(0, currentSpool.remainingWeightG - usedWeight);
        const newStatus = newWeight <= 0 ? 'depleted' : currentSpool.status;

        await tx.spool.update({
          where: { id: spoolId },
          data: {
            remainingWeightG: newWeight,
            status: newStatus,
            locationId: null,      // Rời khỏi kho
            printerId: printerId   // Gắn vào máy in
          }
        });

        // Tạo Usage Record
        await tx.task3DSpoolUsage.create({
          data: {
            taskId: task.id,
            spoolId: spoolId,
            usedWeightG: usedWeight
          }
        });
      }

      return task;
    });

    return ok(result, 'Tạo lệnh in thành công');
  } catch (error: unknown) {
    console.error('Lỗi tạo Task3D:', error);
    return fail(error instanceof Error ? error.message : 'Lỗi máy chủ');
  }
}
