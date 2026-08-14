import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format/formatters.dart';
import '../../core/routes.dart';
import '../../core/scan/scan_mode.dart';
import '../../core/scan/scan_router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/location.dart';
import '../../data/providers.dart';
import '../../data/repositories/label_repository.dart';
import '../../data/repositories/location_repository.dart';
import '../spools/spools_screen.dart';

class LocationsScreen extends ConsumerWidget {
  const LocationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locations = ref.watch(locationsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Kho lưu trữ')),
      body: AsyncView(
        value: locations,
        onRetry: () => ref.read(locationsProvider.notifier).refresh(),
        builder: (data) {
          if (data.isEmpty) {
            return const EmptyView(
              message: 'Chưa có kho nào.',
              icon: Icons.warehouse_outlined,
            );
          }
          return RefreshIndicator(
            onRefresh: () => ref.read(locationsProvider.notifier).refresh(),
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
              itemCount: data.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final location = data[index];
                return SectionCard(
                  onTap: () => context.push(Routes.locationDetail(location.id)),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: AppColors.indigo.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(Icons.warehouse_rounded,
                            color: AppColors.indigoLight),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              location.name,
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            Text(
                              location.id,
                              style: const TextStyle(
                                fontSize: 12,
                                fontFamily: 'monospace',
                                color: AppColors.muted,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            '${location.spools.length} cuộn',
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          Text(
                            Fmt.grams(location.totalRemainingG),
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.muted,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class LocationDetailScreen extends ConsumerWidget {
  const LocationDetailScreen({super.key, required this.locationId});

  final String locationId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locations = ref.watch(locationsProvider).valueOrNull ?? const [];
    StorageLocation? location;
    for (final item in locations) {
      if (item.id == locationId) location = item;
    }

    if (location == null) {
      return Scaffold(
        appBar: AppBar(title: Text(locationId)),
        body: const EmptyView(message: 'Không tìm thấy kho này.'),
      );
    }

    final spools = ref.watch(spoolsProvider).valueOrNull ?? const [];
    final inLocation = spools.where((s) => s.locationId == locationId).toList()
      ..sort((a, b) => a.remainingWeightG.compareTo(b.remainingWeightG));

    return Scaffold(
      appBar: AppBar(
        title: Text(location.name),
        actions: [
          IconButton(
            tooltip: 'In tem QR kho',
            onPressed: () => _printLabel(context, ref, location!),
            icon: const Icon(Icons.print_rounded),
          ),
          IconButton(
            tooltip: 'Xóa kho',
            onPressed: () => _delete(context, ref, location!),
            icon: const Icon(Icons.delete_outline_rounded, color: AppColors.danger),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          SectionCard(
            child: Column(
              children: [
                InfoRow(label: 'Mã kho', value: location.id),
                InfoRow(label: 'Số cuộn', value: '${inLocation.length}'),
                InfoRow(
                  label: 'Tổng nhựa còn',
                  value: Fmt.grams(
                    inLocation.fold<double>(0, (sum, s) => sum + s.remainingWeightG),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => _startScanMode(
                    context,
                    ref,
                    location!,
                    ScanAction.add,
                  ),
                  icon: const Icon(Icons.add_box_rounded),
                  label: const Text('Quét đưa vào'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _startScanMode(
                    context,
                    ref,
                    location!,
                    ScanAction.remove,
                  ),
                  icon: const Icon(Icons.indeterminate_check_box_rounded),
                  label: const Text('Quét lấy ra'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          const Text(
            'Cuộn nhựa trong kho',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
          ),
          const SizedBox(height: 10),
          if (inLocation.isEmpty)
            const EmptyView(message: 'Kho này đang trống.', icon: Icons.inbox_rounded)
          else
            for (final spool in inLocation)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: SpoolTile(spool: spool, showPlace: false),
              ),
        ],
      ),
    );
  }

  /// Bật chế độ quét hàng loạt rồi mở luôn camera — port luồng
  /// "Đang Bật: Quét QR cuộn nhựa..." của ManageLocationModal bản web.
  Future<void> _startScanMode(
    BuildContext context,
    WidgetRef ref,
    StorageLocation location,
    ScanAction action,
  ) async {
    ref.read(scanModeProvider.notifier).start(
          ScanMode(
            target: ScanTarget.location,
            targetId: location.id,
            targetName: location.name,
            action: action,
          ),
        );
    await openGlobalScanner(context, ref);
    ref.read(scanModeProvider.notifier).clear();
  }

  Future<void> _printLabel(
    BuildContext context,
    WidgetRef ref,
    StorageLocation location,
  ) async {
    try {
      await ref.read(labelRepositoryProvider).printQrLabel(
            qrCode: location.id,
            line1: location.id,
            line2: 'VỊ TRÍ KHO',
            line3: location.name,
          );
      if (context.mounted) showToast(context, 'Đã gửi lệnh in tem kho.');
    } catch (error) {
      if (context.mounted) showToast(context, '$error', isError: true);
    }
  }

  Future<void> _delete(
    BuildContext context,
    WidgetRef ref,
    StorageLocation location,
  ) async {
    final ok = await confirmAction(
      context,
      title: 'Xóa kho',
      message: 'Xóa kho "${location.name}"? Cuộn nhựa trong kho sẽ trở về trạng thái '
          'chưa xếp chỗ (không bị xóa).',
      confirmLabel: 'Xóa',
    );
    if (!ok) return;

    try {
      await ref.read(locationRepositoryProvider).deleteLocation(location.id);
      await refreshCoreData(ref);
      if (context.mounted) {
        showToast(context, 'Đã xóa kho.');
        context.pop();
      }
    } catch (error) {
      if (context.mounted) showToast(context, '$error', isError: true);
    }
  }
}
