-- Tách kênh thông báo: Discord nhận mọi thứ (kể cả ảnh camera từng lớp), Zalo chỉ nhận việc cần
-- người xử lý ngay. Vì vậy Zalo được nâng ngưỡng mặc định lên "loi".
ALTER TABLE "CaiDatThongBao" ADD COLUMN "guiDiscord" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CaiDatThongBao" ADD COLUMN "discordWebhook" TEXT;
ALTER TABLE "CaiDatThongBao" ADD COLUMN "nguongDiscord" TEXT NOT NULL DEFAULT 'tin';
ALTER TABLE "CaiDatThongBao" ADD COLUMN "anhTheoLop" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CaiDatThongBao" ADD COLUMN "soAnhMoiLop" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CaiDatThongBao" ADD COLUMN "phutToiThieuGiuaAnh" INTEGER NOT NULL DEFAULT 5;
