import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/routes.dart';
import '../../core/scan/pda_scan.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/filament.dart';
import '../../data/providers.dart';
import '../../data/repositories/filament_repository.dart';
import '../../data/repositories/label_repository.dart';
import '../scanner/scanner_screen.dart';

/// Sinh mã cuộn kế tiếp khi tạo hàng loạt — port `generateNextSpoolId` bản web:
/// tăng phần số ở cuối và giữ nguyên số chữ số (`C-PLA-R-01` → `C-PLA-R-02`).
String nextSpoolId(String baseId, int index) {
  if (index == 0) return baseId;
  final match = RegExp(r'^(.*?)(\d+)$').firstMatch(baseId);
  if (match != null) {
    final prefix = match.group(1)!;
    final digits = match.group(2)!;
    final next = (int.parse(digits) + index).toString().padLeft(digits.length, '0');
    return '$prefix$next';
  }
  return '$baseId-${index + 1}';
}

/// Thêm cuộn nhựa.
///
/// Đây là **thao tác tạo mới duy nhất** app hỗ trợ — mọi việc thêm dữ liệu gốc khác
/// (kho, máy in, đơn hàng, hàng hóa) vẫn làm trên web. Lý do: dán tem cuộn nhựa là
/// việc phải làm ngay tại kệ, cầm điện thoại tiện hơn chạy về máy tính.
///
/// Backend tự tìm hoặc tạo loại nhựa từ bộ (type + colorName + brand) nên không cần
/// tạo loại nhựa trước.
class AddSpoolScreen extends ConsumerStatefulWidget {
  const AddSpoolScreen({super.key});

  @override
  ConsumerState<AddSpoolScreen> createState() => _AddSpoolScreenState();
}

class _AddSpoolScreenState extends ConsumerState<AddSpoolScreen> {
  final _idController = TextEditingController();
  final _typeController = TextEditingController(text: 'PLA');
  final _colorController = TextEditingController();
  final _brandController = TextEditingController();
  final _initialController = TextEditingController(text: '1000');
  final _emptyController = TextEditingController(text: '220');
  final _remainingController = TextEditingController(text: '1000');

  Color _colorHex = AppColors.indigo;
  int _quantity = 1;
  String? _locationId;
  String? _printerId;
  bool _autoPrint = true;
  bool _busy = false;

  /// Chọn loại nhựa đã có sẵn thay vì gõ tay — tránh tạo trùng loại chỉ vì khác
  /// hoa/thường hay thừa dấu cách.
  Filament? _existingFilament;

  @override
  void dispose() {
    for (final controller in [
      _idController,
      _typeController,
      _colorController,
      _brandController,
      _initialController,
      _emptyController,
      _remainingController,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  double get _initialWeight => double.tryParse(_initialController.text.trim()) ?? 0;
  double get _emptyWeight => double.tryParse(_emptyController.text.trim()) ?? 220;
  double get _remainingWeight =>
      double.tryParse(_remainingController.text.trim()) ?? _initialWeight;

  String? _validate() {
    if (_idController.text.trim().isEmpty) return 'Chưa nhập mã cuộn.';
    if (_initialWeight <= 0) return 'Khối lượng ban đầu phải lớn hơn 0.';
    if (_remainingWeight > _initialWeight) {
      return 'Nhựa còn lại không được vượt quá khối lượng ban đầu.';
    }
    if (_existingFilament == null) {
      if (_typeController.text.trim().isEmpty) return 'Chưa nhập loại nhựa.';
      if (_colorController.text.trim().isEmpty) return 'Chưa nhập tên màu.';
    }
    return null;
  }

  Future<void> _submit() async {
    final error = _validate();
    if (error != null) {
      showToast(context, error, isError: true);
      return;
    }

    setState(() => _busy = true);
    final repo = ref.read(filamentRepositoryProvider);
    final labels = ref.read(labelRepositoryProvider);
    final baseId = _idController.text.trim();
    final created = <String>[];

    try {
      for (var index = 0; index < _quantity; index++) {
        final id = nextSpoolId(baseId, index);

        await repo.createSpool(
          id: id,
          initialWeightG: _initialWeight,
          remainingWeightG: _remainingWeight,
          emptySpoolWeightG: _emptyWeight,
          filamentId: _existingFilament?.id,
          type: _existingFilament == null ? _typeController.text.trim() : null,
          colorName: _existingFilament == null ? _colorController.text.trim() : null,
          colorHex: _existingFilament == null ? _hexString(_colorHex) : null,
          brand: _existingFilament == null
              ? (_brandController.text.trim().isEmpty
                  ? null
                  : _brandController.text.trim())
              : null,
          locationId: _locationId,
          printerId: _printerId,
        );
        created.add(id);

        if (_autoPrint) {
          final brand = _existingFilament?.brand ?? _brandController.text.trim();
          final type = _existingFilament?.type ?? _typeController.text.trim();
          final color = _existingFilament?.colorName ?? _colorController.text.trim();
          // In tem hỏng không được làm hỏng cả lượt tạo cuộn — nuốt lỗi như bản web.
          try {
            await labels.printQrLabel(
              qrCode: id,
              line1: id,
              line2: '$brand $type'.trim(),
              line3: color,
            );
          } catch (_) {
            // bỏ qua
          }
        }
      }

      await refreshCoreData(ref);
      if (!mounted) return;
      showToast(context, 'Đã tạo ${created.length} cuộn: ${created.join(', ')}.');
      context.pop();
    } catch (error) {
      if (mounted) {
        showToast(
          context,
          created.isEmpty
              ? '$error'
              : 'Đã tạo ${created.length} cuộn rồi dừng do lỗi: $error',
          isError: true,
        );
        if (created.isNotEmpty) await refreshCoreData(ref);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  static String _hexString(Color color) =>
      '#${(color.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0').toUpperCase()}';

  /// Quét tem đã in sẵn để lấy mã cuộn — chỉ điền vào ô, không tự tạo.
  Future<String?> _applyScannedId(String code) async {
    setState(() => _idController.text = code.trim());
    return 'Mã cuộn: ${code.trim()}';
  }

  @override
  Widget build(BuildContext context) {
    return PdaScanScope(onCode: _applyScannedId, child: _buildScreen(context));
  }

  Widget _buildScreen(BuildContext context) {
    final filaments = ref.watch(filamentsProvider).valueOrNull ?? const <Filament>[];
    final locations = ref.watch(locationsProvider).valueOrNull ?? const [];
    final printers = ref.watch(printersProvider).valueOrNull ?? const [];

    return Scaffold(
      appBar: AppBar(title: const Text('Thêm cuộn nhựa')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          // ── Mã cuộn ──
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _idController,
                  textCapitalization: TextCapitalization.characters,
                  autocorrect: false,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                    labelText: 'Mã cuộn *',
                    hintText: 'VD: C-PLA-R-01',
                    prefixIcon: Icon(Icons.tag_rounded),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                tooltip: 'Quét mã tem đã in sẵn',
                onPressed: () async {
                  final code = await Navigator.of(context).push<String>(
                    MaterialPageRoute(
                      builder: (_) => const ScannerScreen(
                        title: 'Quét mã cuộn',
                        hint: 'Dùng khi tem đã in sẵn, chỉ cần gán vào hệ thống',
                      ),
                    ),
                  );
                  if (code != null) {
                    setState(() => _idController.text = code.trim());
                  }
                },
                icon: const Icon(Icons.qr_code_scanner_rounded),
              ),
            ],
          ),
          if (_quantity > 1 && _idController.text.trim().isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                'Sẽ tạo: ${List.generate(_quantity, (i) => nextSpoolId(_idController.text.trim(), i)).join(', ')}',
                style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
              ),
            ),
          const SizedBox(height: 18),

          // ── Loại nhựa ──
          const Text('Loại nhựa', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          SectionCard(
            onTap: () => _pickFilament(filaments),
            child: Row(
              children: [
                ColorDot(
                  hex: _existingFilament?.colorHex ?? _hexString(_colorHex),
                  size: 26,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    _existingFilament == null
                        ? 'Chọn loại nhựa đã có (hoặc nhập mới bên dưới)'
                        : '${_existingFilament!.displayName} · ${_existingFilament!.colorName}',
                    style: TextStyle(
                      color: _existingFilament == null ? AppColors.muted : Colors.white,
                      fontWeight:
                          _existingFilament == null ? FontWeight.normal : FontWeight.w600,
                    ),
                  ),
                ),
                if (_existingFilament != null)
                  IconButton(
                    tooltip: 'Bỏ chọn, nhập loại nhựa mới',
                    onPressed: () => setState(() => _existingFilament = null),
                    icon: const Icon(Icons.close_rounded, size: 18),
                  )
                else
                  const Icon(Icons.expand_more_rounded, color: AppColors.muted),
              ],
            ),
          ),
          if (_existingFilament == null) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  flex: 4,
                  child: TextField(
                    controller: _typeController,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(labelText: 'Loại *'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  flex: 6,
                  child: TextField(
                    controller: _colorController,
                    decoration: const InputDecoration(
                      labelText: 'Tên màu *',
                      hintText: 'Đỏ, Đen nhám...',
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _brandController,
                    decoration: const InputDecoration(
                      labelText: 'Hãng',
                      hintText: 'eSun, Sunlu...',
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                InkWell(
                  onTap: _pickColor,
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: _colorHex,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Icon(
                      Icons.palette_rounded,
                      color: AppColors.onColor(_colorHex),
                    ),
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 18),

          // ── Khối lượng ──
          const Text('Khối lượng', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _numberField(_initialController, 'Nhựa ban đầu', onChanged: () {
                  // Cuộn mới thì mặc định còn nguyên — đồng bộ luôn cho đỡ gõ 2 lần.
                  _remainingController.text = _initialController.text;
                }),
              ),
              const SizedBox(width: 10),
              Expanded(child: _numberField(_emptyController, 'Vỏ cuộn')),
            ],
          ),
          const SizedBox(height: 12),
          _numberField(_remainingController, 'Nhựa còn lại'),
          const SizedBox(height: 18),

          // ── Vị trí ──
          const Text('Xếp chỗ (tùy chọn)', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          const Text(
            'Cuộn chỉ nằm ở một nơi: chọn kho thì tự bỏ máy in và ngược lại.',
            style: TextStyle(fontSize: 12.5, color: AppColors.muted),
          ),
          const SizedBox(height: 10),
          SectionCard(
            child: Column(
              children: [
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.warehouse_rounded),
                  title: const Text('Kho lưu trữ'),
                  subtitle: Text(
                    _locationId == null
                        ? 'Chưa chọn'
                        : locations
                            .firstWhere((l) => l.id == _locationId)
                            .name,
                  ),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () async {
                    final selected = await showModalBottomSheet<String>(
                      context: context,
                      builder: (context) => SafeArea(
                        child: ListView(
                          shrinkWrap: true,
                          children: [
                            ListTile(
                              leading: const Icon(Icons.block_rounded),
                              title: const Text('Không xếp vào kho'),
                              onTap: () => Navigator.pop(context, ''),
                            ),
                            for (final location in locations)
                              ListTile(
                                title: Text(location.name),
                                subtitle: Text(location.id),
                                onTap: () => Navigator.pop(context, location.id),
                              ),
                          ],
                        ),
                      ),
                    );
                    if (selected == null) return; // vuốt xuống hủy
                    setState(() {
                      _locationId = selected.isEmpty ? null : selected;
                      if (_locationId != null) _printerId = null;
                    });
                  },
                ),
                const Divider(height: 8),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.print_rounded),
                  title: const Text('Máy in'),
                  subtitle: Text(
                    _printerId == null
                        ? 'Chưa chọn'
                        : printers.firstWhere((p) => p.id == _printerId).name,
                  ),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () async {
                    final selected = await showModalBottomSheet<String>(
                      context: context,
                      builder: (context) => SafeArea(
                        child: ListView(
                          shrinkWrap: true,
                          children: [
                            ListTile(
                              leading: const Icon(Icons.block_rounded),
                              title: const Text('Không gắn máy in'),
                              onTap: () => Navigator.pop(context, ''),
                            ),
                            for (final printer in printers)
                              ListTile(
                                title: Text(printer.name),
                                subtitle: Text(printer.id),
                                onTap: () => Navigator.pop(context, printer.id),
                              ),
                          ],
                        ),
                      ),
                    );
                    if (selected == null) return; // vuốt xuống hủy
                    setState(() {
                      _printerId = selected.isEmpty ? null : selected;
                      if (_printerId != null) _locationId = null;
                    });
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),

          // ── Số lượng & in tem ──
          SectionCard(
            child: Column(
              children: [
                Row(
                  children: [
                    const Expanded(
                      child: Text('Số cuộn tạo cùng lúc',
                          style: TextStyle(fontWeight: FontWeight.w600)),
                    ),
                    IconButton.filledTonal(
                      tooltip: 'Giảm số cuộn',
                      onPressed: _quantity <= 1
                          ? null
                          : () => setState(() => _quantity--),
                      icon: const Icon(Icons.remove_rounded),
                    ),
                    SizedBox(
                      width: 44,
                      child: Text(
                        '$_quantity',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    IconButton.filledTonal(
                      tooltip: 'Tăng số cuộn',
                      onPressed: _quantity >= 50
                          ? null
                          : () => setState(() => _quantity++),
                      icon: const Icon(Icons.add_rounded),
                    ),
                  ],
                ),
                const Divider(height: 20),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Tự in tem sau khi tạo'),
                  subtitle: const Text(
                    'Gửi lệnh in tới máy in nhãn cắm ở máy chủ',
                    style: TextStyle(fontSize: 12),
                  ),
                  value: _autoPrint,
                  onChanged: (value) => setState(() => _autoPrint = value),
                ),
              ],
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
                : const Icon(Icons.check_rounded),
            label: Text(_busy
                ? 'Đang tạo...'
                : 'Tạo $_quantity cuộn${_autoPrint ? ' & in tem' : ''}'),
          ),
        ],
      ),
    );
  }

  Widget _numberField(
    TextEditingController controller,
    String label, {
    VoidCallback? onChanged,
  }) {
    return TextField(
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
      decoration: InputDecoration(labelText: label, suffixText: 'g'),
      onChanged: (_) => setState(() => onChanged?.call()),
    );
  }

  Future<void> _pickFilament(List<Filament> filaments) async {
    final selected = await showModalBottomSheet<Filament>(
      context: context,
      isScrollControlled: true,
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.7,
        expand: false,
        builder: (context, controller) => ListView.builder(
          controller: controller,
          itemCount: filaments.length,
          itemBuilder: (context, index) {
            final filament = filaments[index];
            return ListTile(
              leading: ColorDot(hex: filament.colorHex, size: 22),
              title: Text('${filament.displayName} · ${filament.colorName}'),
              subtitle: Text('${filament.spools.length} cuộn đang có'),
              onTap: () => Navigator.pop(context, filament),
            );
          },
        ),
      ),
    );
    if (selected != null) setState(() => _existingFilament = selected);
  }

  Future<void> _pickColor() async {
    const palette = <Color>[
      Color(0xFF000000), Color(0xFFFFFFFF), Color(0xFFEF4444), Color(0xFFF97316),
      Color(0xFFF59E0B), Color(0xFFEAB308), Color(0xFF22C55E), Color(0xFF10B981),
      Color(0xFF06B6D4), Color(0xFF3B82F6), Color(0xFF6366F1), Color(0xFF8B5CF6),
      Color(0xFFEC4899), Color(0xFF78716C), Color(0xFF94A3B8), Color(0xFF7C2D12),
    ];

    final selected = await showModalBottomSheet<Color>(
      context: context,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Chọn màu nhựa',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 14),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  for (final color in palette)
                    InkWell(
                      onTap: () => Navigator.pop(context, color),
                      borderRadius: BorderRadius.circular(999),
                      child: Container(
                        width: 46,
                        height: 46,
                        decoration: BoxDecoration(
                          color: color,
                          shape: BoxShape.circle,
                          border: Border.all(color: AppColors.border, width: 2),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    if (selected != null) setState(() => _colorHex = selected);
  }
}

/// Nút "Thêm cuộn" gắn ở màn danh sách cuộn nhựa.
class AddSpoolFab extends StatelessWidget {
  const AddSpoolFab({super.key});

  @override
  Widget build(BuildContext context) {
    return FloatingActionButton.extended(
      heroTag: 'add-spool',
      onPressed: () => context.push(Routes.addSpool),
      icon: const Icon(Icons.add_rounded),
      label: const Text('Thêm cuộn'),
    );
  }
}
