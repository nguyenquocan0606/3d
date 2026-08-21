import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../local/dashboard_cache.dart';
import '../models/dashboard.dart';
import '../models/json.dart';

/// Gọi hai endpoint dashboard và quản lý cache offline.
///
/// Luồng: thử API → lưu cache → trả DashboardResult(cachedAt: null).
/// Nếu API lỗi → đọc cache → trả DashboardResult(cachedAt: thời_điểm_lưu).
/// Nếu cả API lẫn cache đều thất bại → ném lỗi để UI hiện ErrorView.
class DashboardRepository {
  DashboardRepository(this._api, this._cache);

  final ApiClient _api;
  final DashboardCache _cache;

  /// Fetch cảnh báo — cache 30 s, poll 30 s trên client.
  Future<DashboardResult<KetQuaCanhBao>> fetchCanhBao() async {
    try {
      final raw = await _api.get<Map<String, dynamic>>(
        '/api/dashboard/canh-bao',
        (data) {
          // API trả `{ status, data: {...} }` — cần bọc lại thành raw JSON
          // đầy đủ để cache lưu nguyên, parse sau.
          if (data is Map<String, dynamic>) return data;
          return asMap(data);
        },
      );
      await _cache.luuCanhBao(raw);
      return DashboardResult(KetQuaCanhBao.fromJson(raw));
    } catch (e) {
      final cached = _cache.docCanhBao();
      if (cached != null) return cached;
      rethrow;
    }
  }

  /// Fetch tổng quan hôm nay — cache 60 s, poll 60 s trên client.
  ///
  /// Chỉ gọi `range=today` — app không cần 7d/30d (không có bộ lọc kỳ trên app).
  Future<DashboardResult<KetQuaTongQuan>> fetchTongQuan() async {
    try {
      final raw = await _api.get<Map<String, dynamic>>(
        '/api/dashboard/tong-quan',
        (data) {
          if (data is Map<String, dynamic>) return data;
          return asMap(data);
        },
        query: {'range': 'today'},
      );
      await _cache.luuTongQuan(raw);
      return DashboardResult(KetQuaTongQuan.fromJson(raw));
    } catch (e) {
      final cached = _cache.docTongQuan();
      if (cached != null) return cached;
      rethrow;
    }
  }
}

final dashboardRepositoryProvider = Provider<DashboardRepository>(
  (ref) => DashboardRepository(
    ref.watch(apiClientProvider),
    ref.watch(dashboardCacheProvider),
  ),
);
