import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/formatters.dart';
import '../../core/scan/code_normalizer.dart';
import '../../core/scan/pda_scan.dart';
import '../../core/scan/scan_router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/bulk_order.dart';
import '../../data/providers.dart';
import '../../data/repositories/bulk_repository.dart';
import '../../data/sync/sync_service.dart';
import '../scanner/scanner_screen.dart';
import 'bulk_run_sheet.dart';

/// Quẹt lượt in SLL.
///
/// **Bắt đầu in phải quẹt hai mã: mã lượt rồi mã máy in.** Máy chạy thật hay khác
/// máy được chia lúc tạo đơn (máy kẹt nhựa, dồn mâm sang máy đang rảnh...), nên
/// quẹt tem máy nào thì lượt được gán về đúng máy đó — có vậy bảng lịch sử mới
/// nói đúng máy nào in cái gì. Chốt in xong thì chỉ cần quẹt mã lượt, vì máy đã
/// chốt từ lúc bắt đầu.
///
/// Thao tác đi qua **hàng đợi offline** — nên phản hồi ngay dù đang mất mạng.
Future<String> startBulkRun(WidgetRef ref, BulkRun run, String printerId) async {
  final result = await ref
      .read(bulkRepositoryProvider)
      .checkInRun(run, printerId);
  // Làm mới danh sách ngay — cache đã được vá lạc quan, chỉ cần đọc lại.
  await ref.read(bulkOrdersProvider.notifier).refresh();
  // Đẩy hàng đợi lên ngay, khỏi đợi chu kỳ dự phòng 60s — có mạng thì server biết gần như tức thì.
  unawaited(ref.read(syncProvider.notifier).dongBo());
  return bulkScanMessage(result);
}

/// Chốt in xong — không cần quẹt máy, nhưng có thể kèm số con lỗi của mâm.
Future<String> finishBulkRun(
  WidgetRef ref,
  BulkRun run, {
  int defectQuantity = 0,
}) async {
  final result = await ref
      .read(bulkRepositoryProvider)
      .checkOutRun(run, defectQuantity: defectQuantity);
  await ref.read(bulkOrdersProvider.notifier).refresh();
  unawaited(ref.read(syncProvider.notifier).dongBo());
  return bulkScanMessage(result);
}

/// Hỏi "mâm này có miếng nào lỗi không" rồi mới chốt in xong.
///
/// Số lỗi bị trừ khỏi hàng tốt của đơn, và là căn cứ để bấm "In miếng lỗi" sinh
/// lượt in bù — nên phải hỏi ngay lúc thợ còn đứng cạnh mâm, không để ghi sau.
///
/// Trả về null khi người dùng đóng bảng mà không chọn gì.
Future<String?> finishBulkRunWithDefects(
  BuildContext context,
  WidgetRef ref,
  BulkRun run,
) async {
  final defects = await askDefectQuantity(context, run);
  if (defects == null) return null;
  return finishBulkRun(ref, run, defectQuantity: defects);
}

/// Bảng hỏi số miếng lỗi. Trả về số lỗi (0 = không lỗi), null nếu bỏ qua.
Future<int?> askDefectQuantity(BuildContext context, BulkRun run) {
  return showModalBottomSheet<int>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: AppColors.surfaceAlt,
    builder: (_) => _DefectSheet(run: run),
  );
}

class _DefectSheet extends StatefulWidget {
  const _DefectSheet({required this.run});

  final BulkRun run;

  @override
  State<_DefectSheet> createState() => _DefectSheetState();
}

class _DefectSheetState extends State<_DefectSheet> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final value = int.tryParse(_controller.text.trim()) ?? 0;
    if (value <= 0) {
      showToast(context, 'Nhập số con lỗi lớn hơn 0.', isError: true);
      return;
    }
    if (value > widget.run.quantity) {
      showToast(context, 'Lượt này chỉ có ${widget.run.quantity} con.', isError: true);
      return;
    }
    Navigator.pop(context, value);
  }

  @override
  Widget build(BuildContext context) {
    final run = widget.run;

    return Padding(
      padding: EdgeInsets.fromLTRB(
        16,
        18,
        16,
        MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${run.printerName} · PEI ${run.peiIndex}',
            style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
          ),
          const SizedBox(height: 4),
          Text(
            'Mâm ${run.quantity} con — có miếng nào lỗi không?',
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 18),
          FilledButton.icon(
            onPressed: () => Navigator.pop(context, 0),
            icon: const Icon(Icons.check_rounded),
            label: Text('Không lỗi — xong ${run.quantity} con'),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.success,
              minimumSize: const Size.fromHeight(AppSize.touchTarget),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  autofocus: true,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: const InputDecoration(
                    labelText: 'Số con lỗi',
                    isDense: true,
                  ),
                  onSubmitted: (_) => _submit(),
                ),
              ),
              const SizedBox(width: 10),
              FilledButton(
                onPressed: _submit,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.danger,
                  minimumSize: const Size(120, AppSize.touchTarget),
                ),
                child: const Text('Ghi nhận lỗi'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Text(
            'Số lỗi bị trừ khỏi hàng tốt của đơn. In bù bằng nút "In miếng lỗi" ở màn '
            'chi tiết đơn.',
            style: TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.4),
          ),
        ],
      ),
    );
  }
}

String bulkScanMessage(BulkScanResult result) {
  final run = result.run;
  final vitri = '${run.printerName} · PEI ${run.peiIndex}';
  if (result.isCheckIn) {
    return 'Bắt đầu in: $vitri (${run.quantity} con)';
  }
  return 'In xong: $vitri — hết ${Fmt.duration(run.elapsed)}';
}

/// Tra 1 lượt in trong dữ liệu đã tải, tự tải lại một lần nếu chưa thấy.
Future<BulkRun?> findBulkRun(WidgetRef ref, String runId) async {
  BulkRun? search() {
    final orders = ref.read(bulkOrdersProvider).valueOrNull ?? const <BulkOrder>[];
    for (final order in orders) {
      for (final run in order.runs) {
        if (run.id == runId) return run;
      }
    }
    return null;
  }

  final found = search();
  if (found != null) return found;

  await ref.read(bulkOrdersProvider.notifier).refresh();
  return search();
}

/// Bấm nút "bắt đầu in" ở màn hình: mở máy quét để lấy tem máy in rồi mới check-in.
///
/// Trả về thông báo, hoặc null khi người dùng đóng máy quét giữa chừng.
Future<String?> startBulkRunByScanningPrinter(
  BuildContext context,
  WidgetRef ref,
  BulkRun run,
) async {
  final code = await Navigator.of(context).push<String>(
    MaterialPageRoute(
      builder: (_) => ScannerScreen(
        title: 'Quét máy in',
        hint: 'Lượt PEI ${run.peiIndex} · ${run.quantity} con — '
            'quét tem máy in đang chạy lượt này',
      ),
    ),
  );
  if (code == null) return null;

  final printerId = _printerIdFrom(ref, code);
  if (printerId == null) {
    throw ScanFailure('"$code" không phải mã máy in. Lượt vẫn đang chờ in.');
  }
  return startBulkRun(ref, run, printerId);
}

String? _printerIdFrom(WidgetRef ref, String code) {
  final scanned = ref.read(codeNormalizerProvider).classify(code);
  return scanned.kind == ScanKind.printer ? scanned.id : null;
}

/// Mở máy quét liên tục cho luồng quẹt lượt in.
Future<void> openBulkRunScanner(BuildContext context, WidgetRef ref) {
  return Navigator.of(context).push<void>(
    MaterialPageRoute(
      builder: (scanContext) => ScannerScreen(
        title: 'Quẹt mã lượt in',
        hint: 'Quét mã lượt để xem chi tiết và thao tác',
        continuous: true,
        onCode: (code) => handleBulkRunScan(scanContext, ref, code),
      ),
    ),
  );
}

/// Bọc màn Đơn SLL để máy PDA quẹt được lượt in ngay tại chỗ, khỏi mở màn quét.
///
/// Không cần giữ state nữa: bảng chi tiết mở ra sau cú quẹt đầu tự lo phần chờ tem máy in.
class BulkRunPdaScope extends ConsumerWidget {
  const BulkRunPdaScope({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return PdaScanScope(
      onCode: (code) => handleBulkRunScan(context, ref, code),
      child: child,
    );
  }
}

/// Xử lý một mã lượt in vừa quẹt: mở bảng chi tiết.
///
/// Trước đây chỗ này là một máy trạng thái hai bước (quẹt mã lượt → nhớ lại → quẹt tem máy in).
/// Giờ bảng chi tiết giữ luôn trạng thái đó, mà lại còn bày ra mọi thông tin của mã và đúng những
/// nút dùng được — nên phần nhớ tạm ở đây không còn lý do tồn tại.
///
/// Bảng có bọc `PdaScanScope` nên máy PDA vẫn quẹt tem máy in bằng phím cứng như cũ, không phải
/// chạm màn hình lần nào.
Future<String?> handleBulkRunScan(
  BuildContext context,
  WidgetRef ref,
  String rawCode, {
  void Function(String route)? onOpen,
}) async {
  final run = await findBulkRun(ref, rawCode.trim());
  if (run == null) {
    throw ScanFailure('Không tìm thấy lượt in mã ${rawCode.trim()}.');
  }
  if (!context.mounted) return null;
  return showBulkRunSheet(context, ref, run, onOpen: onOpen);
}
