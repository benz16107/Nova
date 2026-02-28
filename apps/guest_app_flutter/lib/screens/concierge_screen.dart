import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_sound/flutter_sound.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:record/record.dart';
import 'package:audio_session/audio_session.dart';
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

  const ConciergeScreen({super.key, required this.apiService});

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
  int? _pendingVoiceMessageIndex;
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
    final session = await AudioSession.instance;
    await session.configure(
      AudioSessionConfiguration(
        avAudioSessionCategory: AVAudioSessionCategory.playAndRecord,
        avAudioSessionCategoryOptions:
            AVAudioSessionCategoryOptions.allowBluetooth |
            AVAudioSessionCategoryOptions.defaultToSpeaker,
        avAudioSessionMode: AVAudioSessionMode.voiceChat,
        avAudioSessionRouteSharingPolicy:
            AVAudioSessionRouteSharingPolicy.defaultPolicy,
        avAudioSessionSetActiveOptions: AVAudioSessionSetActiveOptions.none,
        androidAudioAttributes: const AndroidAudioAttributes(
          contentType: AndroidAudioContentType.speech,
          flags: AndroidAudioFlags.none,
          usage: AndroidAudioUsage.voiceCommunication,
        ),
        androidAudioFocusGainType: AndroidAudioFocusGainType.gain,
        androidWillPauseWhenDucked: true,
      ),
    );
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

    if (_outputMode == 'voice') {
      await _startPlaying();
    }
    if (_inputMode == 'voice') {
      await _startRecording();
    }
  }

  Future<void> _startPlaying() async {
    try {
      if (!_audioInitialized) return;
      await _player.startPlayerFromStream(
        codec: Codec.pcm16,
        numChannels: 1,
        sampleRate: 24000,
        bufferSize: 8192,
        interleaved: false,
      );
    } catch (e) {
      setState(() {
        _status = 'error';
        _errorMsg = 'Failed to start audio playback: $e';
      });
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

      final stream = await _audioRecorder.startStream(
        const RecordConfig(
          encoder: AudioEncoder.pcm16bits,
          sampleRate: 24000,
          numChannels: 1,
          echoCancel: true,
          autoGain: true,
          noiseSuppress: true,
          androidConfig: AndroidRecordConfig(
            audioSource: AndroidAudioSource.voiceCommunication,
            audioManagerMode: AudioManagerMode.modeInCommunication,
            speakerphone: true,
          ),
        ),
      );

      _micStreamSub = stream.listen((data) {
        final base64Audio = base64Encode(data);
        _wsService.sendAudioBuffer(base64Audio);
      });
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
      setState(() {
        _status = 'idle';
        _pendingVoiceMessageIndex = null;
      });
    }
  }

  void _ensurePendingVoiceMessage() {
    if (_pendingVoiceMessageIndex != null) return;
    setState(() {
      _messages.add(ChatMessage(role: 'user', text: 'Listening…'));
      _pendingVoiceMessageIndex = _messages.length - 1;
    });
  }

  void _applyVoiceTranscription(String text) {
    final normalized = text.trim();
    if (normalized.isEmpty) {
      setState(() {
        if (_pendingVoiceMessageIndex != null &&
            _pendingVoiceMessageIndex! >= 0 &&
            _pendingVoiceMessageIndex! < _messages.length &&
            _messages[_pendingVoiceMessageIndex!].text == 'Listening…') {
          _messages.removeAt(_pendingVoiceMessageIndex!);
        }
        _pendingVoiceMessageIndex = null;
      });
      return;
    }

    setState(() {
      if (_pendingVoiceMessageIndex != null &&
          _pendingVoiceMessageIndex! >= 0 &&
          _pendingVoiceMessageIndex! < _messages.length) {
        _messages[_pendingVoiceMessageIndex!] = ChatMessage(
          role: 'user',
          text: normalized,
        );
      } else {
        _messages.add(ChatMessage(role: 'user', text: normalized));
      }
      _pendingVoiceMessageIndex = null;
    });
  }

  void _handleWsMessage(Map<String, dynamic> msg) {
    if (!mounted) return;

    final type = msg['type'];
    if (type == 'error') {
      setState(() {
        _status = 'error';
        _errorMsg =
            msg['error']?.toString() ??
            msg['message']?.toString() ??
            'Unknown error';
      });
      _disconnect();
      return;
    }

    if (type == 'input_audio_buffer.speech_started') {
      _ensurePendingVoiceMessage();
    } else if (type ==
        'conversation.item.input_audio_transcription.completed') {
      final text = msg['transcript']?.toString() ?? '';
      _applyVoiceTranscription(text);
    } else if (type == 'conversation.item.input_audio_transcription.failed') {
      _applyVoiceTranscription('');
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
    } else if (type == 'response.output_text.delta' ||
        type == 'response.output_audio_transcript.delta') {
      final delta = msg['delta'] as String?;
      if (delta != null) {
        setState(() => _streamingText += delta);
      }
    } else if (type == 'response.output_text.done' ||
        type == 'response.output_audio_transcript.done') {
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
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        leading: BackButton(
          onPressed: () {
            _disconnect();
            Navigator.pushReplacement(
              context,
              MaterialPageRoute(
                builder: (_) => HomeScreen(apiService: widget.apiService),
              ),
            );
          },
        ),
        title: const Text('Nova'),
        actions: [
          TextButton(
            onPressed: () async {
              final navigator = Navigator.of(context);
              _disconnect();
              await widget.apiService.setToken(null);
              if (!mounted) return;
              navigator.pushReplacement(
                MaterialPageRoute(
                  builder: (_) => ActivateScreen(apiService: widget.apiService),
                ),
              );
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
              Expanded(
                child: Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(20),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 520),
                      child: Card(
                        child: Padding(
                          padding: const EdgeInsets.all(20),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text(
                                'Start a concierge session',
                                style: theme.textTheme.titleLarge?.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'Choose how you want to speak and how Nova should respond.',
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                              const SizedBox(height: 18),
                              Row(
                                children: [
                                  const SizedBox(
                                    width: 70,
                                    child: Text(
                                      'You',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                  Expanded(
                                    child: SegmentedButton<String>(
                                      segments: const [
                                        ButtonSegment(
                                          value: 'voice',
                                          label: Text('Voice'),
                                        ),
                                        ButtonSegment(
                                          value: 'text',
                                          label: Text('Text'),
                                        ),
                                      ],
                                      selected: {_inputMode},
                                      onSelectionChanged: (set) => setState(
                                        () => _inputMode = set.first,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  const SizedBox(
                                    width: 70,
                                    child: Text(
                                      'Nova',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                  Expanded(
                                    child: SegmentedButton<String>(
                                      segments: const [
                                        ButtonSegment(
                                          value: 'voice',
                                          label: Text('Voice'),
                                        ),
                                        ButtonSegment(
                                          value: 'text',
                                          label: Text('Text'),
                                        ),
                                      ],
                                      selected: {_outputMode},
                                      onSelectionChanged: (set) => setState(
                                        () => _outputMode = set.first,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 20),
                              FilledButton.icon(
                                onPressed: _start,
                                icon: const Icon(
                                  Icons.play_circle_outline_rounded,
                                ),
                                label: const Text('Start session'),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
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
                        const Icon(
                          Icons.error_outline,
                          color: Colors.red,
                          size: 48,
                        ),
                        const SizedBox(height: 16),
                        Text(
                          _errorMsg,
                          style: const TextStyle(
                            color: Colors.red,
                            fontSize: 16,
                          ),
                          textAlign: TextAlign.center,
                        ),
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
              Container(
                width: double.infinity,
                margin: const EdgeInsets.fromLTRB(12, 12, 12, 6),
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: theme.colorScheme.primaryContainer,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      _inputMode == 'voice' || _outputMode == 'voice'
                          ? Icons.graphic_eq_rounded
                          : Icons.chat_bubble_outline,
                      size: 18,
                      color: theme.colorScheme.onPrimaryContainer,
                    ),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        _inputMode == 'voice' && _outputMode == 'voice'
                            ? 'Connected • Voice session active'
                            : _inputMode == 'text' && _outputMode == 'text'
                            ? 'Connected • Text session active'
                            : 'Connected • Hybrid voice/text session active',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: theme.colorScheme.onPrimaryContainer,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView.builder(
                  reverse: true,
                  controller: _scrollController,
                  padding: const EdgeInsets.all(16),
                  itemCount:
                      _messages.length + (_streamingText.isNotEmpty ? 1 : 0),
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
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _textController,
                          focusNode: _textFocusNode,
                          decoration: const InputDecoration(
                            hintText: 'Type a message...',
                            prefixIcon: Icon(Icons.mode_comment_outlined),
                          ),
                          onSubmitted: (_) => _sendText(),
                        ),
                      ),
                      const SizedBox(width: 8),
                      FilledButton(
                        onPressed: _sendText,
                        style: FilledButton.styleFrom(
                          minimumSize: const Size(48, 48),
                          padding: EdgeInsets.zero,
                        ),
                        child: const Icon(Icons.send_rounded),
                      ),
                    ],
                  ),
                ),
              Padding(
                padding: const EdgeInsets.only(bottom: 20.0, top: 6.0),
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
    final colorScheme = Theme.of(context).colorScheme;

    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        constraints: const BoxConstraints(maxWidth: 320),
        decoration: BoxDecoration(
          color: isUser ? colorScheme.primary : Colors.white,
          border: isUser
              ? null
              : Border.all(
                  color: colorScheme.outlineVariant.withValues(alpha: 0.45),
                ),
          borderRadius: BorderRadius.circular(16).copyWith(
            bottomRight: isUser
                ? const Radius.circular(4)
                : const Radius.circular(16),
            bottomLeft: isUser
                ? const Radius.circular(16)
                : const Radius.circular(4),
          ),
        ),
        child: Text(
          text,
          style: TextStyle(
            color: isUser ? Colors.white : colorScheme.onSurface,
          ),
        ),
      ),
    );
  }
}
