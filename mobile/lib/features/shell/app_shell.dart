import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/scan/scan_mode.dart';
import '../../core/scan/scan_router.dart';
import '../../core/theme/app_theme.dart';

/// Khung điều hướng chính.
///
/// Bố cục **2 - 1 - 2**: hai mục trái, nút quét ở giữa, hai mục phải. Bốn mục cho
/// bốn khu vực hay dùng nhất; "Sản xuất" chuyển vào menu Tất cả vì nó là màn tra
/// cứu theo đợt, không phải chỗ ra vào liên tục như kho nhựa hay máy in.
///
/// Nút quét **nằm trong thanh**, chỉ nhô lên [_scanRise]dp — không dùng
/// `FloatingActionButton` + notch nữa. Cách cũ khiến nút (96dp) rộng hơn khe chừa
/// (72dp) nên đè mất icon hai bên; giờ mọi kích thước tính từ hằng số nên không
/// thể lệch lại.
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  /// Đường kính nút quét — to hơn icon tab để nổi bật, nhưng vẫn vừa trong thanh.
  static const _scanSize = 60.0;

  /// Phần nhô lên khỏi mép trên thanh.
  static const _scanRise = 10.0;

  /// Khe chừa giữa thanh cho nút quét (kèm 8dp thở mỗi bên).
  static const _scanGap = _scanSize + 16;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scanMode = ref.watch(scanModeProvider);
    // Thanh dưới phải né vạch gesture (Android) / home indicator (iPhone).
    final bottomInset = MediaQuery.viewPaddingOf(context).bottom;

    return Scaffold(
      body: Column(
        children: [
          if (scanMode != null) _ScanModeBar(mode: scanMode),
          Expanded(child: navigationShell),
        ],
      ),
      bottomNavigationBar: SizedBox(
        // Chừa thêm _scanRise ở trên để phần nhô của nút không bị cắt.
        height: _scanRise + AppSize.navBar + bottomInset,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              height: AppSize.navBar + bottomInset,
              child: Material(
                color: AppColors.surface,
                surfaceTintColor: Colors.transparent,
                child: Container(
                  padding: EdgeInsets.only(bottom: bottomInset),
                  decoration: const BoxDecoration(
                    border: Border(top: BorderSide(color: AppColors.border)),
                  ),
                  child: Row(
                    children: [
                      _NavItem(
                        icon: Icons.dashboard_outlined,
                        activeIcon: Icons.dashboard_rounded,
                        label: 'Tổng quan',
                        index: 0,
                        shell: navigationShell,
                      ),
                      _NavItem(
                        icon: Icons.inventory_2_outlined,
                        activeIcon: Icons.inventory_2_rounded,
                        label: 'Cuộn nhựa',
                        index: 1,
                        shell: navigationShell,
                      ),
                      const SizedBox(width: _scanGap),
                      _NavItem(
                        icon: Icons.print_outlined,
                        activeIcon: Icons.print_rounded,
                        label: 'Máy in',
                        index: 2,
                        shell: navigationShell,
                      ),
                      _NavItem(
                        icon: Icons.apps_outlined,
                        activeIcon: Icons.apps_rounded,
                        label: 'Tất cả',
                        index: 3,
                        shell: navigationShell,
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Center(child: _ScanButton(size: _scanSize)),
            ),
          ],
        ),
      ),
    );
  }
}

class _ScanButton extends ConsumerWidget {
  const _ScanButton({required this.size});

  final double size;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Tooltip(
      message: 'Quét mã QR / barcode',
      child: Material(
        color: AppColors.indigo,
        shape: const CircleBorder(),
        elevation: 4,
        shadowColor: AppColors.indigo.withValues(alpha: 0.6),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: () => openGlobalScanner(context, ref),
          child: SizedBox(
            width: size,
            height: size,
            child: const Icon(
              Icons.qr_code_scanner_rounded,
              size: AppSize.iconLg,
              color: Colors.white,
            ),
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.index,
    required this.shell,
  });

  final IconData icon;

  /// Tab đang chọn dùng icon đặc, tab thường dùng icon nét — trạng thái không chỉ
  /// dựa vào màu (yêu cầu "color is not the only indicator").
  final IconData activeIcon;
  final String label;
  final int index;
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) {
    final selected = shell.currentIndex == index;
    final color = selected ? AppColors.indigoLight : AppColors.muted;

    return Expanded(
      child: Semantics(
        selected: selected,
        button: true,
        label: label,
        child: InkWell(
          onTap: () =>
              shell.goBranch(index, initialLocation: index == shell.currentIndex),
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(
            // Vùng chạm tối thiểu 48dp (Android) / 44pt (iOS).
            height: AppSize.touchTarget,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(selected ? activeIcon : icon, size: AppSize.iconMd, color: color),
                const SizedBox(height: 2),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: AppSize.textNav,
                    height: 1.1,
                    color: color,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Dải nhắc khi đang bật chế độ gán/tháo cuộn hàng loạt — luôn hiện để người dùng
/// không quên mình đang ở trong một "mode" (bẫy UX của bản web).
class _ScanModeBar extends ConsumerWidget {
  const _ScanModeBar({required this.mode});

  final ScanMode mode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Material(
      color: AppColors.indigo,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 6, 6, 6),
          child: Row(
            children: [
              const Icon(Icons.bolt_rounded, size: AppSize.iconSm, color: Colors.white),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  mode.description,
                  style: const TextStyle(
                    fontSize: AppSize.textCaption,
                    height: 1.3,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              // Nút thoát phải đủ lớn để bấm bằng ngón cái khi tay đang bận.
              TextButton(
                style: TextButton.styleFrom(
                  foregroundColor: Colors.white,
                  minimumSize: const Size(64, AppSize.touchTarget),
                  backgroundColor: Colors.white.withValues(alpha: 0.18),
                ),
                onPressed: () => ref.read(scanModeProvider.notifier).clear(),
                child: const Text('Thoát'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
