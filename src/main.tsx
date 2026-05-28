import React from "react";
import ReactDOM from "react-dom/client";
import Overlay from "./components/Overlay";
import { AppProvider, ThemeProvider } from "./contexts";
import "./global.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import AppRoutes from "./routes";


const currentWindow = getCurrentWindow();
const windowLabel = currentWindow.label;

// 🚀 SHUNYA: Auto-Update Check Function (Disabled until release)
/*
async function checkForAppUpdates() {
  try {
    const update = await check();
    if (update?.available) {
      console.log("🚀 Shunya Update available! Downloading...");
      await update.downloadAndInstall();
      console.log("✅ Update installed! Relaunching...");
      await relaunch();
    }
  } catch (error) {
    console.error("Update check failed:", error);
  }
}
checkForAppUpdates();
*/

if (windowLabel.startsWith("capture-overlay-")) {
  const monitorIndex = parseInt(windowLabel.split("-")[2], 10) || 0;
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <Overlay monitorIndex={monitorIndex} />
    </React.StrictMode>
  );
} else {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <AppProvider>
          <AppRoutes />
        </AppProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
}