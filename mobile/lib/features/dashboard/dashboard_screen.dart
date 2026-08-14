import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format/formatters.dart';
import '../../core/routes.dart';
import '../../core/scale/scale_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../shell/quick_menu.dart';
import '../../data/models/filament.dart';
import '../../data/providers.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stats = ref.watch(dashboardStatsProvider);
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
        onRefresh: () => refreshCoreData(ref),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, AppSize.listBottomInset),
          children: [
            const _ScaleBanner(),
            const SizedBox(height: 16),
            AsyncView(
              value: stats,
              onRetry: () => ref.invalidate(dashboardStatsProvider),
              loading: const SizedBox(
                height: 200,
                child: Center(child: CircularProgressIndicator()),
              ),
              builder: (data) => _StatsGrid(stats: data),
            ),
            const SizedBox(height: 24),
            if (lowSpools.isNotEmpty) ...[
              Row(
                children: [
                  const Icon(Icons.warning_amber_rounded,
                      size: 18, color: AppColors.warning),
                  const SizedBox(width: 8),
                  const Text(
                    'Cuộn sắp hết',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
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
              const SizedBox(height: 16),
            ],
            AsyncView(
              value: stats,
              loading: const SizedBox.shrink(),
              builder: (data) => _Breakdown(stats: data),
            ),
          ],
        ),
      ),
    );
  }
}

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
                const Text('Trạm cân', style: TextStyle(fontWeight: FontWeight.w700)),
                Text(
                  scale.isConnected
                      ? 'Đang online'
                      : (scale.lastError ?? 'Chưa kết nối'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: AppColors.muted),
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

class _StatsGrid extends StatelessWidget {
  const _StatsGrid({required this.stats});

  final DashboardStats stats;

  @override
  Widget build(BuildContext context) {
    final tiles = [
      StatTile(
        label: 'Tổng số cuộn',
        value: '${stats.totalSpools}',
        icon: Icons.inventory_2_rounded,
        caption: 'Cuộn nhựa trong hệ thống',
      ),
      StatTile(
        label: 'Đang dùng',
        value: '${stats.activeSpools}',
        icon: Icons.check_circle_rounded,
        color: AppColors.success,
        caption: 'Sẵn sàng in',
      ),
      StatTile(
        label: 'Sắp hết (<20%)',
        value: '${stats.lowSpools}',
        icon: Icons.trending_down_rounded,
        color: AppColors.warning,
        caption: 'Cần chuẩn bị cuộn mới',
      ),
      StatTile(
        label: 'Đã dùng hết',
        value: '${stats.depletedSpools}',
        icon: Icons.remove_circle_outline_rounded,
        color: AppColors.danger,
        caption: 'Chờ thay/bỏ',
      ),
      StatTile(
        label: 'Tổng nhựa còn',
        value: Fmt.grams(stats.totalRemainingWeightG),
        icon: Icons.scale_rounded,
        color: AppColors.info,
        caption: 'Cộng dồn toàn kho',
      ),
    ];

    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 1.35,
      children: tiles,
    );
  }
}

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
                  style: const TextStyle(fontSize: 12, color: AppColors.muted),
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

class _Breakdown extends StatelessWidget {
  const _Breakdown({required this.stats});

  final DashboardStats stats;

  @override
  Widget build(BuildContext context) {
    Widget group(String title, Map<String, int> data) {
      if (data.isEmpty) return const SizedBox.shrink();
      final entries = data.entries.toList()
        ..sort((a, b) => b.value.compareTo(a.value));
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          SectionCard(
            child: Column(
              children: [
                for (final entry in entries)
                  InfoRow(label: entry.key, value: '${entry.value} cuộn'),
              ],
            ),
          ),
          const SizedBox(height: 20),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        group('Theo loại vật liệu', stats.spoolsByMaterialType),
        group('Theo màu', stats.spoolsByColor),
      ],
    );
  }
}
