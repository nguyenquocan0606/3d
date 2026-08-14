-- CreateTable
CREATE TABLE "MisaCredential" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "bearerToken" TEXT,
    "cookie" TEXT,
    "deviceId" TEXT,
    "msBid" TEXT,
    "dbid" TEXT,
    "tid" TEXT,
    "tco" TEXT,
    "brid" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastCheckOk" BOOLEAN,
    "lastCheckMessage" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MisaCredential_pkey" PRIMARY KEY ("id")
);
