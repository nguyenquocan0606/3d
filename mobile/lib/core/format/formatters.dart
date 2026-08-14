import 'package:intl/intl.dart';

/// Định dạng hiển thị — khớp với bản web (locale vi-VN).
class Fmt {
  Fmt._();

  static final _currency = NumberFormat.currency(
    locale: 'vi_VN',
    symbol: '₫',
    decimalDigits: 0,
  );
  static final _number = NumberFormat.decimalPattern('vi_VN');
  static final _dateTime = DateFormat('dd/MM/yyyy HH:mm', 'vi_VN');
  static final _date = DateFormat('dd/MM/yyyy', 'vi_VN');
  static final _time = DateFormat('HH:mm:ss', 'vi_VN');

  static String money(num value) => _currency.format(value);

  static String number(num value) => _number.format(value);

  /// Khối lượng nhựa — luôn hiển thị số nguyên gram như bản web.
  static String grams(num value) => '${_number.format(value.round())}g';

  static String percent(num ratio) => '${(ratio * 100).round()}%';

  static String dateTime(DateTime? value) =>
      value == null ? '—' : _dateTime.format(value);

  static String date(DateTime? value) => value == null ? '—' : _date.format(value);

  static String time(DateTime? value) => value == null ? '—' : _time.format(value);

  /// "2h 53m" — dùng cho thời gian còn lại của máy in và lệnh in.
  static String duration(Duration? value) {
    if (value == null) return '—';
    final total = value.inMinutes;
    if (total <= 0) return '0m';
    final hours = total ~/ 60;
    final minutes = total % 60;
    if (hours == 0) return '${minutes}m';
    return '${hours}h ${minutes}m';
  }

  static String durationFromSeconds(int? seconds) =>
      seconds == null ? '—' : duration(Duration(seconds: seconds));

  static String fileSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).round()} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  static String temperature(double current, double target) =>
      target > 0 ? '${current.round()}° / ${target.round()}°' : '${current.round()}°';
}
