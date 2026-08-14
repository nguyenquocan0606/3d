-- DropForeignKey
ALTER TABLE "Task3D" DROP CONSTRAINT "Task3D_printerId_fkey";

-- AlterTable
ALTER TABLE "Task3D" ALTER COLUMN "printerId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Task3D" ADD CONSTRAINT "Task3D_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
