import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { GuestAuthProvider } from "./guestToken";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <GuestAuthProvider>
        <App />
      </GuestAuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
