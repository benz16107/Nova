import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';

class WebsocketService {
  WebSocketChannel? _channel;
  final String _wsBaseUrl = const String.fromEnvironment('WS_URL', defaultValue: 'ws://localhost:3000');

  bool get isConnected => _channel != null;

  void connect({
    required String token,
    required String inputMode, // 'voice' or 'text'
    required String outputMode, // 'voice' or 'text'
    required Function(Map<String, dynamic>) onMessage,
    required Function() onDone,
    required Function(dynamic) onError,
  }) {
    final uri = Uri.parse('$_wsBaseUrl/api/realtime/connect?guest_token=$token&input_mode=$inputMode&output_mode=$outputMode');
    _channel = WebSocketChannel.connect(uri);

    _channel!.stream.listen(
      (message) {
        try {
          final decoded = jsonDecode(message);
          onMessage(decoded);
        } catch (e) {
          // Ignore parse errors
        }
      },
      onDone: () {
        _channel = null;
        onDone();
      },
      onError: (err) {
        _channel = null;
        onError(err);
      },
    );
  }

  void sendAudioBuffer(String base64Audio) {
    if (_channel != null) {
      _channel!.sink.add(jsonEncode({
        'type': 'input_audio_buffer.append',
        'audio': base64Audio,
      }));
    }
  }

  void sendText(String text) {
    if (_channel != null) {
      _channel!.sink.add(jsonEncode({
        'type': 'guest_text',
        'text': text,
      }));
    }
  }

  void disconnect() {
    _channel?.sink.close();
    _channel = null;
  }
}
