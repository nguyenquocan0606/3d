-- CreateTable
CREATE TABLE "ZaloAccount" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "cookieJson" TEXT,
    "imei" TEXT,
    "userAgent" TEXT,
    "ownId" TEXT,
    "displayName" TEXT,
    "avatar" TEXT,
    "trangThai" TEXT NOT NULL DEFAULT 'chua_dang_nhap',
    "lastConnectedAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZaloAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZaloThread" (
    "id" TEXT NOT NULL,
    "type" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT,
    "avatar" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessageText" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZaloThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZaloMessage" (
    "id" TEXT NOT NULL,
    "msgId" TEXT NOT NULL,
    "cliMsgId" TEXT,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT,
    "senderName" TEXT,
    "isSelf" BOOLEAN NOT NULL DEFAULT false,
    "msgType" TEXT NOT NULL DEFAULT 'webchat',
    "content" TEXT,
    "rawJson" TEXT,
    "quoteMsgId" TEXT,
    "isUndone" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZaloMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZaloAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'file',
    "fileName" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "url" TEXT,
    "localPath" TEXT,
    "taiLoi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZaloAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ZaloThread_lastMessageAt_idx" ON "ZaloThread"("lastMessageAt");

-- CreateIndex
CREATE INDEX "ZaloMessage_threadId_sentAt_idx" ON "ZaloMessage"("threadId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "ZaloMessage_threadId_msgId_key" ON "ZaloMessage"("threadId", "msgId");

-- CreateIndex
CREATE INDEX "ZaloAttachment_messageId_idx" ON "ZaloAttachment"("messageId");

-- AddForeignKey
ALTER TABLE "ZaloMessage" ADD CONSTRAINT "ZaloMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ZaloThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZaloAttachment" ADD CONSTRAINT "ZaloAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ZaloMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

