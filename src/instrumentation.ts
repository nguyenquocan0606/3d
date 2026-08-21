export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Provider máy in được khởi tạo lazy qua PrinterManager.getProviderAsync()
    // khi có request đầu tiên — không cần auto-connect lúc boot.
    console.log('[Instrumentation] Server started. Printer providers will connect lazily.');

    const { khoiDongLichDongBoEshop } = await import('./services/eshop-scheduler');
    khoiDongLichDongBoEshop();

    // Từ điển mã lỗi tiếng Việt của Bambu — nạp nền, không chặn khởi động. Chưa xong thì thông
    // báo chỉ thiếu phần chữ, vẫn có mã.
    const { napTuDienLoi } = await import('./services/printer-integration/providers/bambu/tu-dien-loi');
    void napTuDienLoi();

    // Vòng giám sát máy in: nguồn duy nhất sinh thông báo đẩy về sự cố máy in.
    const { khoiDongGiamSatMayIn } = await import('./services/printer-monitor.service');
    khoiDongGiamSatMayIn();
  }
}
