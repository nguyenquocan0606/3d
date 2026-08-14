import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/format/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/filament.dart';
import '../../data/providers.dart';
import '../../data/repositories/filament_repository.dart';
import '../../data/repositories/label_repository.dart';
import 'weigh_sheet.dart';

class SpoolDetailScreen extends ConsumerWidget {
  const SpoolDetailScreen({super.key, required this.spoolId});

  final String spoolId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final spool = ref.watch(spoolByIdProvider(spoolId));

    if (spool == null) {
      return Scaffold(
        appBar: AppBar(title: Text(spoolId)),
        body: const EmptyView(
          message: 'Không tìm thấy cuộn nhựa này.\nCó thể nó vừa bị xóa.',
          icon: Icons.search_off_rounded,
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(spool.id),
        actions: [
          IconButton(
            tooltip: 'In tem QR',
            onPressed: () => _printLabel(context, ref, spool),
            icon: const Icon(Icons.print_rounded),
          ),
          IconButton(
            tooltip: 'Xóa cuộn',
            onPressed: () => _delete(context, ref, spool),
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
                Row(
                  children: [
                    ColorDot(hex: spool.filamentColorHex, size: 40),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            spool.materialLabel,
                            style: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          Text(
                            spool.filamentColorName,
                            style: const TextStyle(color: AppColors.muted),
                          ),
                        ],
                      ),
                    ),
                    StatusChip(
                      label: spool.status.label,
                      color: switch (spool.status) {
                        SpoolStatus.active => AppColors.success,
                        SpoolStatus.depleted => AppColors.danger,
                        SpoolStatus.archived => AppColors.muted,
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                Text(
                  Fmt.grams(spool.remainingWeightG),
                  style: TextStyle(
                    fontSize: 40,
                    fontWeight: FontWeight.w800,
                    color: AppColors.forRemaining(spool.remainingWeightG),
                  ),
                ),
                const SizedBox(height: 10),
                RemainingBar(
                  ratio: spool.remainingRatio,
                  grams: spool.remainingWeightG,
                ),
                const SizedBox(height: 8),
                Text(
                  'Còn ${Fmt.percent(spool.remainingRatio)} so với '
                  '${Fmt.grams(spool.initialWeightG)} ban đầu',
                  style: const TextStyle(fontSize: 12, color: AppColors.muted),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: () => showWeighSheet(context, spool),
            icon: const Icon(Icons.monitor_weight_rounded),
            label: const Text('Cân cuộn này'),
          ),
          const SizedBox(height: 18),
          SectionCard(
            child: Column(
              children: [
                InfoRow(label: 'Mã cuộn', value: spool.id),
                InfoRow(label: 'Vật liệu', value: spool.filamentType),
                InfoRow(label: 'Hãng', value: spool.filamentBrand ?? '—'),
                InfoRow(label: 'Khối lượng ban đầu', value: Fmt.grams(spool.initialWeightG)),
                InfoRow(label: 'Khối lượng vỏ', value: Fmt.grams(spool.emptySpoolWeightG)),
                InfoRow(label: 'Vị trí', value: spool.placeLabel),
                InfoRow(label: 'Cập nhật', value: Fmt.dateTime(spool.updatedAt)),
              ],
            ),
          ),
          const SizedBox(height: 18),
          const Text('Xếp chỗ', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          _PlacementActions(spool: spool),
          const SizedBox(height: 20),
          Center(
            child: SectionCard(
              padding: const EdgeInsets.all(18),
              child: Column(
                children: [
                  QrImageView(
                    data: spool.id,
                    size: 170,
                    backgroundColor: Colors.white,
                    padding: const EdgeInsets.all(10),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    spool.id,
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _printLabel(BuildContext context, WidgetRef ref, Spool spool) async {
    try {
      await ref.read(labelRepositoryProvider).printQrLabel(
            qrCode: spool.id,
            line1: spool.id,
            line2: spool.filamentType,
            line3: spool.filamentColorName,
          );
      if (context.mounted) showToast(context, 'Đã gửi lệnh in tem tới máy chủ.');
    } catch (error) {
      if (context.mounted) showToast(context, '$error', isError: true);
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, Spool spool) async {
    final ok = await confirmAction(
      context,
      title: 'Xóa cuộn nhựa',
      message: 'Xóa vĩnh viễn cuộn ${spool.id}? Lịch sử sử dụng nhựa sẽ mất theo.',
      confirmLabel: 'Xóa',
    );
    if (!ok) return;

    try {
      await ref.read(filamentRepositoryProvider).deleteSpool(spool.id);
      await ref.read(filamentsProvider.notifier).refresh();
      if (context.mounted) {
        showToast(context, 'Đã xóa cuộn ${spool.id}.');
        context.pop();
      }
    } catch (error) {
      if (context.mounted) showToast(context, '$error', isError: true);
    }
  }
}

/// Gán cuộn vào kho / máy in.
///
/// Backend bắt buộc loại trừ: gán vào kho sẽ tự tháo khỏi máy in và ngược lại,
/// nên UI cũng trình bày như hai lựa chọn thay thế nhau.
class _PlacementActions extends ConsumerStatefulWidget {
  const _PlacementActions({required this.spool});

  final Spool spool;

  @override
  ConsumerState<_PlacementActions> createState() => _PlacementActionsState();
}

class _PlacementActionsState extends ConsumerState<_PlacementActions> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action, String successMessage) async {
    setState(() => _busy = true);
    try {
      await action();
      await refreshCoreData(ref);
      if (mounted) showToast(context, successMessage);
    } catch (error) {
      if (mounted) showToast(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final spool = widget.spool;
    final locations = ref.watch(locationsProvider).valueOrNull ?? const [];
    final printers = ref.watch(printersProvider).valueOrNull ?? const [];
    final repo = ref.read(filamentRepositoryProvider);

    return SectionCard(
      child: Column(
        children: [
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.warehouse_rounded),
            title: const Text('Đưa vào kho'),
            subtitle: Text(spool.locationName ?? 'Chưa ở kho nào'),
            trailing: const Icon(Icons.chevron_right_rounded),
            enabled: !_busy,
            onTap: () async {
              final selected = await showModalBottomSheet<String>(
                context: context,
                builder: (context) => SafeArea(
                  child: ListView(
                    shrinkWrap: true,
                    children: [
                      for (final location in locations)
                        ListTile(
                          leading: const Icon(Icons.warehouse_outlined),
                          title: Text(location.name),
                          subtitle: Text(location.id),
                          onTap: () => Navigator.pop(context, location.id),
                        ),
                    ],
                  ),
                ),
              );
              if (selected == null) return;
              await _run(
                () => repo.updateSpool(spool.id, locationId: selected),
                'Đã đưa cuộn vào kho.',
              );
            },
          ),
          const Divider(height: 8),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.print_rounded),
            title: const Text('Gắn lên máy in'),
            subtitle: Text(spool.printerName ?? 'Chưa gắn máy nào'),
            trailing: const Icon(Icons.chevron_right_rounded),
            enabled: !_busy,
            onTap: () async {
              final selected = await showModalBottomSheet<(String, int?)>(
                context: context,
                builder: (context) => SafeArea(
                  child: ListView(
                    shrinkWrap: true,
                    children: [
                      for (final printer in printers) ...[
                        ListTile(
                          leading: const Icon(Icons.print_outlined),
                          title: Text(printer.name),
                          subtitle: Text(printer.id),
                          onTap: () => Navigator.pop(context, (printer.id, null)),
                        ),
                        // Máy có AMS: chọn thẳng line để khớp khay nhựa.
                        Padding(
                          padding: const EdgeInsets.only(left: 56, bottom: 6),
                          child: Wrap(
                            spacing: 6,
                            children: [
                              for (var slot = 1; slot <= 4; slot++)
                                OutlinedButton(
                                  style: OutlinedButton.styleFrom(
                                    minimumSize:
                                        const Size(AppSize.touchTarget, AppSize.touchTarget),
                                    padding: const EdgeInsets.symmetric(horizontal: 14),
                                  ),
                                  onPressed: () =>
                                      Navigator.pop(context, (printer.id, slot)),
                                  child: Text('Line $slot'),
                                ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              );
              if (selected == null) return;
              await _run(
                () => repo.updateSpool(
                  spool.id,
                  printerId: selected.$1,
                  printerSlot: selected.$2,
                ),
                'Đã gắn cuộn lên máy in.',
              );
            },
          ),
          if (spool.locationId != null || spool.printerId != null) ...[
            const Divider(height: 8),
            TextButton.icon(
              onPressed: _busy
                  ? null
                  : () => _run(
                        () => repo.updateSpool(
                          spool.id,
                          clearLocation: true,
                          clearPrinter: true,
                          clearSlot: true,
                        ),
                        'Đã tháo cuộn khỏi vị trí hiện tại.',
                      ),
              icon: const Icon(Icons.link_off_rounded),
              label: const Text('Tháo khỏi vị trí hiện tại'),
            ),
          ],
        ],
      ),
    );
  }
}
