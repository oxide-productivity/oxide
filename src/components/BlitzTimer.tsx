import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Paper, Text, Group, ActionIcon, Stack } from "@mantine/core";
import { IconPlayerPlay, IconPlayerPause, IconX, IconRefresh, IconAlertTriangle } from "@tabler/icons-react";

interface FocusSession {
  id: string;
  task_id: string;
  session_type: string;
  started_at: string;
  duration_seconds: number;
}

export function BlitzTimer() {
  const [session, setSession] = useState<FocusSession | null>(null);
  const [timeLeft, setTimeLeft] = useState(1500); // 25 minutes default
  const [isRunning, setIsRunning] = useState(false);
  const [sessionType, setSessionType] = useState<"focus" | "break">("focus");
  const [distractionWarning, setDistractionWarning] = useState<string | null>(null);

  // Keep track of total elapsed seconds during this active session
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // 1. Fetch active session when component mounts & listen to session-started events
  useEffect(() => {
    const fetchActiveSession = async () => {
      try {
        const active: FocusSession | null = await invoke("get_active_session");
        if (active) {
          setSession(active);
          setSessionType(active.session_type === "focus" ? "focus" : "break");
          setTimeLeft(active.session_type === "focus" ? 1500 : 300);
          setIsRunning(true);
          setElapsedSeconds(0);
        }
      } catch (err) {
        console.error("Failed to load active Pomodoro session:", err);
      }
    };

    fetchActiveSession();

    // Listen to session-started events emitted from the background
    const setupListener = async () => {
      const unlisten = await listen<string>("session-started", () => {
        fetchActiveSession();
      });
      return unlisten;
    };

    let unsub: any;
    setupListener().then((fn) => {
      unsub = fn;
    });

    return () => {
      if (unsub) unsub();
    };
  }, []);

  // 2. Listen to background distraction events from Rust (xdotool watcher)
  useEffect(() => {
    const setupListener = async () => {
      const unlisten = await listen<string>("focus-distraction", (event) => {
        setDistractionWarning(event.payload);
        
        // Play native warning audio using Web Audio API
        try {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const oscillator = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          
          oscillator.type = "sawtooth";
          oscillator.frequency.setValueAtTime(150, audioCtx.currentTime); // Low ominous buzz
          gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
          
          oscillator.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          
          oscillator.start();
          oscillator.stop(audioCtx.currentTime + 0.4); // 400ms alarm
        } catch (e) {
          console.warn("Audio Context blocked or failed:", e);
        }
      });
      return unlisten;
    };

    let unsub: any;
    setupListener().then((fn) => {
      unsub = fn;
    });

    return () => {
      if (unsub) unsub();
    };
  }, []);

  // Auto-clear distraction warning badge after 5 seconds
  useEffect(() => {
    if (distractionWarning) {
      const t = setTimeout(() => setDistractionWarning(null), 5000);
      return () => clearTimeout(t);
    }
  }, [distractionWarning]);

  // 3. Countdown timer logic
  useEffect(() => {
    let interval: any = null;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsRunning(false);
      handleFinishSession();
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft]);

  const handleFinishSession = async () => {
    if (session) {
      try {
        // Log finished focus session in SQLite & add 10 XP
        await invoke("end_focus_session", {
          sessionId: session.id,
          durationSeconds: elapsedSeconds,
          outcome: "completed",
        });
      } catch (err) {
        console.error("Failed to end focus session in DB:", err);
      }
    }
    
    // Switch to break automatically
    if (sessionType === "focus") {
      setSessionType("break");
      setTimeLeft(300); // 5 mins break
      setElapsedSeconds(0);
    } else {
      setSessionType("focus");
      setTimeLeft(1500);
      setElapsedSeconds(0);
    }
  };

  const handleInterruptSession = async () => {
    setIsRunning(false);
    if (session) {
      try {
        // Log interrupted focus session in SQLite
        await invoke("end_focus_session", {
          sessionId: session.id,
          durationSeconds: elapsedSeconds,
          outcome: "interrupted",
        });
      } catch (err) {
        console.error("Failed to interrupt session in DB:", err);
      }
    }
    setSession(null);
    handleClose();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleClose = async () => {
    try {
      const window = getCurrentWindow();
      await window.hide();
    } catch (err) {
      console.error("Failed to close timer window:", err);
    }
  };

  return (
    <Paper
      p="xs"
      radius={0}
      style={{
        height: "90px",
        width: "250px",
        background: distractionWarning
          ? "linear-gradient(135deg, #2b0000 0%, #1a0000 100%)"
          : "linear-gradient(135deg, #09090f 0%, #12121f 100%)",
        border: distractionWarning ? "1px solid #ff3e3e" : "1px solid #2f2f4f",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxSizing: "border-box",
        padding: "10px 15px",
        WebkitAppRegion: "drag",
        transition: "all 0.3s ease",
      }}
    >
      <Stack gap={1} style={{ flex: 1, WebkitAppRegion: "none" }}>
        {distractionWarning ? (
          <Group gap={4} align="center">
            <IconAlertTriangle size={10} color="#ff6b6b" />
            <Text
              size="xs"
              style={{
                color: "#ff6b6b",
                textTransform: "uppercase",
                fontWeight: 900,
                fontSize: "9px",
                animation: "flash 1s infinite alternate",
              }}
            >
              ⚠️ PHẠT: {distractionWarning.toUpperCase()}!
            </Text>
          </Group>
        ) : (
          <Text
            size="xs"
            style={{
              color: sessionType === "focus" ? "#ff6b6b" : "#51cf66",
              textTransform: "uppercase",
              fontWeight: 800,
              letterSpacing: "1px",
              fontSize: "10px",
            }}
          >
            {sessionType === "focus" ? "⚡ Focus Session" : "🍵 Short Break"}
          </Text>
        )}
        <Text
          style={{
            color: distractionWarning ? "#ff6b6b" : "#ffffff",
            fontFamily: "Outfit, monospace",
            fontSize: "28px",
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: "-0.5px",
          }}
        >
          {formatTime(timeLeft)}
        </Text>
      </Stack>

      <Group gap="xs" style={{ WebkitAppRegion: "none" }}>
        <ActionIcon
          size="md"
          radius="xl"
          color={isRunning ? "yellow" : "teal"}
          variant="filled"
          onClick={() => setIsRunning(!isRunning)}
        >
          {isRunning ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
        </ActionIcon>

        <ActionIcon
          size="md"
          radius="xl"
          color="gray"
          variant="light"
          onClick={() => {
            setIsRunning(false);
            setTimeLeft(sessionType === "focus" ? 1500 : 300);
            setElapsedSeconds(0);
          }}
        >
          <IconRefresh size={16} />
        </ActionIcon>

        <ActionIcon size="md" radius="xl" color="red" variant="subtle" onClick={handleInterruptSession}>
          <IconX size={16} />
        </ActionIcon>
      </Group>
    </Paper>
  );
}
