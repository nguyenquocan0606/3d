import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/filament.dart';
import '../../data/models/printer.dart';
import '../../data/providers.dart';
import '../../data/repositories/inventory_repository.dart';
import '../scanner/scanner_screen.dart';

/// Tạo lệnh in 3D.
///
/// Một thao tác nhưng backend làm 3 việc trong cùng transaction: trừ nhựa từng cuộn,
/// **chuyển cuộn khỏi kho và gắn vào máy in**, đặt máy in sang trạng thái đang in.
/// Vì vậy màn này luôn hiển thị rõ số nhựa còn lại sau khi trừ trước khi bấm tạo.
class CreateJobScreen extends ConsumerStatefulWidget {
  const CreateJobScreen({super.key});

  @override
  ConsumerState<CreateJobScreen> createState() => _CreateJobScreenState();
}

class _CreateJobScreenState extends ConsumerState<CreateJobScreen> {
  String? _printerId;
  final _nameController = TextEditingController();
  final _hoursController = TextEditingController();
  final _minutesController = TextEditingController();

  /// spoolId → gram dự kiến dùng.
  final Map<String, TextEditingController> _usage = {};
  bool _busy = false;

  @override
  void dispose() {
    _nameController.dispose();
    _hoursController.dispose();
    _minutesController.dispose();
    for (final controller in _usage.values) {
      controller.dispose();
    }
    super.dispose();
  }

  /// Chọn máy in xong thì nạp sẵn các cuộn đang gắn trên máy đó (còn nhựa),
  /// giống hành vi bản web — thợ chỉ cần điền số gram.
  void _selectPrinter(String printerId) {
    final spools = ref.read(spoolsProvider).valueOrNull ?? const <Spool>[];
    final attached = spools
        .where((s) => s.printerId == printerId && s.remainingWeightG > 0)
        .toList();

    setState(() {
      _printerId = printerId;
      for (final controller in _usage.values) {
        controller.dispose();
      }
      _usage
        ..clear()
        ..addEntries(
          attached.map((s) => MapEntry(s.id, TextEditingController())),
        );
    });
  }

  int get _durationMinutes {
    final hours = int.tryParse(_hoursController.text.trim()) ?? 0;
    final minutes = int.tryParse(_minutesController.text.trim()) ?? 0;
    return hours * 60 + minutes;
  }

  List<({String spoolId, double weightG})> get _selectedUsages {
    final result = <({String spoolId, double weightG})>[];
    _usage.forEach((spoolId, controller) {
      final grams = double.tryParse(controller.text.trim()) ?? 0;
      if (grams > 0) result.add((spoolId: spoolId, weightG: grams));
    });
    return result;
  }

  Future<void> _submit() async {
    if (_printerId == null) {
      showToast(context, 'Chưa chọn máy in.', isError: true);
      return;
    }
    if (_durationMinutes <= 0) {
      showToast(context, 'Nhập thời lượng in (giờ/phút).', isError: true);
      return;
    }
    final usages = _selectedUsages;
    if (usages.isEmpty) {
      showToast(context, 'Nhập số gram nhựa dùng cho ít nhất 1 cuộn.', isError: true);
      return;
    }

    setState(() => _busy = true);
    try {
      await ref.read(inventoryRepositoryProvider).createTask(
            printerId: _printerId!,
            durationMinutes: _durationMinutes,
            spools: usages,
            name: _nameController.text.trim().isEmpty
                ? null
                : _nameController.text.trim(),
          );
      await refreshCoreData(ref);
      ref.invalidate(printTasksProvider);
      if (!mounted) return;
      showToast(context, 'Đã tạo lệnh in, đã trừ nhựa và gắn cuộn lên máy.');
      context.pop();
    } catch (error) {
      if (mounted) showToast(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final printers = ref.watch(printersProvider).valueOrNull ?? const <Printer>[];
    final spools = ref.watch(spoolsProvider).valueOrNull ?? const <Spool>[];
    final attached =
        spools.where((s) => _usage.containsKey(s.id)).toList();

    return Scaffold(
      appBar: AppBar(title: const Text('Tạo lệnh in')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          // ── Máy in ──
          Row(
            children: [
              Expanded(
                child: SectionCard(
                  onTap: () => _pickPrinter(printers),
                  child: Row(
                    children: [
                      const Icon(Icons.print_rounded, color: AppColors.warning),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          _printerId == null
                              ? 'Chạm để chọn máy in'
                              : printers
                                  .firstWhere((p) => p.id == _printerId)
                                  .name,
                          style: TextStyle(
                            color: _printerId == null ? AppColors.muted : Colors.white,
                            fontWeight: _printerId == null
                                ? FontWeight.normal
                                : FontWeight.w700,
                          ),
                        ),
                      ),
                      const Icon(Icons.expand_more_rounded, color: AppColors.muted),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                tooltip: 'Quét QR máy in',
                onPressed: () async {
                  final code = await Navigator.of(context).push<String>(
                    MaterialPageRoute(
                      builder: (_) => const ScannerScreen(title: 'Quét QR máy in'),
                    ),
                  );
                  if (code == null || !mounted) return;
                  final normalized = code.replaceAll('-', '').toUpperCase();
                  Printer? found;
                  for (final printer in printers) {
                    if (printer.id.replaceAll('-', '').toUpperCase() == normalized) {
                      found = printer;
                    }
                  }
                  if (found == null) {
                    showToast(context, 'Không tìm thấy máy in $code.', isError: true);
                    return;
                  }
                  _selectPrinter(found.id);
                },
                icon: const Icon(Icons.qr_code_scanner_rounded),
              ),
            ],
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(
              labelText: 'Tên vật in (tùy chọn)',
              prefixIcon: Icon(Icons.label_outline_rounded),
            ),
          ),
          const SizedBox(height: 14),

          // ── Thời lượng ──
          const Text('Thời lượng in', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _hoursController,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(labelText: 'Giờ', suffixText: 'h'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextField(
                  controller: _minutesController,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(labelText: 'Phút', suffixText: 'm'),
                ),
              ),
            ],
          ),
          if (_durationMinutes > 0)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                'Dự kiến xong lúc '
                '${Fmt.dateTime(DateTime.now().add(Duration(minutes: _durationMinutes)))}',
                style: const TextStyle(fontSize: 12, color: AppColors.muted),
              ),
            ),
          const SizedBox(height: 18),

          // ── Cuộn nhựa ──
          const Text('Nhựa sử dụng', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          const Text(
            'Tự nạp các cuộn đang gắn trên máy in đã chọn. Cuộn để trống sẽ không bị trừ.',
            style: TextStyle(fontSize: 12.5, color: AppColors.muted),
          ),
          const SizedBox(height: 10),
          if (_printerId == null)
            const EmptyView(
              message: 'Chọn máy in trước để nạp danh sách cuộn.',
              icon: Icons.print_disabled_rounded,
            )
          else if (attached.isEmpty)
            const EmptyView(
              message: 'Máy in này chưa gắn cuộn nhựa nào còn nhựa.\n'
                  'Quét QR slot AMS để gắn cuộn trước.',
              icon: Icons.link_off_rounded,
            )
          else
            for (final spool in attached)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _UsageRow(
                  spool: spool,
                  controller: _usage[spool.id]!,
                  onChanged: () => setState(() {}),
                ),
              ),
          const SizedBox(height: 22),
          FilledButton.icon(
            onPressed: _busy ? null : _submit,
            icon: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.play_arrow_rounded),
            label: Text(_busy ? 'Đang tạo...' : 'Bắt đầu lệnh in'),
          ),
        ],
      ),
    );
  }

  Future<void> _pickPrinter(List<Printer> printers) async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            for (final printer in printers)
              ListTile(
                leading: const Icon(Icons.print_outlined),
                title: Text(printer.name),
                subtitle: Text(
                  '${printer.id} · ${printer.spools.length} cuộn đang gắn',
                ),
                onTap: () => Navigator.pop(context, printer.id),
              ),
          ],
        ),
      ),
    );
    if (selected != null) _selectPrinter(selected);
  }
}

class _UsageRow extends StatelessWidget {
  const _UsageRow({
    required this.spool,
    required this.controller,
    required this.onChanged,
  });

  final Spool spool;
  final TextEditingController controller;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final used = double.tryParse(controller.text.trim()) ?? 0;
    final after = (spool.remainingWeightG - used).clamp(0, spool.initialWeightG);
    final notEnough = used > spool.remainingWeightG;

    return SectionCard(
      padding: const EdgeInsets.all(12),
      borderColor: notEnough ? AppColors.danger.withValues(alpha: 0.5) : null,
      child: Column(
        children: [
          Row(
            children: [
              ColorDot(hex: spool.filamentColorHex, size: 22),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      spool.id,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontFamily: 'monospace',
                        fontSize: 13.5,
                      ),
                    ),
                    Text(
                      '${spool.materialLabel} · còn ${Fmt.grams(spool.remainingWeightG)}'
                      '${spool.printerSlot != null ? ' · Line ${spool.printerSlot}' : ''}',
                      style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
                    ),
                  ],
                ),
              ),
              SizedBox(
                width: 96,
                child: TextField(
                  controller: controller,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                  ],
                  textAlign: TextAlign.center,
                  onChanged: (_) => onChanged(),
                  decoration: const InputDecoration(
                    hintText: '0',
                    suffixText: 'g',
                    isDense: true,
                  ),
                ),
              ),
            ],
          ),
          if (used > 0) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(
                  notEnough
                      ? Icons.warning_amber_rounded
                      : Icons.arrow_forward_rounded,
                  size: 14,
                  color: notEnough ? AppColors.danger : AppColors.muted,
                ),
                const SizedBox(width: 6),
                Text(
                  notEnough
                      ? 'Không đủ nhựa — backend sẽ trừ về 0 và đánh dấu hết.'
                      : 'Sau khi in còn ${Fmt.grams(after)}',
                  style: TextStyle(
                    fontSize: 12.5,
                    color: notEnough ? AppColors.danger : AppColors.muted,
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
