import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { PrivacyNotice } from "./components/Client/PrivacyNotice.jsx";
import { TermsOfService } from "./components/Client/TermsOfService.jsx";

const route = window.location.pathname;

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {route === "/privacy" ? <PrivacyNotice /> : route === "/terms" ? <TermsOfService /> : <App />}
  </React.StrictMode>
);
