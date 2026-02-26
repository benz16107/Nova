import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiService {
  static const String _tokenKey = 'guest_token';
  // Use 10.0.2.2 for Android emulator to access localhost, or localhost for others.
  // We'll use a configurable base URL. For web/macos testing, localhost:3000 is fine.
  static String baseUrl = const String.fromEnvironment('API_URL', defaultValue: 'http://localhost:3000');

  String? _guestToken;

  String? get guestToken => _guestToken;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _guestToken = prefs.getString(_tokenKey);
  }

  Future<void> setToken(String? token) async {
    _guestToken = token;
    final prefs = await SharedPreferences.getInstance();
    if (token != null) {
      await prefs.setString(_tokenKey, token);
    } else {
      await prefs.remove(_tokenKey);
    }
  }

  Future<Map<String, dynamic>> activate(String roomId, String firstName, String lastName) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/api/me/activate'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'roomId': roomId, 'firstName': firstName, 'lastName': lastName}),
      );
      return jsonDecode(response.body);
    } catch (e) {
      return {'error': 'Network error'};
    }
  }

  Future<Map<String, dynamic>> getMe() async {
    if (_guestToken == null) return {'error': 'unauthorized'};
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/api/me?guest_token=$_guestToken'),
      );
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
      return {'error': 'Failed to fetch status'};
    } catch (e) {
      return {'error': 'Network error'};
    }
  }

  Future<bool> sendFeedback(String content) async {
    if (_guestToken == null) return false;
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/api/feedback?guest_token=$_guestToken'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'content': content, 'source': 'text'}),
      );
      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }
}
