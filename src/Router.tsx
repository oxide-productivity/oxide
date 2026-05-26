import { useEffect, useState } from "react";
import { MainDashboard } from "./components/MainDashboard";
import { BlitzTimer } from "./components/BlitzTimer";
import { BrainDumpInput } from "./components/BrainDumpInput";

export function Router() {
  const [windowLabel, setWindowLabel] = useState<string>("main");

  useEffect(() => {
    const detectWindow = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const label = getCurrentWindow().label;
        setWindowLabel(label);
      } catch (err) {
        console.warn("Running outside of Tauri env, defaulting to 'main'");
      }
    };
    detectWindow();
  }, []);

  switch (windowLabel) {
    case "main":
      return <MainDashboard />;
    case "timer":
      return <BlitzTimer />;
    case "brain_dump":
      return <BrainDumpInput />;
    default:
      return <MainDashboard />;
  }
}
