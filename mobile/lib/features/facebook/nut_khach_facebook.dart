import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/routes.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/providers.dart';

/// Lối tắt ở Tổng quan sang Khách Facebook, kèm số khách mới chưa xử lý — mở app ra là biết ngay
/// hôm nay có ai cần in không. Tải số lỗi thì nút vẫn bấm được, chỉ thiếu con số.
class NutKhachFacebook extends ConsumerStatefulWidget {
  const NutKhachFacebook({super.key});

  @override
  ConsumerState<NutKhachFacebook> createState() => _NutKhachFacebookState();
}

class _NutKhachFacebookState extends ConsumerState<NutKhachFacebook> {
  Timer? _nhip;

  @override
  void initState() {
    super.initState();
    _nhip = Timer.periodic(const Duration(seconds: 60), (_) {
      if (WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
        ref.invalidate(demKhachFacebookProvider);
      }
    });
  }

  @override
  void dispose() {
    _nhip?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dl = ref.watch(demKhachFacebookProvider).valueOrNull;
    final soKhach = dl?.demKhach ?? 0;
    final coKhach = soKhach > 0;
    final bayGio = DateTime.now();
    final phuDe = dl == null
        ? 'Người đang cần thuê in 3D, lọc từ Facebook'
        : dl.agent.isEmpty
            ? 'Chưa có agent nào chạy'
            : '${dl.agent.where((a) => a.conSong(bayGio)).length}/${dl.agent.length} agent đang chạy'
                '${coKhach ? '' : ' · chưa có khách mới'}';

    return SectionCard(
      onTap: () => context.push(Routes.khachFacebook),
      padding: const EdgeInsets.all(12),
      borderColor: coKhach ? AppColors.success.withValues(alpha: 0.5) : null,
      child: Row(
        children: [
          Icon(
            Icons.person_search_rounded,
            size: AppSize.iconLg,
            color: coKhach ? AppColors.success : AppColors.muted,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Khách Facebook', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(
                  phuDe,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: AppSize.textCaption, color: AppColors.muted),
                ),
              ],
            ),
          ),
          if (coKhach) ...[
            const SizedBox(width: 8),
            StatusChip(label: '$soKhach khách mới', color: AppColors.success, dense: true),
          ],
          const Icon(Icons.chevron_right_rounded, color: AppColors.muted),
        ],
      ),
    );
  }
}
