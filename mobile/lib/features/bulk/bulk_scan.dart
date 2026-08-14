import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/formatters.dart';
import '../../data/models/bulk_order.dart';
import '../../data/providers.dart';
import '../../data/repositories/bulk_repository.dart';

/// Quẹt 1 mã lượt in và trả câu thông báo để hiện lên màn quét.
///
/// Backend tự quyết định lần quẹt này là check-in hay check-out, nên app chỉ gửi
/// mã rồi dựng lại câu thông báo từ kết quả (`ApiClient` chỉ trả về `data`, không
/// giữ `message` của server).
Future<String> scanBulkRun(WidgetRef ref, String code) async {
  final result = await ref.read(bulkRepositoryProvider).scanRun(code.trim());
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
