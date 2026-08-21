/// Nguồn mã quét mà app đang dùng.
///
/// Xưởng chạy song song hai loại thiết bị: điện thoại (chỉ có camera) và máy PDA
/// có đầu đọc laser rời. Cùng một màn hình phải phục vụ được cả hai nên chế độ
/// quét là **cấu hình của máy**, chọn một lần trong Cài đặt rồi thôi.
enum ScanInputMode {
  /// Quét bằng camera (`mobile_scanner`) — phải mở màn quét rồi giơ máy vào tem.
  camera,

  /// Máy PDA: bóp cò cứng, đầu đọc "gõ" mã ra như một bàn phím ngoài rồi Enter.
  /// Không cần mở màn quét — đứng ở màn nghiệp vụ nào thì mã vào thẳng màn đó.
  pda;

  String get label => switch (this) {
        ScanInputMode.camera => 'Camera',
        ScanInputMode.pda => 'Máy PDA',
      };

  String get description => switch (this) {
        ScanInputMode.camera =>
          'Bấm nút quét để mở khung camera rồi giơ máy vào mã.',
        ScanInputMode.pda =>
          'Bóp cò trên máy PDA ngay tại màn đang đứng, không cần bấm nút quét.',
      };

  /// Đọc lại giá trị đã lưu; tên lạ (bản cũ / dữ liệu hỏng) thì về camera.
  static ScanInputMode fromName(String? name) {
    for (final mode in ScanInputMode.values) {
      if (mode.name == name) return mode;
    }
    return ScanInputMode.camera;
  }
}
