import 'package:flutter/material.dart';
import 'services/api_service.dart';
import 'screens/activate_screen.dart';
import 'screens/home_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final apiService = ApiService();
  await apiService.init();

  runApp(GuestApp(apiService: apiService));
}

class GuestApp extends StatelessWidget {
  final ApiService apiService;

  const GuestApp({Key? key, required this.apiService}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Nova Guest Agent',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0f766e),
          brightness: Brightness.light,
        ),
        useMaterial3: true,
      ),
      home: apiService.guestToken != null
          ? HomeScreen(apiService: apiService)
          : ActivateScreen(apiService: apiService),
      debugShowCheckedModeBanner: false,
    );
  }
}
