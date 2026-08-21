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
///
/// Có state chỉ để **giữ nguyên mảng byte giữa các lần dựng lại**. Bản cũ giải mã
/// ngay trong `build`, và cái đắt không phải là base64 — mà là `Image.memory` so
/// ảnh theo *danh tính* của mảng byte: mỗi lần dựng ra một `Uint8List` mới là bộ
/// nhớ đệm ảnh của Flutter trượt sạch, phải giải nén lại PNG/JPEG từ đầu. Nhân
/// với vài trăm dòng trong danh sách hàng hóa thì máy yếu không kịp thở.
class StoreThumbnail extends StatefulWidget {
  const StoreThumbnail({super.key, required this.dataUrl, this.size = 48});

  final String? dataUrl;
  final double size;

  @override
  State<StoreThumbnail> createState() => _StoreThumbnailState();
}

class _StoreThumbnailState extends State<StoreThumbnail> {
  Uint8List? _bytes;

  @override
  void initState() {
    super.initState();
    _bytes = decodeDataUrl(widget.dataUrl);
  }

  @override
  void didUpdateWidget(StoreThumbnail oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Chỉ giải mã lại khi đúng là ảnh khác — dòng trong danh sách hay bị dựng lại
    // với cùng dữ liệu (đổi bộ lọc, cuộn qua cuộn lại).
    if (oldWidget.dataUrl != widget.dataUrl) {
      _bytes = decodeDataUrl(widget.dataUrl);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bytes = _bytes;
    final size = widget.size;

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
          : Image.memory(
              bytes,
              fit: BoxFit.cover,
              gaplessPlayback: true,
              // Giải nén thẳng về đúng cỡ hiển thị. Server đã nén sẵn 96×96 nên
              // thường không đổi gì, nhưng hàng cũ nhập trước lúc có thumbnail có
              // thể là ảnh gốc vài nghìn pixel — không có dòng này thì máy phải
              // dựng bitmap khổng lồ rồi thu nhỏ lại chỉ để vẽ ô 48dp.
              cacheWidth: (size * MediaQuery.devicePixelRatioOf(context)).round(),
            ),
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
