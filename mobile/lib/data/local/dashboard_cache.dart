import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/config/app_settings.dart';
import '../models/dashboard.dart';

// Khoá SharedPreferences — tiền tố `cache_db_` để phân biệt với cài đặt.
const _kCanhBaoJson = 'cache_db_canh_bao';
const _kCanhBaoLuc = 'cache_db_canh_bao_luc';
const _kTongQuanJson = 'cache_db_tong_quan';
const _kTongQuanLuc = 'cache_db_tong_quan_luc';

/// Lưu và đọc bản dashboard gần nhất khỏi SharedPreferences.
///
/// Mở app lúc mất mạng → đọc bản này, hiện kèm nhãn "Số liệu lúc HH:mm"
/// (§9, ràng buộc đọc được khi mất mạng). Không dùng SQLite vì dashboard
/// là một khối JSON nhỏ, không cần đánh chỉ mục hay quan hệ cha/con.
class DashboardCache {
  const DashboardCache(this._prefs);

  final SharedPreferences _prefs;

  // ── Cảnh báo ──────────────────────────────────────────────────────────────

  Future<void> luuCanhBao(Map<String, dynamic> rawJson) async {
    await _prefs.setString(_kCanhBaoJson, jsonEncode(rawJson));
    await _prefs.setInt(
        _kCanhBaoLuc, DateTime.now().millisecondsSinceEpoch);
  }

  /// Trả về kết quả từ cache, hoặc null nếu chưa từng lưu.
  DashboardResult<KetQuaCanhBao>? docCanhBao() {
    final raw = _prefs.getString(_kCanhBaoJson);
    if (raw == null) return null;
    final lucMs = _prefs.getInt(_kCanhBaoLuc);
    try {
      final data = KetQuaCanhBao.fromJson(
        jsonDecode(raw) as Map<String, dynamic>,
      );
      return DashboardResult(
        data,
        cachedAt: lucMs != null
            ? DateTime.fromMillisecondsSinceEpoch(lucMs)
            : null,
      );
    } catch (_) {
      return null;
    }
  }

  // ── Tổng quan ─────────────────────────────────────────────────────────────

  Future<void> luuTongQuan(Map<String, dynamic> rawJson) async {
    await _prefs.setString(_kTongQuanJson, jsonEncode(rawJson));
    await _prefs.setInt(
        _kTongQuanLuc, DateTime.now().millisecondsSinceEpoch);
  }

  DashboardResult<KetQuaTongQuan>? docTongQuan() {
    final raw = _prefs.getString(_kTongQuanJson);
    if (raw == null) return null;
    final lucMs = _prefs.getInt(_kTongQuanLuc);
    try {
      final data = KetQuaTongQuan.fromJson(
        jsonDecode(raw) as Map<String, dynamic>,
      );
      return DashboardResult(
        data,
        cachedAt: lucMs != null
            ? DateTime.fromMillisecondsSinceEpoch(lucMs)
            : null,
      );
    } catch (_) {
      return null;
    }
  }
}

final dashboardCacheProvider = Provider<DashboardCache>(
  (ref) => DashboardCache(ref.watch(sharedPreferencesProvider)),
);
