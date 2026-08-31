import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format/formatters.dart';
import '../../core/routes.dart';
import '../../core/scan/code_normalizer.dart';
import '../../core/scan/pda_scan.dart';
import '../../core/scan/scan_router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/bulk_order.dart';
import '../../data/providers.dart';
import '../../data/repositories/bulk_repository.dart';
import '../../data/sync/sync_service.dart';
import 'bulk_orders_screen.dart' show colorForBulkStatus;
import 'bulk_scan.dart';

/// Bảng chi tiết một lượt in SLL, mở ngay khi quét mã lượt.
///
/// Trước đây quét xong chỉ hiện một dòng toast rồi thao tác luôn — nhanh nhưng mù: thợ không biết
/// lượt này thuộc đơn nào, mâm mấy, đã in bao nhiêu con, có phải lượt in bù không. Giờ mọi thứ về
/// mã đó nằm hết ở đây, kèm đúng những nút dùng được với trạng thái hiện tại.
///
/// Trả về thông báo cho màn quét hiển thị, hoặc null nếu người dùng chỉ xem rồi đóng.
///
/// [onOpen] là nơi nhận đường dẫn cần mở. Màn quét toàn cục truyền vào để **mở sau khi màn quét đã
/// đóng** — push khi còn đứng trong màn quét sẽ bị chính cú pop của nó đóng lại.
Future<String?> showBulkRunSheet(
  BuildContext context,
  WidgetRef ref,
  BulkRun run, {
  void Function(String route)? onOpen,
}) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: AppColors.surfaceAlt,
    builder: (_) => _BulkRunSheet(run: run, onOpen: onOpen),
  );
}

/// Tìm đơn chứa lượt này trong danh sách đã tải.
BulkOrder? _timDon(List<BulkOrder> orders, String orderId) {
  for (final o in orders) {
    if (o.id == orderId) return o;
  }
  return null;
}

class _BulkRunSheet extends ConsumerStatefulWidget {
  const _BulkRunSheet({required this.run, this.onOpen});

  final BulkRun run;
  final void Function(String route)? onOpen;

  @override
  ConsumerState<_BulkRunSheet> createState() => _BulkRunSheetState();
}

class _BulkRunSheetState extends ConsumerState<_BulkRunSheet> {
  late BulkRun _run = widget.run;
  bool _busy = false;

  /// Đọc lại lượt từ cache sau mỗi thao tác — cache đã được vá lạc quan nên số liệu mới hiện ngay
  /// cả khi đang mất mạng.
  void _docLai() {
    final don = _timDon(
      ref.read(bulkOrdersProvider).valueOrNull ?? const <BulkOrder>[],
      _run.orderId,
    );
    if (don == null) return;
    for (final r in don.runs) {
      if (r.id == _run.id) {
        setState(() => _run = r);
        return;
      }
    }
  }

  Future<void> _chay(Future<String?> Function() viec) async {
    setState(() => _busy = true);
    try {
      final tin = await viec();
      _docLai();
      if (!mounted) return;
      // Có kết quả thì đóng bảng và trả thông báo lên màn quét; không thì ở lại để xem tiếp.
      if (tin != null) {
        Navigator.pop(context, tin);
      } else {
        setState(() => _busy = false);
      }
    } catch (error) {
      if (!mounted) return;
      showToast(context, '$error', isError: true);
      setState(() => _busy = false);
    }
  }

  Future<void> _doiKiemHang() async {
    final da = _run.isVerified;
    await _chay(() async {
      final repo = ref.read(bulkRepositoryProvider);
      if (da) {
        await repo.unverifyRun(_run.id);
      } else {
        await repo.verifyRun(_run);
        unawaited(ref.read(syncProvider.notifier).dongBo());
      }
      await ref.read(bulkOrdersProvider.notifier).refresh();
      return null; // ở lại bảng để thấy trạng thái vừa đổi
    });
  }

  /// Kéo lượt đã chốt về lại "đang in" — dành cho ca quẹt nhầm mâm.
  Future<void> _datLaiTrangThai() async {
    final chac = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Đặt lại về "Đang in"?'),
        content: Text(
          'Lượt ${_run.printerName} · PEI ${_run.peiIndex} đang tính là đã xong'
          '${_run.defectQuantity > 0 ? ' (${_run.defectQuantity} con lỗi)' : ''}.\n\n'
          'Đặt lại sẽ bỏ mốc kết thúc, và đơn mất phần hàng tốt của mâm này cho tới khi chốt lại.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Thôi')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('Đặt lại'),
          ),
        ],
      ),
    );
    if (chac != true) return;

    await _chay(() async {
      await ref.read(bulkRepositoryProvider).updateRun(_run.id, status: BulkStatus.printing);
      await ref.read(bulkOrdersProvider.notifier).refresh();
      return null;
    });
  }

  void _moDon() {
    final route = Routes.bulkOrderDetail(_run.orderId);
    final mo = widget.onOpen;
    // Lấy router TRƯỚC khi pop: sau khi pop, context của bảng không còn dùng để điều hướng được.
    final router = mo == null ? GoRouter.of(context) : null;
    Navigator.pop(context);
    if (mo != null) {
      mo(route);
    } else {
      router!.push(route);
    }
  }

  @override
  Widget build(BuildContext context) {
    // `watch` chứ không `read`: quẹt xong ở màn khác hoặc đồng bộ về là bảng đang mở tự cập nhật.
    final orders = ref.watch(bulkOrdersProvider).valueOrNull ?? const <BulkOrder>[];
    final don = _timDon(orders, _run.orderId);
    final mau = colorForBulkStatus(_run.status);

    // Máy PDA quét bằng phím cứng chứ không mở camera. Bảng đang mở mà thợ bóp cò quét tem máy in
    // thì bắt đầu lượt luôn — giữ đúng tốc độ của luồng cũ, chỉ thêm phần thông tin ở trên.
    return PdaScanScope(
      enabled: !_busy && _run.status == BulkStatus.pending,
      onCode: _quetTuPda,
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Icon(Icons.qr_code_2_rounded, color: mau),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _run.id,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ),
                  StatusChip(label: _run.status.label, color: mau),
                ],
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Text(
                    '${_run.printerName} · PEI ${_run.peiIndex}',
                    style: const TextStyle(fontSize: 13, color: AppColors.muted),
                  ),
                  if (_run.isRework) ...[
                    const SizedBox(width: 8),
                    const StatusChip(label: 'IN BÙ', color: AppColors.info, dense: true),
                  ],
                  if (_run.isVerified) ...[
                    const SizedBox(width: 8),
                    const StatusChip(label: 'ĐÃ KIỂM', color: AppColors.success, dense: true),
                  ],
                ],
              ),

              const SizedBox(height: 16),
              SectionCard(
                child: Column(
                  children: [
                    InfoRow(label: 'Lượt thứ', value: '${_run.seq}'),
                    InfoRow(label: 'Số con trên mâm', value: '${_run.quantity}'),
                    InfoRow(
                      label: 'Con lỗi',
                      value: _run.defectQuantity > 0 ? '${_run.defectQuantity}' : 'Không',
                      valueColor: _run.defectQuantity > 0 ? AppColors.danger : null,
                    ),
                    InfoRow(
                      label: 'Hàng tốt',
                      value: '${_run.goodQuantity}',
                      valueColor: AppColors.success,
                    ),
                    InfoRow(label: 'Bắt đầu', value: Fmt.dateTime(_run.startedAt)),
                    InfoRow(label: 'In xong', value: Fmt.dateTime(_run.finishedAt)),
                    InfoRow(label: 'Thời gian in', value: Fmt.duration(_run.elapsed)),
                    InfoRow(
                      label: 'Kiểm hàng',
                      value: _run.isVerified ? Fmt.dateTime(_run.verifiedAt) : 'Chưa kiểm',
                      valueColor: _run.isVerified ? AppColors.success : AppColors.warning,
                    ),
                  ],
                ),
              ),

              if (don != null) ...[
                const SizedBox(height: 12),
                SectionCard(
                  child: Column(
                    children: [
                      InfoRow(label: 'Sản phẩm', value: don.productName),
                      InfoRow(label: 'Mã đơn', value: don.orderCode ?? '—'),
                      InfoRow(label: 'Khách hàng', value: don.displayCustomer),
                      InfoRow(
                        label: 'Tiến độ đơn',
                        value: '${don.doneQuantity}/${don.totalQuantity} con',
                      ),
                      InfoRow(
                        label: 'Lỗi chưa in bù',
                        value: don.pendingRework > 0 ? '${don.pendingRework} con' : 'Không',
                        valueColor: don.pendingRework > 0 ? AppColors.danger : null,
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 16),
              ..._nutTheoTrangThai(),

              const SizedBox(height: 8),
              TextButton.icon(
                onPressed: _busy ? null : _moDon,
                icon: const Icon(Icons.open_in_new_rounded, size: 18),
                label: const Text('Mở đơn SLL'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Tem máy in quét từ phím cứng PDA: bắt đầu lượt ngay, khỏi mở camera.
  Future<String?> _quetTuPda(String code) async {
    final scanned = ref.read(codeNormalizerProvider).classify(code);
    if (scanned.kind != ScanKind.printer || scanned.id == null) {
      throw ScanFailure('"$code" không phải tem máy in. Lượt vẫn đang chờ in.');
    }
    final tin = await startBulkRun(ref, _run, scanned.id!);
    if (mounted) Navigator.pop(context, tin);
    return null; // màn quét ngoài sẽ hiện thông báo, đừng toast hai lần
  }

  /// Chỉ bày ra thao tác dùng được với trạng thái hiện tại — bấm nhầm lúc đang vội là mất số liệu.
  List<Widget> _nutTheoTrangThai() {
    switch (_run.status) {
      case BulkStatus.pending:
        return [
          FilledButton.icon(
            onPressed: _busy
                ? null
                : () => _chay(() => startBulkRunByScanningPrinter(context, ref, _run)),
            icon: const Icon(Icons.play_arrow_rounded),
            label: const Text('Bắt đầu in — quét tem máy'),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.warning,
              minimumSize: const Size.fromHeight(AppSize.touchTarget),
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Phải quét tem máy in đang chạy lượt này — máy thật có thể khác máy được chia lúc tạo đơn.',
            style: TextStyle(fontSize: 12, color: AppColors.muted, height: 1.35),
          ),
        ];

      case BulkStatus.printing:
        return [
          FilledButton.icon(
            onPressed:
                _busy ? null : () => _chay(() => finishBulkRunWithDefects(context, ref, _run)),
            icon: const Icon(Icons.check_rounded),
            label: const Text('Chốt in xong'),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.success,
              minimumSize: const Size.fromHeight(AppSize.touchTarget),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Đã in ${Fmt.duration(DateTime.now().difference(_run.startedAt ?? DateTime.now()))}. '
            'Chốt xong sẽ hỏi số con lỗi của mâm.',
            style: const TextStyle(fontSize: 12, color: AppColors.muted, height: 1.35),
          ),
        ];

      case BulkStatus.completed:
        return [
          FilledButton.icon(
            onPressed: _busy ? null : _doiKiemHang,
            icon: Icon(
              _run.isVerified
                  ? Icons.check_box_rounded
                  : Icons.check_box_outline_blank_rounded,
            ),
            label: Text(_run.isVerified ? 'Bỏ đánh dấu đã kiểm' : 'Đánh dấu đã kiểm mâm'),
            style: FilledButton.styleFrom(
              backgroundColor: _run.isVerified ? AppColors.muted : AppColors.info,
              minimumSize: const Size.fromHeight(AppSize.touchTarget),
            ),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: _busy ? null : _datLaiTrangThai,
            icon: const Icon(Icons.undo_rounded, size: 18),
            label: const Text('Đặt lại về "Đang in"'),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.danger,
              minimumSize: const Size.fromHeight(AppSize.touchTarget),
            ),
          ),
        ];
    }
  }
}
