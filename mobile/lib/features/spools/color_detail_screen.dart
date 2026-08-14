import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/format/formatters.dart';
import '../../core/scan/code_normalizer.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/filament.dart';
import '../../data/providers.dart';
import '../../data/repositories/label_repository.dart';
import 'spools_screen.dart';

/// Nội dung QR của tem mã màu — khớp cách bản web sinh
/// (`CLR-` + tên màu viết hoa, dấu cách thành gạch nối).
String colorTagCode(String colorName) =>
    'CLR-${colorName.toUpperCase().replaceAll(RegExp(r'\s+'), '-')}';

/// Thông tin một màu nhựa: tổng tồn, các cuộn thuộc màu đó, tem QR để in.
///
/// Mở khi quét tem `CLR-` dán trên kệ màu. Tem in ra đã bị bỏ dấu tiếng Việt nên
/// việc khớp ngược về đúng màu do [CodeNormalizer] lo (xem [stripDiacritics]).
class ColorDetailScreen extends ConsumerWidget {
  const ColorDetailScreen({super.key, required this.colorName});

  final String colorName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final spools = ref.watch(spoolsProvider).valueOrNull ?? const <Spool>[];
    final matching = spools
        .where((s) => stripDiacritics(s.filamentColorName) == stripDiacritics(colorName))
        .toList()
      ..sort((a, b) => a.remainingWeightG.compareTo(b.remainingWeightG));

    final hex = matching.isEmpty ? null : matching.first.filamentColorHex;
    final total = matching.fold<double>(0, (sum, s) => sum + s.remainingWeightG);
    final active = matching.where((s) => s.status == SpoolStatus.active).length;

    return Scaffold(
      appBar: AppBar(
        title: Text('Màu $colorName'),
        actions: [
          IconButton(
            tooltip: 'In tem QR mã màu',
            onPressed: () => _printTag(context, ref),
            icon: const Icon(Icons.print_rounded),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          SectionCard(
            child: Column(
              children: [
                Row(
                  children: [
                    ColorDot(hex: hex, size: 44),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            colorName,
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          Text(
                            '${matching.length} cuộn · $active đang dùng',
                            style: const TextStyle(color: AppColors.muted),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                InfoRow(label: 'Tổng nhựa còn', value: Fmt.grams(total)),
                InfoRow(
                  label: 'Loại vật liệu',
                  value: matching.isEmpty
                      ? '—'
                      : matching.map((s) => s.filamentType).toSet().join(', '),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          if (matching.isEmpty)
            EmptyView(
              message: 'Không có cuộn nhựa nào màu "$colorName".\n'
                  'Có thể tem này in cho màu đã bị xóa.',
              icon: Icons.palette_outlined,
            )
          else ...[
            const Text(
              'Cuộn nhựa màu này',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
            ),
            const SizedBox(height: 10),
            for (final spool in matching)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: SpoolTile(spool: spool),
              ),
          ],
          const SizedBox(height: 12),
          Center(
            child: SectionCard(
              padding: const EdgeInsets.all(18),
              child: Column(
                children: [
                  QrImageView(
                    data: colorTagCode(colorName),
                    size: 150,
                    backgroundColor: Colors.white,
                    padding: const EdgeInsets.all(10),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    colorTagCode(colorName),
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _printTag(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(labelRepositoryProvider).printQrLabel(
            qrCode: colorTagCode(colorName),
            line1: colorTagCode(colorName),
            line2: 'MÃ MÀU NHỰA',
            line3: colorName,
          );
      if (context.mounted) showToast(context, 'Đã gửi lệnh in tem màu.');
    } catch (error) {
      if (context.mounted) showToast(context, '$error', isError: true);
    }
  }
}
