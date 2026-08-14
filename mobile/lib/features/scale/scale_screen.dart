import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/scale/scale_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';

/// Trạm cân toàn màn hình — bản di động của trang `/scale`.
///
/// Ẩn thanh hệ thống để số cân chiếm trọn màn hình khi dựng máy cạnh bàn cân.
/// (Muốn chống khóa màn hình thì thêm gói `wakelock_plus` — chưa đưa vào để giữ
/// danh sách dependency tối thiểu.)
class ScaleScreen extends ConsumerStatefulWidget {
  const ScaleScreen({super.key});

  @override
  ConsumerState<ScaleScreen> createState() => _ScaleScreenState();
}

class _ScaleScreenState extends ConsumerState<ScaleScreen> {
  @override
  void initState() {
    super.initState();
    // Số cân phải luôn nhìn thấy, không để máy tự khóa.
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  }

  @override
  void dispose() {
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scale = ref.watch(scaleProvider);
    final color = scale.isConnected ? AppColors.success : AppColors.danger;

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: const Text('Trạm cân'),
        actions: [
          IconButton(
            tooltip: 'Kết nối lại',
            onPressed: () => ref.read(scaleProvider.notifier).reconnect(),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: color.withValues(alpha: 0.5)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      scale.isConnected ? Icons.wifi_rounded : Icons.wifi_off_rounded,
                      color: color,
                      size: 18,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      scale.isConnected
                          ? 'Hệ thống cân đang Online'
                          : 'Mất kết nối với cân!',
                      style: TextStyle(color: color, fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 44, horizontal: 20),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(28),
                  border: Border.all(color: AppColors.border),
                ),
                child: Column(
                  children: [
                    const Text(
                      'TRỌNG LƯỢNG HIỆN TẠI',
                      style: TextStyle(
                        letterSpacing: 2,
                        fontSize: 13,
                        color: AppColors.muted,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 20),
                    FittedBox(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic,
                        children: [
                          Text(
                            scale.isConnected ? '${scale.weight.round()}' : '---',
                            style: TextStyle(
                              fontSize: 110,
                              height: 1,
                              fontWeight: FontWeight.w800,
                              color: scale.isConnected
                                  ? AppColors.success
                                  : AppColors.muted,
                              fontFeatures: const [FontFeature.tabularFigures()],
                            ),
                          ),
                          const SizedBox(width: 12),
                          const Text(
                            'g',
                            style: TextStyle(
                              fontSize: 44,
                              color: AppColors.muted,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () async {
                        await ref.read(scaleProvider.notifier).calibrateTo(0);
                        if (context.mounted) {
                          showToast(context, 'Đã đưa cân về 0 (tare).');
                        }
                      },
                      icon: const Icon(Icons.exposure_zero_rounded),
                      label: const Text('Tare (về 0)'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _calibrate(context, scale),
                      icon: const Icon(Icons.tune_rounded),
                      label: const Text('Hiệu chuẩn'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              Text(
                'Số thô ${scale.rawWeight.round()}g · bù trừ ${scale.offset.round()}g\n'
                '${scale.lastError ?? 'Dữ liệu truyền qua MQTT — realtime'}',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 12, color: AppColors.muted, height: 1.5),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Nhập khối lượng thật của vật đang đặt trên cân để tính lại offset.
  Future<void> _calibrate(BuildContext context, ScaleState scale) async {
    final controller = TextEditingController(text: '${scale.weight.round()}');

    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Hiệu chuẩn cân'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Cân đang đọc ${scale.rawWeight.round()}g. Nhập khối lượng đúng của vật '
              'đang đặt trên cân, app sẽ tự tính lượng bù trừ.',
              style: const TextStyle(fontSize: 13, height: 1.4),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(labelText: 'Khối lượng đúng', suffixText: 'g'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Hủy'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Lưu'),
          ),
        ],
      ),
    );

    if (ok != true) return;
    final target = double.tryParse(controller.text.trim());
    if (target == null) return;

    await ref.read(scaleProvider.notifier).calibrateTo(target);
    if (context.mounted) showToast(context, 'Đã lưu hiệu chuẩn cân.');
  }
}
