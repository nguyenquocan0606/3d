/// Tiện ích parse JSON dùng chung cho toàn bộ model.
///
/// Backend trả kiểu khá lỏng: số có thể là int hoặc double, ngày có thể là
/// DateTime ISO (đa số bảng) hoặc String ISO thuần (StoreProduct cố tình để String),
/// và nhiều field Json nullable. Các helper dưới đây chịu hết những trường hợp đó.
library;

Map<String, dynamic> asMap(dynamic value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return value.cast<String, dynamic>();
  return const <String, dynamic>{};
}

List<Map<String, dynamic>> asMapList(dynamic value) {
  if (value is! List) return const [];
  return value.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList();
}

List<T> asList<T>(dynamic value, T Function(Map<String, dynamic>) fromJson) =>
    asMapList(value).map(fromJson).toList();

String asString(dynamic value, [String fallback = '']) {
  if (value == null) return fallback;
  if (value is String) return value;
  return value.toString();
}

String? asStringOrNull(dynamic value) {
  if (value == null) return null;
  if (value is String) return value.isEmpty ? null : value;
  return value.toString();
}

double asDouble(dynamic value, [double fallback = 0]) {
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value) ?? fallback;
  return fallback;
}

double? asDoubleOrNull(dynamic value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value);
  return null;
}

int asInt(dynamic value, [int fallback = 0]) {
  if (value is int) return value;
  if (value is num) return value.round();
  if (value is String) return int.tryParse(value) ?? fallback;
  return fallback;
}

int? asIntOrNull(dynamic value) {
  if (value == null) return null;
  if (value is int) return value;
  if (value is num) return value.round();
  if (value is String) return int.tryParse(value);
  return null;
}

bool asBool(dynamic value, [bool fallback = false]) {
  if (value is bool) return value;
  if (value is num) return value != 0;
  if (value is String) return value.toLowerCase() == 'true';
  return fallback;
}

bool? asBoolOrNull(dynamic value) {
  if (value == null) return null;
  return asBool(value);
}

DateTime? asDate(dynamic value) {
  if (value == null) return null;
  if (value is DateTime) return value;
  if (value is String) return DateTime.tryParse(value)?.toLocal();
  if (value is num) {
    return DateTime.fromMillisecondsSinceEpoch(value.toInt(), isUtc: true).toLocal();
  }
  return null;
}

DateTime asDateOr(dynamic value, DateTime fallback) => asDate(value) ?? fallback;

/// Thay nửa ký tự (surrogate lẻ) bằng `�`. Chuỗi cắt bằng `.slice` của JS có thể đứt đúng giữa
/// emoji; Flutter gặp chuỗi như vậy là ném lỗi lúc vẽ chữ và cả dòng thành ô báo lỗi.
String chuoiHopLe(String s) {
  StringBuffer? ra;
  var daChep = 0;
  for (var i = 0; i < s.length; i++) {
    final c = s.codeUnitAt(i);
    if (c < 0xD800 || c > 0xDFFF) continue;
    final moDau = c <= 0xDBFF;
    if (moDau && i + 1 < s.length) {
      final sau = s.codeUnitAt(i + 1);
      if (sau >= 0xDC00 && sau <= 0xDFFF) {
        i++;
        continue;
      }
    }
    ra ??= StringBuffer();
    ra.write(s.substring(daChep, i));
    ra.write('\uFFFD');
    daChep = i + 1;
  }
  if (ra == null) return s;
  ra.write(s.substring(daChep));
  return ra.toString();
}

/// [chuoiHopLe] cho mọi chuỗi trong một cây JSON.
dynamic jsonHopLe(dynamic value) {
  if (value is String) return chuoiHopLe(value);
  if (value is List) return value.map(jsonHopLe).toList();
  if (value is Map) {
    return <String, dynamic>{
      for (final e in value.entries) '${e.key}': jsonHopLe(e.value),
    };
  }
  return value;
}

/// Bỏ mọi entry null để PUT/PATCH chỉ gửi field thực sự muốn đổi —
/// backend phân biệt rõ "không gửi" (giữ nguyên) và "gửi null" (xóa giá trị).
Map<String, dynamic> compact(Map<String, dynamic> source) {
  final result = <String, dynamic>{};
  source.forEach((key, value) {
    if (value != null) result[key] = value;
  });
  return result;
}
