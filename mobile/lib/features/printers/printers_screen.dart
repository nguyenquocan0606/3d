import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format/formatters.dart';
import '../../core/routes.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/printer.dart';
import '../../data/providers.dart';
import '../shell/quick_menu.dart';
import 'printer_form_sheet.dart';
import 'tinh_trang_may.dart';

Color colorForLiveState(LiveState state) => switch (state) {
      LiveState.printing => AppColors.warning,
      LiveState.idle => AppColors.success,
      LiveState.error => AppColors.danger,
      LiveState.maintenance => AppColors.info,
      LiveState.offline => AppColors.muted,
    };

class PrintersScreen extends ConsumerWidget {
  const PrintersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final printers = ref.watch(printersProvider);
    // Chỉ poll khi màn này còn sống (provider autoDispose) — tiết kiệm pin.
    final live = ref.watch(livePrinterStatusProvider).valueOrNull ?? const {};

    return Scaffold(
      appBar: AppBar(
        title: const Text('Máy in'),
        actions: const [QuickMenuButton()],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => moFormMayIn(context),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Thêm máy in'),
      ),
      body: AsyncView(
        value: printers,
        onRetry: () => ref.read(printersProvider.notifier).refresh(),
        builder: (data) {
          if (data.isEmpty) {
            return const EmptyView(
              message: 'Chưa có máy in nào.\nBấm "Thêm máy in" để bắt đầu.',
              icon: Icons.print_disabled_rounded,
            );
          }
          return RefreshIndicator(
            onRefresh: () => ref.read(printersProvider.notifier).refresh(),
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, AppSize.listBottomInset),
              itemCount: data.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final printer = data[index];
                return PrinterCard(printer: printer, live: live[printer.id]);
              },
            ),
          );
        },
      ),
    );
  }
}

class PrinterCard extends StatelessWidget {
  const PrinterCard({super.key, required this.printer, this.live});

  final Printer printer;
  final PrinterLiveStatus? live;

  @override
  Widget build(BuildContext context) {
    final state = live?.status;
    final color = state == null
        ? (printer.status == PrinterState.printing
            ? AppColors.warning
            : AppColors.muted)
        : colorForLiveState(state);

    return SectionCard(
      onTap: () => context.push(Routes.printerDetail(printer.id)),
      borderColor: color.withValues(alpha: 0.35),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(9),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(Icons.print_rounded, color: color, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      printer.name,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      printer.model ?? printer.id,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12, color: AppColors.muted),
                    ),
                  ],
                ),
              ),
              StatusChip(
                label: state?.label ?? printer.status.label,
                color: color,
                dense: true,
              ),
            ],
          ),
          if (live != null && live!.status == LiveState.printing) ...[
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      value: live!.progress / 100,
                      minHeight: 6,
                      backgroundColor: AppColors.border,
                      valueColor: const AlwaysStoppedAnimation(AppColors.warning),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  '${live!.progress}%',
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.schedule_rounded, size: 13, color: AppColors.muted),
                const SizedBox(width: 5),
                Expanded(
                  child: Text(
                    () {
                      final conLai = Fmt.durationFromSeconds(live!.remainingTimeSeconds);
                      final xong = Fmt.etaFromSeconds(live!.remainingTimeSeconds);
                      return xong == null ? 'Còn $conLai' : 'Còn $conLai · xong $xong';
                    }(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12, color: AppColors.muted),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '${live!.nozzleTemp.round()}° / ${live!.bedTemp.round()}°',
                  style: const TextStyle(fontSize: 12, color: AppColors.muted),
                ),
              ],
            ),
            if (live!.fileName != null) ...[
              const SizedBox(height: 6),
              Text(
                live!.fileName!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
              ),
            ],
          ],
          if (live != null) ...[
            const SizedBox(height: 10),
            TinhTrangMay(live: live!, rutGon: true),
          ],
          if (printer.spools.isNotEmpty) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final spool in printer.spools)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceAlt,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        ColorDot(hex: spool.filamentColorHex, size: 10),
                        const SizedBox(width: 6),
                        Text(
                          spool.printerSlot != null
                              ? 'L${spool.printerSlot} · ${spool.filamentType}'
                              : spool.filamentType,
                          style: const TextStyle(fontSize: 12),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
