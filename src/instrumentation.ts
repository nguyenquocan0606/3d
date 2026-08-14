export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Provider máy in được khởi tạo lazy qua PrinterManager.getProviderAsync()
    // khi có request đầu tiên — không cần auto-connect lúc boot.
    console.log('[Instrumentation] Server started. Printer providers will connect lazily.');
  }
}
