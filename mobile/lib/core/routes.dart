/// Đường dẫn điều hướng trong app (khai báo riêng để tránh phụ thuộc vòng
/// giữa router và các module dùng điều hướng như scan_router).
///
/// Quy ước: đường dẫn **số nhiều** là màn danh sách (nằm trong tab hoặc mở từ menu
/// Thêm), đường dẫn **số ít** là màn chi tiết và luôn được push lên trên khung tab —
/// nhờ vậy quét mã ở bất kỳ tab nào cũng mở được chi tiết mà không nhảy tab.
class Routes {
  Routes._();

  // Tab chính
  static const dashboard = '/';
  static const spools = '/spools';
  static const printers = '/printers';
  static const production = '/production';
  static const more = '/more';

  // Màn phụ mở từ menu nhanh
  static const locations = '/locations';
  static const inventory = '/inventory';
  static const store = '/store';
  static const scale = '/scale';
  static const labels = '/labels';
  static const qrCommands = '/qr-commands';
  static const addSpool = '/add-spool';
  static const createJob = '/create-job';
  static const printHistory = '/print-history';
  static const pei = '/pei';
  static const bulkOrders = '/bulk-orders';
  static const createBulkOrder = '/create-bulk-order';
  static const orderCheck = '/order-check';
  static const settings = '/settings';

  /// Phiếu báo giá gửi khách (cần đăng nhập admin).
  static const baoGia = '/bao-gia';

  /// Xem camera của tất cả máy in cùng lúc.
  static const cameras = '/cameras';

  /// Màn thao tác chưa đồng bộ — danh sách chờ gửi và bị từ chối.
  static const pendingSync = '/pending-sync';

  /// Nhật ký hoạt động máy in. Thêm `?printerId=` để chỉ xem một máy.
  static const printerEvents = '/printer-events';
  static String printerEventsOf(String printerId) =>
      '$printerEvents?printerId=${Uri.encodeComponent(printerId)}';

  /// Khách Facebook: danh sách bài, nhóm theo dõi, nhật ký agent.
  static const khachFacebook = '/khach-facebook';
  static const nhomFacebook = '/khach-facebook/nhom';
  static const nhatKyFacebook = '/khach-facebook/nhat-ky';

  // Màn chi tiết (push lên root navigator)
  static String spoolDetail(String id) => '/spool/${Uri.encodeComponent(id)}';
  static String printerDetail(String id) => '/printer/${Uri.encodeComponent(id)}';
  static String locationDetail(String id) => '/location/${Uri.encodeComponent(id)}';
  static String orderDetail(String id) => '/order/${Uri.encodeComponent(id)}';
  static String storeDetail(String id) => '/product/${Uri.encodeComponent(id)}';
  static String colorDetail(String name) => '/color/${Uri.encodeComponent(name)}';
  static String peiSheetDetail(String id) => '/pei-sheet/${Uri.encodeComponent(id)}';
  static String bulkOrderDetail(String id) => '/bulk-order/${Uri.encodeComponent(id)}';
  static String eshopOrderDetail(String id) => '/eshop-order/${Uri.encodeComponent(id)}';
  static String phieuBaoGia(String id) => '/phieu-bao-gia/${Uri.encodeComponent(id)}';
}
