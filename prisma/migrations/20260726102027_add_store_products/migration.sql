-- CreateTable
CREATE TABLE "StoreProduct" (
    "id" TEXT NOT NULL,
    "maQR" TEXT NOT NULL,
    "ten" TEXT NOT NULL,
    "danhMuc" TEXT NOT NULL DEFAULT 'Chưa phân loại',
    "gia" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "soLuong" INTEGER NOT NULL DEFAULT 0,
    "donVi" TEXT NOT NULL DEFAULT 'cái',
    "nguongCanhBao" INTEGER NOT NULL DEFAULT 5,
    "nhaCungCap" TEXT NOT NULL DEFAULT '',
    "ghiChu" TEXT NOT NULL DEFAULT '',
    "thongTinRieng" JSONB,
    "anh" JSONB,
    "lichSu" JSONB,
    "ngayTao" TEXT NOT NULL,
    "ngayCapNhat" TEXT NOT NULL,

    CONSTRAINT "StoreProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreConfig" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "truongRieng" JSONB NOT NULL,

    CONSTRAINT "StoreConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreProduct_maQR_key" ON "StoreProduct"("maQR");
