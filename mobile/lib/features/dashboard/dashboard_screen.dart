import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/format/formatters.dart';
import '../../core/routes.dart';
import '../../core/scale/scale_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/dashboard.dart';
import '../../data/models/filament.dart';
import '../../data/providers.dart';
import '../facebook/nut_khach_facebook.dart';
import '../shell/quick_menu.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Màn hình chính
// ─────────────────────────────────────────────────────────────────────────────

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canhBao = ref.watch(canhBaoProvider);
    final tongQuan = ref.watch(tongQuanProvider);
    final spools = ref.watch(spoolsProvider).valueOrNull ?? const <Spool>[];
    final lowSpools = spools.where((s) => s.isLow).toList()
      ..sort((a, b) => a.remainingWeightG.compareTo(b.remainingWeightG));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Tổng quan'),
        actions: [
          const QuickMenuButton(),
          IconButton(
            tooltip: 'Trạm cân',
            onPressed: () => context.push(Routes.scale),
            icon: const Icon(Icons.monitor_weight_outlined),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () {
          ref.invalidate(demKhachFacebookProvider);
          return refreshCoreData(ref);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, AppSize.listBottomInset),
          children: [
            // ── 1. Cảnh báo (chỉ hiện khi có) ────────────────────────────
            _KhoiCanhBao(canhBaoAsync: canhBao),
            const SizedBox(height: 8),

            // ── 2. Trạm cân (giữ nguyên — dùng nhiều nhất) ───────────────
            const _ScaleBanner(),
            const SizedBox(height: 16),

            // ── Khách Facebook: có khách mới là thấy ngay khi mở app ──────
            const NutKhachFacebook(),
            const SizedBox(height: 16),

            // ── 3. KPI 4 ô ────────────────────────────────────────────────
            _KhoiKpi(tongQuanAsync: tongQuan),
            const SizedBox(height: 16),

            // ── 4. Lượt đang in ───────────────────────────────────────────
            _KhoiLuotDangIn(tongQuanAsync: tongQuan),

            // ── 5. Cuộn sắp hết (giữ nguyên) ─────────────────────────────
            if (lowSpools.isNotEmpty) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.warning_amber_rounded,
                      size: 18, color: AppColors.warning),
                  const SizedBox(width: 8),
                  const Text(
                    'Cuộn sắp hết',
                    style: TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w700),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: () => context.go(Routes.spools),
                    child: const Text('Xem tất cả'),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              for (final spool in lowSpools.take(5))
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _LowSpoolTile(spool: spool),
                ),
              const SizedBox(height: 8),
            ],
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Khối cảnh báo
// ─────────────────────────────────────────────────────────────────────────────

class _KhoiCanhBao extends StatelessWidget {
  const _KhoiCanhBao({required this.canhBaoAsync});

  final AsyncValue<DashboardResult<KetQuaCanhBao>> canhBaoAsync;

  @override
  Widget build(BuildContext context) {
    return canhBaoAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(), // Lỗi được xử lý ở khối KPI
      data: (result) {
        final data = result.data;
        if (!data.coGi) return const SizedBox.shrink();

        // Tối đa 5 dòng, phần còn lại gom vào "N cảnh báo khác"
        final hienThi = data.canhBao.take(5).toList();
        final soConLai = data.canhBao.length - hienThi.length;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final cb in hienThi)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _TheCanhBao(canhBao: cb),
              ),
            if (soConLai > 0)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _TomTatCanhBao(soConLai: soConLai),
              ),
          ],
        );
      },
    );
  }
}

/// Dòng "và N cảnh báo khác" khi danh sách vượt quá 5.
class _TomTatCanhBao extends StatelessWidget {
  const _TomTatCanhBao({required this.soConLai});
  final int soConLai;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: Text(
        'và $soConLai cảnh báo khác',
        style: const TextStyle(
          fontSize: 13,
          color: AppColors.muted,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _TheCanhBao extends StatelessWidget {
  const _TheCanhBao({required this.canhBao});

  final CanhBao canhBao;

  @override
  Widget build(BuildContext context) {
    final (iconColor, bgColor, iconData) = switch (canhBao.mucDo) {
      MucDoCanhBao.loi => (
          AppColors.danger,
          AppColors.danger.withValues(alpha: 0.08),
          Icons.error_rounded,
        ),
      MucDoCanhBao.canhBao => (
          AppColors.warning,
          AppColors.warning.withValues(alpha: 0.08),
          Icons.warning_amber_rounded,
        ),
      MucDoCanhBao.tin => (
          AppColors.info,
          AppColors.info.withValues(alpha: 0.08),
          Icons.info_outline_rounded,
        ),
    };

    return SectionCard(
      borderColor: iconColor.withValues(alpha: 0.4),
      onTap: () => _diDen(context),
      padding: const EdgeInsets.all(0),
      child: Container(
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(16),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Icon(iconData, size: AppSize.iconMd, color: iconColor),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    canhBao.tieuDe,
                    style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w700,
                      color: iconColor,
                    ),
                  ),
                  if (canhBao.soLuong > 0)
                    Text(
                      '${canhBao.soLuong} mục',
                      style:
                          const TextStyle(fontSize: 12, color: AppColors.muted),
                    ),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded,
                size: AppSize.iconMd, color: iconColor),
          ],
        ),
      ),
    );
  }

  /// Điều hướng tới màn liên quan.
  ///
  /// C12 (thao tác app bị từ chối) LUÔN dẫn tới `/pending-sync` bất kể
  /// giá trị `dichDen.app` mà API trả về.
  void _diDen(BuildContext context) {
    if (canhBao.ma == 'C12') {
      context.push(Routes.pendingSync);
      return;
    }
    final dest = _chuyenDuong(canhBao.dichDenApp);
    if (dest != null) context.push(dest);
  }

  /// Bảng ánh xạ deep-link API → route app.
  static String? _chuyenDuong(String? apiRoute) {
    if (apiRoute == null) return null;
    const map = <String, String>{
      '/spools': Routes.spools,
      '/printers': Routes.printers,
      '/bulk': Routes.bulkOrders,
      '/bulk-orders': Routes.bulkOrders,
      '/store': Routes.store,
      '/settings': Routes.settings,
      '/notifications': Routes.printerEvents,
      '/printer-events': Routes.printerEvents,
      '/production': Routes.production,
      '/orders': Routes.production,
      '/pei': Routes.pei,
      '/pending-sync': Routes.pendingSync,
      '/sync-actions': Routes.pendingSync,
      '/inventory': Routes.inventory,
    };
    return map[apiRoute] ?? apiRoute;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Trạm cân (giữ nguyên từ bản cũ)
// ─────────────────────────────────────────────────────────────────────────────

class _ScaleBanner extends ConsumerWidget {
  const _ScaleBanner();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scale = ref.watch(scaleProvider);
    final color = scale.isConnected ? AppColors.success : AppColors.muted;

    return SectionCard(
      onTap: () => context.push(Routes.scale),
      borderColor: color.withValues(alpha: 0.35),
      child: Row(
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Trạm cân',
                    style: TextStyle(fontWeight: FontWeight.w700)),
                Text(
                  scale.isConnected
                      ? 'Đang online'
                      : (scale.lastError ?? 'Chưa kết nối'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style:
                      const TextStyle(fontSize: 12, color: AppColors.muted),
                ),
              ],
            ),
          ),
          Text(
            scale.isConnected ? '${scale.weight.round()} g' : '--- g',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              color: color,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. KPI 4 ô
// ─────────────────────────────────────────────────────────────────────────────

class _KhoiKpi extends StatelessWidget {
  const _KhoiKpi({required this.tongQuanAsync});

  final AsyncValue<DashboardResult<KetQuaTongQuan>> tongQuanAsync;

  @override
  Widget build(BuildContext context) {
    return tongQuanAsync.when(
      loading: () => const _KpiSkeleton(),
      error: (e, _) => _KpiLoi(message: '$e'),
      data: (result) => _KpiGrid(tq: result.data, cachedAt: result.cachedAt),
    );
  }
}

class _KpiSkeleton extends StatelessWidget {
  const _KpiSkeleton();

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 1.35,
      children: List.generate(
        4,
        (_) => const SectionCard(
          child: Center(
            child: SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ),
        ),
      ),
    );
  }
}

class _KpiLoi extends StatelessWidget {
  const _KpiLoi({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return const SectionCard(
      child: Row(
        children: [
          Icon(Icons.cloud_off_rounded,
              size: AppSize.iconMd, color: AppColors.muted),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'Không tải được dữ liệu. Kiểm tra kết nối mạng.',
              style: TextStyle(
                  fontSize: 13, color: AppColors.muted, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}

class _KpiGrid extends StatelessWidget {
  const _KpiGrid({required this.tq, this.cachedAt});

  final KetQuaTongQuan tq;
  final DateTime? cachedAt;

  @override
  Widget build(BuildContext context) {
    final tiLe = tq.tiLeLoi;
    final tiLeText = tiLe == null ? '—' : Fmt.percent(tiLe);
    final tiLeColor = tiLe == null
        ? AppColors.muted
        : (tiLe > 0.05 ? AppColors.danger : AppColors.success);

    // kg nhựa còn
    final kg = tq.kgCon;
    final nhuaText = kg >= 1 ? '${kg.toStringAsFixed(1)} kg' : '${(kg * 1000).round()} g';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Nhãn cache nếu đang hiện dữ liệu cũ
        if (cachedAt != null) _NhanCache(cachedAt: cachedAt!),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 1.35,
          children: [
            StatTile(
              label: 'Con xong',
              value: Fmt.number(tq.conXong),
              icon: Icons.check_circle_rounded,
              color: AppColors.success,
              caption: 'Hôm nay (SLL)',
              onTap: () => context.push(Routes.bulkOrders),
            ),
            // ⚠ Metric tỉ lệ lỗi — tính từ BulkRun, không phải đo thực tế
            StatTile(
              label: 'Tỉ lệ lỗi ⓘ',
              value: tiLeText,
              icon: Icons.remove_circle_rounded,
              color: tiLeColor,
              caption: tiLe == null ? 'Chưa có lượt SLL' : 'Hôm nay · từ BulkRun',
              onTap: () => context.push(Routes.bulkOrders),
            ),
            StatTile(
              label: 'Máy đang in',
              value: '${tq.soMayDangIn}',
              icon: Icons.print_rounded,
              color: tq.soMayDangIn > 0 ? AppColors.indigo : AppColors.muted,
              caption: 'Lượt SLL đang chạy',
              onTap: () => context.push(Routes.printers),
            ),
            StatTile(
              label: 'Nhựa còn',
              value: nhuaText,
              icon: Icons.inventory_2_rounded,
              color: AppColors.info,
              caption: 'Tổng cuộn active',
              onTap: () => context.go(Routes.spools),
            ),
          ],
        ),
      ],
    );
  }
}

/// Nhãn "Số liệu lúc HH:mm" — bắt buộc hiện khi đang dùng dữ liệu cache.
class _NhanCache extends StatelessWidget {
  const _NhanCache({required this.cachedAt});
  final DateTime cachedAt;

  @override
  Widget build(BuildContext context) {
    final gio = DateFormat('HH:mm').format(cachedAt);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off_rounded,
              size: AppSize.iconSm, color: AppColors.warning),
          const SizedBox(width: 6),
          Text(
            'Số liệu lúc $gio',
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.warning,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Lượt đang in
// ─────────────────────────────────────────────────────────────────────────────

class _KhoiLuotDangIn extends StatelessWidget {
  const _KhoiLuotDangIn({required this.tongQuanAsync});

  final AsyncValue<DashboardResult<KetQuaTongQuan>> tongQuanAsync;

  @override
  Widget build(BuildContext context) {
    return tongQuanAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (result) {
        final luots = result.data.luotDangIn;
        if (luots.isEmpty) return const SizedBox.shrink();
        return _DanhSachLuot(luots: luots, cachedAt: result.cachedAt);
      },
    );
  }
}

class _DanhSachLuot extends StatelessWidget {
  const _DanhSachLuot({required this.luots, this.cachedAt});

  final List<LuotDangIn> luots;
  final DateTime? cachedAt;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.play_circle_rounded,
                size: 18, color: AppColors.indigo),
            const SizedBox(width: 8),
            const Text(
              'Đang in',
              style:
                  TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            const SizedBox(width: 6),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: AppColors.indigo.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                '${luots.length}',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.indigo,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        // Cuộn ngang để tiết kiệm chiều dọc
        SizedBox(
          height: 100,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: luots.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (_, i) => _LuotCard(
              luot: luots[i],
              cachedAt: cachedAt,
            ),
          ),
        ),
        const SizedBox(height: 16),
      ],
    );
  }
}

class _LuotCard extends StatelessWidget {
  const _LuotCard({required this.luot, this.cachedAt});

  final LuotDangIn luot;
  final DateTime? cachedAt;

  @override
  Widget build(BuildContext context) {
    // Số phút đã trôi: nếu là dữ liệu mới thì đây là thời gian thật; nếu từ
    // cache thì cộng thêm thời gian trôi từ khi cache được lưu.
    final phut = cachedAt == null
        ? luot.phutDaTroi
        : luot.phutDaTroi +
            DateTime.now().difference(cachedAt!).inMinutes;

    final (mauPhut, nhanPhut) = _mauPhut(phut);

    return SectionCard(
      padding: const EdgeInsets.all(12),
      child: SizedBox(
        width: 150,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            // Tên máy
            Text(
              luot.may,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w700,
              ),
            ),
            // Số con
            Text(
              '${luot.soCon} con · mâm ${luot.peiIndex}',
              style:
                  const TextStyle(fontSize: 12, color: AppColors.muted),
            ),
            // Thời gian đã trôi
            Row(
              children: [
                Icon(Icons.timer_outlined, size: 14, color: mauPhut),
                const SizedBox(width: 4),
                Text(
                  nhanPhut,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: mauPhut,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// Màu và nhãn thời gian — đỏ khi chạy quá 2h (ngưỡng cảnh báo C3).
  static (Color, String) _mauPhut(int phut) {
    final gio = phut ~/ 60;
    final phutDu = phut % 60;
    final nhan = gio > 0 ? '${gio}h ${phutDu}m' : '${phutDu}m';
    final mau = phut > 120 ? AppColors.warning : AppColors.muted;
    return (mau, nhan);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Cuộn sắp hết (giữ nguyên từ bản cũ)
// ─────────────────────────────────────────────────────────────────────────────

class _LowSpoolTile extends StatelessWidget {
  const _LowSpoolTile({required this.spool});

  final Spool spool;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      onTap: () => context.push(Routes.spoolDetail(spool.id)),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          ColorDot(hex: spool.filamentColorHex, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  spool.id,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontFamily: 'monospace',
                  ),
                ),
                Text(
                  '${spool.materialLabel} · ${spool.placeLabel}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style:
                      const TextStyle(fontSize: 12, color: AppColors.muted),
                ),
              ],
            ),
          ),
          Text(
            Fmt.grams(spool.remainingWeightG),
            style: TextStyle(
              fontWeight: FontWeight.w800,
              color: AppColors.forRemaining(spool.remainingWeightG),
            ),
          ),
        ],
      ),
    );
  }
}
