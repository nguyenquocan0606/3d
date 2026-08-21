import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'core/routes.dart';
import 'features/bulk/bulk_order_detail_screen.dart';
import 'features/bulk/bulk_orders_screen.dart';
import 'features/bulk/create_bulk_order_screen.dart';
import 'features/dashboard/dashboard_screen.dart';
import 'features/eshop/eshop_order_detail_screen.dart';
import 'features/inventory/inventory_screen.dart';
import 'features/jobs/create_job_screen.dart';
import 'features/jobs/print_history_screen.dart';
import 'features/labels/labels_screen.dart';
import 'features/labels/qr_commands_screen.dart';
import 'features/locations/locations_screen.dart';
import 'features/notifications/printer_events_screen.dart';
import 'features/printers/printer_detail_screen.dart';
import 'features/printers/printers_screen.dart';
import 'features/printers/tuong_camera_screen.dart';
import 'features/production/order_check_screen.dart';
import 'features/production/order_detail_screen.dart';
import 'features/production/pei_screen.dart';
import 'features/production/pei_sheet_detail_screen.dart';
import 'features/production/production_screen.dart';
import 'features/scale/scale_screen.dart';
import 'features/settings/settings_screen.dart';
import 'features/shell/app_shell.dart';
import 'features/shell/quick_menu.dart';
import 'features/spools/add_spool_screen.dart';
import 'features/spools/color_detail_screen.dart';
import 'features/spools/spool_detail_screen.dart';
import 'features/spools/spools_screen.dart';
import 'features/store/store_detail_screen.dart';
import 'features/store/store_screen.dart';
import 'features/sync/pending_actions_screen.dart';

final _rootKey = GlobalKey<NavigatorState>();

String _param(GoRouterState state) =>
    Uri.decodeComponent(state.pathParameters['id']!);

/// Cấu trúc điều hướng:
///  - 4 nhánh tab (StatefulShellRoute) giữ stack riêng, chuyển tab không mất vị trí.
///    Thanh dưới xếp 2 - 1 - 2 quanh nút quét nên chỉ nhận đúng 4 mục.
///  - Toàn bộ màn chi tiết và màn phụ nằm ở cấp gốc để `context.push` từ bất kỳ đâu
///    (đặc biệt là từ luồng quét mã) đều mở được mà không phụ thuộc tab đang đứng.
final appRouter = GoRouter(
  navigatorKey: _rootKey,
  initialLocation: Routes.dashboard,
  routes: [
    StatefulShellRoute.indexedStack(
      builder: (context, state, navigationShell) =>
          AppShell(navigationShell: navigationShell),
      branches: [
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: Routes.dashboard,
              builder: (context, state) => const DashboardScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: Routes.spools,
              builder: (context, state) =>
                  SpoolsScreen(initialQuery: state.uri.queryParameters['q']),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: Routes.printers,
              builder: (context, state) => const PrintersScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: Routes.more,
              builder: (context, state) => const QuickMenuScreen(),
            ),
          ],
        ),
      ],
    ),

    // ── Màn phụ (mở từ menu Tất cả hoặc từ luồng quét) ──
    GoRoute(
      path: Routes.production,
      builder: (context, state) => const ProductionScreen(),
    ),
    GoRoute(
      path: Routes.locations,
      builder: (context, state) => const LocationsScreen(),
    ),
    GoRoute(
      path: Routes.inventory,
      builder: (context, state) => const InventoryScreen(),
    ),
    GoRoute(
      path: Routes.store,
      builder: (context, state) => const StoreScreen(),
    ),
    GoRoute(
      path: Routes.scale,
      builder: (context, state) => const ScaleScreen(),
    ),
    GoRoute(
      path: Routes.labels,
      builder: (context, state) => const LabelsScreen(),
    ),
    GoRoute(
      path: Routes.cameras,
      builder: (context, state) => const TuongCameraScreen(),
    ),
    GoRoute(
      path: Routes.qrCommands,
      builder: (context, state) => const QrCommandsScreen(),
    ),
    GoRoute(
      path: Routes.addSpool,
      builder: (context, state) => const AddSpoolScreen(),
    ),
    GoRoute(
      path: Routes.createJob,
      builder: (context, state) => const CreateJobScreen(),
    ),
    GoRoute(
      path: Routes.printHistory,
      builder: (context, state) => const PrintHistoryScreen(),
    ),
    GoRoute(
      path: Routes.pei,
      builder: (context, state) => const PeiScreen(),
    ),
    GoRoute(
      path: Routes.orderCheck,
      builder: (context, state) => const OrderCheckScreen(),
    ),
    GoRoute(
      path: Routes.bulkOrders,
      builder: (context, state) => const BulkOrdersScreen(),
    ),
    GoRoute(
      path: Routes.createBulkOrder,
      builder: (context, state) => const CreateBulkOrderScreen(),
    ),
    GoRoute(
      path: Routes.printerEvents,
      builder: (context, state) =>
          PrinterEventsScreen(printerId: state.uri.queryParameters['printerId']),
    ),
    GoRoute(
      path: Routes.settings,
      builder: (context, state) => const SettingsScreen(),
    ),
    GoRoute(
      path: Routes.pendingSync,
      builder: (context, state) => const PendingActionsScreen(),
    ),

    // ── Màn chi tiết ──
    GoRoute(
      path: '/spool/:id',
      builder: (context, state) => SpoolDetailScreen(spoolId: _param(state)),
    ),
    GoRoute(
      path: '/printer/:id',
      builder: (context, state) => PrinterDetailScreen(printerId: _param(state)),
    ),
    GoRoute(
      path: '/location/:id',
      builder: (context, state) => LocationDetailScreen(locationId: _param(state)),
    ),
    GoRoute(
      path: '/order/:id',
      builder: (context, state) => OrderDetailScreen(orderId: _param(state)),
    ),
    GoRoute(
      path: '/product/:id',
      builder: (context, state) => StoreDetailScreen(productId: _param(state)),
    ),
    GoRoute(
      path: '/color/:id',
      builder: (context, state) => ColorDetailScreen(colorName: _param(state)),
    ),
    GoRoute(
      path: '/pei-sheet/:id',
      builder: (context, state) => PeiSheetDetailScreen(sheetId: _param(state)),
    ),
    GoRoute(
      path: '/bulk-order/:id',
      builder: (context, state) => BulkOrderDetailScreen(orderId: _param(state)),
    ),
    GoRoute(
      path: '/eshop-order/:id',
      builder: (context, state) => EshopOrderDetailScreen(orderId: _param(state)),
    ),
  ],
);
