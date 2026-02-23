import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./auth";
import { SettingsProvider } from "./context/SettingsContext";
import Login from "./pages/Login";
import Layout from "./pages/Layout";
import Guests from "./pages/Guests";
import Activity from "./pages/Activity";
import Settings from "./pages/Settings";

function App() {
  const { token } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={token ? <SettingsProvider><Layout /></SettingsProvider> : <Navigate to="/login" replace />}
      >
        <Route index element={<Guests />} />
        <Route path="guests" element={<Guests />} />
        <Route path="activity" element={<Activity />} />
        <Route path="settings" element={<Settings />} />
        <Route path="requests" element={<Navigate to="/activity" replace />} />
        <Route path="memory" element={<Navigate to="/activity" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
