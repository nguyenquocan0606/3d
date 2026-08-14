import 'package:flutter/material.dart';

/// Bảng màu bám theo bản web: nền `#090d16`, thẻ `#111827`, accent indigo `#4f46e5`.
class AppColors {
  AppColors._();

  static const indigo = Color(0xFF4F46E5);
  static const indigoLight = Color(0xFF6366F1);
  static const background = Color(0xFF090D16);
  static const surface = Color(0xFF111827);
  static const surfaceAlt = Color(0xFF0F1729);

  /// Viền/đường kẻ. Trước đây là #1F2937 — gần như tàng hình trên nền #090D16
  /// (tương phản ~1.5:1), làm mọi thẻ trông nhòe vào nhau. Giá trị mới lấy theo
  /// bảng màu "Digital Signage / Kiosk" của skill, hợp bối cảnh xưởng: nhìn lướt,
  /// thiếu sáng, cầm máy xa mắt.
  static const border = Color(0xFF334155);

  static const success = Color(0xFF10B981);
  static const warning = Color(0xFFF59E0B);
  static const danger = Color(0xFFEF4444);
  static const info = Color(0xFF06B6D4);
  static const muted = Color(0xFF94A3B8);

  /// Parse `#RRGGBB` / `#RRGGBBAA` từ DB. Trả về màu mặc định nếu chuỗi hỏng.
  static Color fromHex(String? hex, {Color fallback = indigo}) {
    if (hex == null) return fallback;
    var value = hex.trim().replaceAll('#', '');
    if (value.length == 3) {
      value = value.split('').map((c) => '$c$c').join();
    }
    if (value.length == 8) value = value.substring(0, 6); // bỏ alpha kiểu HA
    if (value.length != 6) return fallback;
    final parsed = int.tryParse(value, radix: 16);
    if (parsed == null) return fallback;
    return Color(0xFF000000 | parsed);
  }

  /// Màu cảnh báo theo khối lượng còn lại — khớp `SpoolsView` bản web
  /// (≤150g đỏ, ≤330g vàng).
  static Color forRemaining(double grams) {
    if (grams <= 150) return danger;
    if (grams <= 330) return warning;
    return success;
  }

  /// Chọn màu chữ tương phản để đặt lên nền màu nhựa.
  static Color onColor(Color background) =>
      background.computeLuminance() > 0.55 ? Colors.black87 : Colors.white;
}

/// Token kích thước dùng chung — pro-rules yêu cầu icon/spacing theo thang cố định
/// thay vì rải số tùy hứng (20/24/28...) làm nhịp thị giác lộn xộn.
class AppSize {
  AppSize._();

  /// Vùng chạm tối thiểu: 48dp Android / 44pt iOS → lấy mức lớn hơn cho an toàn.
  static const touchTarget = 48.0;

  /// Chiều cao thanh điều hướng dưới (chưa tính safe area).
  static const navBar = 64.0;

  /// Khoảng chừa dưới cùng cho ListView nằm trong khung tab, để nội dung cuối
  /// không bị thanh dưới và nút quét che mất.
  static const listBottomInset = 104.0;

  // Icon — 3 bậc, không dùng giá trị ngoài thang này.
  static const iconSm = 16.0;
  static const iconMd = 22.0;
  static const iconLg = 28.0;

  // Chữ. Body >= 14, phụ đề >= 12.5. Nhãn tab dưới đạt đúng ngưỡng 12 nhờ rút
  // còn 4 mục — mỗi mục ~71dp trên máy 360dp, đủ chỗ cho "Tổng quan".
  static const textNav = 12.0;
  static const textCaption = 12.5;
  static const textBody = 14.0;
  static const textTitle = 16.0;
}

class AppTheme {
  AppTheme._();

  static ThemeData get dark {
    const scheme = ColorScheme.dark(
      primary: AppColors.indigo,
      secondary: AppColors.indigoLight,
      surface: AppColors.surface,
      error: AppColors.danger,
      onPrimary: Colors.white,
      onSurface: Color(0xFFE2E8F0),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: scheme,
      scaffoldBackgroundColor: AppColors.background,
      splashFactory: InkSparkle.splashFactory,
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          color: Colors.white,
        ),
      ),
      // Không khai báo cardTheme/dialogTheme ở đây: kiểu của chúng đổi giữa các bản
      // Flutter (CardTheme → CardThemeData). SectionCard tự dựng bằng Material nên
      // không cần theme riêng.
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surfaceAlt,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        border: _inputBorder(AppColors.border),
        enabledBorder: _inputBorder(AppColors.border),
        focusedBorder: _inputBorder(AppColors.indigo),
        errorBorder: _inputBorder(AppColors.danger),
        labelStyle: const TextStyle(color: AppColors.muted),
        hintStyle: const TextStyle(color: Color(0xFF64748B)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(0, 48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(0, 48),
          side: const BorderSide(color: AppColors.border),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      dividerTheme: const DividerThemeData(color: AppColors.border, space: 1),
      chipTheme: const ChipThemeData(
        backgroundColor: AppColors.surfaceAlt,
        side: BorderSide(color: AppColors.border),
        labelStyle: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.surfaceAlt,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.surfaceAlt,
        contentTextStyle: const TextStyle(color: Colors.white),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      listTileTheme: const ListTileThemeData(
        iconColor: AppColors.muted,
        textColor: Color(0xFFE2E8F0),
      ),
    );
  }

  static OutlineInputBorder _inputBorder(Color color) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: color),
      );
}
