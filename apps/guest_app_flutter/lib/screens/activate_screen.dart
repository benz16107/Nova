import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 'home_screen.dart';

class ActivateScreen extends StatefulWidget {
  final ApiService apiService;

  const ActivateScreen({Key? key, required this.apiService}) : super(key: key);

  @override
  State<ActivateScreen> createState() => _ActivateScreenState();
}

class _ActivateScreenState extends State<ActivateScreen> {
  final _roomIdController = TextEditingController();
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  bool _isLoading = false;
  String _errorMsg = '';

  Future<void> _activate() async {
    final roomId = _roomIdController.text.trim();
    final firstName = _firstNameController.text.trim();
    final lastName = _lastNameController.text.trim();

    if (roomId.isEmpty || firstName.isEmpty || lastName.isEmpty) {
      setState(() => _errorMsg = 'All fields are required.');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMsg = '';
    });

    final res = await widget.apiService.activate(roomId, firstName, lastName);

    setState(() => _isLoading = false);

    if (res.containsKey('token') && res['token'] != null) {
      await widget.apiService.setToken(res['token']);
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => HomeScreen(apiService: widget.apiService)),
      );
    } else {
      setState(() => _errorMsg = res['error'] ?? 'Activation failed.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Nova Guest Agent')),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Card(
              elevation: 2,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              child: Padding(
                padding: const EdgeInsets.all(32.0),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Activate your room',
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Enter your room number and name to get started.',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.grey[600]),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 32),
                    TextField(
                      controller: _roomIdController,
                      decoration: const InputDecoration(labelText: 'Room number', border: OutlineInputBorder()),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _firstNameController,
                      decoration: const InputDecoration(labelText: 'First name', border: OutlineInputBorder()),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _lastNameController,
                      decoration: const InputDecoration(labelText: 'Last name', border: OutlineInputBorder()),
                    ),
                    if (_errorMsg.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      Text(_errorMsg, style: const TextStyle(color: Colors.red)),
                    ],
                    const SizedBox(height: 32),
                    ElevatedButton(
                      onPressed: _isLoading ? null : _activate,
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      child: Text(_isLoading ? 'Activating...' : 'Activate', style: const TextStyle(fontSize: 16)),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
