import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/formatters.dart';
import '../../core/scan/code_normalizer.dart';
import '../../core/scan/scan_router.dart';
import '../../data/models/bulk_order.dart';
import '../../data/providers.dart';
import '../../data/repositories/bulk_repository.dart';
import '../scanner/scanner_screen.dart';

/// Quẹt lượt in SLL.
///
/// **Bắt đầu in phải quẹt hai mã: mã lượt rồi mã máy in.** Máy chạy thật hay khác
/// máy được chia lúc tạo đơn (máy kẹt nhựa, dồn mâm sang máy đang rảnh...), nên
/// quẹt tem máy nào thì lượt được gán về đúng máy đó — có vậy bảng lịch sử mới
/// nói đúng máy nào in cái gì. Chốt in xong thì chỉ cần quẹt mã lượt, vì máy đã
/// chốt từ lúc bắt đầu.
Future<String> startBulkRun(WidgetRef ref, String runId, String printerId) async {
  final result = await ref
      .read(bulkRepositoryProvider)
      .scanRun(runId, printerId: printerId);
  await ref.read(bulkOrdersProvider.notifier).refresh();
  return bulkScanMessage(result);
}

/// Chốt in xong — không cần quẹt máy.
Future<String> finishBulkRun(WidgetRef ref, String runId) async {
  final result = await ref.read(bulkRepositoryProvider).scanRun(runId);
  await ref.read(bulkOrdersProvider.notifier).refresh();
  return bulkScanMessage(result);
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
  return startBulkRun(ref, run.id, printerId);
}

String? _printerIdFrom(WidgetRef ref, String code) {
  final scanned = ref.read(codeNormalizerProvider).classify(code);
  return scanned.kind == ScanKind.printer ? scanned.id : null;
}

/// Mở máy quét liên tục cho luồng quẹt lượt in.
Future<void> openBulkRunScanner(BuildContext context, WidgetRef ref) {
  final session = BulkRunScanSession();
  return Navigator.of(context).push<void>(
    MaterialPageRoute(
      builder: (_) => ScannerScreen(
        title: 'Quẹt mã lượt in',
        hint: 'Bắt đầu in: quét mã lượt rồi quét tem máy in · In xong: quét mã lượt',
        continuous: true,
        onCode: (code) => session.handle(ref, code),
      ),
    ),
  );
}

/// Phiên quẹt liên tục ở các màn Đơn SLL.
///
/// Giữ trạng thái giữa hai lần quét: quét mã lượt đang chờ in xong thì phiên
/// "đang đợi mã máy in", quét tiếp tem máy mới thật sự bắt đầu.
class BulkRunScanSession {
  String? _runId;
  String? _runLabel;

  bool get waitingForPrinter => _runId != null;

  Future<String> handle(WidgetRef ref, String rawCode) async {
    final code = rawCode.trim();

    if (_runId != null) {
      final printerId = _printerIdFrom(ref, code);
      if (printerId == null) {
        throw ScanFailure(
          'Cần quét tem MÁY IN để bắt đầu lượt $_runLabel.\n'
          'Quét lại mã lượt nếu muốn bỏ qua.',
        );
      }
      final runId = _runId!;
      _runId = null;
      _runLabel = null;
      return startBulkRun(ref, runId, printerId);
    }

    final run = await findBulkRun(ref, code);
    if (run == null) {
      throw ScanFailure('Không tìm thấy lượt in mã $code.');
    }

    switch (run.status) {
      case BulkStatus.pending:
        _runId = run.id;
        _runLabel = 'PEI ${run.peiIndex}';
        return 'Lượt PEI ${run.peiIndex} (${run.quantity} con) — '
            'quét tiếp tem MÁY IN để bắt đầu.';
      case BulkStatus.printing:
        return finishBulkRun(ref, run.id);
      case BulkStatus.completed:
        throw ScanFailure(
          'Lượt ${run.printerName} · PEI ${run.peiIndex} đã in xong lúc '
          '${Fmt.dateTime(run.finishedAt)}.',
        );
    }
  }
}
