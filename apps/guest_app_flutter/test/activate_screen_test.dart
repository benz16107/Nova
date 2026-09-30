import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:guest_app_flutter/main.dart';
import 'package:guest_app_flutter/services/api_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('without a saved token the app opens on activation', (
    tester,
  ) async {
    final api = ApiService();
    await api.init();
    await tester.pumpWidget(GuestApp(apiService: api));

    expect(find.text('Welcome to Nova'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Room number'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'First name'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Last name'), findsOneWidget);
  });

  testWidgets('activating with empty fields shows an error, no request', (
    tester,
  ) async {
    final api = ApiService();
    await api.init();
    await tester.pumpWidget(GuestApp(apiService: api));

    await tester.enterText(find.widgetWithText(TextField, 'Room number'), '301');
    await tester.tap(find.byType(ElevatedButton));
    await tester.pump();

    expect(find.text('All fields are required.'), findsOneWidget);
  });

  test('setToken persists and clears the guest token', () async {
    final api = ApiService();
    await api.setToken('tok-1');
    final reloaded = ApiService();
    await reloaded.init();
    expect(reloaded.guestToken, 'tok-1');

    await api.setToken(null);
    await reloaded.init();
    expect(reloaded.guestToken, isNull);
  });
}
