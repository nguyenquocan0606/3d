class EshopOrder {
  const EshopOrder({
    required this.id,
    this.refNo,
    this.ecomOrderNo,
    this.channelName,
    this.customerName,
    this.partnerOrderStatus,
    this.deliveryCode,
    this.pickStatus = 'pending',
    this.pickedItems = const {},
    required this.items,
  });

  final String id;
  final String? refNo;
  final String? ecomOrderNo;
  final String? channelName;
  final String? customerName;
  final String? partnerOrderStatus;
  final String? deliveryCode;

  final String pickStatus; // 'pending', 'picking', 'picked'
  final Map<String, int> pickedItems;

  final List<EshopOrderItem> items;

  factory EshopOrder.fromJson(Map<String, dynamic> json) {
    final progress = json['pickProgress'] as Map<String, dynamic>?;
    final pickedItemsDynamic = progress?['pickedItems'] as Map<String, dynamic>?;
    final pickedItems = <String, int>{};
    if (pickedItemsDynamic != null) {
      for (final entry in pickedItemsDynamic.entries) {
        pickedItems[entry.key] = entry.value as int;
      }
    }

    return EshopOrder(
      id: json['id'] as String,
      refNo: json['refNo'] as String?,
      ecomOrderNo: json['ecomOrderNo'] as String?,
      channelName: json['channelName'] as String?,
      customerName: json['customerName'] as String?,
      partnerOrderStatus: json['partnerOrderStatus'] as String?,
      deliveryCode: json['deliveryCode'] as String?,
      pickStatus: (progress?['status'] as String?) ?? 'pending',
      pickedItems: pickedItems,
      items: (json['items'] as List<dynamic>?)
              ?.map((e) => EshopOrderItem.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'refNo': refNo,
        'ecomOrderNo': ecomOrderNo,
        'channelName': channelName,
        'customerName': customerName,
        'partnerOrderStatus': partnerOrderStatus,
        'deliveryCode': deliveryCode,
        'pickProgress': {
          'status': pickStatus,
          'pickedItems': pickedItems,
        },
        'items': items.map((e) => e.toJson()).toList(),
      };
}

class EshopOrderItem {
  const EshopOrderItem({
    required this.id,
    required this.orderId,
    this.skuCode,
    required this.itemName,
    required this.quantity,
  });

  final String id;
  final String orderId;
  final String? skuCode;
  final String itemName;
  final double quantity;

  factory EshopOrderItem.fromJson(Map<String, dynamic> json) => EshopOrderItem(
        id: json['id'] as String,
        orderId: json['orderId'] as String,
        skuCode: json['skuCode'] as String?,
        itemName: json['itemName'] as String? ?? '(không tên)',
        quantity: (json['quantity'] as num?)?.toDouble() ?? 0,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'orderId': orderId,
        'skuCode': skuCode,
        'itemName': itemName,
        'quantity': quantity,
      };
}
