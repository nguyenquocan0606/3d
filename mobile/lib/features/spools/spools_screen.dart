import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format/formatters.dart';
import '../../core/routes.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/filament.dart';
import '../../data/providers.dart';
import '../shell/quick_menu.dart';
import 'add_spool_screen.dart';
import 'weigh_sheet.dart';

enum SpoolSort {
  remainingAsc('Còn ít nhất'),
  remainingDesc('Còn nhiều nhất'),
  idAsc('Mã A → Z');

  const SpoolSort(this.label);
  final String label;
}

class SpoolsScreen extends ConsumerStatefulWidget {
  const SpoolsScreen({super.key, this.initialQuery});

  /// Cho phép mở màn này kèm từ khóa sẵn (VD quét tem mã màu `CLR-DO`).
  final String? initialQuery;

  @override
  ConsumerState<SpoolsScreen> createState() => _SpoolsScreenState();
}

class _SpoolsScreenState extends ConsumerState<SpoolsScreen> {
  late final TextEditingController _search =
      TextEditingController(text: widget.initialQuery ?? '');

  String _material = 'Tất cả';
  SpoolStatus? _status = SpoolStatus.active;
  SpoolSort _sort = SpoolSort.remainingAsc;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<Spool> _apply(List<Spool> source) {
    final query = _search.text.trim().toLowerCase();

    final result = source.where((spool) {
      if (_status != null && spool.status != _status) return false;
      if (_material != 'Tất cả' && spool.filamentType != _material) return false;
      if (query.isNotEmpty && !spool.searchText.contains(query)) return false;
      return true;
    }).toList();

    result.sort((a, b) => switch (_sort) {
          SpoolSort.remainingAsc =>
            a.remainingWeightG.compareTo(b.remainingWeightG),
          SpoolSort.remainingDesc =>
            b.remainingWeightG.compareTo(a.remainingWeightG),
          SpoolSort.idAsc => a.id.compareTo(b.id),
        });
    return result;
  }

  @override
  Widget build(BuildContext context) {
    final spoolsAsync = ref.watch(spoolsProvider);
    final allSpools = spoolsAsync.valueOrNull ?? const <Spool>[];
    final materials = <String>{
      'Tất cả',
      ...allSpools.map((s) => s.filamentType).where((t) => t.isNotEmpty),
    }.toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Cuộn nhựa'),
        actions: const [QuickMenuButton()],
      ),
      // Thêm cuộn nhựa là thao tác tạo mới duy nhất app hỗ trợ (xem AddSpoolScreen).
      floatingActionButton: const AddSpoolFab(),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              controller: _search,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: 'Tìm mã cuộn, vật liệu, màu, hãng...',
                prefixIcon: const Icon(Icons.search_rounded),
                isDense: true,
                suffixIcon: _search.text.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Xóa từ khóa tìm kiếm',
                        icon: const Icon(Icons.close_rounded),
                        onPressed: () {
                          _search.clear();
                          setState(() {});
                        },
                      ),
              ),
            ),
          ),
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                _FilterChip(
                  label: _status?.label ?? 'Mọi trạng thái',
                  active: _status != null,
                  onTap: _pickStatus,
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: _material,
                  active: _material != 'Tất cả',
                  onTap: () => _pickMaterial(materials),
                ),
                const SizedBox(width: 8),
                _FilterChip(label: _sort.label, active: true, onTap: _pickSort),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: AsyncView(
              value: spoolsAsync,
              onRetry: () => ref.read(filamentsProvider.notifier).refresh(),
              builder: (data) {
                final spools = _apply(data);
                if (spools.isEmpty) {
                  return const EmptyView(
                    message: 'Không có cuộn nhựa nào khớp bộ lọc.',
                    icon: Icons.inventory_2_outlined,
                  );
                }
                return RefreshIndicator(
                  onRefresh: () => refreshCoreData(ref),
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, AppSize.listBottomInset),
                    itemCount: spools.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, index) => SpoolTile(spool: spools[index]),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _pickStatus() async {
    final result = await showModalBottomSheet<Object>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: const Text('Mọi trạng thái'),
              onTap: () => Navigator.pop(context, 'all'),
            ),
            for (final status in SpoolStatus.values)
              ListTile(
                title: Text(status.label),
                onTap: () => Navigator.pop(context, status),
              ),
          ],
        ),
      ),
    );
    if (result == null) return;
    setState(() => _status = result is SpoolStatus ? result : null);
  }

  Future<void> _pickMaterial(List<String> materials) async {
    final result = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            for (final material in materials)
              ListTile(
                title: Text(material),
                onTap: () => Navigator.pop(context, material),
              ),
          ],
        ),
      ),
    );
    if (result != null) setState(() => _material = result);
  }

  Future<void> _pickSort() async {
    final result = await showModalBottomSheet<SpoolSort>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final sort in SpoolSort.values)
              ListTile(
                title: Text(sort.label),
                onTap: () => Navigator.pop(context, sort),
              ),
          ],
        ),
      ),
    );
    if (result != null) setState(() => _sort = result);
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({required this.label, required this.active, required this.onTap});

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      onPressed: onTap,
      backgroundColor:
          active ? AppColors.indigo.withValues(alpha: 0.18) : AppColors.surfaceAlt,
      side: BorderSide(color: active ? AppColors.indigo : AppColors.border),
      label: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: const TextStyle(fontSize: 12.5)),
          const SizedBox(width: 4),
          const Icon(Icons.expand_more_rounded, size: 15),
        ],
      ),
    );
  }
}

/// Thẻ 1 cuộn nhựa — dùng chung ở danh sách cuộn, chi tiết kho và chi tiết máy in.
class SpoolTile extends ConsumerWidget {
  const SpoolTile({super.key, required this.spool, this.showPlace = true});

  final Spool spool;
  final bool showPlace;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SectionCard(
      onTap: () => context.push(Routes.spoolDetail(spool.id)),
      padding: const EdgeInsets.all(14),
      child: Column(
        children: [
          Row(
            children: [
              ColorDot(hex: spool.filamentColorHex, size: 26),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      spool.id,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontFamily: 'monospace',
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${spool.materialLabel} · ${spool.filamentColorName}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    Fmt.grams(spool.remainingWeightG),
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: AppColors.forRemaining(spool.remainingWeightG),
                    ),
                  ),
                  Text(
                    Fmt.percent(spool.remainingRatio),
                    style: const TextStyle(fontSize: 12, color: AppColors.muted),
                  ),
                ],
              ),
              const SizedBox(width: 6),
              IconButton(
                tooltip: 'Cân nhanh',
                onPressed: () => showWeighSheet(context, spool),
                icon: const Icon(Icons.monitor_weight_outlined),
              ),
            ],
          ),
          const SizedBox(height: 10),
          RemainingBar(ratio: spool.remainingRatio, grams: spool.remainingWeightG),
          if (showPlace) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Icon(
                  spool.locationId != null
                      ? Icons.warehouse_rounded
                      : spool.printerId != null
                          ? Icons.print_rounded
                          : Icons.help_outline_rounded,
                  size: 14,
                  color: AppColors.muted,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    spool.placeLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12, color: AppColors.muted),
                  ),
                ),
                if (spool.status != SpoolStatus.active)
                  StatusChip(
                    label: spool.status.label,
                    color: spool.status == SpoolStatus.depleted
                        ? AppColors.danger
                        : AppColors.muted,
                    dense: true,
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
