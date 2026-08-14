import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/config/app_settings.dart';
import '../../core/scale/scale_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/providers.dart';
import '../../data/repositories/store_repository.dart';

/// Cấu hình kết nối.
///
/// Mặc định trỏ máy chủ xưởng ([AppSettings.serverAddress]). Vẫn cho sửa vì khi ra
/// khỏi xưởng phải đi qua VPN/domain — có nút khôi phục để về lại địa chỉ gốc.
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  late final AppSettings _initial = ref.read(appSettingsProvider);
  late final _baseUrl = TextEditingController(text: _initial.baseUrl);
  late final _mqttUrl = TextEditingController(text: _initial.mqttUrl);
  late final _scaleTopic = TextEditingController(text: _initial.scaleTopic);
  late final _apiKey = TextEditingController(text: _initial.apiKey);

  bool _testing = false;
  String? _testResult;
  bool _testOk = false;

  @override
  void dispose() {
    _baseUrl.dispose();
    _mqttUrl.dispose();
    _scaleTopic.dispose();
    _apiKey.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    await ref.read(appSettingsProvider.notifier).update(
          baseUrl: _baseUrl.text,
          mqttUrl: _mqttUrl.text,
          scaleTopic: _scaleTopic.text,
          apiKey: _apiKey.text,
        );
    // Đổi địa chỉ thì mọi dữ liệu đang cache đều thuộc máy chủ cũ.
    ref.invalidate(filamentsProvider);
    ref.invalidate(locationsProvider);
    ref.invalidate(printersProvider);
    ref.invalidate(ordersProvider);
    ref.invalidate(storeProvider);
    await ref.read(scaleProvider.notifier).reconnect();

    if (mounted) showToast(context, 'Đã lưu cấu hình.');
  }

  /// Kiểm tra bằng endpoint nhẹ nhất có sẵn (`/api/dashboard/stats`) —
  /// backend chưa có `/api/health`.
  Future<void> _testConnection() async {
    setState(() {
      _testing = true;
      _testResult = null;
    });
    try {
      await ref.read(appSettingsProvider.notifier).update(baseUrl: _baseUrl.text);
      final stats = await ref.read(apiClientProvider).get<int>(
            '/api/dashboard/stats',
            (data) => (data is Map ? data['totalSpools'] : 0) as int,
          );
      setState(() {
        _testOk = true;
        _testResult = 'Kết nối tốt — máy chủ đang quản lý $stats cuộn nhựa.';
      });
    } catch (error) {
      setState(() {
        _testOk = false;
        _testResult = '$error';
      });
    } finally {
      if (mounted) setState(() => _testing = false);
    }
  }

  Future<void> _checkMisa() async {
    try {
      final result = await ref.read(storeRepositoryProvider).checkMisaToken();
      if (mounted) showToast(context, result.message, isError: !result.ok);
    } catch (error) {
      if (mounted) showToast(context, '$error', isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(appSettingsProvider);
    final scale = ref.watch(scaleProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Cài đặt')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          const Text('Máy chủ', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          TextField(
            controller: _baseUrl,
            keyboardType: TextInputType.url,
            autocorrect: false,
            decoration: const InputDecoration(
              labelText: 'Địa chỉ máy chủ',
              helperText: 'Mặc định: ${AppSettings.serverAddress}',
              prefixIcon: Icon(Icons.dns_rounded),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _apiKey,
            autocorrect: false,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: 'API key (nếu máy chủ đã bật xác thực)',
              helperText: 'Gửi kèm header X-API-Key',
              prefixIcon: Icon(Icons.key_rounded),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _testing ? null : _testConnection,
                  icon: _testing
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.wifi_tethering_rounded),
                  label: const Text('Kiểm tra'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  onPressed: _save,
                  icon: const Icon(Icons.save_rounded),
                  label: const Text('Lưu'),
                ),
              ),
            ],
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () async {
                await ref.read(appSettingsProvider.notifier).resetServerAddress();
                if (!context.mounted) return;
                setState(() {
                  _baseUrl.text = AppSettings.serverAddress;
                  _mqttUrl.text = '';
                  _testResult = null;
                });
                await ref.read(scaleProvider.notifier).reconnect();
                if (context.mounted) {
                  showToast(context, 'Đã về máy chủ xưởng ${AppSettings.serverAddress}.');
                }
              },
              icon: const Icon(Icons.restore_rounded, size: 18),
              label: const Text('Khôi phục máy chủ xưởng'),
            ),
          ),
          if (_testResult != null) ...[
            const SizedBox(height: 12),
            SectionCard(
              borderColor:
                  (_testOk ? AppColors.success : AppColors.danger).withValues(alpha: 0.4),
              child: Row(
                children: [
                  Icon(
                    _testOk ? Icons.check_circle_rounded : Icons.error_outline_rounded,
                    color: _testOk ? AppColors.success : AppColors.danger,
                  ),
                  const SizedBox(width: 10),
                  Expanded(child: Text(_testResult!, style: const TextStyle(fontSize: 13))),
                ],
              ),
            ),
          ],
          const SizedBox(height: 26),
          const Text('Trạm cân MQTT', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          TextField(
            controller: _mqttUrl,
            keyboardType: TextInputType.url,
            autocorrect: false,
            decoration: InputDecoration(
              labelText: 'Broker WebSocket',
              helperText: 'Để trống sẽ tự dùng ${settings.effectiveMqttUrl}',
              prefixIcon: const Icon(Icons.router_rounded),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _scaleTopic,
            autocorrect: false,
            decoration: const InputDecoration(
              labelText: 'Topic khối lượng',
              prefixIcon: Icon(Icons.topic_rounded),
            ),
          ),
          const SizedBox(height: 12),
          SectionCard(
            child: Row(
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: scale.isConnected ? AppColors.success : AppColors.danger,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    scale.isConnected
                        ? 'Đang nhận số cân (${scale.rawWeight.round()}g thô)'
                        : (scale.lastError ?? 'Chưa kết nối broker'),
                    style: const TextStyle(fontSize: 13),
                  ),
                ),
                TextButton(
                  onPressed: () => ref.read(scaleProvider.notifier).reconnect(),
                  child: const Text('Nối lại'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 26),
          const Text('Tích hợp', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          SectionCard(
            child: Column(
              children: [
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.verified_user_outlined),
                  title: const Text('Kiểm tra token MISA eShop'),
                  subtitle: const Text(
                    'Ping thử API bằng credential đã lưu trên máy chủ',
                    style: TextStyle(fontSize: 12),
                  ),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: _checkMisa,
                ),
                const Divider(height: 8),
                const ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.info_outline_rounded),
                  title: Text('Cập nhật credential MISA'),
                  subtitle: Text(
                    'Token/cookie MISA phải nhập ở bản web (Cài đặt) vì cần copy từ '
                    'trình duyệt.',
                    style: TextStyle(fontSize: 12),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 26),
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Lưu ý vận hành',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                const Text(
                  '• Máy chủ Next.js phải đang chạy thì app mới hoạt động.\n'
                  '• In tem chỉ được khi máy in USB cắm ở máy chủ.\n'
                  '• Ra khỏi xưởng cần VPN (Tailscale/WireGuard) hoặc domain đã mở.',
                  style: TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.6),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
