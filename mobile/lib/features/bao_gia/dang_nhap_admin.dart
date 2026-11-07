import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/phien_admin.dart';
import '../../core/config/app_settings.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';

/// Ô đăng nhập admin — báo giá giữ thông tin khách nên API đòi đúng tài khoản admin của bản web.
class DangNhapAdminCard extends ConsumerStatefulWidget {
  const DangNhapAdminCard({super.key});

  @override
  ConsumerState<DangNhapAdminCard> createState() => _DangNhapAdminCardState();
}

class _DangNhapAdminCardState extends ConsumerState<DangNhapAdminCard> {
  final _ten = TextEditingController();
  final _matKhau = TextEditingController();
  bool _dang = false;
  bool _anMatKhau = true;
  String? _loi;

  @override
  void dispose() {
    _ten.dispose();
    _matKhau.dispose();
    super.dispose();
  }

  Future<void> _dangNhap() async {
    if (_ten.text.trim().isEmpty || _matKhau.text.isEmpty) {
      setState(() => _loi = 'Nhập tên đăng nhập và mật khẩu');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _dang = true;
      _loi = null;
    });
    try {
      final phien = await ref.read(phienAdminProvider.notifier).dangNhap(_ten.text, _matKhau.text);
      if (mounted) showToast(context, 'Xin chào ${phien.tenHien}');
    } catch (e) {
      if (mounted) setState(() => _loi = '$e');
    } finally {
      if (mounted) setState(() => _dang = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final mayChu = ref.watch(appSettingsProvider).baseUrl;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 40),
      children: [
        const Icon(Icons.lock_person_rounded, size: 48, color: AppColors.indigoLight),
        const SizedBox(height: 14),
        const Text(
          'Đăng nhập admin để dùng báo giá',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 6),
        const Text(
          'Phiếu báo giá có thông tin khách nên chỉ tài khoản admin của bản web mới xem và soạn được. '
          'Đăng nhập một lần, máy nhớ 30 ngày.',
          textAlign: TextAlign.center,
          style: TextStyle(color: AppColors.muted, height: 1.4),
        ),
        const SizedBox(height: 22),
        SectionCard(
          child: AutofillGroup(
            child: Column(
              children: [
                TextField(
                  controller: _ten,
                  autofillHints: const [AutofillHints.username],
                  textInputAction: TextInputAction.next,
                  autocorrect: false,
                  decoration: const InputDecoration(
                    labelText: 'Tên đăng nhập',
                    prefixIcon: Icon(Icons.person_rounded),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _matKhau,
                  obscureText: _anMatKhau,
                  autofillHints: const [AutofillHints.password],
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _dangNhap(),
                  decoration: InputDecoration(
                    labelText: 'Mật khẩu',
                    prefixIcon: const Icon(Icons.key_rounded),
                    suffixIcon: IconButton(
                      tooltip: _anMatKhau ? 'Hiện mật khẩu' : 'Ẩn mật khẩu',
                      onPressed: () => setState(() => _anMatKhau = !_anMatKhau),
                      icon: Icon(_anMatKhau ? Icons.visibility_rounded : Icons.visibility_off_rounded),
                    ),
                  ),
                ),
                if (_loi != null) ...[
                  const SizedBox(height: 12),
                  Text(_loi!, style: const TextStyle(color: AppColors.danger, height: 1.35)),
                ],
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: _dang ? null : _dangNhap,
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(AppSize.touchTarget)),
                  icon: _dang
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.login_rounded),
                  label: const Text('Đăng nhập'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Text(
          'Máy chủ: $mayChu',
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
        ),
      ],
    );
  }
}
