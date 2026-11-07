import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/format/formatters.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/bao_gia.dart';
import '../../data/repositories/bao_gia_repository.dart';

final _tuMayTinhProvider = FutureProvider.autoDispose<List<LanTinhGia>>(
  (ref) => ref.read(baoGiaRepositoryProvider).tuMayTinh(),
);

/// Chọn các lần tính giá ở trang "Báo giá in 3D" (máy tính giá STL/3MF trên web) để thêm thành hạng mục.
/// Trả danh sách dòng mới, null nếu đóng.
Future<List<DongBaoGia>?> chonTuMayTinh(BuildContext context) {
  return showModalBottomSheet<List<DongBaoGia>>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: AppColors.surfaceAlt,
    builder: (_) => const FractionallySizedBox(heightFactor: 0.85, child: _ChonTuMayTinh()),
  );
}

class _ChonTuMayTinh extends ConsumerStatefulWidget {
  const _ChonTuMayTinh();

  @override
  ConsumerState<_ChonTuMayTinh> createState() => _ChonTuMayTinhState();
}

class _ChonTuMayTinhState extends ConsumerState<_ChonTuMayTinh> {
  final Set<String> _chon = {};

  @override
  Widget build(BuildContext context) {
    final ds = ref.watch(_tuMayTinhProvider);
    return Column(
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 16, 16, 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Lấy từ máy tính giá 3D', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
              SizedBox(height: 2),
              Text(
                'Các lần tính giá file STL/3MF gần đây trên web — chọn để thêm thành hạng mục.',
                style: TextStyle(color: AppColors.muted, fontSize: 13),
              ),
            ],
          ),
        ),
        Expanded(
          child: AsyncView(
            value: ds,
            onRetry: () => ref.invalidate(_tuMayTinhProvider),
            builder: (data) {
              if (data.isEmpty) {
                return const EmptyView(
                  icon: Icons.calculate_rounded,
                  message: 'Chưa có lần tính giá nào. Tải file STL/3MF lên trang Báo giá in 3D trên web trước.',
                );
              }
              return ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                itemCount: data.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (context, i) {
                  final q = data[i];
                  final da = _chon.contains(q.id);
                  return SectionCard(
                    padding: const EdgeInsets.fromLTRB(6, 10, 14, 10),
                    borderColor: da ? AppColors.indigoLight : null,
                    onTap: () => setState(() => da ? _chon.remove(q.id) : _chon.add(q.id)),
                    child: Row(
                      children: [
                        Checkbox(
                          value: da,
                          onChanged: (_) => setState(() => da ? _chon.remove(q.id) : _chon.add(q.id)),
                        ),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(q.fileName,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontWeight: FontWeight.w700)),
                              Text(
                                [
                                  if (q.nhua != null) q.nhua!,
                                  '${q.soLuong} cái',
                                  '${q.weightG.round()} g',
                                  '${soGon(jsRound(q.timeMinutes / 6) / 10)} giờ',
                                  q.cheDo == 'slice' ? 'slice thật' : 'ước lượng',
                                  Fmt.date(q.createdAt),
                                ].join(' · '),
                                style: const TextStyle(fontSize: 12, color: AppColors.muted),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(dinhDangVnd(q.giaBanLe), style: const TextStyle(fontWeight: FontWeight.w800)),
                      ],
                    ),
                  );
                },
              );
            },
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(AppSize.touchTarget)),
              onPressed: _chon.isEmpty
                  ? null
                  : () {
                      const uuid = Uuid();
                      final data = ds.valueOrNull ?? const <LanTinhGia>[];
                      Navigator.pop(
                        context,
                        [for (final q in data.where((q) => _chon.contains(q.id))) q.thanhDong(uuid.v4())],
                      );
                    },
              child: Text(_chon.isEmpty ? 'Chọn lần tính giá' : 'Thêm ${_chon.length} hạng mục'),
            ),
          ),
        ),
      ],
    );
  }
}
