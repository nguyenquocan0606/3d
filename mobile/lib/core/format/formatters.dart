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
  static final _hourMinute = DateFormat('HH:mm', 'vi_VN');
  static final _dayMonth = DateFormat('dd/MM', 'vi_VN');

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

  /// Giờ dự kiến xong = giờ máy hiện tại + thời gian còn lại. Máy in chỉ báo số giây còn
  /// lại chứ không báo mốc kết thúc, nên mốc này luôn tính ở phía hiển thị — khớp bản web.
  /// "21:30", "21:30 (mai)", hoặc "21:30 28/08" nếu còn xa hơn. Không có số liệu → null.
  static String? etaFromSeconds(int? seconds, {DateTime? now}) {
    if (seconds == null || seconds <= 0) return null;
    final bayGio = now ?? DateTime.now();
    final xong = bayGio.add(Duration(seconds: seconds));
    final gio = _hourMinute.format(xong);
    final soNgay = DateTime(xong.year, xong.month, xong.day)
        .difference(DateTime(bayGio.year, bayGio.month, bayGio.day))
        .inDays;
    if (soNgay <= 0) return gio;
    if (soNgay == 1) return '$gio (mai)';
    return '$gio ${_dayMonth.format(xong)}';
  }

  /// "14:32 14/10" — đọc nhanh lúc nào trong ngày, khỏi tính nhẩm "3 giờ trước".
  static String gioNgay(DateTime? value) =>
      value == null ? '—' : '${_hourMinute.format(value)} ${_dayMonth.format(value)}';

  /// "vừa xong" / "5 phút trước" / "3 giờ trước", quá một ngày thì ghi ngày giờ.
  static String tuongDoi(DateTime? value, {DateTime? now}) {
    if (value == null) return '—';
    final phut = ((now ?? DateTime.now()).difference(value).inSeconds / 60).round();
    if (phut < 1) return 'vừa xong';
    if (phut < 60) return '$phut phút trước';
    final gio = (phut / 60).round();
    return gio < 24 ? '$gio giờ trước' : dateTime(value);
  }

  static String fileSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).round()} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  static String temperature(double current, double target) =>
      target > 0 ? '${current.round()}° / ${target.round()}°' : '${current.round()}°';
}
