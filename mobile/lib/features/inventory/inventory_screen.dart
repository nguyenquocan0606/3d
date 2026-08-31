import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/formatters.dart';
import '../../core/scale/scale_audio.dart';
import '../../core/scan/pda_scan.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/filament.dart';
import '../../data/providers.dart';
import '../../data/repositories/filament_repository.dart';
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

/// Một dòng phản hồi ngay dưới thanh tiêu đề: cuộn vừa quét là con nào.
///
/// Toast hệ thống nổi ở đáy màn, chỗ đó lại bị nút "Quét kiểm" che — người đứng
/// kiểm kho cầm máy ngang tầm mắt không kịp đọc. Dải này nằm ngay trên ô tiến độ,
/// đúng chỗ mắt đang nhìn.
typedef _ScanFeedback = ({
  String title,
  String? subtitle,
  String? colorHex,
  bool isError,
});

class _InventoryScreenState extends ConsumerState<InventoryScreen> {
  ScanFilter _filter = ScanFilter.all;
  bool _showAllStatuses = false;
  String _query = '';

  /// Hiện 2 giây rồi tự tắt; quét con tiếp theo thì thay luôn nội dung cũ.
  _ScanFeedback? _feedback;
  Timer? _feedbackTimer;
  bool _undoing = false;
  String? _deletingSpoolId;

  static const _feedbackDuration = Duration(seconds: 2);

  @override
  void dispose() {
    _feedbackTimer?.cancel();
    super.dispose();
  }

  void _showFeedback(_ScanFeedback feedback) {
    if (!mounted) return;
    _feedbackTimer?.cancel();
    setState(() => _feedback = feedback);
    _feedbackTimer = Timer(_feedbackDuration, () {
      if (mounted) setState(() => _feedback = null);
    });
  }

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
    final scanned =
        ref.read(inventorySessionProvider).valueOrNull?.scannedMap ??
            const <String, bool>{};
    final normalized = code.replaceAll('-', '').toUpperCase();
    var spoolId = code.trim();
    Spool? matchedSpool;
    for (final spool in spools) {
      if (spool.id.replaceAll('-', '').toUpperCase() == normalized) {
        spoolId = spool.id;
        matchedSpool = spool;
        break;
      }
    }

    if (scanned[spoolId] ?? false) {
      await ref.read(scaleAudioProvider).speak('error');
      _showFeedback((
        title: 'Trùng $spoolId',
        subtitle: matchedSpool == null
            ? 'Cuộn này đã được quét trong phiên kiểm kho.'
            : '${matchedSpool.filamentType} ${matchedSpool.filamentColorName} · '
                'đã quét rồi',
        colorHex: matchedSpool?.filamentColorHex,
        isError: true,
      ));
      return 'Trùng $spoolId — cuộn này đã quét rồi.';
    }

    final result =
        await ref.read(inventorySessionProvider.notifier).scan(spoolId);
    _showFeedback((
      title: result.spoolId,
      subtitle: '${result.filamentType} ${result.colorName} · '
          '${Fmt.grams(result.remainingWeightG)}',
      colorHex: result.colorHex,
      isError: false,
    ));
    return '✔ ${result.spoolId} · ${result.filamentType} ${result.colorName} · '
        '${Fmt.grams(result.remainingWeightG)}';
  }

  /// Bản dùng cho máy PDA: phản hồi đã nằm ở dải trên màn (kể cả lỗi) nên tắt
  /// toast của [PdaScanScope], khỏi hiện hai lần cùng một câu.
  Future<String?> _handlePdaScan(String code) async {
    try {
      return await _handleScan(code);
    } catch (error) {
      _showFeedback((
        title: '$error',
        subtitle: null,
        colorHex: null,
        isError: true,
      ));
      rethrow; // Để scope rung báo lỗi.
    }
  }

  /// Hoàn tác lượt quét gần nhất — quét nhầm cuộn bên cạnh thì bấm một nút là xong.
  Future<void> _undoLastScan() async {
    if (_undoing) return;
    setState(() => _undoing = true);
    try {
      final result =
          await ref.read(inventorySessionProvider.notifier).undoLastScan();
      _showFeedback((
        title: 'Đã bỏ ${result.spoolId}',
        subtitle: result.colorName.isEmpty
            ? 'Cuộn này trở lại danh sách chưa quét'
            : '${result.filamentType} ${result.colorName} · chưa quét trở lại',
        colorHex: result.colorHex,
        isError: false,
      ));
    } catch (error) {
      _showFeedback((
        title: '$error',
        subtitle: null,
        colorHex: null,
        isError: true,
      ));
    } finally {
      if (mounted) setState(() => _undoing = false);
    }
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

  /// Xóa ngay cuộn không tìm thấy trong lúc kiểm kho.
  ///
  /// Chỉ hiện cho nhóm chưa quét: đó là luồng kiểm thực tế "không thấy cuộn trên
  /// kệ nữa thì dọn khỏi hệ thống" mà không phải rời màn kiểm kho.
  Future<void> _deleteUnscannedSpool(Spool spool) async {
    if (_deletingSpoolId != null) return;

    final ok = await confirmAction(
      context,
      title: 'Xóa cuộn chưa kiểm',
      message: 'Xóa vĩnh viễn cuộn ${spool.id}? Chỉ dùng khi đã tìm trên kệ '
          'nhưng không còn thấy cuộn này.',
      confirmLabel: 'Xóa',
    );
    if (!ok) return;

    setState(() => _deletingSpoolId = spool.id);
    try {
      await ref.read(filamentRepositoryProvider).deleteSpool(spool.id);
      await refreshCoreData(ref);
      if (!mounted) return;
      _showFeedback((
        title: 'Đã xóa ${spool.id}',
        subtitle: '${spool.filamentType} ${spool.filamentColorName}',
        colorHex: spool.filamentColorHex,
        isError: false,
      ));
      showToast(context, 'Đã xóa cuộn ${spool.id}.');
    } catch (error) {
      if (mounted) showToast(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _deletingSpoolId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Máy PDA: đứng ngay đây bóp cò từng cuộn trên kệ, khỏi mở màn quét.
    return PdaScanScope(
      onCode: _handlePdaScan,
      showFeedback: false,
      child: _buildScreen(context),
    );
  }

  Widget _buildScreen(BuildContext context) {
    final sessionAsync = ref.watch(inventorySessionProvider);
    final spools = ref.watch(spoolsProvider).valueOrNull ?? const <Spool>[];
    final scanned =
        sessionAsync.valueOrNull?.scannedMap ?? const <String, bool>{};

    final visible = _apply(spools, scanned);
    final relevant = spools
        .where((s) => _showAllStatuses || s.status == SpoolStatus.active)
        .toList();
    final scannedCount = relevant.where((s) => scanned[s.id] ?? false).length;
    final ratio = relevant.isEmpty ? 0.0 : scannedCount / relevant.length;

    final hasScans = sessionAsync.valueOrNull?.items.isNotEmpty ?? false;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Kiểm kho'),
        actions: [
          IconButton(
            tooltip: 'Hoàn tác lượt quét gần nhất',
            onPressed: hasScans && !_undoing ? _undoLastScan : null,
            icon: _undoing
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.undo_rounded),
          ),
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
          if (_feedback != null)
            _ScanFeedbackBar(
              feedback: _feedback!,
              onUndo: hasScans && !_undoing ? _undoLastScan : null,
            ),
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
                      valueColor:
                          const AlwaysStoppedAnimation(AppColors.success),
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
                  onSelected: (value) =>
                      setState(() => _showAllStatuses = value),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: AsyncView(
              value: sessionAsync,
              onRetry: () =>
                  ref.read(inventorySessionProvider.notifier).refresh(),
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
                    final isDeleting = _deletingSpoolId == spool.id;
                    final deleteAction = isScanned
                        ? null
                        : IconButton(
                            tooltip: 'Xóa cuộn chưa kiểm',
                            onPressed: isDeleting
                                ? null
                                : () => _deleteUnscannedSpool(spool),
                            icon: isDeleting
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(
                                    Icons.delete_outline_rounded,
                                    color: AppColors.danger,
                                  ),
                          );
                    return Opacity(
                      opacity: isScanned ? 0.55 : 1,
                      child: Stack(
                        children: [
                          SpoolTile(spool: spool, trailingAction: deleteAction),
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

/// Dải phản hồi cuộn vừa quét. Chữ to, chấm màu đúng màu nhựa để đối chiếu
/// nhanh với cuộn đang cầm trên tay, kèm nút hoàn tác ngay cạnh.
class _ScanFeedbackBar extends StatelessWidget {
  const _ScanFeedbackBar({required this.feedback, this.onUndo});

  final _ScanFeedback feedback;
  final VoidCallback? onUndo;

  @override
  Widget build(BuildContext context) {
    final accent = feedback.isError ? AppColors.danger : AppColors.success;

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: accent.withValues(alpha: 0.5)),
      ),
      child: Row(
        children: [
          if (feedback.isError)
            const Icon(Icons.error_outline_rounded,
                color: AppColors.danger, size: 20)
          else if (feedback.colorHex != null)
            ColorDot(hex: feedback.colorHex, size: 20)
          else
            const Icon(Icons.check_circle_rounded,
                color: AppColors.success, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  feedback.title,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: accent,
                  ),
                ),
                if (feedback.subtitle != null)
                  Text(
                    feedback.subtitle!,
                    style:
                        const TextStyle(color: AppColors.muted, fontSize: 13),
                  ),
              ],
            ),
          ),
          if (onUndo != null)
            TextButton.icon(
              onPressed: onUndo,
              icon: const Icon(Icons.undo_rounded, size: 18),
              label: const Text('Hoàn tác'),
            ),
        ],
      ),
    );
  }
}
