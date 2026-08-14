import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/printer.dart';
import '../../data/providers.dart';
import '../../data/repositories/label_repository.dart';

class QrCommand {
  const QrCommand({
    required this.code,
    required this.name,
    required this.desc,
    required this.scope,
  });

  final String code;
  final String name;
  final String desc;

  /// Nơi mã có tác dụng — app hay bản web (một số lệnh chỉ để điều khiển web
  /// bằng súng quét HID, in ra dán cạnh máy tính).
  final QrScope scope;
}

enum QrScope {
  app('Dùng trong app', AppColors.success),
  web('Dùng trên web', AppColors.info);

  const QrScope(this.label, this.color);
  final String label;
  final Color color;
}

/// Danh sách QR lệnh — giữ đúng mã của bản web (`qr-commands-modal.tsx`) để một
/// tờ lệnh in ra dùng được cho cả web lẫn app.
const _commands = <String, List<QrCommand>>{
  'Kiểm kho & cân': [
    QrCommand(
      code: 'CMD-INV-RESET',
      name: 'Làm mới kiểm kho',
      desc: 'Kết thúc phiên hiện tại, bắt đầu đếm lại từ đầu',
      scope: QrScope.app,
    ),
    QrCommand(
      code: 'CMD-INV-TOGGLE-ALL',
      name: 'Phạm vi kiểm kho',
      desc: 'Bật/tắt hiển thị mọi trạng thái cuộn (không chỉ đang dùng)',
      scope: QrScope.app,
    ),
    QrCommand(
      code: 'CMD-WEIGHT-TAB',
      name: 'Chuyển ô nhập cân',
      desc: 'Đổi giữa ô cân cả cuộn và ô khối lượng vỏ',
      scope: QrScope.web,
    ),
    QrCommand(
      code: 'CMD-WEIGHT-DONE',
      name: 'Hoàn tất cân',
      desc: 'Lưu khối lượng cuộn đang cân rồi đóng',
      scope: QrScope.web,
    ),
  ],
  'Chuyển tab (bản web)': [
    QrCommand(
      code: 'CMD-TAB-SPOOLS',
      name: 'Tab Cuộn nhựa',
      desc: 'Mở danh sách cuộn nhựa',
      scope: QrScope.web,
    ),
    QrCommand(
      code: 'CMD-TAB-FILAMENTS',
      name: 'Tab Theo màu',
      desc: 'Mở tổng hợp theo màu sắc',
      scope: QrScope.web,
    ),
    QrCommand(
      code: 'CMD-TAB-LOCATIONS',
      name: 'Tab Kho chứa',
      desc: 'Mở quản lý vị trí kho',
      scope: QrScope.web,
    ),
    QrCommand(
      code: 'CMD-TAB-PRINTERS',
      name: 'Tab Máy in',
      desc: 'Mở quản lý máy in 3D',
      scope: QrScope.web,
    ),
    QrCommand(
      code: 'CMD-TAB-PRINTQR',
      name: 'Tab In lại QR',
      desc: 'Mở tab in lại mã QR',
      scope: QrScope.web,
    ),
    QrCommand(
      code: 'CMD-TAB-CREATEJOB',
      name: 'Tab Tạo lệnh in',
      desc: 'Mở tab tạo lệnh in 3D',
      scope: QrScope.web,
    ),
    QrCommand(
      code: 'CMD-TAB-INVENTORY',
      name: 'Tab Kiểm kho',
      desc: 'Mở chế độ kiểm kho',
      scope: QrScope.web,
    ),
  ],
  'Hệ thống (bản web)': [
    QrCommand(
      code: 'CMD-REFRESH',
      name: 'Làm mới dữ liệu',
      desc: 'Tải lại toàn bộ dữ liệu từ máy chủ',
      scope: QrScope.web,
    ),
    QrCommand(
      code: 'CMD-CLOSE-MODAL',
      name: 'Đóng cửa sổ',
      desc: 'Đóng mọi popup đang mở',
      scope: QrScope.web,
    ),
  ],
};

/// Bảng QR lệnh + QR slot AMS.
///
/// Hai công dụng: (1) xem QR to trên màn hình để quét bằng thiết bị khác, (2) in ra
/// giấy dán cạnh máy in / bàn cân để thao tác không cần chạm màn hình.
class QrCommandsScreen extends ConsumerWidget {
  const QrCommandsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final printers = ref.watch(printersProvider).valueOrNull ?? const [];

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('QR lệnh'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Lệnh thao tác'),
              Tab(text: 'Slot AMS'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [
                const SectionCard(
                  child: Row(
                    children: [
                      Icon(Icons.info_outline_rounded,
                          color: AppColors.muted, size: 20),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Chạm vào mã để xem QR to. Nút in gửi tem QR tới máy in nhãn '
                          'của xưởng để dán tại chỗ làm.',
                          style: TextStyle(
                            fontSize: 12.5,
                            color: AppColors.muted,
                            height: 1.4,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                for (final entry in _commands.entries) ...[
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Text(
                      entry.key.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 12.5,
                        letterSpacing: 0.8,
                        fontWeight: FontWeight.w700,
                        color: AppColors.muted,
                      ),
                    ),
                  ),
                  for (final command in entry.value)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _CommandTile(command: command),
                    ),
                  const SizedBox(height: 10),
                ],
              ],
            ),
            _AmsSlotTab(printers: printers),
          ],
        ),
      ),
    );
  }
}

class _CommandTile extends ConsumerWidget {
  const _CommandTile({required this.command});

  final QrCommand command;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SectionCard(
      onTap: () => showQrPreview(context, command.code, command.name),
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
            ),
            child: QrImageView(
              data: command.code,
              size: 52,
              padding: EdgeInsets.zero,
              backgroundColor: Colors.white,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        command.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                    const SizedBox(width: 6),
                    StatusChip(
                      label: command.scope.label,
                      color: command.scope.color,
                      dense: true,
                    ),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  command.desc,
                  maxLines: 2,
                  style: const TextStyle(
                    fontSize: 12.5,
                    color: AppColors.muted,
                    height: 1.3,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  command.code,
                  style: const TextStyle(
                    fontSize: 12,
                    fontFamily: 'monospace',
                    color: AppColors.indigoLight,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'In tem QR lệnh này',
            onPressed: () async {
              try {
                await ref.read(labelRepositoryProvider).printQrLabel(
                      qrCode: command.code,
                      line1: 'LENH',
                      line2: 'QR LENH',
                      line3: command.name,
                    );
                if (context.mounted) showToast(context, 'Đã gửi lệnh in.');
              } catch (error) {
                if (context.mounted) showToast(context, '$error', isError: true);
              }
            },
            icon: const Icon(Icons.print_rounded, size: 20),
          ),
        ],
      ),
    );
  }
}

/// QR slot AMS `PRT-xx-L1..4` — quét mã này rồi quét cuộn nhựa là gán được cuộn
/// vào đúng khay, không cần mở menu.
class _AmsSlotTab extends ConsumerWidget {
  const _AmsSlotTab({required this.printers});

  final List<Printer> printers;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (printers.isEmpty) {
      return const EmptyView(
        message: 'Chưa có máy in nào.\nThêm máy in ở bản web.',
        icon: Icons.print_disabled_rounded,
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        const SectionCard(
          child: Row(
            children: [
              Icon(Icons.lightbulb_outline_rounded,
                  color: AppColors.warning, size: 20),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  'In các mã này dán lên từng khay AMS. Quét mã khay → quét cuộn nhựa '
                  'là cuộn được gán vào đúng Line.',
                  style: TextStyle(
                    fontSize: 12.5,
                    color: AppColors.muted,
                    height: 1.4,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        for (final printer in printers) ...[
          Text(
            printer.name,
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
          ),
          Text(
            printer.id,
            style: const TextStyle(
              fontSize: 12.5,
              fontFamily: 'monospace',
              color: AppColors.muted,
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              for (var slot = 1; slot <= 4; slot++) ...[
                Expanded(
                  child: _SlotCard(printerId: printer.id, slot: slot),
                ),
                if (slot < 4) const SizedBox(width: 8),
              ],
            ],
          ),
          const SizedBox(height: 20),
        ],
      ],
    );
  }
}

class _SlotCard extends ConsumerWidget {
  const _SlotCard({required this.printerId, required this.slot});

  final String printerId;
  final int slot;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final code = '$printerId-L$slot';

    return SectionCard(
      padding: const EdgeInsets.all(8),
      onTap: () => showQrPreview(context, code, 'Line $slot'),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(6),
            ),
            child: QrImageView(
              data: code,
              size: 46,
              padding: EdgeInsets.zero,
              backgroundColor: Colors.white,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Line $slot',
            style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          SizedBox(
            // Nút in phải đạt vùng chạm tối thiểu; trước đây chỉ cao 28dp.
            height: AppSize.touchTarget,
            width: AppSize.touchTarget,
            child: IconButton(
              padding: EdgeInsets.zero,
              tooltip: 'In tem slot (2 trang)',
              onPressed: () async {
                try {
                  // Layout riêng của backend: trang 1 QR to, trang 2 số slot khổng lồ.
                  await ref.read(labelRepositoryProvider).printPrinterSlotLabel(
                        printerId: printerId,
                        slotNumber: slot,
                      );
                  if (context.mounted) showToast(context, 'Đã gửi lệnh in Line $slot.');
                } catch (error) {
                  if (context.mounted) showToast(context, '$error', isError: true);
                }
              },
              icon: const Icon(Icons.print_rounded, size: 17),
            ),
          ),
        ],
      ),
    );
  }
}

/// Xem QR phóng to — để thiết bị khác quét trực tiếp từ màn hình.
Future<void> showQrPreview(BuildContext context, String data, String title) {
  return showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
            ),
            child: QrImageView(
              data: data,
              size: 220,
              padding: EdgeInsets.zero,
              backgroundColor: Colors.white,
            ),
          ),
          const SizedBox(height: 14),
          SelectableText(
            data,
            style: const TextStyle(
              fontFamily: 'monospace',
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
      actions: [
        TextButton.icon(
          onPressed: () {
            Clipboard.setData(ClipboardData(text: data));
            showToast(context, 'Đã sao chép mã.');
          },
          icon: const Icon(Icons.copy_rounded, size: 18),
          label: const Text('Sao chép'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Đóng'),
        ),
      ],
    ),
  );
}
