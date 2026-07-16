import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./App";
import { StudioProvider } from "./StudioContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <StudioProvider>
        <App />
      </StudioProvider>
    </HashRouter>
  </React.StrictMode>
);
