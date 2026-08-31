-- AlterTable
ALTER TABLE "Filament" ADD COLUMN     "costPerKg" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "PeiSheet" ADD COLUMN     "plateType" TEXT;

-- AlterTable
ALTER TABLE "Printer" ADD COLUMN     "buildVolumeXMm" DOUBLE PRECISION,
ADD COLUMN     "buildVolumeYMm" DOUBLE PRECISION,
ADD COLUMN     "buildVolumeZMm" DOUBLE PRECISION,
ADD COLUMN     "nozzleDiameterMm" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "CauHinhBaoGia" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "gioMayInVnd" DOUBLE PRECISION NOT NULL DEFAULT 3000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CauHinhBaoGia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT,
    "printerId" TEXT,
    "peiSheetId" TEXT,
    "filamentId" TEXT,
    "infillPercent" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "layerHeightMm" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "instanceCount" INTEGER NOT NULL DEFAULT 1,
    "volumeCm3" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weightG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timeMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mode" TEXT NOT NULL DEFAULT 'estimate',
    "sliceStatus" TEXT,
    "sliceError" TEXT,
    "giaVon" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gia" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "giaBanLe" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "giaKhuyenMai" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Quote_createdAt_idx" ON "Quote"("createdAt");

-- CreateIndex
CREATE INDEX "Quote_printerId_idx" ON "Quote"("printerId");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_peiSheetId_fkey" FOREIGN KEY ("peiSheetId") REFERENCES "PeiSheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_filamentId_fkey" FOREIGN KEY ("filamentId") REFERENCES "Filament"("id") ON DELETE SET NULL ON UPDATE CASCADE;
