-- Serial dùng làm topic MQTT. Tách khỏi cloudPrinterId để việc đổi qua lại giữa LAN mode và
-- Home Assistant chỉ cần sửa cloudAccountId, không phải ghi đè ID của provider kia.
ALTER TABLE "Printer" ADD COLUMN "lanSerial" TEXT;
