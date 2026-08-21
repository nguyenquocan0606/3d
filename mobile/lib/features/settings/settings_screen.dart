import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/config/app_settings.dart';
import '../../core/format/formatters.dart';
import '../../core/notify/push_service.dart';
import '../../core/routes.dart';
import '../../core/scale/scale_service.dart';
import '../../core/scan/pda_scan.dart';
import '../../core/scan/scan_input_mode.dart';
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
  late final _tenThietBi = TextEditingController(text: _initial.tenThietBi);

  bool _testing = false;
  String? _testResult;
  bool _testOk = false;

  @override
  void dispose() {
    _baseUrl.dispose();
    _mqttUrl.dispose();
    _scaleTopic.dispose();
    _apiKey.dispose();
    _tenThietBi.dispose();
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

    // Tên máy nằm trong danh sách thiết bị nhận thông báo trên web — đổi tên phải báo lại máy chủ,
    // không thì web vẫn hiện tên cũ.
    await ref.read(appSettingsProvider.notifier).setTenThietBi(_tenThietBi.text);
    await ref.read(pushServiceProvider).dongBoDangKy();

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
    // Nuốt mã quét ngay tại màn này: đang thử máy mà mã lọt xuống bộ điều phối
    // chung thì cứ mỗi lần bóp cò lại bật lên một bảng kết quả che mất ô thử.
    return PdaScanScope(
      showFeedback: false,
      onCode: (_) async => null,
      child: _buildScreen(context),
    );
  }

  Widget _buildScreen(BuildContext context) {
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
          const Text('Chế độ quét', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          const Text(
            'Cấu hình riêng của máy này, không ảnh hưởng máy khác trong xưởng.',
            style: TextStyle(fontSize: 12.5, color: AppColors.muted),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: SegmentedButton<ScanInputMode>(
              segments: [
                for (final mode in ScanInputMode.values)
                  ButtonSegment<ScanInputMode>(
                    value: mode,
                    label: Text(mode.label),
                    icon: Icon(
                      mode == ScanInputMode.camera
                          ? Icons.photo_camera_rounded
                          : Icons.qr_code_scanner_rounded,
                    ),
                  ),
              ],
              selected: {settings.scanInputMode},
              showSelectedIcon: false,
              onSelectionChanged: (value) => ref
                  .read(appSettingsProvider.notifier)
                  .setScanInputMode(value.first),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            settings.scanInputMode.description,
            style: const TextStyle(
              fontSize: 12.5,
              color: AppColors.muted,
              height: 1.5,
            ),
          ),
          if (settings.scanInputMode == ScanInputMode.pda) ...[
            const SizedBox(height: 12),
            const _PdaScanTestCard(),
          ],
          const SizedBox(height: 26),
          const Text('Thông báo máy in', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          SectionCard(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            child: SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: settings.thongBaoBat,
              title: const Text('Nhận thông báo hoạt động máy in'),
              subtitle: Text(
                settings.thongBaoBat
                    ? 'Máy chủ sẽ đẩy thông báo khi máy in bắt đầu, in xong, báo lỗi hoặc mất kết nối.'
                    : 'Đã tắt — máy này không nhận thông báo nào.',
                style: const TextStyle(fontSize: 12),
              ),
              onChanged: (bat) async {
                await ref.read(appSettingsProvider.notifier).setThongBaoBat(bat);
                await ref.read(pushServiceProvider).dongBoDangKy();
              },
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _tenThietBi,
            enabled: settings.thongBaoBat,
            decoration: const InputDecoration(
              labelText: 'Tên máy này',
              helperText: 'Hiện trên web để biết máy nào đang nhận (VD: PDA kho 1)',
              prefixIcon: Icon(Icons.smartphone_rounded),
            ),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: () => context.push(Routes.printerEvents),
            icon: const Icon(Icons.history_rounded),
            label: const Text('Xem nhật ký hoạt động máy in'),
          ),
          const SizedBox(height: 26),
          const Text('Trạm cân MQTT', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          SectionCard(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            child: SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: settings.scaleEnabled,
              title: const Text('Dùng trạm cân'),
              subtitle: Text(
                settings.scaleEnabled
                    ? 'Đang giữ kết nối tới broker để nhận số cân.'
                    : 'Đã tắt — máy không nối broker, đỡ tốn pin. Máy PDA ngoài '
                        'kho nên để tắt.',
                style: const TextStyle(fontSize: 12),
              ),
              onChanged: (bat) async {
                await ref.read(appSettingsProvider.notifier).setScaleEnabled(bat);
                // Bật thì nối ngay, tắt thì `_connect` tự đóng socket.
                await ref.read(scaleProvider.notifier).reconnect();
              },
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _mqttUrl,
            enabled: settings.scaleEnabled,
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
            enabled: settings.scaleEnabled,
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
                    // Tắt cân là trạng thái do người dùng chọn, không phải hỏng —
                    // để chấm đỏ ở đây thì lần nào mở Cài đặt cũng tưởng có lỗi.
                    color: !settings.scaleEnabled
                        ? AppColors.muted
                        : scale.isConnected
                            ? AppColors.success
                            : AppColors.danger,
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
                  onPressed: settings.scaleEnabled
                      ? () => ref.read(scaleProvider.notifier).reconnect()
                      : null,
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
          const SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Lưu ý vận hành',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                SizedBox(height: 8),
                Text(
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

/// Ô thử đầu đọc của máy PDA.
///
/// Lắp PDA mới hay hỏng nhất ở chỗ **quên bật hậu tố Enter**: ký tự vẫn về app
/// nhưng không bao giờ chốt thành mã, nhìn bên ngoài y như máy chết. Dòng "đang
/// nhận" tách bạch hai trường hợp đó ra ngay.
class _PdaScanTestCard extends StatelessWidget {
  const _PdaScanTestCard();

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<PdaScanProbe>(
      valueListenable: pdaScanProbe,
      builder: (context, probe, _) {
        final code = probe.lastCode;

        return SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Icon(Icons.bolt_rounded, size: 18, color: AppColors.indigoLight),
                  SizedBox(width: 8),
                  Text('Thử máy quét', style: TextStyle(fontWeight: FontWeight.w700)),
                ],
              ),
              const SizedBox(height: 6),
              const Text(
                'Bóp cò ngay tại màn này. Mã hiện ra bên dưới là máy đã chạy đúng.',
                style: TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.4),
              ),
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.surfaceAlt,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: (code == null ? AppColors.border : AppColors.success)
                        .withValues(alpha: 0.6),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      code ?? 'Chưa nhận được mã nào',
                      style: TextStyle(
                        fontSize: 16,
                        fontFamily: code == null ? null : 'monospace',
                        fontWeight: FontWeight.w700,
                        color: code == null ? AppColors.muted : AppColors.success,
                      ),
                    ),
                    if (code != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        'Lúc ${Fmt.dateTime(probe.lastAt)}',
                        style: const TextStyle(fontSize: 12, color: AppColors.muted),
                      ),
                    ],
                  ],
                ),
              ),
              if (probe.pending.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  'Đang nhận: ${probe.pending}',
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontFamily: 'monospace',
                    color: AppColors.warning,
                  ),
                ),
              ],
              const SizedBox(height: 10),
              const Text(
                'Không ra mã mà dòng "đang nhận" vẫn chạy chữ: máy chưa bật hậu tố '
                'Enter. Vào Scanner Settings của PDA, đặt Suffix = Enter (hoặc Tab) '
                'và để đầu đọc ở chế độ bàn phím (HID / Keyboard Wedge).',
                style: TextStyle(fontSize: 12, color: AppColors.muted, height: 1.5),
              ),
            ],
          ),
        );
      },
    );
  }
}
