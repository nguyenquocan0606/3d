import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/scan/code_normalizer.dart';
import '../../core/scan/pda_scan.dart';
import '../../core/scan/scan_router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/filament.dart';
import '../../data/models/order.dart';
import '../../data/providers.dart';
import '../../data/repositories/label_repository.dart';
import '../production/pei_sheet_detail_screen.dart';
import '../scanner/scanner_screen.dart';
import '../spools/color_detail_screen.dart';
import 'custom_label.dart';
import 'label_payload.dart';

enum LabelSource {
  spool('Cuộn nhựa'),
  color('Mã màu nhựa'),
  location('Kho lưu trữ'),
  printer('Máy in'),
  printerSlot('Slot AMS của máy in'),
  peiSheet('Mâm in PEI'),
  custom('In tự do');

  const LabelSource(this.label);
  final String label;
}

/// In tem nhãn.
///
/// Máy in nhiệt XPrinter cắm USB vào máy chủ chứ không phải điện thoại, nên màn
/// này chỉ chọn nội dung rồi gửi lệnh — server sinh TSPL và in. Xem trước ở đây là
/// mô phỏng bố cục tem 40×30mm, không phải bản in pixel-perfect như tab In Tem web.
///
/// Hai lối vào, hai tình huống khác nhau:
///  - **Quét để in lại**: tem trên kệ mờ/rách, quét cái cũ là ra cái mới y hệt.
///    Đây là việc hay làm nhất, nên đặt ngay đầu màn và in luôn không hỏi lại.
///  - **Chọn thủ công**: in tem cho thứ chưa từng có tem, hoặc tem tự nhập.
class LabelsScreen extends ConsumerStatefulWidget {
  const LabelsScreen({super.key});

  @override
  ConsumerState<LabelsScreen> createState() => _LabelsScreenState();
}

class _LabelsScreenState extends ConsumerState<LabelsScreen> {
  LabelSource _source = LabelSource.spool;
  String? _selectedId;
  int _slot = 1;
  bool _busy = false;

  // ── Riêng cho "In tự do" ──
  LabelTemplate _template = LabelTemplate.textOnly;
  LabelFontSize _fontSize = LabelFontSize.lg;
  int _copies = 1;

  final _reprintController = TextEditingController();
  final _qrController = TextEditingController();
  final _line1Controller = TextEditingController();
  final _line2Controller = TextEditingController();
  final _line3Controller = TextEditingController();

  @override
  void dispose() {
    _reprintController.dispose();
    _qrController.dispose();
    _line1Controller.dispose();
    _line2Controller.dispose();
    _line3Controller.dispose();
    super.dispose();
  }

  /// Nội dung tem theo nguồn đã chọn — khớp payload bản web gửi lên.
  ({String qr, String line1, String line2, String line3})? _buildPayload() {
    switch (_source) {
      case LabelSource.spool:
        final spools = ref.read(spoolsProvider).valueOrNull ?? const <Spool>[];
        for (final spool in spools) {
          if (spool.id == _selectedId) {
            return (
              qr: spool.id,
              line1: spool.id,
              line2: spool.filamentType,
              line3: spool.filamentColorName,
            );
          }
        }
        return null;

      case LabelSource.color:
        final name = _selectedId;
        if (name == null) return null;
        return (
          qr: colorTagCode(name),
          line1: colorTagCode(name),
          line2: 'MÃ MÀU NHỰA',
          line3: name,
        );

      case LabelSource.peiSheet:
        final sheets = ref.read(peiSheetsProvider).valueOrNull ?? const <PeiSheet>[];
        for (final sheet in sheets) {
          if (sheet.id == _selectedId) {
            return (
              qr: peiSheetCode(sheet.id),
              line1: 'PEI',
              line2: 'MAM IN PEI',
              line3: sheet.name,
            );
          }
        }
        return null;

      case LabelSource.location:
        final locations = ref.read(locationsProvider).valueOrNull ?? const [];
        for (final location in locations) {
          if (location.id == _selectedId) {
            return (
              qr: location.id,
              line1: location.id,
              line2: 'VỊ TRÍ KHO',
              line3: location.name,
            );
          }
        }
        return null;

      case LabelSource.printer:
      case LabelSource.printerSlot:
        final printers = ref.read(printersProvider).valueOrNull ?? const [];
        for (final printer in printers) {
          if (printer.id == _selectedId) {
            if (_source == LabelSource.printerSlot) {
              return (
                qr: '${printer.id}-L$_slot',
                line1: printer.id,
                line2: 'LINE',
                line3: '$_slot',
              );
            }
            return (
              qr: printer.id,
              line1: printer.id,
              line2: 'MÁY IN 3D',
              line3: printer.name,
            );
          }
        }
        return null;

      case LabelSource.custom:
        final qr = _qrController.text.trim();
        if (qr.isEmpty) return null;
        return (
          qr: qr,
          line1: _line1Controller.text.trim(),
          line2: _line2Controller.text.trim(),
          line3: _line3Controller.text.trim(),
        );
    }
  }

  /// Nội dung tem "in tự do" đang gõ dở — dùng chung cho xem trước và lúc in.
  CustomLabelSpec get _customSpec => CustomLabelSpec(
        template: _template,
        line1: _line1Controller.text,
        line2: _line2Controller.text,
        line3: _line3Controller.text,
        codeContent: _qrController.text,
        fontSize: _fontSize,
        copies: _copies,
      );

  /// In tem tự do: app tự vẽ tem ra ảnh rồi gửi ảnh, nên in được cả chữ có dấu.
  Future<void> _printCustom() async {
    final spec = _customSpec;
    if (spec.isEmpty) {
      showToast(context, 'Nhập ít nhất 1 dòng nội dung.', isError: true);
      return;
    }

    setState(() => _busy = true);
    try {
      final bitmap = await renderCustomLabelBase64(spec);
      await ref.read(labelRepositoryProvider).printCustomLabel(
            bitmapBase64: bitmap,
            copies: spec.copies,
            label: spec.summary,
          );
      if (mounted) showToast(context, 'Đã gửi ${spec.copies} tem tới máy in của xưởng.');
    } catch (error) {
      if (mounted) showToast(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _print() async {
    if (_source == LabelSource.custom) return _printCustom();

    final payload = _buildPayload();
    if (payload == null) {
      showToast(context, 'Chưa chọn/nhập đủ nội dung tem.', isError: true);
      return;
    }

    setState(() => _busy = true);
    try {
      final repo = ref.read(labelRepositoryProvider);
      if (_source == LabelSource.printerSlot) {
        // Layout riêng: in 2 trang (QR to + số slot khổng lồ).
        await repo.printPrinterSlotLabel(printerId: _selectedId!, slotNumber: _slot);
      } else {
        await repo.printQrLabel(
          qrCode: payload.qr,
          line1: payload.line1,
          line2: payload.line2,
          line3: payload.line3,
        );
      }
      if (mounted) showToast(context, 'Đã gửi lệnh in tới máy in của xưởng.');
    } catch (error) {
      if (mounted) showToast(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Quét tem cũ → in ra tem mới y hệt, không hỏi lại.
  ///
  /// Người đứng cạnh máy in cầm tem mờ trên tay: chỉ có đúng một việc muốn làm.
  /// Bản web (tab "In Tem QR Code") cũng in thẳng như vậy.
  Future<String?> _reprint(String code) async {
    final scanned = ref.read(codeNormalizerProvider).classify(code);
    if (scanned.kind == ScanKind.unknown) {
      throw ScanFailure('Không nhận ra mã "${code.trim()}".');
    }

    final payload = labelPayloadFor(ref, scanned);
    setState(() => _busy = true);
    try {
      await printLabelPayload(ref, payload);
      return 'Đã in lại tem ${payload.qr}.';
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _scanToReprint() async {
    final code = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => const ScannerScreen(
          title: 'Quét tem cần in lại',
          hint: 'Cuộn nhựa · Tem màu · Kho · Máy in · Khay AMS · Mâm PEI',
        ),
      ),
    );
    if (code == null || !mounted) return;

    try {
      final message = await _reprint(code);
      if (mounted && message != null) showToast(context, message);
    } catch (error) {
      if (mounted) showToast(context, '$error', isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Máy PDA: đứng ngay đây bóp cò từng tem mờ trên kệ là in lại cả loạt.
    return PdaScanScope(onCode: _reprint, child: _buildScreen(context));
  }

  Widget _buildScreen(BuildContext context) {
    final payload = _buildPayload();

    return Scaffold(
      appBar: AppBar(title: const Text('In tem nhãn')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          _reprintCard(),
          const SizedBox(height: 16),
          const SectionCard(
            child: Row(
              children: [
                Icon(Icons.print_rounded, color: AppColors.indigoLight),
                SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Tem được in bằng máy XPrinter cắm ở máy chủ. Điện thoại chỉ gửi '
                    'lệnh — máy chủ phải đang bật.',
                    style: TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.4),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          const Text(
            'Hoặc chọn thủ công',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          Text(
            _source == LabelSource.custom
                ? 'Tem tự do: gõ gì in nấy, chọn bố cục và cỡ chữ — kể cả tem chỉ có mấy chữ '
                    'thật to, không mã nào cả.'
                : 'Dùng khi in tem lần đầu cho thứ chưa có tem dán.',
            style: const TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.35),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final source in LabelSource.values)
                ChoiceChip(
                  label: Text(source.label),
                  selected: _source == source,
                  onSelected: (_) => setState(() {
                    _source = source;
                    _selectedId = null;
                  }),
                ),
            ],
          ),
          const SizedBox(height: 16),
          if (_source != LabelSource.custom) _picker(),
          if (_source == LabelSource.printerSlot) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                const Text('Line: '),
                const SizedBox(width: 8),
                for (var slot = 1; slot <= 4; slot++) ...[
                  ChoiceChip(
                    label: Text('$slot'),
                    selected: _slot == slot,
                    onSelected: (_) => setState(() => _slot = slot),
                  ),
                  const SizedBox(width: 6),
                ],
              ],
            ),
          ],
          if (_source == LabelSource.custom) ..._customFields(),
          const SizedBox(height: 20),
          const Text('Xem trước', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          if (_source == LabelSource.custom)
            CustomLabelPreview(spec: _customSpec)
          else
            _LabelPreview(payload: payload),
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: _busy || (_source == LabelSource.custom ? _customSpec.isEmpty : payload == null)
                ? null
                : _print,
            icon: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.print_rounded),
            label: Text(
              _busy
                  ? 'Đang gửi...'
                  : _source == LabelSource.custom && _copies > 1
                      ? 'In $_copies tem'
                      : 'In tem',
            ),
          ),
        ],
      ),
    );
  }

  /// Phần "In tự do": chọn bố cục, cỡ chữ, số bản rồi gõ nội dung.
  ///
  /// Đây là thứ bản web có mà app thiếu bấy lâu — nhất là mẫu **Chỉ chữ**: dán thùng hàng, ghi
  /// tên kệ, đánh dấu lô nhựa... toàn những việc chẳng cần mã nào, chỉ cần mấy chữ thật to.
  List<Widget> _customFields() {
    final coMa = _template != LabelTemplate.textOnly;

    return [
      const Text('Bố cục tem', style: TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 8),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final template in LabelTemplate.values)
            ChoiceChip(
              label: Text(template.label),
              selected: _template == template,
              onSelected: (_) => setState(() => _template = template),
            ),
        ],
      ),
      const SizedBox(height: 6),
      Text(
        _template.desc,
        style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
      ),

      const SizedBox(height: 16),
      const Text('Cỡ chữ', style: TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 8),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final size in LabelFontSize.values)
            ChoiceChip(
              label: Text('${size.label} · ${size.desc}'),
              selected: _fontSize == size,
              onSelected: (_) => setState(() => _fontSize = size),
            ),
        ],
      ),
      if (coMa && _fontSize.px > 40) ...[
        const SizedBox(height: 6),
        const Text(
          'Mẫu có mã QR/mã vạch bị chặn cỡ chữ để chữ không đè lên mã. '
          'Muốn chữ to hết cỡ thì chọn bố cục "Chỉ chữ".',
          style: TextStyle(fontSize: 12.5, color: AppColors.warning, height: 1.35),
        ),
      ],

      const SizedBox(height: 16),
      Row(
        children: [
          const Text('Số bản in', style: TextStyle(fontWeight: FontWeight.w700)),
          const Spacer(),
          IconButton.outlined(
            onPressed: _copies > 1 ? () => setState(() => _copies--) : null,
            icon: const Icon(Icons.remove_rounded, size: 18),
          ),
          SizedBox(
            width: 44,
            child: Text(
              '$_copies',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
            ),
          ),
          IconButton.outlined(
            onPressed: _copies < 20 ? () => setState(() => _copies++) : null,
            icon: const Icon(Icons.add_rounded, size: 18),
          ),
        ],
      ),

      const SizedBox(height: 16),
      if (coMa) ...[
        TextField(
          controller: _qrController,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            labelText: _template == LabelTemplate.barcodeText
                ? 'Nội dung mã vạch'
                : 'Nội dung QR',
            helperText: 'Bỏ trống thì lấy dòng 1',
          ),
        ),
        const SizedBox(height: 10),
      ],
      TextField(
        controller: _line1Controller,
        onChanged: (_) => setState(() {}),
        decoration: const InputDecoration(labelText: 'Dòng 1'),
      ),
      const SizedBox(height: 10),
      TextField(
        controller: _line2Controller,
        onChanged: (_) => setState(() {}),
        decoration: const InputDecoration(labelText: 'Dòng 2'),
      ),
      const SizedBox(height: 10),
      TextField(
        controller: _line3Controller,
        onChanged: (_) => setState(() {}),
        decoration: const InputDecoration(labelText: 'Dòng 3'),
      ),
      const SizedBox(height: 12),
      const SectionCard(
        child: Row(
          children: [
            Icon(Icons.translate_rounded, color: AppColors.success, size: 20),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'Tem tự do in được tiếng Việt CÓ DẤU, và bản xem trước dưới đây đúng bằng bản '
                'in ra — app vẽ sẵn cả tem rồi gửi ảnh cho máy in.',
                style: TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.4),
              ),
            ),
          ],
        ),
      ),
    ];
  }

  /// Ô quét/nhập mã để in lại — việc hay làm nhất nên nằm ngay đầu màn.
  Widget _reprintCard() {
    return SectionCard(
      borderColor: AppColors.indigo.withValues(alpha: 0.5),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.qr_code_scanner_rounded, color: AppColors.indigoLight),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Quét để in lại',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          const Text(
            'Tem mờ hay rách: quét cái cũ là in ra cái mới y hệt, không hỏi lại.',
            style: TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.4),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _reprintController,
                  autocorrect: false,
                  textCapitalization: TextCapitalization.characters,
                  textInputAction: TextInputAction.done,
                  decoration: const InputDecoration(
                    hintText: 'Hoặc nhập mã tem',
                    prefixIcon: Icon(Icons.keyboard_rounded),
                    isDense: true,
                  ),
                  onSubmitted: _submitReprintField,
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                tooltip: 'Quét tem cần in lại',
                onPressed: _busy ? null : _scanToReprint,
                icon: const Icon(Icons.qr_code_scanner_rounded),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _submitReprintField(String value) async {
    if (value.trim().isEmpty) return;
    _reprintController.clear();
    try {
      final message = await _reprint(value);
      if (mounted && message != null) showToast(context, message);
    } catch (error) {
      if (mounted) showToast(context, '$error', isError: true);
    }
  }

  Widget _picker() {
    final options = switch (_source) {
      LabelSource.spool => (ref.watch(spoolsProvider).valueOrNull ?? const <Spool>[])
          .map((s) => (
                id: s.id,
                title: s.id,
                subtitle: '${s.materialLabel} · ${s.filamentColorName}',
              ))
          .toList(),
      LabelSource.location => (ref.watch(locationsProvider).valueOrNull ?? const [])
          .map((l) => (id: l.id, title: l.name, subtitle: l.id))
          .toList(),
      LabelSource.printer ||
      LabelSource.printerSlot =>
        (ref.watch(printersProvider).valueOrNull ?? const [])
            .map((p) => (id: p.id, title: p.name, subtitle: p.id))
            .toList(),
      // Màu không phải một bảng riêng — gom từ chính các cuộn đang có.
      LabelSource.color => (ref.watch(spoolsProvider).valueOrNull ?? const <Spool>[])
          .map((s) => s.filamentColorName)
          .where((name) => name.isNotEmpty)
          .toSet()
          .map((name) => (id: name, title: name, subtitle: colorTagCode(name)))
          .toList(),
      LabelSource.peiSheet =>
        (ref.watch(peiSheetsProvider).valueOrNull ?? const <PeiSheet>[])
            .map((s) => (id: s.id, title: s.name, subtitle: '${s.items.length} miếng'))
            .toList(),
      LabelSource.custom => const <({String id, String subtitle, String title})>[],
    };

    if (options.isEmpty) {
      return const EmptyView(message: 'Chưa có dữ liệu để chọn.');
    }

    final selected = options.where((o) => o.id == _selectedId).toList();

    return SectionCard(
      onTap: () async {
        final result = await showModalBottomSheet<String>(
          context: context,
          isScrollControlled: true,
          builder: (context) => DraggableScrollableSheet(
            initialChildSize: 0.7,
            expand: false,
            builder: (context, controller) => ListView.builder(
              controller: controller,
              itemCount: options.length,
              itemBuilder: (context, index) {
                final option = options[index];
                return ListTile(
                  title: Text(option.title),
                  subtitle: Text(option.subtitle),
                  onTap: () => Navigator.pop(context, option.id),
                );
              },
            ),
          ),
        );
        if (result != null) setState(() => _selectedId = result);
      },
      child: Row(
        children: [
          Expanded(
            child: Text(
              selected.isEmpty
                  ? 'Chạm để chọn ${_source.label.toLowerCase()}'
                  : '${selected.first.title} · ${selected.first.subtitle}',
              style: TextStyle(
                color: selected.isEmpty ? AppColors.muted : Colors.white,
                fontWeight: selected.isEmpty ? FontWeight.normal : FontWeight.w600,
              ),
            ),
          ),
          const Icon(Icons.expand_more_rounded, color: AppColors.muted),
        ],
      ),
    );
  }
}

/// Xem trước tem tự do — **vẽ bằng đúng hàm dùng lúc in**, nên thấy sao in vậy.
class CustomLabelPreview extends StatelessWidget {
  const CustomLabelPreview({super.key, required this.spec});

  final CustomLabelSpec spec;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        children: [
          Container(
            width: 320,
            height: 240,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppColors.border),
            ),
            clipBehavior: Clip.antiAlias,
            child: CustomPaint(
              painter: _CustomLabelPainter(spec),
              size: const Size(kLabelWidth * 1.0, kLabelHeight * 1.0),
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            '40 × 30 mm · 320 × 240 dot (203 DPI)',
            style: TextStyle(fontSize: 11.5, color: AppColors.muted),
          ),
        ],
      ),
    );
  }
}

class _CustomLabelPainter extends CustomPainter {
  const _CustomLabelPainter(this.spec);

  final CustomLabelSpec spec;

  @override
  void paint(Canvas canvas, Size size) => paintCustomLabel(canvas, spec);

  @override
  bool shouldRepaint(_CustomLabelPainter old) => true;
}

/// Mô phỏng bố cục tem 40×30mm: QR bên trái, vạch ngăn, 2 dòng chữ xoay bên phải.
class _LabelPreview extends StatelessWidget {
  const _LabelPreview({required this.payload});

  final ({String qr, String line1, String line2, String line3})? payload;

  @override
  Widget build(BuildContext context) {
    if (payload == null) {
      return const SectionCard(
        child: SizedBox(
          height: 120,
          child: Center(
            child: Text(
              'Chọn nội dung để xem trước tem',
              style: TextStyle(color: AppColors.muted),
            ),
          ),
        ),
      );
    }

    return Center(
      child: Container(
        width: 320,
        height: 240,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            Expanded(
              flex: 55,
              child: Column(
                children: [
                  Expanded(
                    child: Container(
                      alignment: Alignment.center,
                      color: Colors.black12,
                      child: Text(
                        payload!.qr,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Colors.black87,
                          fontSize: 12,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    payload!.line2.toUpperCase(),
                    style: const TextStyle(
                      color: Colors.black,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            const VerticalDivider(color: Colors.black, thickness: 2),
            Expanded(
              flex: 45,
              child: RotatedBox(
                quarterTurns: 3,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      payload!.line1.toUpperCase(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.black,
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      payload!.line3.toUpperCase(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.black87, fontSize: 15),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
