import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/filament.dart';
import '../../data/providers.dart';
import '../scanner/scanner_screen.dart';
import '../spools/spools_screen.dart';

enum ScanFilter {
  all('Tất cả'),
  unscanned('Chưa quét'),
  scanned('Đã quét');

  const ScanFilter(this.label);
  final String label;
}

/// Kiểm kho — quét từng cuộn nhựa để đối chiếu với dữ liệu trong hệ thống.
///
/// Sắp xếp bám đúng `filterAndSortSpoolsForInventory` của backend: chưa quét lên
/// trước, trong mỗi nhóm ưu tiên cuộn `active`, rồi tới cuộn còn ít nhựa nhất —
/// để người kiểm cầm điện thoại đi theo đúng thứ tự trên màn hình.
class InventoryScreen extends ConsumerStatefulWidget {
  const InventoryScreen({super.key});

  @override
  ConsumerState<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends ConsumerState<InventoryScreen> {
  ScanFilter _filter = ScanFilter.all;
  bool _showAllStatuses = false;
  String _query = '';

  List<Spool> _apply(List<Spool> spools, Map<String, bool> scanned) {
    final query = _query.trim().toLowerCase();

    final result = spools.where((spool) {
      if (!_showAllStatuses && spool.status != SpoolStatus.active) return false;

      final isScanned = scanned[spool.id] ?? false;
      if (_filter == ScanFilter.scanned && !isScanned) return false;
      if (_filter == ScanFilter.unscanned && isScanned) return false;

      if (query.isNotEmpty && !spool.searchText.contains(query)) return false;
      return true;
    }).toList();

    result.sort((a, b) {
      final aScanned = scanned[a.id] ?? false;
      final bScanned = scanned[b.id] ?? false;
      if (aScanned != bScanned) return aScanned ? 1 : -1;

      final aActive = a.status == SpoolStatus.active;
      final bActive = b.status == SpoolStatus.active;
      if (aActive != bActive) return aActive ? -1 : 1;

      return a.remainingWeightG.compareTo(b.remainingWeightG);
    });
    return result;
  }

  Future<String?> _handleScan(String code) async {
    final upper = code.trim().toUpperCase();

    // QR lệnh hoạt động ngay trong màn quét, không cần thoát ra.
    if (upper == 'CMD-INV-RESET') {
      await ref.read(inventorySessionProvider.notifier).reset();
      return 'Đã bắt đầu phiên kiểm kho mới.';
    }
    if (upper == 'CMD-INV-TOGGLE-ALL') {
      setState(() => _showAllStatuses = !_showAllStatuses);
      return _showAllStatuses
          ? 'Hiện tất cả trạng thái cuộn.'
          : 'Chỉ hiện cuộn đang dùng.';
    }

    // Chấp nhận mã đã bỏ gạch nối (PLAWHT01) như bản web.
    final spools = ref.read(spoolsProvider).valueOrNull ?? const [];
    final normalized = code.replaceAll('-', '').toUpperCase();
    var spoolId = code.trim();
    for (final spool in spools) {
      if (spool.id.replaceAll('-', '').toUpperCase() == normalized) {
        spoolId = spool.id;
        break;
      }
    }

    final result = await ref.read(inventorySessionProvider.notifier).scan(spoolId);
    return '✔ ${result.spoolId} · ${result.filamentType} ${result.colorName} · '
        '${Fmt.grams(result.remainingWeightG)}';
  }

  Future<void> _resetSession() async {
    final ok = await confirmAction(
      context,
      title: 'Phiên kiểm kho mới',
      message: 'Kết thúc phiên hiện tại và bắt đầu đếm lại từ đầu?',
      confirmLabel: 'Bắt đầu mới',
    );
    if (!ok) return;
    try {
      await ref.read(inventorySessionProvider.notifier).reset();
      if (mounted) showToast(context, 'Đã bắt đầu phiên kiểm kho mới.');
    } catch (error) {
      if (mounted) showToast(context, '$error', isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sessionAsync = ref.watch(inventorySessionProvider);
    final spools = ref.watch(spoolsProvider).valueOrNull ?? const <Spool>[];
    final scanned = sessionAsync.valueOrNull?.scannedMap ?? const <String, bool>{};

    final visible = _apply(spools, scanned);
    final relevant = spools
        .where((s) => _showAllStatuses || s.status == SpoolStatus.active)
        .toList();
    final scannedCount = relevant.where((s) => scanned[s.id] ?? false).length;
    final ratio = relevant.isEmpty ? 0.0 : scannedCount / relevant.length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Kiểm kho'),
        actions: [
          IconButton(
            tooltip: 'Phiên mới',
            onPressed: _resetSession,
            icon: const Icon(Icons.restart_alt_rounded),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ScannerScreen(
              title: 'Quét kiểm kho',
              hint: 'Quét liên tục từng cuộn nhựa trên kệ',
              continuous: true,
              onCode: _handleScan,
            ),
          ),
        ),
        icon: const Icon(Icons.qr_code_scanner_rounded),
        label: const Text('Quét kiểm'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
            child: SectionCard(
              child: Column(
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      Text(
                        '$scannedCount',
                        style: const TextStyle(
                          fontSize: 32,
                          fontWeight: FontWeight.w800,
                          color: AppColors.success,
                        ),
                      ),
                      Text(
                        ' / ${relevant.length} cuộn',
                        style: const TextStyle(color: AppColors.muted),
                      ),
                      const Spacer(),
                      Text(
                        Fmt.percent(ratio),
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      value: ratio,
                      minHeight: 8,
                      backgroundColor: AppColors.border,
                      valueColor: const AlwaysStoppedAnimation(AppColors.success),
                    ),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              onChanged: (value) => setState(() => _query = value),
              decoration: const InputDecoration(
                hintText: 'Tìm trong danh sách...',
                prefixIcon: Icon(Icons.search_rounded),
                isDense: true,
              ),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                for (final filter in ScanFilter.values) ...[
                  ChoiceChip(
                    label: Text(filter.label),
                    selected: _filter == filter,
                    onSelected: (_) => setState(() => _filter = filter),
                  ),
                  const SizedBox(width: 8),
                ],
                FilterChip(
                  label: const Text('Mọi trạng thái'),
                  selected: _showAllStatuses,
                  onSelected: (value) => setState(() => _showAllStatuses = value),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: AsyncView(
              value: sessionAsync,
              onRetry: () => ref.read(inventorySessionProvider.notifier).refresh(),
              builder: (_) {
                if (visible.isEmpty) {
                  return const EmptyView(
                    message: 'Không còn cuộn nào khớp bộ lọc.',
                    icon: Icons.checklist_rounded,
                  );
                }
                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
                  itemCount: visible.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final spool = visible[index];
                    final isScanned = scanned[spool.id] ?? false;
                    return Opacity(
                      opacity: isScanned ? 0.55 : 1,
                      child: Stack(
                        children: [
                          SpoolTile(spool: spool),
                          if (isScanned)
                            const Positioned(
                              right: 12,
                              top: 12,
                              child: Icon(
                                Icons.check_circle_rounded,
                                color: AppColors.success,
                                size: 18,
                              ),
                            ),
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
