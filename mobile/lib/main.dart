import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/config/app_settings.dart';
import 'core/scale/scale_service.dart';
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

class Manage3DApp extends ConsumerWidget {
  const Manage3DApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Kết nối MQTT trạm cân ngay từ đầu để widget số cân ở Tổng quan có dữ liệu
    // mà không cần vào màn Cân trước.
    ref.watch(scaleProvider);

    return MaterialApp.router(
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
    );
  }
}
