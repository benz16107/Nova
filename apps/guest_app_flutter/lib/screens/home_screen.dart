import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 'activate_screen.dart';
import 'concierge_screen.dart';

class HomeScreen extends StatefulWidget {
  final ApiService apiService;

  const HomeScreen({Key? key, required this.apiService}) : super(key: key);

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
        _conciergeAllowed = res['conciergeAllowed'] is bool ? res['conciergeAllowed'] : false;
        if (res['guest'] != null) {
          _guestName = res['guest']['firstName'];
          _roomId = res['guest']['roomId'];
        }
      }
    });

    if (res['error'] == 'unauthorized' || res['error'] == 'Failed to fetch status') {
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
      MaterialPageRoute(builder: (_) => ActivateScreen(apiService: widget.apiService)),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (_conciergeAllowed == false) {
      return Scaffold(
        appBar: AppBar(title: const Text('Nova Guest Agent')),
        body: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24.0),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 500),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('You have checked out', style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  Text('Thank you for staying with us. We hope you had a great stay.', style: Theme.of(context).textTheme.bodyLarge),
                  const SizedBox(height: 32),
                  if (!_feedbackSent) ...[
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(24.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text('Leave feedback (optional)', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                            const SizedBox(height: 8),
                            const Text('Share any feedback about your stay.'),
                            const SizedBox(height: 16),
                            TextField(
                              maxLines: 3,
                              onChanged: (v) => setState(() => _feedbackText = v),
                              decoration: const InputDecoration(
                                hintText: 'e.g. The shower was great, would love late checkout next time...',
                                border: OutlineInputBorder(),
                              ),
                            ),
                            const SizedBox(height: 16),
                            ElevatedButton(
                              onPressed: _feedbackText.trim().isNotEmpty && !_feedbackSending ? _submitFeedback : null,
                              child: Text(_feedbackSending ? 'Sending...' : 'Submit feedback'),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ] else ...[
                    const Card(
                      child: Padding(
                        padding: EdgeInsets.all(24.0),
                        child: Text('Thank you, your feedback has been recorded.', style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),
                  TextButton(onPressed: _logout, child: const Text('Log out')),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(_roomId != null ? 'Room $_roomId' : 'Your room'),
        actions: [
          IconButton(icon: const Icon(Icons.logout), onPressed: _logout),
        ],
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (_guestName != null) Text('Welcome, $_guestName', style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 16),
              Text('Talk to Nova for help with anything you need.', style: Theme.of(context).textTheme.bodyLarge, textAlign: TextAlign.center),
              const SizedBox(height: 32),
              ElevatedButton.icon(
                icon: const Icon(Icons.mic),
                label: const Text('Open Nova', style: TextStyle(fontSize: 18)),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)),
                ),
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => ConciergeScreen(apiService: widget.apiService)),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
