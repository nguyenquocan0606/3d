import 'json.dart';

/// Trạng thái miếng in (tem barcode 8 chữ số).
enum PrintItemStatus {
  pending('pending', 'Chờ in'),
  printing('printing', 'Đang in'),
  completed('completed', 'Hoàn thành');

  const PrintItemStatus(this.value, this.label);
  final String value;
  final String label;

  static PrintItemStatus from(String? raw) => PrintItemStatus.values.firstWhere(
        (e) => e.value == raw,
        orElse: () => PrintItemStatus.pending,
      );

  /// Vòng đời khi quét barcode ở tab Miếng in (khớp `print-items-tab.tsx`):
  /// pending → printing → completed → (quét tiếp quay lại) pending.
  PrintItemStatus get next => switch (this) {
        PrintItemStatus.pending => PrintItemStatus.printing,
        PrintItemStatus.printing => PrintItemStatus.completed,
        PrintItemStatus.completed => PrintItemStatus.pending,
      };
}

class PrintItem {
  const PrintItem({
    required this.id,
    required this.productId,
    required this.name,
    required this.status,
    required this.isChecked,
    this.peiSheetId,
    this.peiSheetName,
    this.printerId,
    this.printerName,
    this.productName,
    this.orderId,
    this.orderCode,
    this.customerName,
  });

  /// Chính là mã barcode 8 chữ số.
  final String id;
  final String productId;
  final String name;
  final PrintItemStatus status;
  final bool isChecked;
  final String? peiSheetId;
  final String? peiSheetName;
  final String? printerId;
  final String? printerName;

  final String? productName;
  final String? orderId;
  final String? orderCode;
  final String? customerName;

  factory PrintItem.fromJson(Map<String, dynamic> json) {
    final product = asMap(json['product']);
    final order = asMap(product['order']);
    final peiSheet = asMap(json['peiSheet']);
    final printer = asMap(json['printer']);

    return PrintItem(
      id: asString(json['id']),
      productId: asString(json['productId']),
      name: asString(json['name']),
      status: PrintItemStatus.from(asStringOrNull(json['status'])),
      isChecked: asBool(json['isChecked']),
      peiSheetId: asStringOrNull(json['peiSheetId']),
      peiSheetName: asStringOrNull(peiSheet['name']),
      printerId: asStringOrNull(json['printerId']),
      printerName: asStringOrNull(printer['name']),
      productName: asStringOrNull(product['name']),
      orderId: asStringOrNull(order['id']),
      orderCode: asStringOrNull(order['orderCode']),
      customerName: asStringOrNull(order['customerName']),
    );
  }

  PrintItem copyWith({PrintItemStatus? status, bool? isChecked}) => PrintItem(
        id: id,
        productId: productId,
        name: name,
        status: status ?? this.status,
        isChecked: isChecked ?? this.isChecked,
        peiSheetId: peiSheetId,
        peiSheetName: peiSheetName,
        printerId: printerId,
        printerName: printerName,
        productName: productName,
        orderId: orderId,
        orderCode: orderCode,
        customerName: customerName,
      );
}

class OrderProduct {
  const OrderProduct({
    required this.id,
    required this.name,
    required this.quantity,
    required this.price,
    this.items = const [],
  });

  final String id;
  final String name;
  final int quantity;
  final double price;
  final List<PrintItem> items;

  int get completedCount =>
      items.where((i) => i.status == PrintItemStatus.completed).length;
  int get checkedCount => items.where((i) => i.isChecked).length;

  factory OrderProduct.fromJson(Map<String, dynamic> json) => OrderProduct(
        id: asString(json['id']),
        name: asString(json['name']),
        quantity: asInt(json['quantity']),
        price: asDouble(json['price']),
        items: asList(json['items'], PrintItem.fromJson),
      );
}

class Order {
  const Order({
    required this.id,
    required this.status,
    this.orderCode,
    this.customerName,
    this.products = const [],
    this.createdAt,
  });

  final String id;
  final String status; // pending | printing | completed
  final String? orderCode;
  final String? customerName;
  final List<OrderProduct> products;
  final DateTime? createdAt;

  String get displayCode => orderCode ?? id;
  String get displayCustomer => customerName ?? 'Khách lẻ';

  List<PrintItem> get allItems => products.expand((p) => p.items).toList();
  int get totalItems => allItems.length;
  int get completedItems =>
      allItems.where((i) => i.status == PrintItemStatus.completed).length;
  int get checkedItems => allItems.where((i) => i.isChecked).length;

  double get totalPrice =>
      products.fold<double>(0, (sum, p) => sum + p.price * p.quantity);

  factory Order.fromJson(Map<String, dynamic> json) => Order(
        id: asString(json['id']),
        status: asString(json['status'], 'pending'),
        orderCode: asStringOrNull(json['orderCode']),
        customerName: asStringOrNull(json['customerName']),
        products: asList(json['products'], OrderProduct.fromJson),
        createdAt: asDate(json['createdAt']),
      );
}

/// Mâm in PEI.
class PeiSheet {
  const PeiSheet({
    required this.id,
    required this.name,
    this.printerId,
    this.printerName,
    this.items = const [],
  });

  final String id;
  final String name;
  final String? printerId;
  final String? printerName;
  final List<PrintItem> items;

  factory PeiSheet.fromJson(Map<String, dynamic> json) {
    final printer = asMap(json['printer']);
    return PeiSheet(
      id: asString(json['id']),
      name: asString(json['name']),
      printerId: asStringOrNull(json['printerId']),
      printerName: asStringOrNull(printer['name']),
      items: asList(json['items'], PrintItem.fromJson),
    );
  }
}
