import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/formatters.dart';
import '../../core/scan/pda_scan.dart';
import '../../core/scan/scan_router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/bulk_order.dart';
import '../../data/providers.dart';
import '../../data/repositories/bulk_repository.dart';
import '../../data/sync/sync_service.dart';
import '../scanner/scanner_screen.dart';

/// Kiểm hàng đơn SLL: quẹt lại từng mâm ĐÃ IN XONG để đối soát trước khi giao.
///
/// Đây là lượt quẹt **thứ ba** của một mâm (bắt đầu in → in xong → kiểm hàng), nên
/// chỉ ghi mốc `verifiedAt`, không đụng tới số lỗi hay trạng thái in: sửa kết quả
/// in là việc của màn chi tiết đơn.
///
/// Mâm chưa in xong không nằm trong danh sách — quẹt trúng thì báo rõ, vì đó là
/// dấu hiệu thợ đang cầm nhầm mâm chứ không phải quên bấm nút.
class BulkVerifyScreen extends ConsumerStatefulWidget {
  const BulkVerifyScreen({super.key, required this.orderId});

  final String orderId;

  @override
  ConsumerState<BulkVerifyScreen> createState() => _BulkVerifyScreenState();
}

class _BulkVerifyScreenState extends ConsumerState<BulkVerifyScreen> {
  /// Quẹt 1 mã trong màn kiểm hàng. Trả về thông báo cho khung quét.
  Future<String?> _verify(String rawCode) async {
    final code = rawCode.trim();
    final order = ref.read(bulkOrderByIdProvider(widget.orderId));
    if (order == null) throw ScanFailure('Đơn này không còn tồn tại.');

    BulkRun? run;
    for (final r in order.runs) {
      if (r.id == code) run = r;
    }
    if (run == null) {
      throw ScanFailure('Mã $code không thuộc đơn ${order.productName}.');
    }
    if (run.status != BulkStatus.completed) {
      throw ScanFailure(
        'Mâm ${run.printerName} · PEI ${run.peiIndex} chưa in xong — '
        'chốt in xong ở màn chi tiết đơn trước đã.',
      );
    }
    if (run.isVerified) {
      throw ScanFailure(
        'Mâm ${run.printerName} · PEI ${run.peiIndex} đã kiểm lúc '
        '${Fmt.dateTime(run.verifiedAt)}.',
      );
    }

    await ref.read(bulkRepositoryProvider).verifyRun(run);
    await ref.read(bulkOrdersProvider.notifier).refresh();
    unawaited(ref.read(syncProvider.notifier).dongBo());

    final capNhat = ref.read(bulkOrderByIdProvider(widget.orderId)) ?? order;
    return '✔ PEI ${run.peiIndex} · ${run.quantity} con — '
        '${capNhat.verifiedRuns}/${capNhat.runsToVerify.length} mâm';
  }

  Future<void> _toggle(BulkRun run) async {
    try {
      if (run.isVerified) {
        final ok = await confirmAction(
          context,
          title: 'Bỏ đánh dấu đã kiểm',
          message: 'Mâm ${run.printerName} · PEI ${run.peiIndex} sẽ quay về "chưa kiểm".',
          confirmLabel: 'Bỏ đánh dấu',
        );
        if (!ok) return;
        await ref.read(bulkRepositoryProvider).unverifyRun(run.id);
      } else {
        await ref.read(bulkRepositoryProvider).verifyRun(run);
        unawaited(ref.read(syncProvider.notifier).dongBo());
      }
      await ref.read(bulkOrdersProvider.notifier).refresh();
    } catch (error) {
      if (mounted) showToast(context, '$error', isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PdaScanScope(onCode: _verify, child: _buildScreen(context));
  }

  Widget _buildScreen(BuildContext context) {
    final order = ref.watch(bulkOrderByIdProvider(widget.orderId));

    return Scaffold(
      appBar: AppBar(title: const Text('Kiểm hàng đơn SLL')),
      body: order == null
          ? const EmptyView(
              message: 'Đơn này không còn tồn tại.',
              icon: Icons.search_off_rounded,
            )
          : _buildBody(context, order),
    );
  }

  Widget _buildBody(BuildContext context, BulkOrder order) {
    final canKiem = order.runsToVerify;

    if (canKiem.isEmpty) {
      return const EmptyView(
        message: 'Chưa mâm nào in xong nên chưa có gì để kiểm.',
        icon: Icons.inventory_2_outlined,
      );
    }

    return RefreshIndicator(
      onRefresh: () => ref.read(bulkOrdersProvider.notifier).refresh(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, AppSize.listBottomInset),
        children: [
          _VerifyProgress(order: order),
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ScannerScreen(
                  title: 'Quét kiểm mâm',
                  hint: 'Quét liên tục tem lượt in cho tới khi đủ ${canKiem.length} mâm',
                  continuous: true,
                  onCode: _verify,
                ),
              ),
            ),
            icon: const Icon(Icons.qr_code_scanner_rounded),
            label: const Text('Bắt đầu quét kiểm'),
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(AppSize.touchTarget),
            ),
          ),
          const SizedBox(height: 18),
          SectionCard(
            padding: const EdgeInsets.fromLTRB(14, 6, 8, 6),
            child: Column(
              children: [
                for (final run in canKiem)
                  _VerifyRow(run: run, onToggle: () => _toggle(run)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _VerifyProgress extends StatelessWidget {
  const _VerifyProgress({required this.order});

  final BulkOrder order;

  @override
  Widget build(BuildContext context) {
    final total = order.runsToVerify.length;
    final checked = order.verifiedRuns;
    final done = checked >= total;
    final color = done ? AppColors.success : AppColors.warning;

    return SectionCard(
      borderColor: color.withValues(alpha: 0.4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            order.productName,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
          ),
          Text(
            'Mã đơn: ${order.orderCode ?? '—'} · ${order.displayCustomer}',
            style: const TextStyle(fontSize: 12, color: AppColors.muted),
          ),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                '$checked',
                style: TextStyle(
                  fontSize: 40,
                  fontWeight: FontWeight.w800,
                  color: color,
                ),
              ),
              Text(
                ' / $total mâm đã in xong',
                style: const TextStyle(fontSize: 15, color: AppColors.muted),
              ),
              const Spacer(),
              if (done)
                const StatusChip(
                  label: 'Kiểm đủ',
                  color: AppColors.success,
                  icon: Icons.check_circle_rounded,
                ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: order.verifyProgress,
              minHeight: 10,
              backgroundColor: AppColors.border,
              valueColor: AlwaysStoppedAnimation(color),
            ),
          ),
          const SizedBox(height: 10),
          InfoRow(
            label: 'Hàng tốt đã kiểm',
            value: '${order.verifiedQuantity} / ${order.doneQuantity} con',
          ),
        ],
      ),
    );
  }
}

class _VerifyRow extends StatelessWidget {
  const _VerifyRow({required this.run, required this.onToggle});

  final BulkRun run;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final verified = run.isVerified;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(
            verified
                ? Icons.check_circle_rounded
                : Icons.radio_button_unchecked_rounded,
            size: 20,
            color: verified ? AppColors.success : AppColors.muted,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      run.id,
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (run.isRework) ...[
                      const SizedBox(width: 6),
                      const StatusChip(label: 'BÙ', color: AppColors.danger, dense: true),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  '${run.printerName} · PEI ${run.peiIndex} · ${run.goodQuantity} con tốt'
                  '${run.defectQuantity > 0 ? ' · lỗi ${run.defectQuantity}' : ''}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: AppColors.muted),
                ),
                if (verified)
                  Text(
                    'Kiểm lúc ${Fmt.dateTime(run.verifiedAt)}',
                    style: const TextStyle(fontSize: 11.5, color: AppColors.success),
                  ),
              ],
            ),
          ),
          IconButton(
            tooltip: verified ? 'Bỏ đánh dấu đã kiểm' : 'Đánh dấu đã kiểm (tem rách, hỏng)',
            onPressed: onToggle,
            icon: Icon(
              verified ? Icons.undo_rounded : Icons.done_rounded,
              size: 20,
              color: verified ? AppColors.muted : AppColors.success,
            ),
          ),
        ],
      ),
    );
  }
}
