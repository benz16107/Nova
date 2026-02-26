import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_sound/flutter_sound.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:record/record.dart';
import '../services/api_service.dart';
import '../services/websocket_service.dart';
import 'home_screen.dart';
import 'activate_screen.dart';

class ChatMessage {
  final String role;
  final String text;
  ChatMessage({required this.role, required this.text});
}

class ConciergeScreen extends StatefulWidget {
  final ApiService apiService;

  const ConciergeScreen({Key? key, required this.apiService}) : super(key: key);

  @override
  State<ConciergeScreen> createState() => _ConciergeScreenState();
}

class _ConciergeScreenState extends State<ConciergeScreen> {
  final WebsocketService _wsService = WebsocketService();
  final AudioRecorder _audioRecorder = AudioRecorder();
  final FlutterSoundPlayer _player = FlutterSoundPlayer();
  bool _audioInitialized = false;

  String _status = 'idle'; // idle, connecting, connected, error
  String _errorMsg = '';
  String _inputMode = 'voice';
  String _outputMode = 'voice';

  List<ChatMessage> _messages = [];
  String _streamingText = '';
  final _textController = TextEditingController();
  final _scrollController = ScrollController();
  final _textFocusNode = FocusNode();

  StreamSubscription? _micStreamSub;

  @override
  void initState() {
    super.initState();
    _initAudio();
  }

  Future<void> _initAudio() async {
    await _player.openPlayer();
    _audioInitialized = true;
  }

  @override
  void dispose() {
    _disconnect();
    _textController.dispose();
    _scrollController.dispose();
    _textFocusNode.dispose();
    if (_audioInitialized) {
      _player.closePlayer();
    }
    _audioRecorder.dispose();
    super.dispose();
  }



  Future<void> _start() async {
    final token = widget.apiService.guestToken;
    if (token == null) {
      setState(() {
        _status = 'error';
        _errorMsg = 'No token found. Please activate again.';
      });
      return;
    }

    setState(() {
      _status = 'connecting';
      _errorMsg = '';
      _messages = [];
      _streamingText = '';
    });

    _wsService.connect(
      token: token,
      inputMode: _inputMode,
      outputMode: _outputMode,
      onMessage: _handleWsMessage,
      onDone: () {
        if (_status != 'idle') {
          _disconnect();
          setState(() {
            _status = 'error';
            _errorMsg = 'Connection closed.';
          });
        }
      },
      onError: (err) {
        _disconnect();
        setState(() {
          _status = 'error';
          _errorMsg = 'WebSocket error: $err';
        });
      },
    );

    setState(() => _status = 'connected');

    if (_inputMode == 'voice') {
      await _startRecording();
    }
  }

  Future<void> _startRecording() async {
    try {
      if (!_audioInitialized) return;

      final status = await Permission.microphone.request();
      if (status != PermissionStatus.granted) {
        setState(() {
          _status = 'error';
          _errorMsg = 'Microphone permission denied.';
        });
        return;
      }

      final stream = await _audioRecorder.startStream(const RecordConfig(
        encoder: AudioEncoder.pcm16bits,
        sampleRate: 24000,
        numChannels: 1,
      ));

      _micStreamSub = stream.listen((data) {
        final base64Audio = base64Encode(data);
        _wsService.sendAudioBuffer(base64Audio);
      });

      if (_outputMode == 'voice') {
        await _player.startPlayerFromStream(
          codec: Codec.pcm16,
          numChannels: 1,
          sampleRate: 24000,
          bufferSize: 8192,
          interleaved: false,
        );
      }
    } catch (e) {
      setState(() {
        _status = 'error';
        _errorMsg = 'Failed to start audio: $e';
      });
    }
  }

  void _disconnect() async {
    _micStreamSub?.cancel();
    if (await _audioRecorder.isRecording()) {
      await _audioRecorder.stop();
    }
    if (_player.isPlaying) _player.stopPlayer();
    _wsService.disconnect();
    if (mounted) {
      setState(() => _status = 'idle');
    }
  }

  void _handleWsMessage(Map<String, dynamic> msg) {
    if (!mounted) return;
    
    final type = msg['type'];
    if (type == 'error') {
      setState(() {
        _status = 'error';
        _errorMsg = msg['error']?.toString() ?? msg['message']?.toString() ?? 'Unknown error';
      });
      _disconnect();
      return;
    }

    if (type == 'conversation.item.input_audio_transcription.completed') {
      final text = msg['transcript']?.toString().trim();
      if (text != null && text.isNotEmpty) {
        setState(() => _messages.add(ChatMessage(role: 'user', text: text)));
      }
    } else if (type == 'response.output_audio.delta') {
       final base64Audio = msg['delta'] as String?;
       if (base64Audio != null && _outputMode == 'voice') {
          try {
            final bytes = base64Decode(base64Audio);
            if (_player.isPlaying) {
              _player.uint8ListSink?.add(bytes);
            }
          } catch (e) {
            // ignore
          }
       }
    } else if (type == 'response.output_text.delta' || type == 'response.output_audio_transcript.delta') {
      final delta = msg['delta'] as String?;
      if (delta != null) {
        setState(() => _streamingText += delta);
      }
    } else if (type == 'response.output_text.done' || type == 'response.output_audio_transcript.done') {
      final transcript = msg['transcript']?.toString().trim() ?? _streamingText;
      if (transcript.isNotEmpty) {
        setState(() {
          _messages.add(ChatMessage(role: 'assistant', text: transcript));
          _streamingText = '';
        });
      }
    }
  }

  void _sendText() {
    final text = _textController.text.trim();
    if (text.isEmpty) return;
    
    setState(() => _messages.add(ChatMessage(role: 'user', text: text)));
    _textController.clear();
    _wsService.sendText(text);
    _textFocusNode.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: BackButton(onPressed: () {
          _disconnect();
          Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => HomeScreen(apiService: widget.apiService)));
        }),
        title: const Text('Nova'),
        actions: [
          TextButton(
            onPressed: () async {
              _disconnect();
              await widget.apiService.setToken(null);
              if (!mounted) return;
              Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => ActivateScreen(apiService: widget.apiService)));
            },
            child: const Text('Log out', style: TextStyle(color: Colors.white)),
          ),
        ],
        backgroundColor: Theme.of(context).colorScheme.primary,
        foregroundColor: Colors.white,
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (_status == 'idle') ...[
              const SizedBox(height: 32),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 24),
                child: Text('Choose how you want to talk and how Nova should respond.', style: TextStyle(fontSize: 16)),
              ),
              const SizedBox(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Text('You: ', style: TextStyle(fontWeight: FontWeight.bold)),
                  SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: 'voice', label: Text('Voice')),
                      ButtonSegment(value: 'text', label: Text('Text')),
                    ],
                    selected: {_inputMode},
                    onSelectionChanged: (set) => setState(() => _inputMode = set.first),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Text('Nova: ', style: TextStyle(fontWeight: FontWeight.bold)),
                  SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: 'voice', label: Text('Voice')),
                      ButtonSegment(value: 'text', label: Text('Text')),
                    ],
                    selected: {_outputMode},
                    onSelectionChanged: (set) => setState(() => _outputMode = set.first),
                  ),
                ],
              ),
              const SizedBox(height: 48),
              ElevatedButton(
                onPressed: _start,
                style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 48, vertical: 16)),
                child: const Text('Start', style: TextStyle(fontSize: 18)),
              ),
            ] else if (_status == 'connecting') ...[
              const Expanded(child: Center(child: CircularProgressIndicator())),
            ] else if (_status == 'error') ...[
              Expanded(
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24.0),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.error_outline, color: Colors.red, size: 48),
                        const SizedBox(height: 16),
                        Text(_errorMsg, style: const TextStyle(color: Colors.red, fontSize: 16), textAlign: TextAlign.center),
                        const SizedBox(height: 24),
                        ElevatedButton(
                          onPressed: () => setState(() => _status = 'idle'),
                          child: const Text('Try Again'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ] else if (_status == 'connected') ...[
              Expanded(
                child: ListView.builder(
                  reverse: true,
                  controller: _scrollController,
                  padding: const EdgeInsets.all(16),
                  itemCount: _messages.length + (_streamingText.isNotEmpty ? 1 : 0),
                  itemBuilder: (context, index) {
                    if (_streamingText.isNotEmpty) {
                      if (index == 0) {
                        return _buildChatBubble('assistant', _streamingText);
                      }
                      final msgIndex = _messages.length - index;
                      final msg = _messages[msgIndex];
                      return _buildChatBubble(msg.role, msg.text);
                    } else {
                      final msgIndex = _messages.length - 1 - index;
                      final msg = _messages[msgIndex];
                      return _buildChatBubble(msg.role, msg.text);
                    }
                  },
                ),
              ),
              if (_inputMode == 'text')
                Padding(
                  padding: const EdgeInsets.all(8.0),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _textController,
                          focusNode: _textFocusNode,
                          decoration: const InputDecoration(hintText: 'Type a message...', border: OutlineInputBorder()),
                          onSubmitted: (_) => _sendText(),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton(
                        icon: const Icon(Icons.send),
                        color: Theme.of(context).colorScheme.primary,
                        onPressed: _sendText,
                      ),
                    ],
                  ),
                ),
              if (_inputMode == 'voice' || _outputMode == 'voice')
                Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.mic, color: Colors.green),
                      const SizedBox(width: 8),
                      Text(
                        _inputMode == 'voice' && _outputMode == 'voice'
                            ? 'Connected. Speak now.'
                            : 'Connected. Voice active.',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                ),
              Padding(
                padding: const EdgeInsets.only(bottom: 24.0, top: 8.0),
                child: OutlinedButton(
                  onPressed: _disconnect,
                  child: const Text('End Session'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildChatBubble(String role, String text) {
    final isUser = role == 'user';
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: isUser ? Theme.of(context).colorScheme.primary : Colors.grey[200],
          borderRadius: BorderRadius.circular(16).copyWith(
            bottomRight: isUser ? const Radius.circular(4) : const Radius.circular(16),
            bottomLeft: isUser ? const Radius.circular(16) : const Radius.circular(4),
          ),
        ),
        child: Text(
          text,
          style: TextStyle(color: isUser ? Colors.white : Colors.black87),
        ),
      ),
    );
  }
}
