import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

/// Giải mã data URL base64 mà backend lưu trong cột `anh` / `anhDaiDien`.
///
/// Trả null nếu chuỗi rỗng hoặc hỏng — ảnh hàng hóa là dữ liệu người dùng nhập
/// nên không thể tin là luôn hợp lệ.
Uint8List? decodeDataUrl(String? dataUrl) {
  if (dataUrl == null || dataUrl.isEmpty) return null;
  final separator = dataUrl.indexOf(',');
  if (separator == -1) return null;
  try {
    return base64Decode(dataUrl.substring(separator + 1));
  } catch (_) {
    return null;
  }
}

/// Ảnh đại diện hàng hóa (thumbnail 96×96 do server nén sẵn bằng sharp).
class StoreThumbnail extends StatelessWidget {
  const StoreThumbnail({super.key, required this.dataUrl, this.size = 48});

  final String? dataUrl;
  final double size;

  @override
  Widget build(BuildContext context) {
    final bytes = decodeDataUrl(dataUrl);

    return Container(
      width: size,
      height: size,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: bytes == null
          ? Icon(Icons.inventory_2_outlined, size: size * 0.45, color: AppColors.muted)
          : Image.memory(bytes, fit: BoxFit.cover, gaplessPlayback: true),
    );
  }
}

/// Xem ảnh gốc toàn màn hình.
class StoreImageViewer extends StatelessWidget {
  const StoreImageViewer({super.key, required this.dataUrl, required this.title});

  final String dataUrl;
  final String title;

  @override
  Widget build(BuildContext context) {
    final bytes = decodeDataUrl(dataUrl);

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(backgroundColor: Colors.black, title: Text(title)),
      body: Center(
        child: bytes == null
            ? const Text('Không đọc được ảnh này.')
            : InteractiveViewer(
                maxScale: 5,
                child: Image.memory(bytes, fit: BoxFit.contain),
              ),
      ),
    );
  }
}
