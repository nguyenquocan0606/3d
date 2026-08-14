import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format/formatters.dart';
import '../../core/routes.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/inventory.dart';
import '../../data/providers.dart';

/// Lịch sử lệnh in 3D.
///
/// Backend chưa có endpoint kết thúc task (§10 tài liệu hệ thống), nên trạng thái
/// "đã quá giờ dự kiến" được suy ra ở client — giống hệt bản web.
class PrintHistoryScreen extends ConsumerStatefulWidget {
  const PrintHistoryScreen({super.key});

  @override
  ConsumerState<PrintHistoryScreen> createState() => _PrintHistoryScreenState();
}

class _PrintHistoryScreenState extends ConsumerState<PrintHistoryScreen> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    // Đếm ngược thời gian còn lại — cập nhật mỗi 30s là đủ mượt mà không tốn pin.
    _ticker = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tasks = ref.watch(printTasksProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Lịch sử lệnh in'),
        actions: [
          IconButton(
            tooltip: 'Tạo lệnh in',
            onPressed: () => context.push(Routes.createJob),
            icon: const Icon(Icons.add_rounded),
          ),
        ],
      ),
      body: AsyncView(
        value: tasks,
        onRetry: () => ref.invalidate(printTasksProvider),
        builder: (data) {
          if (data.isEmpty) {
            return const EmptyView(
              message: 'Chưa có lệnh in nào.',
              icon: Icons.history_rounded,
            );
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(printTasksProvider),
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              itemCount: data.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, index) => _TaskCard(task: data[index]),
            ),
          );
        },
      ),
    );
  }
}

class _TaskCard extends StatelessWidget {
  const _TaskCard({required this.task});

  final PrintTask task;

  ({String label, Color color, IconData icon}) get _badge {
    if (task.status == 'completed') {
      return (label: 'Hoàn thành', color: AppColors.success, icon: Icons.check_rounded);
    }
    if (task.status == 'failed' || task.status == 'cancelled') {
      return (label: 'Thất bại', color: AppColors.danger, icon: Icons.close_rounded);
    }
    if (task.isOverdue) {
      return (
        label: 'Quá giờ dự kiến',
        color: AppColors.info,
        icon: Icons.schedule_rounded
      );
    }
    return (label: 'Đang in', color: AppColors.warning, icon: Icons.print_rounded);
  }

  @override
  Widget build(BuildContext context) {
    final badge = _badge;
    final remaining = task.remaining;

    return SectionCard(
      borderColor: badge.color.withValues(alpha: 0.35),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      task.name?.isNotEmpty == true ? task.name! : 'Lệnh in không tên',
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${task.printerName ?? task.printerId ?? 'Máy in đã xóa'} · '
                      '${Fmt.dateTime(task.createdAt)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
                    ),
                  ],
                ),
              ),
              StatusChip(label: badge.label, color: badge.color, icon: badge.icon),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              const Icon(Icons.timer_outlined, size: 15, color: AppColors.muted),
              const SizedBox(width: 6),
              Text(
                task.durationMinutes == null
                    ? 'Không rõ thời lượng'
                    : 'Dự kiến ${Fmt.duration(Duration(minutes: task.durationMinutes!))}',
                style: const TextStyle(fontSize: 12, color: AppColors.muted),
              ),
              const Spacer(),
              if (task.status == 'printing' && remaining != null)
                Text(
                  remaining == Duration.zero
                      ? 'Đã tới giờ'
                      : 'Còn ${Fmt.duration(remaining)}',
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: badge.color,
                  ),
                ),
            ],
          ),
          if (task.usages.isNotEmpty) ...[
            const Divider(height: 20),
            Row(
              children: [
                const Icon(Icons.scale_rounded, size: 15, color: AppColors.muted),
                const SizedBox(width: 6),
                Text(
                  'Đã dùng ${Fmt.grams(task.totalUsedG)}',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final usage in task.usages)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceAlt,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        ColorDot(hex: usage.colorHex, size: 10),
                        const SizedBox(width: 6),
                        Text(
                          '${usage.spoolId ?? 'Cuộn đã xóa'} · '
                          '${Fmt.grams(usage.usedWeightG)}',
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
