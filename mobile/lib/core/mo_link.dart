import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'widgets/common.dart';

/// Mở link bằng app ngoài (app Facebook nếu máy có, không thì trình duyệt).
Future<void> moLinkNgoai(BuildContext context, String url) async {
  final uri = Uri.tryParse(url);
  var duoc = false;
  if (uri != null) {
    try {
      duoc = await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      duoc = false;
    }
  }
  if (!duoc && context.mounted) {
    showToast(context, 'Không mở được link này.', isError: true);
  }
}
