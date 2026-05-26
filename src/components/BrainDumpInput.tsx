import { useState, useEffect, useRef, FormEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { Paper, TextInput, Text, Group } from "@mantine/core";
import { IconBrain, IconCornerDownLeft } from "@tabler/icons-react";

export function BrainDumpInput() {
  const [inputValue, setInputValue] = useState("");
  const [statusMessage, setStatusMessage] = useState("Nhập ý tưởng hoặc việc cần làm và nhấn Enter...");
  const inputRef = useRef<HTMLInputElement>(null);

  // Setup event listener to hide window when it loses focus (onBlur)
  useEffect(() => {
    const handleBlur = async () => {
      try {
        const window = getCurrentWindow();
        await window.hide();
      } catch (err) {
        console.error("Failed to hide window on blur:", err);
      }
    };

    // Listen to Tauri's native window blur event
    let unlisten: any;
    const setupListener = async () => {
      try {
        const window = getCurrentWindow();
        unlisten = await window.onFocusChanged(({ payload: focused }) => {
          if (!focused) {
            handleBlur();
          }
        });
      } catch (err) {
        console.error("Failed to register focus change listener:", err);
      }
    };

    setupListener();
    
    // Auto-focus input on mount
    if (inputRef.current) {
      inputRef.current.focus();
    }

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    setStatusMessage("⚡ Đang phân tích...");

    try {
      // In Sprint 1, we save it as a simple task. In Sprint 4, we will hook it to the LLM.
      await invoke("create_task", {
        title: inputValue,
        priority: "medium",
      });

      setStatusMessage("✅ Đã ghi nhận thành công!");
      setInputValue("");
      
      // Short delay, then hide window
      setTimeout(async () => {
        try {
          const window = getCurrentWindow();
          await window.hide();
          setStatusMessage("Nhập ý tưởng hoặc việc cần làm và nhấn Enter...");
        } catch (err) {
          console.error(err);
        }
      }, 800);
    } catch (err) {
      console.error(err);
      setStatusMessage("❌ Có lỗi xảy ra khi ghi nhận.");
    }
  };

  return (
    <Paper
      radius={0}
      style={{
        height: "80px",
        width: "600px",
        background: "linear-gradient(135deg, #0e0e1a 0%, #151525 100%)",
        border: "2px solid #5c5fc8",
        boxSizing: "border-box",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0px 20px",
      }}
    >
      <form onSubmit={handleSubmit}>
        <Group justify="space-between" align="center">
          <IconBrain color="#748ffc" size={24} style={{ marginRight: "10px" }} />
          <TextInput
            ref={inputRef}
            placeholder="Viết mã nguồn cho dự án Oxide, độ ưu tiên cao..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            style={{ flex: 1 }}
            variant="unstyled"
            styles={{
              input: {
                color: "#ffffff",
                fontSize: "18px",
                fontFamily: "Inter, sans-serif",
                fontWeight: 500,
                border: "none",
                outline: "none",
                background: "transparent",
                padding: "0px",
              },
            }}
          />
          <Group gap={4}>
            <Text size="xs" color="dimmed" style={{ fontSize: "11px", backgroundColor: "#2b2b40", padding: "2px 6px", borderRadius: "4px" }}>
              ENTER
            </Text>
            <IconCornerDownLeft size={14} color="#868e96" />
          </Group>
        </Group>
      </form>
      <Text size="xs" color="dimmed" mt={4} style={{ fontSize: "11px", color: "#a0a0c0", fontFamily: "Inter, sans-serif" }}>
        {statusMessage}
      </Text>
    </Paper>
  );
}
