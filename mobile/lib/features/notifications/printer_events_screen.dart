import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format/formatters.dart';
import '../../core/routes.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/printer_event.dart';
import '../../data/providers.dart';

/// Nhật ký mọi hoạt động của máy in, mới nhất lên đầu.
///
/// Cần có màn này chứ không chỉ dựa vào thông báo đẩy: thông báo trôi mất khi vuốt đi, máy hết pin
/// thì không nhận được, mà lúc truy nguyên "tối qua máy hỏng lúc mấy giờ" thì đây là chỗ duy nhất
/// còn dữ liệu.
class PrinterEventsScreen extends ConsumerStatefulWidget {
  const PrinterEventsScreen({super.key, this.printerId});

  /// Lọc theo một máy (mở từ màn chi tiết máy in). Null = tất cả máy.
  final String? printerId;

  @override
  ConsumerState<PrinterEventsScreen> createState() => _PrinterEventsScreenState();
}

class _PrinterEventsScreenState extends ConsumerState<PrinterEventsScreen> {
  /// Chỉ hiện sự cố — lúc đang chữa máy thì không muốn lướt qua hàng chục dòng "bắt đầu in".
  bool _chiSuCo = false;

  @override
  Widget build(BuildContext context) {
    final suKien = ref.watch(printerEventsProvider(widget.printerId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Hoạt động máy in'),
        actions: [
          IconButton(
            tooltip: _chiSuCo ? 'Đang lọc: chỉ sự cố' : 'Lọc: chỉ sự cố',
            onPressed: () => setState(() => _chiSuCo = !_chiSuCo),
            icon: Icon(
              _chiSuCo ? Icons.filter_alt_rounded : Icons.filter_alt_outlined,
              color: _chiSuCo ? AppColors.warning : null,
            ),
          ),
        ],
      ),
      body: AsyncView(
        value: suKien,
        onRetry: () => ref.invalidate(printerEventsProvider(widget.printerId)),
        builder: (data) {
          final hienThi = _chiSuCo
              ? data.where((e) => e.mucDo != MucDoSuKien.tin).toList()
              : data;

          if (hienThi.isEmpty) {
            return EmptyView(
              message: _chiSuCo
                  ? 'Không có sự cố nào. Máy chạy êm.'
                  : 'Chưa ghi được hoạt động nào.\nMáy in phải được ghép cloud (Home Assistant / Moonraker) thì máy chủ mới theo dõi được.',
              icon: Icons.notifications_none_rounded,
            );
          }

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(printerEventsProvider(widget.printerId)),
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, AppSize.listBottomInset),
              itemCount: hienThi.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, index) => _EventCard(event: hienThi[index]),
            ),
          );
        },
      ),
    );
  }
}

class _EventCard extends StatelessWidget {
  const _EventCard({required this.event});

  final PrinterEvent event;

  Color get _mau => switch (event.mucDo) {
        MucDoSuKien.loi => AppColors.danger,
        MucDoSuKien.canhBao => AppColors.warning,
        MucDoSuKien.tin => AppColors.muted,
      };

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => context.push(Routes.printerDetail(event.printerId)),
      child: SectionCard(
        borderColor: event.mucDo == MucDoSuKien.tin ? null : _mau.withValues(alpha: 0.5),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(event.icon, style: const TextStyle(fontSize: 18)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    event.tieuDe,
                    style: TextStyle(fontWeight: FontWeight.w600, color: _mau),
                  ),
                ),
                Text(
                  Fmt.dateTime(event.createdAt),
                  style: const TextStyle(fontSize: 12, color: AppColors.muted),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(event.noiDung, style: const TextStyle(fontSize: 13, height: 1.35)),
          ],
        ),
      ),
    );
  }
}
