import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/app_settings.dart';
import '../../core/format/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/printer.dart';
import '../../data/providers.dart';
import '../../data/repositories/label_repository.dart';
import '../../data/repositories/printer_repository.dart';
import '../spools/spools_screen.dart';
import 'cam_may_in.dart';
import 'printer_form_sheet.dart';
import 'printers_screen.dart';
import 'tinh_trang_may.dart';

/// Chi tiết + điều khiển từ xa 1 máy in.
///
/// Chỉ máy đã ghép cloud mới có phần điều khiển; máy local chỉ xem thông tin và
/// cuộn nhựa đang gắn (giống bản web).
class PrinterDetailScreen extends ConsumerWidget {
  const PrinterDetailScreen({super.key, required this.printerId});

  final String printerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final printers = ref.watch(printersProvider).valueOrNull ?? const [];
    Printer? printer;
    for (final item in printers) {
      if (item.id == printerId) printer = item;
    }

    if (printer == null) {
      return Scaffold(
        appBar: AppBar(title: Text(printerId)),
        body: const EmptyView(message: 'Không tìm thấy máy in này.'),
      );
    }

    final live = ref.watch(livePrinterStatusProvider).valueOrNull?[printerId];

    return Scaffold(
      appBar: AppBar(
        title: Text(printer.name),
        actions: [
          IconButton(
            tooltip: 'Sửa máy in',
            onPressed: () => moFormMayIn(context, may: printer!),
            icon: const Icon(Icons.edit_rounded),
          ),
          IconButton(
            tooltip: 'In tem QR máy in',
            onPressed: () => _printLabel(context, ref, printer!),
            icon: const Icon(Icons.print_rounded),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          _StatusCard(
            printer: printer,
            live: live,
            baseUrl: ref.watch(appSettingsProvider).baseUrl,
          ),
          if (printer.cloudPrinterId != null) ...[
            const SizedBox(height: 16),
            SectionCard(
              child: CamMayIn(
                baseUrl: ref.watch(appSettingsProvider).baseUrl,
                may: printer.cloudPrinterId,
                tenMay: printer.name,
              ),
            ),
          ],
          if (printer.isCloudLinked) ...[
            const SizedBox(height: 16),
            _ControlPanel(printer: printer, live: live),
            const SizedBox(height: 16),
            _AmsPanel(printer: printer, live: live),
          ] else ...[
            const SizedBox(height: 16),
            const SectionCard(
              child: Row(
                children: [
                  Icon(Icons.info_outline_rounded, color: AppColors.muted),
                  SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Máy in này chưa ghép tài khoản cloud nên không điều khiển được '
                      'từ xa. Ghép máy ở bản web (Máy in → Kết nối cloud).',
                      style: TextStyle(fontSize: 13, color: AppColors.muted, height: 1.4),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 20),
          const Text(
            'Cuộn nhựa đang gắn',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
          ),
          const SizedBox(height: 10),
          if (printer.spools.isEmpty)
            const EmptyView(
              message: 'Chưa gắn cuộn nhựa nào.',
              icon: Icons.link_off_rounded,
            )
          else
            for (final spool in printer.spools)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: SpoolTile(spool: spool, showPlace: false),
              ),
        ],
      ),
    );
  }

  Future<void> _printLabel(
    BuildContext context,
    WidgetRef ref,
    Printer printer,
  ) async {
    try {
      await ref.read(labelRepositoryProvider).printQrLabel(
            qrCode: printer.id,
            line1: printer.id,
            line2: 'MÁY IN 3D',
            line3: printer.name,
          );
      if (context.mounted) showToast(context, 'Đã gửi lệnh in tem máy in.');
    } catch (error) {
      if (context.mounted) showToast(context, '$error', isError: true);
    }
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.printer, this.live, required this.baseUrl});

  final Printer printer;
  final PrinterLiveStatus? live;

  /// Cần để ghép URL ảnh preview — backend trả đường dẫn tương đối cho ảnh lấy từ máy in.
  final String baseUrl;

  @override
  Widget build(BuildContext context) {
    final color =
        live == null ? AppColors.muted : colorForLiveState(live!.status);

    return SectionCard(
      borderColor: color.withValues(alpha: 0.35),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              StatusChip(
                label: live?.status.label ?? printer.status.label,
                color: color,
              ),
              const Spacer(),
              Text(
                printer.id,
                style: const TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: AppColors.muted,
                ),
              ),
            ],
          ),
          if (live != null) ...[
            const SizedBox(height: 16),
            if (live!.anhDayDu(baseUrl) != null)
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.network(
                  live!.anhDayDu(baseUrl)!,
                  height: 160,
                  width: double.infinity,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                ),
              ),
            if (live!.status == LiveState.printing) ...[
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(999),
                      child: LinearProgressIndicator(
                        value: live!.progress / 100,
                        minHeight: 8,
                        backgroundColor: AppColors.border,
                        valueColor: const AlwaysStoppedAnimation(AppColors.warning),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    '${live!.progress}%',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 12),
            TinhTrangMay(live: live!),
            const SizedBox(height: 12),
            InfoRow(
              label: 'Đầu phun',
              value: Fmt.temperature(live!.nozzleTemp, live!.nozzleTargetTemp),
            ),
            InfoRow(
              label: 'Bàn nhiệt',
              value: Fmt.temperature(live!.bedTemp, live!.bedTargetTemp),
            ),
            InfoRow(
              label: 'Thời gian còn',
              value: Fmt.durationFromSeconds(live!.remainingTimeSeconds),
            ),
            if (live!.currentLayer != null && live!.totalLayers != null)
              InfoRow(
                label: 'Lớp',
                value: '${live!.currentLayer} / ${live!.totalLayers}',
              ),
            if (live!.fileName != null)
              InfoRow(label: 'Tệp in', value: live!.fileName!),
            InfoRow(label: 'Nguồn dữ liệu', value: live!.nguon.label),
          ] else
            const Padding(
              padding: EdgeInsets.only(top: 12),
              child: Text(
                'Chưa lấy được trạng thái realtime.',
                style: TextStyle(color: AppColors.muted, fontSize: 13),
              ),
            ),
        ],
      ),
    );
  }
}

class _ControlPanel extends ConsumerStatefulWidget {
  const _ControlPanel({required this.printer, this.live});

  final Printer printer;
  final PrinterLiveStatus? live;

  @override
  ConsumerState<_ControlPanel> createState() => _ControlPanelState();
}

class _ControlPanelState extends ConsumerState<_ControlPanel> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action, String message) async {
    setState(() => _busy = true);
    try {
      await action();
      if (mounted) showToast(context, message);
    } catch (error) {
      if (mounted) showToast(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final repo = ref.read(printerRepositoryProvider);
    final id = widget.printer.id;
    final live = widget.live;
    final isPrinting = live?.status == LiveState.printing;
    final lightOn = live?.isChamberLightOn ?? false;

    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Điều khiển', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: _busy
                      ? null
                      : () => _run(
                            () => repo.sendCommand(id, isPrinting ? 'pause' : 'resume'),
                            isPrinting ? 'Đã gửi lệnh tạm dừng.' : 'Đã gửi lệnh tiếp tục.',
                          ),
                  icon: Icon(isPrinting
                      ? Icons.pause_rounded
                      : Icons.play_arrow_rounded),
                  label: Text(isPrinting ? 'Tạm dừng' : 'Tiếp tục'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger),
                  onPressed: _busy
                      ? null
                      : () async {
                          final ok = await confirmAction(
                            context,
                            title: 'Hủy bản in',
                            message: 'Dừng hẳn bản in đang chạy trên '
                                '${widget.printer.name}? Không thể hoàn tác.',
                            confirmLabel: 'Dừng in',
                          );
                          if (!ok) return;
                          await _run(
                            () => repo.sendCommand(id, 'stop'),
                            'Đã gửi lệnh dừng in.',
                          );
                        },
                  icon: const Icon(Icons.stop_rounded),
                  label: const Text('Dừng in'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Đèn buồng in'),
            value: lightOn,
            onChanged: _busy
                ? null
                : (value) => _run(
                      () => repo.setLight(id, value),
                      value ? 'Đã bật đèn.' : 'Đã tắt đèn.',
                    ),
          ),
          const Divider(),
          _TempControl(
            label: 'Nhiệt đầu phun',
            current: live?.nozzleTemp ?? 0,
            target: live?.nozzleTargetTemp ?? 0,
            presets: const [0, 200, 220, 250],
            enabled: !_busy,
            onSet: (value) => _run(
              () => repo.setNozzleTemp(id, value),
              'Đã đặt nhiệt đầu phun $value°C.',
            ),
          ),
          const SizedBox(height: 10),
          _TempControl(
            label: 'Nhiệt bàn',
            current: live?.bedTemp ?? 0,
            target: live?.bedTargetTemp ?? 0,
            presets: const [0, 55, 60, 90],
            enabled: !_busy,
            onSet: (value) => _run(
              () => repo.setBedTemp(id, value),
              'Đã đặt nhiệt bàn $value°C.',
            ),
          ),
          const SizedBox(height: 12),
          const Text('Quạt làm mát', style: TextStyle(fontSize: 13)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            children: [
              for (final speed in [0, 50, 80, 100])
                OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(56, AppSize.touchTarget),
                  ),
                  onPressed: _busy
                      ? null
                      : () => _run(
                            () => repo.setFanSpeed(id, speed),
                            'Đã đặt quạt $speed%.',
                          ),
                  child: Text('$speed%'),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TempControl extends StatelessWidget {
  const _TempControl({
    required this.label,
    required this.current,
    required this.target,
    required this.presets,
    required this.enabled,
    required this.onSet,
  });

  final String label;
  final double current;
  final double target;
  final List<int> presets;
  final bool enabled;
  final ValueChanged<int> onSet;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(label, style: const TextStyle(fontSize: 13)),
            const Spacer(),
            Text(
              Fmt.temperature(current, target),
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          children: [
            for (final preset in presets)
              OutlinedButton(
                style: OutlinedButton.styleFrom(
                    minimumSize: const Size(56, AppSize.touchTarget),
                  ),
                onPressed: enabled ? () => onSet(preset) : null,
                child: Text(preset == 0 ? 'Tắt' : '$preset°'),
              ),
          ],
        ),
      ],
    );
  }
}

/// Khay AMS + nút đẩy thông tin cuộn nhựa lên máy.
class _AmsPanel extends ConsumerStatefulWidget {
  const _AmsPanel({required this.printer, this.live});

  final Printer printer;
  final PrinterLiveStatus? live;

  @override
  ConsumerState<_AmsPanel> createState() => _AmsPanelState();
}

class _AmsPanelState extends ConsumerState<_AmsPanel> {
  bool _busy = false;

  Future<void> _syncAms() async {
    setState(() => _busy = true);
    try {
      // Backend cần đúng shape mà BambuLabProvider đọc: printerSlot + filament.
      final payload = widget.printer.spools
          .where((spool) => spool.printerSlot != null)
          .map((spool) => {
                'printerSlot': spool.printerSlot,
                'filament': {
                  'type': spool.filamentType,
                  'colorHex': spool.filamentColorHex ?? '#FFFFFF',
                },
              })
          .toList();

      if (payload.isEmpty) {
        showToast(
          context,
          'Chưa có cuộn nào được gán slot AMS (Line 1-4).',
          isError: true,
        );
        return;
      }

      await ref.read(printerRepositoryProvider).syncAms(widget.printer.id, payload);
      if (mounted) showToast(context, 'Đã đẩy ${payload.length} cuộn lên AMS.');
    } catch (error) {
      if (mounted) showToast(context, '$error', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final materials = widget.live?.materials ?? const <AmsTray?>[];

    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('Khay AMS', style: TextStyle(fontWeight: FontWeight.w700)),
              const Spacer(),
              TextButton.icon(
                onPressed: _busy ? null : _syncAms,
                icon: const Icon(Icons.sync_rounded, size: 18),
                label: const Text('Đồng bộ'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              for (var index = 0; index < 4; index++) ...[
                Expanded(
                  child: _AmsSlot(
                    slot: index + 1,
                    // Mảng materials giữ nguyên vị trí, null = khay trống.
                    tray: index < materials.length ? materials[index] : null,
                  ),
                ),
                if (index < 3) const SizedBox(width: 8),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _AmsSlot extends StatelessWidget {
  const _AmsSlot({required this.slot, this.tray});

  final int slot;
  final AmsTray? tray;

  @override
  Widget build(BuildContext context) {
    final color = tray == null ? AppColors.border : AppColors.fromHex(tray!.color);

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.6)),
      ),
      child: Column(
        children: [
          Container(
            width: 26,
            height: 26,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white24),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'L$slot',
            style: const TextStyle(fontSize: 12, color: AppColors.muted),
          ),
          Text(
            tray?.name ?? 'Trống',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
