-- CreateTable
CREATE TABLE "SuKienMayIn" (
    "id" TEXT NOT NULL,
    "printerId" TEXT NOT NULL,
    "tenMay" TEXT NOT NULL,
    "loai" TEXT NOT NULL,
    "mucDo" TEXT NOT NULL DEFAULT 'tin',
    "tieuDe" TEXT NOT NULL,
    "noiDung" TEXT NOT NULL,
    "tienDo" INTEGER,
    "tenFile" TEXT,
    "nhietVoi" DOUBLE PRECISION,
    "nhietBan" DOUBLE PRECISION,
    "daGui" BOOLEAN NOT NULL DEFAULT false,
    "loiGui" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuKienMayIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThietBiThongBao" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "nenTang" TEXT NOT NULL,
    "tenMay" TEXT,
    "hoatDong" BOOLEAN NOT NULL DEFAULT true,
    "lanCuoi" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThietBiThongBao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaiDatThongBao" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "bat" BOOLEAN NOT NULL DEFAULT true,
    "guiApp" BOOLEAN NOT NULL DEFAULT true,
    "guiZalo" BOOLEAN NOT NULL DEFAULT false,
    "zaloThreadId" TEXT,
    "zaloTenHoiThoai" TEXT,
    "loaiTat" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nguongZalo" TEXT NOT NULL DEFAULT 'canhBao',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaiDatThongBao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SuKienMayIn_printerId_createdAt_idx" ON "SuKienMayIn"("printerId", "createdAt");

-- CreateIndex
CREATE INDEX "SuKienMayIn_createdAt_idx" ON "SuKienMayIn"("createdAt");

-- CreateIndex
CREATE INDEX "SuKienMayIn_loai_idx" ON "SuKienMayIn"("loai");

-- CreateIndex
CREATE UNIQUE INDEX "ThietBiThongBao_token_key" ON "ThietBiThongBao"("token");

-- CreateIndex
CREATE INDEX "ThietBiThongBao_hoatDong_idx" ON "ThietBiThongBao"("hoatDong");

-- AddForeignKey
ALTER TABLE "SuKienMayIn" ADD CONSTRAINT "SuKienMayIn_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
