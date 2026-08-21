import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/formatters.dart';
import '../../core/scale/scale_audio.dart';
import '../../core/scale/scale_service.dart';
import '../../core/scan/pda_scan.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/filament.dart';
import '../../data/providers.dart';
import '../../data/repositories/filament_repository.dart';
import '../scanner/scanner_screen.dart';

/// Mở màn cân cho 1 cuộn nhựa.
Future<void> showWeighSheet(BuildContext context, Spool spool) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: AppColors.surfaceAlt,
    builder: (_) => WeighSheet(spool: spool),
  );
}

enum _WeighMode {
  /// Cân cả cuộn rồi trừ vỏ — luồng mặc định vì thợ chỉ việc đặt cuộn lên cân.
  calculated,

  /// Nhập thẳng số nhựa còn lại.
  direct,
}

/// Cân cuộn nhựa.
///
/// Đây là màn hình có giá trị nhất khi chuyển sang di động: người thợ đứng cạnh
/// cân, cầm cuộn nhựa, không rảnh tay gõ. Vì vậy:
///  - số cân hiển thị cực to, cập nhật realtime qua MQTT;
///  - 1 chạm để lấy số từ cân, 1 chạm để lưu;
///  - quét cuộn tiếp theo ngay trong màn này sẽ **tự lưu cuộn hiện tại** rồi chuyển
///    sang cuộn mới (port luồng quét liên tục của `update-weight-modal.tsx`).
class WeighSheet extends ConsumerStatefulWidget {
  const WeighSheet({super.key, required this.spool});

  final Spool spool;

  @override
  ConsumerState<WeighSheet> createState() => _WeighSheetState();
}

class _WeighSheetState extends ConsumerState<WeighSheet> {
  late Spool _spool = widget.spool;
  late double _emptyWeight = widget.spool.emptySpoolWeightG;
  late double _remaining = widget.spool.remainingWeightG;
  double? _totalWeighed;

  _WeighMode _mode = _WeighMode.calculated;
  bool _saving = false;

  double get _computedRemaining {
    if (_mode == _WeighMode.direct) return _remaining;
    final total = _totalWeighed;
    if (total == null) return _remaining;
    final value = total - _emptyWeight;
    return value.clamp(0, _spool.initialWeightG).toDouble();
  }

  /// Lấy số đang hiện trên cân (đã cộng offset hiệu chuẩn).
  void _captureFromScale() {
    final scale = ref.read(scaleProvider);
    if (!scale.isConnected) {
      showToast(context, 'Chưa kết nối trạm cân.', isError: true);
      return;
    }
    final rounded = scale.weight.roundToDouble();
    setState(() {
      if (_mode == _WeighMode.calculated) {
        _totalWeighed = rounded;
      } else {
        _remaining = rounded.clamp(0, _spool.initialWeightG).toDouble();
      }
    });
    HapticFeedback.selectionClick();
    ref.read(scaleAudioProvider).speakNumber(_computedRemaining);
  }

  Future<bool> _save({bool silent = false}) async {
    final value = _computedRemaining;
    if (value > _spool.initialWeightG) {
      showToast(context, 'Khối lượng còn lại vượt quá khối lượng ban đầu.',
          isError: true);
      return false;
    }

    setState(() => _saving = true);
    try {
      final repo = ref.read(filamentRepositoryProvider);
      // Vỏ cuộn đổi thì phải ghi qua endpoint sửa cuộn — endpoint /weight chỉ
      // nhận remainingWeightG.
      if (_emptyWeight != _spool.emptySpoolWeightG) {
        await repo.updateSpool(_spool.id, emptySpoolWeightG: _emptyWeight);
      }
      await repo.updateSpoolWeight(_spool.id, value);
      await ref.read(filamentsProvider.notifier).refresh();

      if (!silent && mounted) {
        showToast(context, 'Đã lưu ${Fmt.grams(value)} cho cuộn ${_spool.id}.');
      }
      ref.read(scaleAudioProvider).speak('done');
      return true;
    } catch (error) {
      if (mounted) showToast(context, '$error', isError: true);
      return false;
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// Quét cuộn tiếp theo: lưu cuộn hiện tại rồi nạp cuộn mới vào cùng màn hình.
  Future<void> _scanNextSpool() async {
    final code = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => const ScannerScreen(
          title: 'Quét cuộn tiếp theo',
          hint: 'Cuộn hiện tại sẽ được lưu tự động',
        ),
      ),
    );
    if (code == null || !context.mounted) return;

    try {
      final message = await _switchToSpool(code);
      if (mounted && message != null) showToast(context, message);
    } catch (error) {
      if (mounted) showToast(context, '$error', isError: true);
    }
  }

  /// Lưu cuộn đang cân rồi nạp cuộn vừa quét vào cùng màn hình.
  ///
  /// Dùng chung cho nút "Lưu & quét cuộn tiếp theo" và cho máy PDA — bóp cò ngay
  /// trên bảng cân là chuyển cuộn, khỏi rời tay khỏi cân.
  Future<String?> _switchToSpool(String code) async {
    final saved = await _save(silent: true);
    if (!saved || !mounted) return null;

    final spools = ref.read(spoolsProvider).valueOrNull ?? const [];
    final normalized = code.replaceAll('-', '').toUpperCase();
    Spool? next;
    for (final item in spools) {
      if (item.id.replaceAll('-', '').toUpperCase() == normalized) {
        next = item;
        break;
      }
    }

    final selected = next;
    if (selected == null) {
      throw Exception('Không tìm thấy cuộn nhựa ${code.trim()}.');
    }

    ref.read(scaleAudioProvider).speak('spool');
    setState(() {
      _spool = selected;
      _emptyWeight = selected.emptySpoolWeightG;
      _remaining = selected.remainingWeightG;
      _totalWeighed = null;
    });
    return 'Đã chuyển sang cuộn ${selected.id}.';
  }

  @override
  Widget build(BuildContext context) {
    return PdaScanScope(onCode: _switchToSpool, child: _buildSheet(context));
  }

  Widget _buildSheet(BuildContext context) {
    final scale = ref.watch(scaleProvider);
    final result = _computedRemaining;

    return DraggableScrollableSheet(
      initialChildSize: 0.92,
      minChildSize: 0.6,
      maxChildSize: 0.96,
      expand: false,
      builder: (context, scrollController) => Column(
        children: [
          const SizedBox(height: 10),
          Container(
            width: 42,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.border,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          Expanded(
            child: ListView(
              controller: scrollController,
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
              children: [
                _header(),
                const SizedBox(height: 16),
                _liveScaleCard(scale),
                const SizedBox(height: 16),
                _modeSelector(),
                const SizedBox(height: 16),
                if (_mode == _WeighMode.calculated) ...[
                  _NumberField(
                    label: 'Cân cả cuộn (g)',
                    value: _totalWeighed,
                    onChanged: (value) => setState(() => _totalWeighed = value),
                  ),
                  const SizedBox(height: 12),
                  _NumberField(
                    label: 'Khối lượng vỏ cuộn (g)',
                    value: _emptyWeight,
                    onChanged: (value) =>
                        setState(() => _emptyWeight = value ?? _emptyWeight),
                  ),
                ] else
                  _NumberField(
                    label: 'Nhựa còn lại (g)',
                    value: _remaining,
                    onChanged: (value) =>
                        setState(() => _remaining = value ?? _remaining),
                  ),
                const SizedBox(height: 16),
                _resultCard(result),
                const SizedBox(height: 20),
                FilledButton.icon(
                  onPressed: _saving ? null : () async {
                    final ok = await _save();
                    if (ok && context.mounted) Navigator.pop(context);
                  },
                  icon: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save_rounded),
                  label: Text(_saving ? 'Đang lưu...' : 'Lưu khối lượng'),
                ),
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: _saving ? null : _scanNextSpool,
                  icon: const Icon(Icons.qr_code_scanner_rounded),
                  label: const Text('Lưu & quét cuộn tiếp theo'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _header() {
    return Row(
      children: [
        ColorDot(hex: _spool.filamentColorHex, size: 34),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _spool.id,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  fontFamily: 'monospace',
                ),
              ),
              Text(
                '${_spool.materialLabel} · ${_spool.filamentColorName}',
                style: const TextStyle(color: AppColors.muted, fontSize: 13),
              ),
            ],
          ),
        ),
        StatusChip(
          label: _spool.status.label,
          color: _spool.status == SpoolStatus.active
              ? AppColors.success
              : AppColors.muted,
        ),
      ],
    );
  }

  Widget _liveScaleCard(ScaleState scale) {
    final color = scale.isConnected ? AppColors.success : AppColors.muted;
    return SectionCard(
      borderColor: color.withValues(alpha: 0.4),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
              const SizedBox(width: 8),
              Text(
                scale.isConnected ? 'Trạm cân đang online' : 'Mất kết nối trạm cân',
                style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 13),
              ),
            ],
          ),
          const SizedBox(height: 8),
          FittedBox(
            child: Text(
              scale.isConnected ? '${scale.weight.round()} g' : '--- g',
              style: TextStyle(
                fontSize: 64,
                fontWeight: FontWeight.w800,
                fontFeatures: const [FontFeature.tabularFigures()],
                color: scale.isConnected ? AppColors.success : AppColors.muted,
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: _captureFromScale,
                  icon: const Icon(Icons.download_rounded),
                  label: const Text('Lấy số từ cân'),
                ),
              ),
              const SizedBox(width: 10),
              OutlinedButton(
                onPressed: () => ref.read(scaleProvider.notifier).calibrateTo(0),
                child: const Text('Tare'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _modeSelector() {
    return SegmentedButton<_WeighMode>(
      segments: const [
        ButtonSegment(
          value: _WeighMode.calculated,
          label: Text('Cân cả cuộn'),
          icon: Icon(Icons.scale_rounded),
        ),
        ButtonSegment(
          value: _WeighMode.direct,
          label: Text('Nhập nhựa còn'),
          icon: Icon(Icons.edit_rounded),
        ),
      ],
      selected: {_mode},
      onSelectionChanged: (value) => setState(() => _mode = value.first),
    );
  }

  Widget _resultCard(double result) {
    final ratio =
        _spool.initialWeightG <= 0 ? 0.0 : (result / _spool.initialWeightG).clamp(0.0, 1.0);
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              const Text('Nhựa còn lại', style: TextStyle(color: AppColors.muted)),
              const Spacer(),
              Text(
                Fmt.grams(result),
                style: TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  color: AppColors.forRemaining(result),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          RemainingBar(ratio: ratio, grams: result),
          const SizedBox(height: 10),
          Text(
            'Ban đầu ${Fmt.grams(_spool.initialWeightG)} · vỏ ${Fmt.grams(_emptyWeight)} · '
            'còn ${(ratio * 100).round()}%',
            style: const TextStyle(fontSize: 12, color: AppColors.muted),
          ),
          if (result == 0)
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: Text(
                'Lưu với 0g sẽ tự chuyển cuộn sang trạng thái "Hết nhựa".',
                style: TextStyle(fontSize: 12, color: AppColors.warning),
              ),
            ),
        ],
      ),
    );
  }
}

class _NumberField extends StatefulWidget {
  const _NumberField({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final double? value;
  final ValueChanged<double?> onChanged;

  @override
  State<_NumberField> createState() => _NumberFieldState();
}

class _NumberFieldState extends State<_NumberField> {
  late final TextEditingController _controller =
      TextEditingController(text: widget.value?.round().toString() ?? '');

  @override
  void didUpdateWidget(_NumberField oldWidget) {
    super.didUpdateWidget(oldWidget);
    final incoming = widget.value?.round().toString() ?? '';
    // Chỉ ghi đè khi giá trị đến từ bên ngoài (bấm "Lấy số từ cân"),
    // tránh nhảy con trỏ trong lúc người dùng đang gõ.
    if (incoming != _controller.text && !_focus.hasFocus) {
      _controller.text = incoming;
    }
  }

  final FocusNode _focus = FocusNode();

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _controller,
      focusNode: _focus,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
      decoration: InputDecoration(labelText: widget.label, suffixText: 'g'),
      onChanged: (text) => widget.onChanged(double.tryParse(text)),
    );
  }
}
