-- LAN mode Bambu: mỗi máy in tự nó là một broker MQTT (cổng 8883, TLS, user "bblp"),
-- nên IP + Access Code phải nằm ở từng máy chứ không ở CloudAccount.
-- Cả hai cột đều nullable: máy đang chạy qua Home Assistant / Moonraker không cần điền.
ALTER TABLE "Printer" ADD COLUMN "lanIp" TEXT;
ALTER TABLE "Printer" ADD COLUMN "lanAccessCode" TEXT;
