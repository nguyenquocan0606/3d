export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Provider máy in được khởi tạo lazy qua PrinterManager.getProviderAsync()
    // khi có request đầu tiên — không cần auto-connect lúc boot.
    console.log('[Instrumentation] Server started. Printer providers will connect lazily.');

    const { khoiDongLichDongBoEshop } = await import('./services/eshop-scheduler');
    khoiDongLichDongBoEshop();

    // Vòng giám sát máy in: nguồn duy nhất sinh thông báo đẩy về sự cố máy in.
    const { khoiDongGiamSatMayIn } = await import('./services/printer-monitor.service');
    khoiDongGiamSatMayIn();
  }
}
