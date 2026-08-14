import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/app_theme.dart';
import '../../data/models/bulk_order.dart';
import '../../data/models/printer.dart';

/// Chọn máy in chạy đơn SLL, kèm ô khai **số con mỗi mâm riêng của máy đó**.
///
/// Máy khổ bàn khác nhau xếp được số con khác nhau, nên mỗi máy được phép khai
/// riêng; bỏ trống thì dùng số chung của đơn. Thứ tự bấm chọn = thứ tự nhận lượt.
class PrinterPicker extends StatelessWidget {
  const PrinterPicker({
    super.key,
    required this.printers,
    required this.selectedIds,
    required this.limits,
    required this.perSheetHint,
    required this.onToggle,
    required this.onLimit,
  });

  final List<Printer> printers;
  final List<String> selectedIds;

  /// printerId → số con mỗi mâm đã gõ (chuỗi thô để người dùng xóa trắng được).
  final Map<String, String> limits;

  /// Số chung của đơn, hiện làm gợi ý trong ô để trống.
  final String perSheetHint;

  final void Function(String printerId) onToggle;
  final void Function(String printerId, String value) onLimit;

  @override
  Widget build(BuildContext context) {
    if (printers.isEmpty) {
      return const Text(
        'Chưa có máy in nào trong hệ thống.',
        style: TextStyle(fontSize: 12.5, color: AppColors.muted),
      );
    }

    return Column(
      children: [
        for (final printer in printers)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _PrinterTile(
              name: printer.name,
              order: selectedIds.indexOf(printer.id),
              limit: limits[printer.id] ?? '',
              perSheetHint: perSheetHint,
              onTap: () => onToggle(printer.id),
              onLimit: (value) => onLimit(printer.id, value),
            ),
          ),
      ],
    );
  }
}

class _PrinterTile extends StatelessWidget {
  const _PrinterTile({
    required this.name,
    required this.order,
    required this.limit,
    required this.perSheetHint,
    required this.onTap,
    required this.onLimit,
  });

  final String name;

  /// Vị trí trong danh sách đã chọn, -1 nếu chưa chọn.
  final int order;
  final String limit;
  final String perSheetHint;
  final VoidCallback onTap;
  final ValueChanged<String> onLimit;

  @override
  Widget build(BuildContext context) {
    final selected = order >= 0;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: selected ? AppColors.indigo.withValues(alpha: 0.12) : AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: selected ? AppColors.indigo : AppColors.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: InkWell(
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  children: [
                    Container(
                      width: 22,
                      height: 22,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: selected ? AppColors.indigo : AppColors.border,
                        shape: BoxShape.circle,
                      ),
                      child: Text(
                        selected ? '${order + 1}' : '·',
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w600,
                          color: selected ? AppColors.indigoLight : null,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (selected) ...[
            const SizedBox(width: 8),
            SizedBox(
              width: 76,
              child: TextFormField(
                initialValue: limit,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 13),
                decoration: InputDecoration(
                  isDense: true,
                  hintText: perSheetHint.isEmpty ? '—' : perSheetHint,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                ),
                onChanged: onLimit,
              ),
            ),
            const SizedBox(width: 6),
            const Text(
              'con/mâm',
              style: TextStyle(fontSize: 11, color: AppColors.muted),
            ),
          ],
        ],
      ),
    );
  }
}

/// Sức chứa mâm của từng máy theo đúng thứ tự chọn — máy khai riêng thì lấy số riêng.
List<int> sucChuaTheoMay(
  List<String> ids,
  Map<String, String> limits,
  int perSheetChung,
) =>
    [
      for (final id in ids)
        (int.tryParse(limits[id] ?? '') ?? 0) > 0
            ? int.parse(limits[id]!)
            : perSheetChung,
    ];

/// Dòng tóm tắt "sẽ chia thành N lượt" dùng chung cho form tạo và form chia lại.
class SplitPreview extends StatelessWidget {
  const SplitPreview({
    super.key,
    required this.printers,
    required this.selectedIds,
    required this.planned,
    required this.capacities,
    this.title = 'Sẽ chia thành',
  });

  final List<Printer> printers;
  final List<String> selectedIds;
  final List<PlannedRun> planned;
  final List<int> capacities;
  final String title;

  @override
  Widget build(BuildContext context) {
    if (planned.isEmpty) return const SizedBox.shrink();

    String tenMay(String id) {
      for (final printer in printers) {
        if (printer.id == id) return printer.name;
      }
      return id;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '$title ${planned.length} lượt in trên ${selectedIds.length} máy',
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 6),
        for (var i = 0; i < selectedIds.length; i++)
          Text(
            '${tenMay(selectedIds[i])}: '
            '${planned.where((p) => p.printerIndex == i).length} lượt × '
            '${capacities[i]} con',
            style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
          ),
        if (planned.last.quantity != capacities[planned.last.printerIndex]) ...[
          const SizedBox(height: 6),
          Text(
            'Lượt cuối chỉ ${planned.last.quantity} con.',
            style: const TextStyle(fontSize: 12.5, color: AppColors.warning),
          ),
        ],
      ],
    );
  }
}
