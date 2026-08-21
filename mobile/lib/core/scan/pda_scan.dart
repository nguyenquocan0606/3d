import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_settings.dart';
import '../widgets/common.dart';
import 'hid_scan_buffer.dart';
import 'scan_input_mode.dart';

/// Nhận mã từ máy PDA mà **không phải mở màn quét**.
///
/// Cách hoạt động: [PdaScanListener] bọc cả app, nghe mọi phím phần cứng và ghép
/// lại thành mã ([HidScanBuffer]). Mỗi màn có việc quét thì bọc mình trong một
/// [PdaScanScope]; mã ghép xong được giao cho scope đang hoạt động.
///
/// Vì sao dùng danh sách toàn cục thay cho provider: scope đăng ký trong
/// `initState` và rút tên trong `dispose` — đó là vòng đời của widget, không phải
/// trạng thái ai cần lắng nghe. Đẩy vào Riverpod chỉ tạo thêm rebuild vô ích, và
/// bản thân bộ bắt phím cũng đã là singleton toàn cục (`HardwareKeyboard`).
final List<_PdaScanScopeState> _scopes = <_PdaScanScopeState>[];

/// Scope nào sẽ nhận mã vừa quét.
///
/// Ưu tiên màn mở sau cùng (nằm cuối danh sách) và đang là route hiện hành. Khi
/// có bảng chọn / hộp thoại đè lên thì không màn nào còn là route hiện hành nữa,
/// lúc đó mã vẫn nên rơi về màn nghiệp vụ dưới nó thay vì mất hút.
_PdaScanScopeState? _activeScope() {
  for (var i = _scopes.length - 1; i >= 0; i--) {
    final scope = _scopes[i];
    if (scope.canReceive && scope.isCurrentRoute) return scope;
  }
  for (var i = _scopes.length - 1; i >= 0; i--) {
    if (_scopes[i].canReceive) return _scopes[i];
  }
  return null;
}

/// Ảnh chụp trạng thái bộ bắt phím, chỉ phục vụ ô "thử máy quét" ở màn Cài đặt.
///
/// Lỗi hay gặp nhất khi lắp PDA mới là quên bật hậu tố Enter: ký tự vẫn về app
/// nhưng không bao giờ chốt thành mã. [pending] cho người lắp máy thấy điều đó
/// ngay thay vì phải đoán.
class PdaScanProbe {
  const PdaScanProbe({this.pending = '', this.lastCode, this.lastAt});

  final String pending;
  final String? lastCode;
  final DateTime? lastAt;
}

/// Sống suốt đời app nên không cần dispose.
final ValueNotifier<PdaScanProbe> pdaScanProbe =
    ValueNotifier<PdaScanProbe>(const PdaScanProbe());

/// Đánh dấu một màn hình là đích nhận mã quét từ máy PDA.
///
/// Bọc quanh `Scaffold` của màn. [onCode] dùng chung hợp đồng với
/// `ScannerScreen.onCode`: trả về câu thông báo để hiện toast, hoặc null nếu màn
/// tự lo hiển thị; ném lỗi để báo đỏ.
class PdaScanScope extends StatefulWidget {
  const PdaScanScope({
    super.key,
    required this.onCode,
    required this.child,
    this.enabled = true,
    this.showFeedback = true,
  });

  final Future<String?> Function(String code) onCode;

  /// Tắt tạm khi màn chưa đủ điều kiện quét (chưa chọn mâm đích, đang đứng ở tab
  /// khác...) — quét lúc đó chỉ tạo ra thao tác nhầm.
  final bool enabled;

  /// Tự hiện toast kết quả. Tắt khi màn tự vẽ phản hồi riêng.
  final bool showFeedback;

  final Widget child;

  @override
  State<PdaScanScope> createState() => _PdaScanScopeState();
}

class _PdaScanScopeState extends State<PdaScanScope> {
  ModalRoute<Object?>? _route;
  bool _busy = false;
  String? _lastCode;
  DateTime _lastAt = DateTime.fromMillisecondsSinceEpoch(0);

  @override
  void initState() {
    super.initState();
    _scopes.add(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Giữ sẵn route để lúc nhận mã không phải gọi ModalRoute.of ngoài build.
    _route = ModalRoute.of(context);
  }

  @override
  void dispose() {
    _scopes.remove(this);
    super.dispose();
  }

  bool get canReceive => mounted && widget.enabled;

  bool get isCurrentRoute => _route?.isCurrent ?? true;

  Future<void> receive(String code) async {
    // Cò của PDA thỉnh thoảng bắn lặp; hai lần cách nhau dưới nửa giây chắc chắn
    // không phải người quét hai lượt. Để ngưỡng thấp vì quét lại cùng một mã là
    // thao tác hợp lệ ở nhiều màn (VD quét lại mã lượt in để bỏ qua).
    final now = DateTime.now();
    if (code == _lastCode &&
        now.difference(_lastAt) < const Duration(milliseconds: 500)) {
      return;
    }
    _lastCode = code;
    _lastAt = now;

    if (_busy) return;
    _busy = true;
    HapticFeedback.mediumImpact();

    try {
      final message = await widget.onCode(code);
      if (!mounted || !widget.showFeedback) return;
      if (message != null && message.isNotEmpty) showToast(context, message);
    } catch (error) {
      if (!mounted) return;
      HapticFeedback.heavyImpact();
      if (widget.showFeedback) showToast(context, '$error', isError: true);
    } finally {
      _busy = false;
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

/// Bọc toàn app để nghe phím từ đầu đọc của máy PDA.
///
/// Đặt ngoài `MaterialApp` vì nó không vẽ gì, chỉ cần sống suốt đời app.
class PdaScanListener extends ConsumerStatefulWidget {
  const PdaScanListener({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<PdaScanListener> createState() => _PdaScanListenerState();
}

class _PdaScanListenerState extends ConsumerState<PdaScanListener> {
  final _buffer = HidScanBuffer();

  @override
  void initState() {
    super.initState();
    HardwareKeyboard.instance.addHandler(_onKey);
  }

  @override
  void dispose() {
    HardwareKeyboard.instance.removeHandler(_onKey);
    super.dispose();
  }

  bool _onKey(KeyEvent event) {
    if (event is! KeyDownEvent) return false;

    final key = event.logicalKey;
    final mode = ref.read(appSettingsProvider).scanInputMode;

    // Lắp PDA mới luôn phải trả lời được câu "phím có tới app không". Log trước cả
    // khi lọc chế độ, vì quên bật chế độ PDA trong Cài đặt cũng là một cách hỏng —
    // và trông từ ngoài y hệt lúc đầu đọc không gửi được gì. Chỉ chạy ở bản debug.
    if (kDebugMode) {
      debugPrint(
        '[PDA] chế độ: ${mode.name} · phím: ${key.debugName} · '
        'ký tự: ${event.character == null ? '(rỗng)' : '"${event.character}"'} · '
        'đang gõ dở: "${_buffer.pending}"',
      );
    }

    if (mode != ScanInputMode.pda) return false;

    // Con trỏ đang nằm trong một ô nhập: để máy PDA gõ thẳng vào ô đó, giống bản
    // web bỏ qua sự kiện khi người dùng đang gõ (src/app/page.tsx). Bắt ở đây nữa
    // thì một lần quét vào hai chỗ.
    final editable = _focusedEditable();
    if (editable != null) {
      _buffer.reset();
      _publish();

      // Trừ hậu tố Tab: trong ô nhập, Tab mặc định nhảy focus sang widget kế chứ
      // không xác nhận, nên mã quét vào sẽ nằm im trong ô và con trỏ thì văng đi
      // chỗ khác. Ép nó chạy đúng như Enter để hai hậu tố dùng thay nhau được.
      if (key == LogicalKeyboardKey.tab) {
        editable.performAction(TextInputAction.done);
        return true;
      }
      return false;
    }

    final isTerminator = key == LogicalKeyboardKey.enter ||
        key == LogicalKeyboardKey.numpadEnter ||
        key == LogicalKeyboardKey.tab;

    final code = _buffer.add(
      now: DateTime.now(),
      character: isTerminator ? null : event.character,
      isTerminator: isTerminator,
    );

    if (code != null) {
      _publish(code: code);
      // Không await: xử lý mã có thể gọi API, còn hàm này phải trả lời ngay cho
      // hệ thống phím.
      _activeScope()?.receive(code);
      return true;
    }

    _publish();

    // Nuốt ký tự của mã để nó không kích hoạt phím tắt hay nhảy focus lung tung.
    // Phím kết thúc mà chưa chốt được mã thì trả lại cho hệ thống, để Enter vẫn
    // bấm được nút khi người dùng cắm bàn phím rời.
    return !isTerminator && (event.character ?? '').isNotEmpty;
  }

  /// Ô nhập đang giữ con trỏ, null nếu không có ô nào.
  ///
  /// `FocusNode` của một `TextField` gắn vào widget `Focus` nằm bên trong
  /// `EditableText`, nên cứ soi ngược lên là ra.
  EditableTextState? _focusedEditable() {
    final focusContext = FocusManager.instance.primaryFocus?.context;
    if (focusContext == null || !focusContext.mounted) return null;
    return focusContext.findAncestorStateOfType<EditableTextState>();
  }

  void _publish({String? code}) {
    final previous = pdaScanProbe.value;
    pdaScanProbe.value = PdaScanProbe(
      pending: _buffer.pending,
      lastCode: code ?? previous.lastCode,
      lastAt: code == null ? previous.lastAt : DateTime.now(),
    );
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
