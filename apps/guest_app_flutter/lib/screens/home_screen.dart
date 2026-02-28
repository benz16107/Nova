import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 'activate_screen.dart';
import 'concierge_screen.dart';

class HomeScreen extends StatefulWidget {
  final ApiService apiService;

  const HomeScreen({super.key, required this.apiService});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool? _conciergeAllowed;
  String? _guestName;
  String? _roomId;
  bool _isLoading = true;
  String _feedbackText = '';
  bool _feedbackSending = false;
  bool _feedbackSent = false;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    final res = await widget.apiService.getMe();
    if (!mounted) return;
    setState(() {
      _isLoading = false;
      if (res.containsKey('error') && res['error'] != null) {
        _conciergeAllowed = false; // Kick out or show checked out
      } else {
        _conciergeAllowed = res['conciergeAllowed'] is bool
            ? res['conciergeAllowed']
            : false;
        if (res['guest'] != null) {
          _guestName = res['guest']['firstName'];
          _roomId = res['guest']['roomId'];
        }
      }
    });

    if (res['error'] == 'unauthorized' ||
        res['error'] == 'Failed to fetch status') {
      // invalid token, redirect
      _logout();
    }
  }

  Future<void> _submitFeedback() async {
    if (_feedbackText.trim().isEmpty || _feedbackSending) return;
    setState(() => _feedbackSending = true);
    final success = await widget.apiService.sendFeedback(_feedbackText.trim());
    if (!mounted) return;
    setState(() {
      _feedbackSending = false;
      if (success) _feedbackSent = true;
    });
  }

  Future<void> _logout() async {
    await widget.apiService.setToken(null);
    if (!mounted) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => ActivateScreen(apiService: widget.apiService),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (_isLoading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (_conciergeAllowed == false) {
      return Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 500),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Container(
                                  width: 40,
                                  height: 40,
                                  decoration: BoxDecoration(
                                    color: theme.colorScheme.secondaryContainer,
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Icon(
                                    Icons.check_circle_outline,
                                    color: theme.colorScheme.secondary,
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Text(
                                  'Stay completed',
                                  style: theme.textTheme.titleLarge?.copyWith(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            Text(
                              'You have checked out. Thank you for staying with us.',
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: theme.colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    if (!_feedbackSent) ...[
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(20),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text(
                                'Leave feedback (optional)',
                                style: theme.textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'Share anything that can help us improve your next visit.',
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                              const SizedBox(height: 16),
                              TextField(
                                maxLines: 3,
                                onChanged: (v) =>
                                    setState(() => _feedbackText = v),
                                decoration: const InputDecoration(
                                  hintText:
                                      'e.g. Great stay, would love later checkout next time.',
                                ),
                              ),
                              const SizedBox(height: 16),
                              FilledButton.icon(
                                onPressed:
                                    _feedbackText.trim().isNotEmpty &&
                                        !_feedbackSending
                                    ? _submitFeedback
                                    : null,
                                icon: _feedbackSending
                                    ? const SizedBox(
                                        width: 16,
                                        height: 16,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                        ),
                                      )
                                    : const Icon(Icons.send_rounded),
                                label: Text(
                                  _feedbackSending
                                      ? 'Sending...'
                                      : 'Submit feedback',
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ] else ...[
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(20),
                          child: Text(
                            'Thank you. Your feedback has been submitted.',
                            style: TextStyle(
                              color: theme.colorScheme.primary,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    OutlinedButton.icon(
                      onPressed: _logout,
                      icon: const Icon(Icons.logout_rounded),
                      label: const Text('Log out'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _roomId != null ? 'Room $_roomId' : 'Your room',
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: _loadData,
                    icon: const Icon(Icons.refresh_rounded),
                    tooltip: 'Refresh status',
                  ),
                  IconButton(
                    onPressed: _logout,
                    icon: const Icon(Icons.logout_rounded),
                    tooltip: 'Log out',
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (_guestName != null)
                        Text(
                          'Welcome, $_guestName',
                          style: theme.textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      const SizedBox(height: 10),
                      Text(
                        'Ask Nova for room help, requests, and common hotel information.',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const Spacer(),
              FilledButton.icon(
                icon: const Icon(Icons.mic_none_rounded),
                label: const Text('Open Nova concierge'),
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) =>
                          ConciergeScreen(apiService: widget.apiService),
                    ),
                  );
                },
              ),
              const SizedBox(height: 8),
              Text(
                'Voice and text are both supported inside concierge.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }
}
