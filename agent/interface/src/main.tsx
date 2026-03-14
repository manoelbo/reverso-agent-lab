import "./assets/main.css"

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    // #region agent log
    fetch("http://127.0.0.1:7692/ingest/e1cb9c6d-e97e-4854-9dae-2fef1b8211ce", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "ea45fe",
      },
      body: JSON.stringify({
        sessionId: "ea45fe",
        runId: "debug-2",
        hypothesisId: "H5",
        location: "main.tsx:8",
        message: "window error event",
        data: {
          errorMessage: event.error?.message ?? event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
  })
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
