import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/printer.dart';

/// Dải tình trạng của một máy in: đang lấy dữ liệu từ đâu, vì sao dừng, và **tất cả** lỗi HMS.
///
/// Liệt kê hết chứ không rút gọn còn một dòng: máy có thể ôm mấy lỗi cùng lúc (firmware AMS lệch
/// + nhắc tra dầu trục), gộp lại thì người sửa máy mất manh mối. Mấy lỗi này KHÔNG bắn thông báo —
/// chúng dai dẳng và phần lớn không cản việc in — nên đây là chỗ duy nhất thấy được.
class TinhTrangMay extends StatelessWidget {
  const TinhTrangMay({super.key, required this.live, this.rutGon = false});

  final PrinterLiveStatus live;

  /// Ở thẻ danh sách thì chỉ hiện chip nguồn + lý do dừng, không trải hết lỗi HMS.
  final bool rutGon;

  @override
  Widget build(BuildContext context) {
    final hms = live.loiHms;
    final coGiDeNoi = live.lyDoDung != null ||
        live.maLoiIn != null ||
        hms.isNotEmpty ||
        live.nguon == NguonDuLieu.ha;
    if (!coGiDeNoi) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            if (live.nguon == NguonDuLieu.mqtt)
              const StatusChip(
                label: 'MQTT trực tiếp',
                color: AppColors.success,
                icon: Icons.bolt_rounded,
                dense: true,
              ),
            if (live.nguon == NguonDuLieu.ha)
              StatusChip(
                // Máy vốn chỉ có HA là bình thường; máy có MQTT mà đang chạy HA mới đáng để ý.
                label: live.mqttRoi ? 'MQTT rớt — đang dùng HA' : 'Qua Home Assistant',
                color: live.mqttRoi ? AppColors.warning : AppColors.muted,
                icon: Icons.dns_rounded,
                dense: true,
              ),
            if (rutGon && hms.isNotEmpty)
              StatusChip(
                label: '${hms.length} lỗi máy báo',
                color: hms.any((l) => l.nang) ? AppColors.warning : AppColors.muted,
                icon: Icons.warning_amber_rounded,
                dense: true,
              ),
          ],
        ),
        if (live.lyDoDung != null) ...[
          const SizedBox(height: 8),
          _Hop(
            mau: live.dungDoSuCo ? AppColors.danger : AppColors.muted,
            child: Text(
              'Dừng vì: ${live.lyDoDung}'
              '${live.maLoiIn != null ? ' (${live.maLoiIn})' : ''}',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: live.dungDoSuCo ? AppColors.danger : AppColors.muted,
              ),
            ),
          ),
        ],
        if (!rutGon && hms.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(
            '${hms.length} LỖI MÁY BÁO',
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.1,
              color: AppColors.muted,
            ),
          ),
          for (final l in hms) ...[
            const SizedBox(height: 6),
            _Hop(
              mau: l.nang ? AppColors.warning : AppColors.muted,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        // Cho chọn để copy: không có url_launcher nên người dùng tự tra mã trên wiki.
                        child: SelectableText(
                          l.ma,
                          style: TextStyle(
                            fontSize: 12,
                            fontFamily: 'monospace',
                            fontWeight: FontWeight.w700,
                            color: l.nang ? AppColors.warning : AppColors.muted,
                          ),
                        ),
                      ),
                      Text(
                        l.mucDo,
                        style: const TextStyle(fontSize: 10, color: AppColors.muted),
                      ),
                    ],
                  ),
                  if (l.moTa != null) ...[
                    const SizedBox(height: 3),
                    Text(
                      l.moTa!,
                      style: const TextStyle(fontSize: 11, height: 1.3, color: AppColors.muted),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ],
      ],
    );
  }
}

class _Hop extends StatelessWidget {
  const _Hop({required this.mau, required this.child});

  final Color mau;
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: mau.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: mau.withValues(alpha: 0.30)),
        ),
        child: child,
      );
}
