import { useState, useEffect, useRef, FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";
import {
  Container,
  Grid,
  Card,
  Text,
  Title,
  Button,
  Group,
  Stack,
  TextInput,
  Badge,
  ActionIcon,
  Select,
  Progress,
  Divider,
  Paper,
  Drawer,
  Modal,
  Checkbox,
  Tooltip,
} from "@mantine/core";
import {
  IconRocket,
  IconBrain,
  IconFlame,
  IconPlus,
  IconCheck,
  IconPlayerPlay,
  IconFolder,
  IconSettings,
  IconTrash,
  IconLink,
  IconExternalLink,
  IconEdit,
  IconCornerDownRight,
} from "@tabler/icons-react";

interface Project {
  id: string;
  name: string;
  color: string;
  icon: string | null;
}

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface Task {
  id: string;
  project_id: string | null;
  parent_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  estimated_duration: number;
  actual_duration: number;
  is_daily_focus: number;
}

interface TaskLink {
  id: string;
  task_id: string;
  title: string;
  url: string;
  auto_open: number;
}

interface TaskNode extends Task {
  children: TaskNode[];
}

interface UserStats {
  date: string;
  total_focus_seconds: number;
  tasks_completed_count: number;
  current_streak: number;
  experience_points: number;
}

export function MainDashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const [stats, setStats] = useState<UserStats>({
    date: "",
    total_focus_seconds: 0,
    tasks_completed_count: 0,
    current_streak: 0,
    experience_points: 0,
  });

  // Level-up celebration state
  const [levelUpModalOpen, setLevelUpModalOpen] = useState(false);
  const [celebrationLevel, setCelebrationLevel] = useState(1);
  const levelRef = useRef<number | null>(null);

  const playSound = (type: "celebrate" | "beep") => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = ctx.currentTime;
      if (type === "celebrate") {
        const playNote = (freq: number, start: number, duration: number) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.01, start);
          gain.gain.linearRampToValueAtTime(0.3, start + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.01, start + duration);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(start);
          osc.stop(start + duration);
        };
        playNote(261.63, now, 0.15); // C4
        playNote(329.63, now + 0.15, 0.15); // E4
        playNote(392.00, now + 0.3, 0.15); // G4
        playNote(523.25, now + 0.45, 0.4); // C5
      }
    } catch (err) {
      console.error("Audio Context error:", err);
    }
  };

  useEffect(() => {
    if (stats.experience_points !== undefined && stats.experience_points > 0) {
      const level = Math.floor(stats.experience_points / 100) + 1;
      if (levelRef.current !== null && level > levelRef.current) {
        playSound("celebrate");
        setCelebrationLevel(level);
        setLevelUpModalOpen(true);
      }
      levelRef.current = level;
    }
  }, [stats.experience_points]);

  // Form & Interaction states
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<string>("medium");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState("#4dabf7");

  // Project CRUD Modal States
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editProjName, setEditProjName] = useState("");
  const [editProjColor, setEditProjColor] = useState("");

  // Recursive Subtask Active States
  const [activeSubtaskParentId, setActiveSubtaskParentId] = useState<string | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  // Task Drawer states
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [taskTags, setTaskTags] = useState<Tag[]>([]);
  const [taskLinks, setTaskLinks] = useState<TaskLink[]>([]);

  // Add Link form state
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkAutoOpen, setNewLinkAutoOpen] = useState(true);

  // Create Tag form state
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#fab005");

  // Load projects, tags, and tasks from SQLite
  const loadData = async () => {
    try {
      const projs: Project[] = await invoke("get_projects");
      setProjects(projs);

      const tsks: Task[] = await invoke("get_tasks", {
        project_id: selectedProjectId || undefined,
      });
      setTasks(tsks);

      const tagsList: Tag[] = await invoke("get_tags");
      setAllTags(tagsList);

      // If drawer is open and a task is selected, reload drawer items
      if (selectedTask) {
        const updatedTask = tsks.find((t) => t.id === selectedTask.id);
        if (updatedTask) {
          setSelectedTask(updatedTask);
        }
        await loadDrawerDetails(selectedTask.id);
      }
    } catch (error) {
      console.error("Failed to load SQLite data:", error);
    }
  };

  const loadDrawerDetails = async (taskId: string) => {
    try {
      const tags: Tag[] = await invoke("get_task_tags", { task_id: taskId });
      setTaskTags(tags);

      const links: TaskLink[] = await invoke("get_task_links", { task_id: taskId });
      setTaskLinks(links);
    } catch (err) {
      console.error("Failed to load task drawer details:", err);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedProjectId]);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data: UserStats = await invoke("get_user_stats");
        setStats(data);
      } catch (err) {
        console.error("Failed to load user stats:", err);
      }
    };
    loadStats();

    // Listen to stats-updated event from Rust backend
    const setupStatsListener = async () => {
      const unlisten = await listen<UserStats>("stats-updated", (event) => {
        setStats(event.payload);
        loadData();
      });
      return unlisten;
    };

    let unsub: any;
    setupStatsListener().then((fn) => {
      unsub = fn;
    });

    return () => {
      if (unsub) unsub().then((fn: any) => fn && fn());
    };
  }, []);

  // Create Project
  const handleCreateProject = async (e: FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    try {
      await invoke("create_project", {
        name: newProjectName,
        color: newProjectColor,
      });
      setNewProjectName("");
      loadData();
    } catch (err) {
      console.error("Failed to create project:", err);
    }
  };

  // Update Project
  const handleUpdateProject = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingProject || !editProjName.trim()) return;
    try {
      await invoke("update_project", {
        id: editingProject.id,
        name: editProjName,
        color: editProjColor,
      });
      setEditingProject(null);
      loadData();
    } catch (err) {
      console.error("Failed to update project:", err);
    }
  };

  // Delete Project
  const handleDeleteProject = async (projectId: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa/lưu trữ dự án này? Tất cả các nhiệm vụ thuộc dự án sẽ bị tách khỏi dự án.")) return;
    try {
      await invoke("delete_project", { id: projectId });
      setEditingProject(null);
      if (selectedProjectId === projectId) {
        setSelectedProjectId(null);
      }
      loadData();
    } catch (err) {
      console.error("Failed to delete project:", err);
    }
  };

  // Create Root Task
  const handleCreateTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    try {
      await invoke("create_task", {
        title: newTaskTitle,
        project_id: selectedProjectId,
        parent_id: null,
        priority: newTaskPriority,
        estimated_duration: 1800, // default 30 mins
      });
      setNewTaskTitle("");
      loadData();
    } catch (err) {
      console.error("Failed to create task:", err);
    }
  };

  // Create Subtask
  const handleCreateSubtask = async (e: FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim() || !activeSubtaskParentId) return;
    try {
      await invoke("create_task", {
        title: newSubtaskTitle,
        project_id: selectedProjectId,
        parent_id: activeSubtaskParentId,
        priority: "medium",
        estimated_duration: 1800,
      });
      setNewSubtaskTitle("");
      setActiveSubtaskParentId(null);
      loadData();
    } catch (err) {
      console.error("Failed to create subtask:", err);
    }
  };

  // Delete Task
  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa nhiệm vụ này? Toàn bộ nhiệm vụ con liên đới cũng sẽ bị xóa.")) return;
    try {
      await invoke("delete_task", { id: taskId });
      if (selectedTask?.id === taskId) {
        setIsDrawerOpen(false);
        setSelectedTask(null);
      }
      loadData();
    } catch (err) {
      console.error("Failed to delete task:", err);
    }
  };

  // Task Links management
  const handleAddTaskLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !newLinkTitle.trim() || !newLinkUrl.trim()) return;
    try {
      await invoke("add_task_link", {
        task_id: selectedTask.id,
        title: newLinkTitle,
        url: newLinkUrl,
        auto_open: newLinkAutoOpen,
      });
      setNewLinkTitle("");
      setNewLinkUrl("");
      loadDrawerDetails(selectedTask.id);
    } catch (err) {
      console.error("Failed to add task link:", err);
    }
  };

  const handleDeleteTaskLink = async (linkId: string) => {
    if (!selectedTask) return;
    try {
      await invoke("delete_task_link", { link_id: linkId });
      loadDrawerDetails(selectedTask.id);
    } catch (err) {
      console.error("Failed to delete task link:", err);
    }
  };

  // Tags management
  const handleCreateTag = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    try {
      await invoke("create_tag", {
        name: newTagName,
        color: newTagColor,
      });
      setNewTagName("");
      loadData();
    } catch (err) {
      console.error("Failed to create tag:", err);
    }
  };

  const handleAssignTag = async (tagId: string) => {
    if (!selectedTask) return;
    try {
      await invoke("assign_tag_to_task", {
        task_id: selectedTask.id,
        tag_id: tagId,
      });
      loadDrawerDetails(selectedTask.id);
    } catch (err) {
      console.error("Failed to assign tag:", err);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!selectedTask) return;
    try {
      await invoke("remove_tag_from_task", {
        task_id: selectedTask.id,
        tag_id: tagId,
      });
      loadDrawerDetails(selectedTask.id);
    } catch (err) {
      console.error("Failed to remove tag:", err);
    }
  };

  // Open Task Drawer Detail
  const handleOpenDrawer = async (task: Task) => {
    setSelectedTask(task);
    setIsDrawerOpen(true);
    await loadDrawerDetails(task.id);
  };

  // Blitz Focus system execution
  const startFocusTimer = async (task: Task) => {
    try {
      // 1. Start the SQLite Focus Session and active-window distraction tracking in background
      await invoke("start_focus_session", {
        task_id: task.id,
        session_type: "focus",
      });

      // 2. Run Blitz Trigger to launch auto-open links in background natively via Rust
      await invoke("execute_blitz_trigger", { task_id: task.id });

      // 3. Open / Show the borderless Blitz Timer window
      const timerWindow = await WebviewWindow.getByLabel("timer");
      if (timerWindow) {
        // Delay to allow the default browser to boot and avoid drawing focus away from the timer
        setTimeout(async () => {
          await timerWindow.show();
          await timerWindow.setFocus();
        }, 600);
      }
    } catch (err) {
      console.error("Failed to execute Blitz focus trigger:", err);
    }
  };

  // Build recursive tree in memory
  const taskTree = buildTaskTree(tasks);

  function buildTaskTree(flatTasks: Task[]): TaskNode[] {
    const map = new Map<string, TaskNode>();
    const roots: TaskNode[] = [];

    flatTasks.forEach((task) => map.set(task.id, { ...task, children: [] }));
    flatTasks.forEach((task) => {
      const node = map.get(task.id)!;
      if (task.parent_id) {
        const parent = map.get(task.parent_id);
        if (parent) {
          parent.children.push(node);
        } else {
          roots.push(node); // Fallback for orphans
        }
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  // Recursive Task Component
  const renderTaskNode = (node: TaskNode, level: number = 0) => {
    const priorityColor =
      node.priority === "urgent"
        ? "red"
        : node.priority === "high"
        ? "orange"
        : node.priority === "medium"
        ? "yellow"
        : "gray";

    return (
      <Stack gap="xs" key={node.id}>
        <Paper
          p="xs"
          radius="sm"
          style={{
            background: "#1e1e24",
            border: "1px solid #2e2e38",
            marginLeft: `${level * 24}px`,
            position: "relative",
            transition: "all 0.2s ease",
            borderColor: activeSubtaskParentId === node.id ? "#748ffc" : "#2e2e38",
          }}
          styles={{
            root: {
              "&:hover": {
                borderColor: "#5c5fc8",
                transform: "translateX(2px)",
              },
            },
          }}
        >
          {/* Thread Line connecting subtasks visually */}
          {level > 0 && (
            <div
              style={{
                position: "absolute",
                left: "-16px",
                top: "-10px",
                bottom: "50%",
                width: "12px",
                borderLeft: "2px solid #373a40",
                borderBottom: "2px solid #373a40",
                borderBottomLeftRadius: "6px",
                pointerEvents: "none",
              }}
            />
          )}

          <Group justify="space-between" align="center" wrap="wrap">
            <Group gap="sm" style={{ flex: 1 }}>
              <ActionIcon color="teal" variant="light" radius="xl" size="sm">
                <IconCheck size={14} />
              </ActionIcon>
              <div>
                <Group gap="xs">
                  {level > 0 && <IconCornerDownRight size={14} color="#868e96" />}
                  <Text style={{ fontWeight: 600, color: "#fff", fontSize: "14px" }}>
                    {node.title}
                  </Text>
                </Group>
                {node.description && (
                  <Text size="xs" color="dimmed" mt={2} ml={level > 0 ? 18 : 0}>
                    {node.description}
                  </Text>
                )}
              </div>
            </Group>

            <Group gap="xs">
              <Badge color={priorityColor} variant="dot" size="xs">
                {node.priority.toUpperCase()}
              </Badge>

              <Tooltip label="Blitz Focus">
                <ActionIcon
                  size="sm"
                  color="indigo"
                  variant="filled"
                  onClick={() => startFocusTimer(node)}
                >
                  <IconPlayerPlay size={12} />
                </ActionIcon>
              </Tooltip>

              <Tooltip label="Thêm subtask">
                <ActionIcon
                  size="sm"
                  color="blue"
                  variant="light"
                  onClick={() => {
                    setActiveSubtaskParentId(node.id);
                    setNewSubtaskTitle("");
                  }}
                >
                  <IconPlus size={12} />
                </ActionIcon>
              </Tooltip>

              <Tooltip label="Chi tiết & Nhãn">
                <ActionIcon
                  size="sm"
                  color="gray"
                  variant="light"
                  onClick={() => handleOpenDrawer(node)}
                >
                  <IconSettings size={12} />
                </ActionIcon>
              </Tooltip>

              <Tooltip label="Xóa">
                <ActionIcon
                  size="sm"
                  color="red"
                  variant="subtle"
                  onClick={() => handleDeleteTask(node.id)}
                >
                  <IconTrash size={12} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </Paper>

        {/* Inline Subtask Input Form */}
        {activeSubtaskParentId === node.id && (
          <Paper
            p="xs"
            radius="sm"
            style={{
              background: "#16161c",
              border: "1px dashed #748ffc",
              marginLeft: `${(level + 1) * 24}px`,
            }}
          >
            <form onSubmit={handleCreateSubtask}>
              <Group gap="xs">
                <TextInput
                  placeholder="Nhập nhiệm vụ con..."
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  style={{ flex: 1 }}
                  styles={{
                    input: {
                      backgroundColor: "#1e1e24",
                      borderColor: "#373a40",
                      color: "#fff",
                      height: "28px",
                      fontSize: "12px",
                    },
                  }}
                  autoFocus
                />
                <Button size="xs" type="submit" color="indigo" h={28}>
                  Thêm
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  color="gray"
                  h={28}
                  onClick={() => setActiveSubtaskParentId(null)}
                >
                  Hủy
                </Button>
              </Group>
            </form>
          </Paper>
        )}

        {/* Render nested children recursively */}
        {node.children.map((child) => renderTaskNode(child, level + 1))}
      </Stack>
    );
  };

  const totalFocusTime = stats.total_focus_seconds;
  const experiencePoints = stats.experience_points;
  const currentStreak = stats.current_streak;

  const level = Math.floor(experiencePoints / 100) + 1;
  const xpProgress = experiencePoints % 100;

  return (
    <Container size="xl" py="md" style={{ color: "#e2e8f0" }}>
      {/* Gamified Header */}
      <Grid mb="lg">
        <Grid.Col span={12}>
          <Paper
            p="md"
            radius="md"
            style={{
              background: "linear-gradient(135deg, #10111a 0%, #171825 100%)",
              border: "1px solid #232536",
            }}
          >
            <Group justify="space-between">
              <div>
                <Group gap="xs">
                  <IconRocket color="#4dabf7" size={32} />
                  <Title order={2} style={{ color: "#fff", fontFamily: "Outfit, sans-serif" }}>
                    OXIDE WORKSPACE
                  </Title>
                </Group>
                <Text size="sm" color="dimmed" mt={4}>
                  Bàn làm việc Local-first tập trung cao độ & Game hóa thành tích
                </Text>
              </div>

              {/* Stats Widgets */}
              <Group gap="lg">
                <Paper p="xs" radius="sm" style={{ background: "#1c1c24", border: "1px solid #2e2e3c" }}>
                  <Group gap="xs">
                    <IconFlame color="#ff922b" size={24} />
                    <div>
                      <Text size="xs" color="dimmed" style={{ textTransform: "uppercase", fontWeight: 700 }}>
                        Streak
                      </Text>
                      <Text size="sm" style={{ fontWeight: 800, color: "#ff922b" }}>
                        {currentStreak} ngày
                      </Text>
                    </div>
                  </Group>
                </Paper>

                <Paper p="xs" radius="sm" style={{ background: "#1c1c24", border: "1px solid #2e2e3c" }}>
                  <Group gap="xs">
                    <IconBrain color="#be4bdb" size={24} />
                    <div>
                      <Text size="xs" color="dimmed" style={{ textTransform: "uppercase", fontWeight: 700 }}>
                        Kinh nghiệm (XP)
                      </Text>
                      <Text size="sm" style={{ fontWeight: 800, color: "#be4bdb" }}>
                        {experiencePoints} XP
                      </Text>
                    </div>
                  </Group>
                </Paper>
              </Group>
            </Group>

            <Divider my="md" style={{ borderColor: "#232536" }} />

            <Group justify="space-between">
              <Text size="sm" style={{ color: "#a0a0c0" }}>
                Hôm nay: <strong style={{ color: "#fff" }}>{Math.floor(totalFocusTime / 60)} phút</strong> tập trung.
              </Text>
              <Group gap="xs">
                <Text size="xs" style={{ color: "#a0a0c0", fontWeight: 700, fontFamily: "Outfit, sans-serif" }}>
                  Cấp độ {level} ({xpProgress}/100 XP)
                </Text>
                <Progress value={xpProgress} w={200} color="indigo" size="sm" radius="xl" striped animated />
              </Group>
            </Group>
          </Paper>
        </Grid.Col>
      </Grid>

      {/* Main Layout */}
      <Grid gap="md">
        {/* Left column: Projects Sidebar */}
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="md">
            <Card p="md" radius="md" style={{ backgroundColor: "#14141c", border: "1px solid #222330" }}>
              <Title order={4} mb="xs" style={{ color: "#fff" }}>
                Dự án (Projects)
              </Title>

              <Stack gap="xs" mb="md">
                <Button
                  variant={selectedProjectId === null ? "filled" : "light"}
                  color="indigo"
                  onClick={() => setSelectedProjectId(null)}
                  leftSection={<IconFolder size={18} />}
                  justify="flex-start"
                  fullWidth
                >
                  Tất cả công việc
                </Button>

                {projects.map((p) => (
                  <Group key={p.id} gap={4} wrap="nowrap" style={{ width: "100%" }}>
                    <Button
                      variant={selectedProjectId === p.id ? "filled" : "light"}
                      color="gray"
                      style={{
                        flex: 1,
                        backgroundColor: selectedProjectId === p.id ? p.color : "rgba(28,28,36,0.8)",
                        color: selectedProjectId === p.id ? "#000" : "#fff",
                        border: `1px solid ${p.color}`,
                        transition: "all 0.2s ease",
                      }}
                      onClick={() => setSelectedProjectId(p.id)}
                      leftSection={<IconFolder size={18} />}
                      justify="flex-start"
                    >
                      {p.name}
                    </Button>
                    <ActionIcon
                      variant="light"
                      color="gray"
                      size={36}
                      onClick={() => {
                        setEditingProject(p);
                        setEditProjName(p.name);
                        setEditProjColor(p.color);
                      }}
                    >
                      <IconEdit size={16} />
                    </ActionIcon>
                  </Group>
                ))}
              </Stack>

              {/* Add Project Form */}
              <form onSubmit={handleCreateProject}>
                <Divider my="sm" style={{ borderColor: "#222330" }} />
                <Group gap="xs">
                  <TextInput
                    placeholder="Dự án mới..."
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    style={{ flex: 1 }}
                    styles={{ input: { backgroundColor: "#1c1c24", borderColor: "#2e2e3c", color: "#fff" } }}
                  />
                  <input
                    type="color"
                    value={newProjectColor}
                    onChange={(e) => setNewProjectColor(e.target.value)}
                    style={{
                      width: "36px",
                      height: "36px",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      backgroundColor: "transparent",
                    }}
                  />
                  <ActionIcon type="submit" color="indigo" size={36}>
                    <IconPlus size={18} />
                  </ActionIcon>
                </Group>
              </form>
            </Card>

            {/* Quick Tag Generator on Sidebar */}
            <Card p="md" radius="md" style={{ backgroundColor: "#14141c", border: "1px solid #222330" }}>
              <Title order={4} mb="xs" style={{ color: "#fff" }}>
                Nhãn phân loại (Tags)
              </Title>
              <Group gap="xs" mb="sm">
                {allTags.map((tag) => (
                  <Badge
                    key={tag.id}
                    style={{
                      backgroundColor: tag.color,
                      color: "#000",
                      fontWeight: 600,
                    }}
                  >
                    {tag.name}
                  </Badge>
                ))}
              </Group>
              <form onSubmit={handleCreateTag}>
                <Group gap="xs">
                  <TextInput
                    placeholder="Tên nhãn..."
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    style={{ flex: 1 }}
                    styles={{ input: { backgroundColor: "#1c1c24", borderColor: "#2e2e3c", color: "#fff", height: "30px", fontSize: "12px" } }}
                  />
                  <input
                    type="color"
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    style={{
                      width: "30px",
                      height: "30px",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      backgroundColor: "transparent",
                    }}
                  />
                  <ActionIcon type="submit" color="indigo" size={30}>
                    <IconPlus size={14} />
                  </ActionIcon>
                </Group>
              </form>
            </Card>
          </Stack>
        </Grid.Col>

        {/* Right column: Tasks Tree */}
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Card p="md" radius="md" style={{ backgroundColor: "#14141c", border: "1px solid #222330" }}>
            <Group justify="space-between" mb="md">
              <Title order={3} style={{ color: "#fff" }}>
                {selectedProjectId
                  ? `Nhiệm vụ: ${projects.find((p) => p.id === selectedProjectId)?.name}`
                  : "Tất cả nhiệm vụ"}
              </Title>
              <Badge color="indigo" size="lg">
                {tasks.length} tasks
              </Badge>
            </Group>

            {/* Quick Add Task Form */}
            <form onSubmit={handleCreateTask} style={{ marginBottom: "20px" }}>
              <Grid gap="xs">
                <Grid.Col span={{ base: 12, sm: 7 }}>
                  <TextInput
                    placeholder="Thêm việc cần làm hôm nay..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    styles={{ input: { backgroundColor: "#1c1c24", borderColor: "#2e2e3c", color: "#fff" } }}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 6, sm: 3 }}>
                  <Select
                    value={newTaskPriority}
                    onChange={(val) => setNewTaskPriority(val || "medium")}
                    data={[
                      { value: "low", label: "Priority: Low 🟢" },
                      { value: "medium", label: "Priority: Medium 🟡" },
                      { value: "high", label: "Priority: High 🔴" },
                      { value: "urgent", label: "Priority: Urgent ⚡" },
                    ]}
                    styles={{
                      dropdown: { backgroundColor: "#1c1c24", borderColor: "#2e2e3c" },
                      input: { backgroundColor: "#1c1c24", borderColor: "#2e2e3c", color: "#fff" },
                    }}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 6, sm: 2 }}>
                  <Button type="submit" color="indigo" fullWidth leftSection={<IconPlus size={18} />}>
                    Thêm
                  </Button>
                </Grid.Col>
              </Grid>
            </form>

            <Divider my="md" style={{ borderColor: "#222330" }} />

            {/* Render recursive Tree */}
            <Stack gap="xs">
              {taskTree.length === 0 ? (
                <Paper p="xl" radius="md" style={{ background: "rgba(28,28,36,0.3)", border: "1px dashed #2e2e3c", textAlign: "center" }}>
                  <Text color="dimmed">Không có nhiệm vụ nào. Thêm một nhiệm vụ để bắt đầu!</Text>
                </Paper>
              ) : (
                taskTree.map((node) => renderTaskNode(node, 0))
              )}
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>

      {/* Project Edit Modal */}
      <Modal
        opened={editingProject !== null}
        onClose={() => setEditingProject(null)}
        title="Cấu hình Dự án"
        centered
        styles={{
          content: { backgroundColor: "#14141c", border: "1px solid #2e2e3c" },
          header: { backgroundColor: "#14141c", color: "#fff" },
        }}
      >
        <form onSubmit={handleUpdateProject}>
          <Stack gap="md">
            <TextInput
              label="Tên dự án"
              placeholder="Tên dự án..."
              value={editProjName}
              onChange={(e) => setEditProjName(e.target.value)}
              styles={{
                input: { backgroundColor: "#1c1c24", borderColor: "#2e2e3c", color: "#fff" },
                label: { color: "#aaa" },
              }}
              required
            />
            <Group align="flex-end">
              <div style={{ flex: 1 }}>
                <Text size="sm" color="#aaa" mb={4}>
                  Màu đại diện
                </Text>
                <TextInput
                  value={editProjColor}
                  onChange={(e) => setEditProjColor(e.target.value)}
                  styles={{ input: { backgroundColor: "#1c1c24", borderColor: "#2e2e3c", color: "#fff" } }}
                />
              </div>
              <input
                type="color"
                value={editProjColor}
                onChange={(e) => setEditProjColor(e.target.value)}
                style={{
                  width: "36px",
                  height: "36px",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              />
            </Group>

            <Group justify="space-between" mt="md">
              <Button
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={16} />}
                onClick={() => editingProject && handleDeleteProject(editingProject.id)}
              >
                Xóa dự án
              </Button>
              <Group gap="xs">
                <Button variant="outline" color="gray" onClick={() => setEditingProject(null)}>
                  Hủy
                </Button>
                <Button type="submit" color="indigo">
                  Cập nhật
                </Button>
              </Group>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* RPG LEVEL UP CELEBRATION MODAL */}
      <Modal
        opened={levelUpModalOpen}
        onClose={() => setLevelUpModalOpen(false)}
        withCloseButton={false}
        centered
        size="md"
        radius="lg"
        overlayProps={{
          backgroundOpacity: 0.85,
          blur: 8,
        }}
        styles={{
          content: {
            background: "linear-gradient(135deg, #15152a 0%, #0e0e18 100%)",
            border: "2px solid #fab005",
            padding: "30px",
            boxShadow: "0 0 30px rgba(250, 176, 5, 0.4)",
          }
        }}
      >
        <style>{`
          @keyframes bounce {
            0% { transform: translateY(0); }
            100% { transform: translateY(-10px); }
          }
        `}</style>
        <Stack align="center" gap="lg" style={{ textAlign: "center" }}>
          <div style={{
            fontSize: "64px",
            animation: "bounce 0.6s infinite alternate ease-in-out",
          }}>
            🏆
          </div>
          
          <Title order={2} style={{ color: "#fab005", fontFamily: "Outfit, sans-serif", fontWeight: 800, letterSpacing: "1px" }}>
            LEVEL UP!
          </Title>

          <Text style={{ color: "#ffffff", fontSize: "18px", fontWeight: 600 }}>
            Chúc mừng bạn đã đạt đến Cấp độ mới!
          </Text>

          <div style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100px",
            height: "100px",
            borderRadius: "50%",
            background: "rgba(250, 176, 5, 0.15)",
            border: "3px solid #fab005",
            color: "#fab005",
            fontSize: "36px",
            fontWeight: 800,
            margin: "10px 0px",
            boxShadow: "0 0 15px rgba(250, 176, 5, 0.2)"
          }}>
            {celebrationLevel}
          </div>

          <Text size="sm" style={{ color: "#a0a0c0", maxWidth: "300px" }}>
            Mỗi level tăng thêm chứng minh sự tập trung sâu vượt bậc và hiệu suất công việc tuyệt vời của bạn! Keep moving forward! ⚡
          </Text>

          <Button
            color="yellow"
            variant="light"
            size="md"
            fullWidth
            onClick={() => setLevelUpModalOpen(false)}
            style={{ fontWeight: 700 }}
          >
            Tiếp tục tập trung!
          </Button>
        </Stack>
      </Modal>

      {/* Task Settings & Details Drawer */}
      <Drawer
        opened={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedTask(null);
        }}
        title={
          <Group gap="xs">
            <IconSettings size={22} color="#748ffc" />
            <Text style={{ fontWeight: 800, fontSize: "18px", color: "#fff" }}>Chi tiết Nhiệm vụ</Text>
          </Group>
        }
        position="right"
        size="md"
        styles={{
          content: { backgroundColor: "#101015", color: "#e2e8f0", borderLeft: "1px solid #2e2e3c" },
          header: { backgroundColor: "#101015", color: "#fff" },
        }}
      >
        {selectedTask && (
          <Stack gap="lg" py="md">
            <div>
              <Text size="xs" color="dimmed" style={{ textTransform: "uppercase", fontWeight: 700 }}>
                Tiêu đề
              </Text>
              <Text size="md" style={{ color: "#fff", fontWeight: 600, marginTop: "4px" }}>
                {selectedTask.title}
              </Text>
            </div>

            {/* Tags section */}
            <div>
              <Text size="xs" color="dimmed" style={{ textTransform: "uppercase", fontWeight: 700 }} mb="xs">
                Nhãn của nhiệm vụ (Tags)
              </Text>
              <Group gap="xs" mb="sm">
                {taskTags.length === 0 ? (
                  <Text size="xs" color="dimmed">
                    Chưa gán nhãn nào.
                  </Text>
                ) : (
                  taskTags.map((tag) => (
                    <Badge
                      key={tag.id}
                      style={{
                        backgroundColor: tag.color,
                        color: "#000",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                      rightSection={
                        <span
                          style={{ marginLeft: "4px", fontSize: "10px", fontWeight: "bold" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveTag(tag.id);
                          }}
                        >
                          ×
                        </span>
                      }
                    >
                      {tag.name}
                    </Badge>
                  ))
                )}
              </Group>

              {/* Add existing tag list */}
              <Text size="xs" color="#aaa" mb="xs">
                Gán thêm nhãn có sẵn:
              </Text>
              <Group gap="xs">
                {allTags
                  .filter((t) => !taskTags.some((curr) => curr.id === t.id))
                  .map((tag) => (
                    <Badge
                      key={tag.id}
                      style={{
                        backgroundColor: "rgba(28,28,36,0.9)",
                        color: tag.color,
                        border: `1px solid ${tag.color}`,
                        cursor: "pointer",
                        opacity: 0.8,
                      }}
                      onClick={() => handleAssignTag(tag.id)}
                    >
                      + {tag.name}
                    </Badge>
                  ))}
              </Group>
            </div>

            <Divider style={{ borderColor: "#222330" }} />

            {/* Blitz Automation Links section */}
            <div>
              <Group justify="space-between" mb="xs">
                <Text size="xs" color="dimmed" style={{ textTransform: "uppercase", fontWeight: 700 }}>
                  Tự động mở Link khi Focus (Blitz Mode)
                </Text>
                <IconLink size={16} color="#748ffc" />
              </Group>

              {/* List Links */}
              <Stack gap="xs" mb="md">
                {taskLinks.length === 0 ? (
                  <Text size="xs" color="dimmed">
                    Chưa cấu hình tự động mở link.
                  </Text>
                ) : (
                  taskLinks.map((link) => (
                    <Paper key={link.id} p="xs" radius="sm" style={{ backgroundColor: "#1c1c24", border: "1px solid #2e2e3c" }}>
                      <Group justify="space-between">
                        <div>
                          <Group gap="xs">
                            <Text size="sm" style={{ fontWeight: 600, color: "#fff" }}>
                              {link.title}
                            </Text>
                            {link.auto_open === 1 && (
                              <Badge color="red" size="xs" variant="filled">
                                AUTO OPEN ⚡
                              </Badge>
                            )}
                          </Group>
                          <Text size="xs" color="dimmed" style={{ wordBreak: "break-all" }}>
                            {link.url}
                          </Text>
                        </div>
                        <Group gap={6}>
                          <ActionIcon
                            size="sm"
                            color="gray"
                            variant="light"
                            onClick={() => window.open(link.url, "_blank")}
                          >
                            <IconExternalLink size={12} />
                          </ActionIcon>
                          <ActionIcon
                            size="sm"
                            color="red"
                            variant="light"
                            onClick={() => handleDeleteTaskLink(link.id)}
                          >
                            <IconTrash size={12} />
                          </ActionIcon>
                        </Group>
                      </Group>
                    </Paper>
                  ))
                )}
              </Stack>

              {/* Add Link Form */}
              <Paper p="xs" radius="sm" style={{ backgroundColor: "#15151e", border: "1px dashed #2e2e3c" }}>
                <form onSubmit={handleAddTaskLink}>
                  <Stack gap="xs">
                    <TextInput
                      placeholder="Tiêu đề link (e.g. Tài liệu API, Repo...)"
                      value={newLinkTitle}
                      onChange={(e) => setNewLinkTitle(e.target.value)}
                      styles={{ input: { backgroundColor: "#1e1e24", borderColor: "#2e2e3c", color: "#fff", height: "28px", fontSize: "12px" } }}
                      required
                    />
                    <TextInput
                      placeholder="Địa chỉ URL (https://...)"
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                      styles={{ input: { backgroundColor: "#1e1e24", borderColor: "#2e2e3c", color: "#fff", height: "28px", fontSize: "12px" } }}
                      required
                    />
                    <Checkbox
                      label="Mở tự động khi bấm nút Focus"
                      checked={newLinkAutoOpen}
                      onChange={(e) => setNewLinkAutoOpen(e.currentTarget.checked)}
                      styles={{ label: { color: "#aaa", fontSize: "12px" } }}
                    />
                    <Button type="submit" color="indigo" size="xs" fullWidth leftSection={<IconPlus size={12} />}>
                      Thêm liên kết tự động
                    </Button>
                  </Stack>
                </form>
              </Paper>
            </div>
          </Stack>
        )}
      </Drawer>
    </Container>
  );
}
