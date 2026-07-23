import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./App";
import { StudioProvider } from "./StudioContext";
import "./styles.css";

// HashRouter would read the skip link's "#studio-main" as a route and bounce
// the keyboard user to Home; focus the main region directly instead.
document.querySelector<HTMLAnchorElement>(".skip-link")?.addEventListener("click", (event) => {
  event.preventDefault();
  document.getElementById("studio-main")?.focus();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <StudioProvider>
        <App />
      </StudioProvider>
    </HashRouter>
  </React.StrictMode>
);
