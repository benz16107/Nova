import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./auth";
import Login from "./pages/Login";
import Layout from "./pages/Layout";
import Guests from "./pages/Guests";
import Requests from "./pages/Requests";

function App() {
  const { token } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={token ? <Layout /> : <Navigate to="/login" replace />}
      >
        <Route index element={<Navigate to="guests" replace />} />
        <Route path="guests" element={<Guests />} />
        <Route path="requests" element={<Requests />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
