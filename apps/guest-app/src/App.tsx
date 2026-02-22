import { Routes, Route, Navigate } from "react-router-dom";
import { useGuestToken } from "./guestToken";
import Activate from "./pages/Activate";
import Home from "./pages/Home";
import Concierge from "./pages/Concierge";

function App() {
  const token = useGuestToken();
  return (
    <Routes>
      <Route path="/activate" element={token ? <Navigate to="/" replace /> : <Activate />} />
      <Route path="/" element={token ? <Home /> : <Navigate to="/activate" replace />} />
      <Route path="/concierge" element={token ? <Concierge /> : <Navigate to="/activate" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
