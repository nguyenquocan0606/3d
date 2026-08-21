import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/local/outbox.dart';
import '../../data/sync/sync_service.dart';

/// Provider cho danh sách thao tác đang chờ và bị từ chối.
///
/// Tự load lại mỗi khi `syncProvider` thay đổi (worker vừa đẩy xong một lô).
final pendingActionsProvider =
    FutureProvider.autoDispose<({List<ThaoTacCho> cho, List<ThaoTacCho> tuChoi})>(
  (ref) async {
    ref.watch(syncProvider.select((s) => s.choGui + s.biTuChoi));
    final outbox = ref.watch(outboxProvider);
    final cho = await outbox.loCho(toiDa: 200);
    final tuChoi = await outbox.danhSachTuChoi();
    return (cho: cho, tuChoi: tuChoi);
  },
);

/// Màn "Thao tác chưa đồng bộ" — nơi thợ thấy và xử tay những thao tác bị từ chối.
///
/// Đây là **bức tường an toàn cuối cùng** của hệ thống offline: nếu server từ chối
/// một thao tác thì nó dừng ở đây để thợ thấy, không tự xóa trong im lặng.
class PendingActionsScreen extends ConsumerWidget {
  const PendingActionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sync = ref.watch(syncProvider);
    final actionsAsync = ref.watch(pendingActionsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Thao tác chưa đồng bộ'),
        actions: [
          if (sync.dangChay)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 14),
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          else
            IconButton(
              tooltip: 'Đồng bộ ngay',
              icon: const Icon(Icons.sync_rounded),
              onPressed: () => ref.read(syncProvider.notifier).dongBo(),
            ),
        ],
      ),
      body: actionsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(message: '$e', onRetry: () => ref.invalidate(pendingActionsProvider)),
        data: (data) => _Body(cho: data.cho, tuChoi: data.tuChoi),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.cho, required this.tuChoi});

  final List<ThaoTacCho> cho;
  final List<ThaoTacCho> tuChoi;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (cho.isEmpty && tuChoi.isEmpty) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.check_circle_rounded, size: 56, color: AppColors.success),
            SizedBox(height: 16),
            Text(
              'Mọi thao tác đã đồng bộ xong.',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            SizedBox(height: 8),
            Text(
              'Không có gì chờ gửi hay bị từ chối.',
              style: TextStyle(fontSize: AppSize.textBody, color: AppColors.muted),
            ),
          ],
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, AppSize.listBottomInset),
      children: [
        // ── Thao tác bị từ chối (quan trọng nhất, hiện trước) ──────────────
        if (tuChoi.isNotEmpty) ...[
          _SectionHeader(
            icon: Icons.error_rounded,
            color: AppColors.danger,
            title: 'Bị từ chối (${tuChoi.length})',
            subtitle: 'Server không thể áp dụng — thợ cần xử tay từng thao tác.',
          ),
          for (final t in tuChoi) _RejectedCard(thaoTac: t),
          const SizedBox(height: 24),
        ],

        // ── Thao tác đang chờ gửi ──────────────────────────────────────────
        if (cho.isNotEmpty) ...[
          _SectionHeader(
            icon: Icons.upload_rounded,
            color: AppColors.warning,
            title: 'Chờ gửi lên (${cho.length})',
            subtitle: 'Sẽ tự đồng bộ khi có mạng. Thao tác được gửi theo đúng thứ tự.',
          ),
          for (final t in cho) _PendingCard(thaoTac: t),
        ],
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12, top: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: AppSize.iconMd),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: AppSize.textTitle,
                    fontWeight: FontWeight.w700,
                    color: color,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: const TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.3),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Thẻ thao tác bị từ chối — hiện lý do và nút xử lý.
class _RejectedCard extends ConsumerWidget {
  const _RejectedCard({required this.thaoTac});

  final ThaoTacCho thaoTac;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SectionCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  thaoTac.moTa.isNotEmpty ? thaoTac.moTa : thaoTac.loai,
                  style: const TextStyle(
                    fontSize: AppSize.textBody,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.danger.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: const Text(
                  'Từ chối',
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.danger,
                  ),
                ),
              ),
            ],
          ),
          if (thaoTac.loiCuoi != null) ...[
            const SizedBox(height: 6),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.danger.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.danger.withValues(alpha: 0.3)),
              ),
              child: Text(
                thaoTac.loiCuoi!,
                style: const TextStyle(
                  fontSize: 12.5,
                  color: AppColors.danger,
                  height: 1.4,
                ),
              ),
            ),
          ],
          const SizedBox(height: 6),
          Text(
            'Thao tác lúc ${Fmt.dateTime(thaoTac.taoLuc)} · Đã thử ${thaoTac.soLanThu} lần',
            style: const TextStyle(fontSize: 12, color: AppColors.muted),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _boQua(context, ref),
                  icon: const Icon(Icons.delete_outline_rounded, size: 18),
                  label: const Text('Bỏ qua'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.muted,
                    side: const BorderSide(color: AppColors.border),
                    minimumSize: const Size(0, AppSize.touchTarget),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => _thuLai(context, ref),
                  icon: const Icon(Icons.refresh_rounded, size: 18),
                  label: const Text('Thử lại'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.warning,
                    minimumSize: const Size(0, AppSize.touchTarget),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _boQua(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Bỏ qua thao tác?'),
        content: Text(
          'Thao tác "${thaoTac.moTa.isNotEmpty ? thaoTac.moTa : thaoTac.loai}" '
          'sẽ bị xóa vĩnh viễn. Dữ liệu server KHÔNG bị thay đổi.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Hủy'),
          ),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Xóa'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await ref.read(outboxProvider).boQua(thaoTac.id);
    ref.invalidate(pendingActionsProvider);
    await ref.read(syncProvider.notifier).capNhatSoLieu();
    if (context.mounted) showToast(context, 'Đã bỏ qua thao tác.');
  }

  Future<void> _thuLai(BuildContext context, WidgetRef ref) async {
    await ref.read(outboxProvider).thuLai(thaoTac.id);
    ref.invalidate(pendingActionsProvider);
    await ref.read(syncProvider.notifier).capNhatSoLieu();
    // Kích hoạt đồng bộ ngay để thử lại không phải đợi 60 giây
    unawaited(ref.read(syncProvider.notifier).dongBo());
    if (context.mounted) showToast(context, 'Sẽ thử lại trong giây lát.');
  }
}

/// Thẻ thao tác đang chờ gửi — chỉ hiện thông tin, không có nút xử lý.
class _PendingCard extends StatelessWidget {
  const _PendingCard({required this.thaoTac});

  final ThaoTacCho thaoTac;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          const Icon(Icons.schedule_rounded, size: AppSize.iconSm, color: AppColors.warning),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  thaoTac.moTa.isNotEmpty ? thaoTac.moTa : thaoTac.loai,
                  style: const TextStyle(
                    fontSize: AppSize.textBody,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  Fmt.dateTime(thaoTac.taoLuc),
                  style: const TextStyle(fontSize: 12, color: AppColors.muted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

void unawaited(Future<void> future) {
  // Intentionally fire and forget — đẩy đồng bộ nền sau khi thử lại.
}
