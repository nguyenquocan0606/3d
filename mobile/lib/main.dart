import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/config/app_settings.dart';
import 'core/notify/push_service.dart';
import 'core/routes.dart';
import 'core/scale/scale_service.dart';
import 'core/scan/pda_scan.dart';
import 'data/sync/sync_notify_listener.dart';
import 'data/sync/sync_service.dart';
import 'core/theme/app_theme.dart';
import 'router.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Fmt dùng NumberFormat/DateFormat locale vi_VN nên phải nạp dữ liệu locale trước.
  await initializeDateFormatting('vi_VN');

  final prefs = await SharedPreferences.getInstance();

  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  runApp(
    ProviderScope(
      overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
      child: const Manage3DApp(),
    ),
  );
}

class Manage3DApp extends ConsumerStatefulWidget {
  const Manage3DApp({super.key});

  @override
  ConsumerState<Manage3DApp> createState() => _Manage3DAppState();
}

class _Manage3DAppState extends ConsumerState<Manage3DApp> {
  @override
  void initState() {
    super.initState();

    // Bấm vào thông báo thì mở thẳng nhật ký của đúng máy in đó — người ta bấm là vì muốn xem
    // chuyện gì đang xảy ra, không phải để nhìn màn Tổng quan.
    PushService.onBamThongBao = (duLieu) {
      final printerId = duLieu['printerId'] as String?;
      appRouter.push(
        printerId == null || printerId.isEmpty
            ? Routes.printerEvents
            : Routes.printerEventsOf(printerId),
      );
    };

    // Đăng ký nhận push. Chạy sau frame đầu để không kéo dài màn hình trắng lúc mở app; mọi lỗi
    // (chưa cấu hình Firebase, chưa có mạng) đã được nuốt bên trong.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(pushServiceProvider).khoiDong();
    });
  }

  @override
  Widget build(BuildContext context) {
    // Kết nối MQTT trạm cân ngay từ đầu để widget số cân ở Tổng quan có dữ liệu
    // mà không cần vào màn Cân trước.
    //
    // Phải là `listen` chứ không phải `watch`: trạm cân bắn số liên tục, mà đây
    // là widget gốc nằm trên cả MaterialApp — `watch` thì mỗi lần cân nhúc nhích
    // là dựng lại toàn bộ cây widget của app, ở mọi màn, kể cả khi không ai nhìn
    // số cân. `listen` vẫn giữ provider sống và kết nối chạy, nhưng không rebuild.
    ref.listen(scaleProvider, (_, __) {});

    // Đánh thức worker đồng bộ ngay khi app mở. Bắt buộc chứ không phải tùy chọn:
    // từ nay mọi repository đọc từ CSDL cục bộ, không có worker thì cache rỗng và
    // app trống trơn. `listen` chứ không `watch` — cùng lý do với trạm cân ở trên.
    ref.listen(syncProvider, (_, __) {});

    // Nghe server báo có thay đổi để kéo delta ngay, thay vì đợi hết chu kỳ 60s.
    ref.listen(syncNotifyProvider, (_, __) {});

    // Bọc ngoài cùng để đầu đọc của máy PDA bắn mã vào được ở bất kỳ màn nào.
    return PdaScanListener(
      child: MaterialApp.router(
        title: '3D Manage',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.dark,
        darkTheme: AppTheme.dark,
        themeMode: ThemeMode.dark,
        routerConfig: appRouter,
        locale: const Locale('vi', 'VN'),
        supportedLocales: const [Locale('vi', 'VN'), Locale('en', 'US')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
      ),
    );
  }
}
