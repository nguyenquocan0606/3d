-- Tab eShop: lưu đơn hàng sàn kéo về từ MISA + trạng thái lần đồng bộ gần nhất.

-- Môi trường MISA của tenant (g2/g3) — quyết định đường dẫn API, trước đây hardcode trong code.
ALTER TABLE "MisaCredential" ADD COLUMN "env" TEXT NOT NULL DEFAULT 'g3';

CREATE TABLE "EshopOrder" (
    "id" TEXT NOT NULL,
    "refNo" TEXT,
    "ecomOrderNo" TEXT,
    "channelId" INTEGER,
    "channelName" TEXT,
    "partnerObjectName" TEXT,
    "customerName" TEXT,
    "orderStatus" INTEGER,
    "partnerOrderStatus" TEXT,
    "paymentStatus" INTEGER,
    "paymentMethod" TEXT,
    "shippingPartner" TEXT,
    "deliveryCode" TEXT,
    "totalRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refDate" TIMESTAMP(3),
    "createTime" TIMESTAMP(3),
    "prepareDueTime" TIMESTAMP(3),
    "shippingDate" TIMESTAMP(3),
    "completeDate" TIMESTAMP(3),
    "daTruTonKhoLuc" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EshopOrder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EshopOrder_refDate_idx" ON "EshopOrder"("refDate");
CREATE INDEX "EshopOrder_orderStatus_idx" ON "EshopOrder"("orderStatus");
CREATE INDEX "EshopOrder_completeDate_idx" ON "EshopOrder"("completeDate");

CREATE TABLE "EshopOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "skuCode" TEXT,
    "itemName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitName" TEXT,
    "urlImage" TEXT,

    CONSTRAINT "EshopOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EshopOrderItem_orderId_idx" ON "EshopOrderItem"("orderId");
CREATE INDEX "EshopOrderItem_skuCode_idx" ON "EshopOrderItem"("skuCode");

ALTER TABLE "EshopOrderItem" ADD CONSTRAINT "EshopOrderItem_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "EshopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EshopSyncState" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncOk" BOOLEAN,
    "lastMessage" TEXT,
    "lastCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EshopSyncState_pkey" PRIMARY KEY ("id")
);
