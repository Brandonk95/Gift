import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AppProvider } from "./lib/app.jsx";
import "@fontsource-variable/inter";
import "@fontsource-variable/nunito";
import "@fontsource-variable/fraunces";
import "./styles.css";
import { trackVisualViewport } from "./lib/viewport.js";

// keeps bottom sheets above the iPhone keyboard (see lib/viewport.js)
trackVisualViewport();

// lets the app be installed (home screen / desktop) and receive shared links
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>
);
