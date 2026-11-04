import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config/app_settings.dart';
import '../../core/routes.dart';
import '../../core/scale/scale_service.dart';
import '../../core/scan/scan_router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';

/// Một mục trong menu nhanh.
class QuickAction {
  const QuickAction({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    this.route,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final String? route;
  final void Function(BuildContext context, WidgetRef ref)? onTap;
}

class QuickActionGroup {
  const QuickActionGroup(this.title, this.actions);

  final String title;
  final List<QuickAction> actions;
}

/// Toàn bộ tính năng của app, gom nhóm theo nghiệp vụ.
///
/// Nguyên tắc phân vai với bản web: **web quản trị (tạo/sửa dữ liệu gốc), app vận
/// hành** — mọi thứ dính tới mã, QR và quét đều có ở đây. Ngoại lệ duy nhất được
/// phép tạo mới trên app là **cuộn nhựa**, vì đó là việc làm ngay tại kệ hàng.
const quickActionGroups = <QuickActionGroup>[
  QuickActionGroup('Quét & mã', [
    QuickAction(
      icon: Icons.qr_code_scanner_rounded,
      title: 'Quét mã',
      subtitle: 'Cuộn nhựa, kho, máy in, tem đơn, hàng hóa',
      color: AppColors.indigo,
    ),
    QuickAction(
      icon: Icons.local_offer_rounded,
      title: 'In tem nhãn',
      subtitle: '4 mẫu tem, in tiếng Việt có dấu',
      color: AppColors.indigo,
      route: Routes.labels,
    ),
    QuickAction(
      icon: Icons.terminal_rounded,
      title: 'QR lệnh',
      subtitle: 'Mã điều khiển nhanh + QR slot AMS',
      color: AppColors.indigo,
      route: Routes.qrCommands,
    ),
  ]),
  QuickActionGroup('Nhựa & kho', [
    QuickAction(
      icon: Icons.inventory_2_rounded,
      title: 'Cuộn nhựa',
      subtitle: 'Danh sách, tìm kiếm, lọc theo trạng thái',
      color: AppColors.success,
      route: Routes.spools,
    ),
    QuickAction(
      icon: Icons.add_box_rounded,
      title: 'Thêm cuộn nhựa',
      subtitle: 'Tạo hàng loạt + tự in tem',
      color: AppColors.success,
      route: Routes.addSpool,
    ),
    QuickAction(
      icon: Icons.warehouse_rounded,
      title: 'Kho lưu trữ',
      subtitle: 'Quét đưa cuộn vào / lấy ra khỏi kho',
      color: AppColors.success,
      route: Routes.locations,
    ),
    QuickAction(
      icon: Icons.checklist_rounded,
      title: 'Kiểm kho',
      subtitle: 'Phiên kiểm kê, quét đối chiếu từng cuộn',
      color: AppColors.success,
      route: Routes.inventory,
    ),
    QuickAction(
      icon: Icons.monitor_weight_rounded,
      title: 'Trạm cân',
      subtitle: 'Số cân realtime, tare, hiệu chuẩn',
      color: AppColors.success,
      route: Routes.scale,
    ),
  ]),
  QuickActionGroup('Máy in & lệnh in', [
    QuickAction(
      icon: Icons.print_rounded,
      title: 'Máy in',
      subtitle: 'Trạng thái realtime, điều khiển, khay AMS',
      color: AppColors.warning,
      route: Routes.printers,
    ),
    QuickAction(
      icon: Icons.videocam_rounded,
      title: 'Camera máy in',
      subtitle: 'Xem tất cả camera cùng lúc',
      color: AppColors.warning,
      route: Routes.cameras,
    ),
    QuickAction(
      icon: Icons.play_circle_rounded,
      title: 'Tạo lệnh in',
      subtitle: 'Trừ nhựa, đưa cuộn lên máy, hẹn giờ',
      color: AppColors.warning,
      route: Routes.createJob,
    ),
    QuickAction(
      icon: Icons.history_rounded,
      title: 'Lịch sử lệnh in',
      subtitle: 'Task đang chạy, nhựa đã dùng',
      color: AppColors.warning,
      route: Routes.printHistory,
    ),
  ]),
  QuickActionGroup('Sản xuất', [
    QuickAction(
      icon: Icons.receipt_long_rounded,
      title: 'Đơn hàng',
      subtitle: 'Xem đơn, tem miếng in, in lại tem',
      color: AppColors.info,
      route: Routes.production,
    ),
    QuickAction(
      icon: Icons.inventory_rounded,
      title: 'Đơn SLL',
      subtitle: 'Sản xuất số lượng lớn, quẹt mã từng lượt PEI',
      color: AppColors.info,
      route: Routes.bulkOrders,
    ),
    QuickAction(
      icon: Icons.fact_check_rounded,
      title: 'Kiểm hàng đóng gói',
      subtitle: 'Quét tem đối chiếu đủ hàng trong thùng',
      color: AppColors.info,
      route: Routes.orderCheck,
    ),
    QuickAction(
      icon: Icons.grid_view_rounded,
      title: 'Mâm in PEI',
      subtitle: 'Gom miếng in vào mâm, gắn mâm lên máy',
      color: AppColors.info,
      route: Routes.pei,
    ),
  ]),
  QuickActionGroup('Cửa hàng & hệ thống', [
    QuickAction(
      icon: Icons.person_search_rounded,
      title: 'Khách Facebook',
      subtitle: 'Bài cần in 3D, bình luận, nhắn tin, nhóm',
      color: AppColors.success,
      route: Routes.khachFacebook,
    ),
    QuickAction(
      icon: Icons.storefront_rounded,
      title: 'Hàng hóa cửa hàng',
      subtitle: 'Tra cứu, nhập/xuất kho, giá và combo',
      color: AppColors.indigoLight,
      route: Routes.store,
    ),
    QuickAction(
      icon: Icons.notifications_active_rounded,
      title: 'Hoạt động máy in',
      subtitle: 'Nhật ký lỗi, in xong, mất kết nối',
      color: AppColors.warning,
      route: Routes.printerEvents,
    ),
    QuickAction(
      icon: Icons.cloud_sync_rounded,
      title: 'Chưa đồng bộ',
      subtitle: 'Thao tác đang chờ gửi hoặc bị từ chối',
      color: AppColors.info,
      route: Routes.pendingSync,
    ),
    QuickAction(
      icon: Icons.settings_rounded,
      title: 'Cài đặt',
      subtitle: 'Máy chủ, MQTT, kiểm tra kết nối',
      color: AppColors.muted,
      route: Routes.settings,
    ),
  ]),
];

/// Màn "Thêm" — danh sách đầy đủ mọi tính năng của app.
class QuickMenuScreen extends ConsumerWidget {
  const QuickMenuScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(appSettingsProvider);
    final scale = ref.watch(scaleProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Tất cả tính năng'),
        actions: [
          IconButton(
            tooltip: 'Cài đặt',
            onPressed: () => context.push(Routes.settings),
            icon: const Icon(Icons.settings_rounded),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, AppSize.listBottomInset),
        children: [
          for (final group in quickActionGroups) ...[
            Padding(
              padding: const EdgeInsets.only(bottom: 10, top: 6),
              child: Text(
                group.title.toUpperCase(),
                style: const TextStyle(
                  fontSize: 12.5,
                  letterSpacing: 0.8,
                  fontWeight: FontWeight.w700,
                  color: AppColors.muted,
                ),
              ),
            ),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 1.15,
              children: [
                for (final action in group.actions)
                  QuickActionCard(action: action),
              ],
            ),
            const SizedBox(height: 18),
          ],
          const Divider(height: 32),
          Text(
            'Máy chủ: ${settings.baseUrl}\n'
            'Trạm cân: ${scale.isConnected ? 'đang nhận số' : 'chưa kết nối'}',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.6),
          ),
        ],
      ),
    );
  }
}

class QuickActionCard extends ConsumerWidget {
  const QuickActionCard({super.key, required this.action, this.dense = false});

  final QuickAction action;
  final bool dense;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SectionCard(
      padding: EdgeInsets.all(dense ? 10 : 13),
      onTap: () {
        if (action.onTap != null) {
          action.onTap!(context, ref);
        } else if (action.route != null) {
          context.push(action.route!);
        } else {
          // Mục không có route là nút quét — mở camera ngay.
          openGlobalScanner(context, ref);
        }
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(9),
            decoration: BoxDecoration(
              color: action.color.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(action.icon, color: action.color, size: 20),
          ),
          const Spacer(),
          Text(
            action.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 3),
          Text(
            action.subtitle,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12, color: AppColors.muted, height: 1.3),
          ),
        ],
      ),
    );
  }
}

/// Menu nhanh dạng bottom sheet — mở được từ bất kỳ màn nào bằng nút ☰ trên AppBar,
/// để không phải quay về tab "Thêm" mỗi lần muốn nhảy sang tính năng khác.
Future<void> showQuickMenu(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: AppColors.surfaceAlt,
    builder: (context) => DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, controller) => Column(
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
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 14, 16, 6),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Menu nhanh',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
              ),
            ),
          ),
          Expanded(
            child: ListView(
              controller: controller,
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
              children: [
                for (final group in quickActionGroups) ...[
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8, top: 6),
                    child: Text(
                      group.title.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 12,
                        letterSpacing: 0.8,
                        fontWeight: FontWeight.w700,
                        color: AppColors.muted,
                      ),
                    ),
                  ),
                  GridView.count(
                    crossAxisCount: 3,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: 8,
                    crossAxisSpacing: 8,
                    childAspectRatio: 0.95,
                    children: [
                      for (final action in group.actions)
                        Builder(
                          builder: (cardContext) => QuickActionCard(
                            action: action,
                            dense: true,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                ],
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

/// Nút mở menu nhanh, gắn vào AppBar của các màn hình chính.
class QuickMenuButton extends StatelessWidget {
  const QuickMenuButton({super.key});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: 'Menu nhanh',
      onPressed: () => showQuickMenu(context),
      icon: const Icon(Icons.apps_rounded),
    );
  }
}
