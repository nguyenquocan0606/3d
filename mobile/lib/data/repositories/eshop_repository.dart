import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../models/json.dart';
import '../models/eshop_order.dart';

class EshopRepository {
  EshopRepository(this._api);

  final ApiClient _api;

  Future<List<EshopOrder>> fetchOrders() => _api.get(
        '/api/eshop/orders',
        (data) {
          final map = asMap(data);
          final ordersData = asList(map['orders'], asMap);
          return ordersData.map((e) => EshopOrder.fromJson(e)).toList();
        },
      );

  Future<void> updatePickProgress(
    String orderId,
    String status,
    Map<String, int> pickedItems,
  ) =>
      _api.post<void>(
        '/api/eshop/orders/$orderId/pick',
        (_) {},
        body: {
          'status': status,
          'pickedItems': pickedItems,
        },
      );
}

final eshopRepositoryProvider = Provider<EshopRepository>(
  (ref) => EshopRepository(ref.watch(apiClientProvider)),
);
