use tauri::{State, Emitter, Manager};
use crate::database::DbState;
use crate::models::{Project, Task, Tag, TaskLink, UserStats};
use ulid::Ulid;
use chrono::Utc;

// --- GREET COMMAND ---
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// --- PROJECT COMMANDS ---
#[tauri::command]
pub async fn get_projects(db_state: State<'_, DbState>) -> Result<Vec<Project>, String> {
    let conn = db_state.0.lock().map_err(|e| format!("Failed to lock database: {}", e))?;
    let mut stmt = conn
        .prepare("SELECT id, name, color, icon, position, is_archived, created_at, updated_at FROM projects WHERE is_archived = 0 ORDER BY position ASC")
        .map_err(|e| format!("Failed to prepare SQL: {}", e))?;

    let project_iter = stmt
        .query_map([], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                icon: row.get(3)?,
                position: row.get(4)?,
                is_archived: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|e| format!("Failed to query projects: {}", e))?;

    let mut projects = Vec::new();
    for project in project_iter {
        projects.push(project.map_err(|e| format!("Failed to parse project row: {}", e))?);
    }

    Ok(projects)
}

#[tauri::command]
pub async fn create_project(
    db_state: State<'_, DbState>,
    name: String,
    color: Option<String>,
    icon: Option<String>,
) -> Result<Project, String> {
    let conn = db_state.0.lock().map_err(|e| format!("Failed to lock database: {}", e))?;
    let id = Ulid::new().to_string();
    let now = Utc::now().to_rfc3339();
    let default_color = color.unwrap_or_else(|| "#4dabf7".to_string());
    
    let mut stmt = conn.prepare("SELECT COALESCE(MAX(position), 0) FROM projects")
        .map_err(|e| format!("Failed to prepare position SQL: {}", e))?;
    let max_pos: i32 = stmt.query_row([], |row| row.get(0))
        .unwrap_or(0);
    let position = max_pos + 1;

    conn.execute(
        "INSERT INTO projects (id, name, color, icon, position, is_archived, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7)",
        (
            &id,
            &name,
            &default_color,
            &icon,
            position,
            &now,
            &now,
        ),
    )
    .map_err(|e| format!("Failed to insert project: {}", e))?;

    Ok(Project {
        id,
        name,
        color: Some(default_color),
        icon,
        position,
        is_archived: 0,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub async fn update_project(
    db_state: State<'_, DbState>,
    id: String,
    name: String,
    color: String,
) -> Result<(), String> {
    let conn = db_state.0.lock().map_err(|e| format!("Failed to lock database: {}", e))?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE projects SET name = ?1, color = ?2, updated_at = ?3 WHERE id = ?4",
        (&name, &color, &now, &id),
    )
    .map_err(|e| format!("Failed to update project: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn delete_project(db_state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = db_state.0.lock().map_err(|e| format!("Failed to lock database: {}", e))?;

    // Hard delete or archive: let's archive to preserve integrity or hard delete since we have ON DELETE SET NULL configured.
    // Let's archive so we don't accidentally lose tasks, or delete if requested. The schema says is_archived.
    conn.execute(
        "UPDATE projects SET is_archived = 1 WHERE id = ?",
        [&id],
    )
    .map_err(|e| format!("Failed to delete/archive project: {}", e))?;

    Ok(())
}


// --- TAG COMMANDS ---
#[tauri::command]
pub async fn get_tags(db_state: State<'_, DbState>) -> Result<Vec<Tag>, String> {
    let conn = db_state.0.lock().map_err(|e| format!("Failed to lock database: {}", e))?;
    let mut stmt = conn
        .prepare("SELECT id, name, color, created_at FROM tags ORDER BY name ASC")
        .map_err(|e| format!("Failed to prepare SQL: {}", e))?;

    let tag_iter = stmt
        .query_map([], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| format!("Failed to query tags: {}", e))?;

    let mut tags = Vec::new();
    for tag in tag_iter {
        tags.push(tag.map_err(|e| format!("Failed to parse tag row: {}", e))?);
    }

    Ok(tags)
}

#[tauri::command]
pub async fn create_tag(db_state: State<'_, DbState>, name: String, color: String) -> Result<Tag, String> {
    let conn = db_state.0.lock().map_err(|e| format!("Failed to lock database: {}", e))?;
    let id = Ulid::new().to_string();
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO tags (id, name, color, created_at) VALUES (?1, ?2, ?3, ?4)",
        (&id, &name, &color, &now),
    )
    .map_err(|e| format!("Failed to insert tag: {}", e))?;

    Ok(Tag { id, name, color: Some(color), created_at: now })
}

#[tauri::command]
pub async fn assign_tag_to_task(db_state: State<'_, DbState>, task_id: String, tag_id: String) -> Result<(), String> {
    let conn = db_state.0.lock().map_err(|e| format!("Failed to lock database: {}", e))?;
    conn.execute(
        "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)",
        (&task_id, &tag_id),
    )
    .map_err(|e| format!("Failed to assign tag to task: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn remove_tag_from_task(db_state: State<'_, DbState>, task_id: String, tag_id: String) -> Result<(), String> {
    let conn = db_state.0.lock().map_err(|e| format!("Failed to lock database: {}", e))?;
    conn.execute(
        "DELETE FROM task_tags WHERE task_id = ? AND tag_id = ?",
        (&task_id, &tag_id),
    )
    .map_err(|e| format!("Failed to remove tag from task: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn get_task_tags(db_state: State<'_, DbState>, task_id: String) -> Result<Vec<Tag>, String> {
    let conn = db_state.0.lock().map_err(|e| format!("Failed to lock database: {}", e))?;
    let mut stmt = conn
        .prepare("
            SELECT t.id, t.name, t.color, t.created_at 
            FROM tags t
            INNER JOIN task_tags tt ON t.id = tt.tag_id
            WHERE tt.task_id = ?
        ")
        .map_err(|e| format!("Failed to prepare SQL: {}", e))?;

    let tag_iter = stmt
        .query_map([&task_id], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| format!("Failed to query task tags: {}", e))?;

    let mut tags = Vec::new();
    for tag in tag_iter {
        tags.push(tag.map_err(|e| format!("Failed to parse tag: {}", e))?);
    }

    Ok(tags)
}



// --- TASK COMMANDS ---
#[tauri::command]
pub async fn get_tasks(
    db_state: State<'_, DbState>,
    project_id: Option<String>,
    status: Option<String>,
) -> Result<Vec<Task>, String> {
    let conn = db_state.0.lock().map_err(|e| format!("Failed to lock database: {}", e))?;
    
    let mut query = "SELECT id, project_id, parent_id, title, description, status, priority, estimated_duration, actual_duration, position, is_daily_focus, due_date, completed_at, created_at, updated_at, last_synced_at FROM tasks WHERE 1=1".to_string();
    let mut params: Vec<serde_json::Value> = Vec::new();

    if let Some(ref pid) = project_id {
        query.push_str(" AND project_id = ?");
        params.push(serde_json::Value::String(pid.clone()));
    }
    
    if let Some(ref stat) = status {
        query.push_str(" AND status = ?");
        params.push(serde_json::Value::String(stat.clone()));
    }

    query.push_str(" ORDER BY position ASC, created_at DESC");

    let mut stmt = conn.prepare(&query).map_err(|e| format!("Failed to prepare tasks SQL: {}", e))?;
    
    let rusqlite_params: Vec<&dyn rusqlite::ToSql> = params
        .iter()
        .map(|v| match v {
            serde_json::Value::String(s) => s as &dyn rusqlite::ToSql,
            _ => unreachable!(),
        })
        .collect();

    let task_iter = stmt
        .query_map(&*rusqlite_params, |row| {
            Ok(Task {
                id: row.get(0)?,
                project_id: row.get(1)?,
                parent_id: row.get(2)?,
                title: row.get(3)?,
                description: row.get(4)?,
                status: row.get(5)?,
                priority: row.get(6)?,
                estimated_duration: row.get(7)?,
                actual_duration: row.get(8)?,
                position: row.get(9)?,
                is_daily_focus: row.get(10)?,
                due_date: row.get(11)?,
                completed_at: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
                last_synced_at: row.get(15)?,
            })
        })
        .map_err(|e| format!("Failed to query tasks: {}", e))?;

    let mut tasks = Vec::new();
    for task in task_iter {
        tasks.push(task.map_err(|e| format!("Failed to parse task row: {}", e))?);
    }

    Ok(tasks)
}

#[tauri::command]
pub async fn create_task(
    db_state: State<'_, DbState>,
    title: String,
    project_id: Option<String>,
    parent_id: Option<String>,
    priority: Option<String>,
    estimated_duration: Option<i32>,
) -> Result<Task, String> {
    let conn = db_state.0.lock().map_err(|e| format!("Failed to lock database: {}", e))?;
    let id = Ulid::new().to_string();
    let now = Utc::now().to_rfc3339();
    let default_priority = priority.unwrap_or_else(|| "medium".to_string());
    let default_est = estimated_duration.unwrap_or(0);
    
    let mut stmt = conn.prepare("SELECT COALESCE(MAX(position), 0) FROM tasks")
        .map_err(|e| format!("Failed to prepare task position SQL: {}", e))?;
    let max_pos: i32 = stmt.query_row([], |row| row.get(0))
        .unwrap_or(0);
    let position = max_pos + 1;

    conn.execute(
        "INSERT INTO tasks (id, project_id, parent_id, title, description, status, priority, estimated_duration, actual_duration, position, is_daily_focus, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, NULL, 'todo', ?5, ?6, 0, ?7, 0, ?8, ?9)",
        (
            &id,
            &project_id,
            &parent_id,
            &title,
            &default_priority,
            default_est,
            position,
            &now,
            &now,
        ),
    )
    .map_err(|e| format!("Failed to insert task: {}", e))?;

    Ok(Task {
        id,
        project_id,
        parent_id,
        title,
        description: None,
        status: "todo".to_string(),
        priority: default_priority,
        estimated_duration: default_est,
        actual_duration: 0,
        position,
        is_daily_focus: 0,
        due_date: None,
        completed_at: None,
        created_at: now.clone(),
        updated_at: now,
        last_synced_at: None,
    })
}

#[tauri::command]
pub async fn delete_task(db_state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = db_state.0.lock().map_err(|e| format!("Failed to lock database: {}", e))?;
    
    // SQLite has ON DELETE CASCADE configured on foreign key parent_id,
    // so deleting a parent task automatically deletes all its infinite subtasks!
    conn.execute("DELETE FROM tasks WHERE id = ?", [&id])
        .map_err(|e| format!("Failed to delete task: {}", e))?;

    Ok(())
}


// --- AUTOMATION & LINK COMMANDS ---
#[tauri::command]
pub async fn get_task_links(db_state: State<'_, DbState>, task_id: String) -> Result<Vec<TaskLink>, String> {
    let conn = db_state.0.lock().map_err(|e| format!("Failed to lock database: {}", e))?;
    let mut stmt = conn
        .prepare("SELECT id, task_id, title, url, auto_open, created_at FROM task_links WHERE task_id = ?")
        .map_err(|e| format!("Failed to prepare SQL: {}", e))?;

    let link_iter = stmt
        .query_map([&task_id], |row| {
            Ok(TaskLink {
                id: row.get(0)?,
                task_id: row.get(1)?,
                title: row.get(2)?,
                url: row.get(3)?,
                auto_open: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| format!("Failed to query links: {}", e))?;

    let mut links = Vec::new();
    for link in link_iter {
        links.push(link.map_err(|e| format!("Failed to parse link row: {}", e))?);
    }

    Ok(links)
}

#[tauri::command]
pub async fn add_task_link(
    db_state: State<'_, DbState>,
    task_id: String,
    title: String,
    url: String,
    auto_open: bool,
) -> Result<TaskLink, String> {
    let conn = db_state.0.lock().map_err(|e| format!("Failed to lock database: {}", e))?;
    let id = Ulid::new().to_string();
    let now = Utc::now().to_rfc3339();
    let auto_open_int = if auto_open { 1 } else { 0 };

    conn.execute(
        "INSERT INTO task_links (id, task_id, title, url, auto_open, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (&id, &task_id, &title, &url, auto_open_int, &now),
    )
    .map_err(|e| format!("Failed to insert link: {}", e))?;

    Ok(TaskLink {
        id,
        task_id,
        title,
        url,
        auto_open: auto_open_int,
        created_at: now,
    })
}

#[tauri::command]
pub async fn delete_task_link(db_state: State<'_, DbState>, link_id: String) -> Result<(), String> {
    let conn = db_state.0.lock().map_err(|e| format!("Failed to lock database: {}", e))?;
    conn.execute("DELETE FROM task_links WHERE id = ?", [&link_id])
        .map_err(|e| format!("Failed to delete task link: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn execute_blitz_trigger(db_state: State<'_, DbState>, task_id: String) -> Result<(), String> {
    // 1. Lock database and read all URLs with auto_open = 1 for the task
    let conn = db_state.0.lock().map_err(|e| format!("Failed to lock database: {}", e))?;
    let mut stmt = conn
        .prepare("SELECT url FROM task_links WHERE task_id = ? AND auto_open = 1")
        .map_err(|e| format!("Failed to prepare SQL: {}", e))?;

    let urls_iter = stmt
        .query_map([&task_id], |row| {
            let url: String = row.get(0)?;
            Ok(url)
        })
        .map_err(|e| format!("Failed to query urls: {}", e))?;

    let mut urls = Vec::new();
    for url in urls_iter {
        urls.push(url.map_err(|e| format!("Failed to parse url row: {}", e))?);
    }

    // 2. Open each URL in a background-spawned system process (xdg-open / open / start)
    for url in urls {
        open_url_native(&url)?;
    }

    Ok(())
}

/// Helper function to open a URL natively on Linux, Windows, or macOS
fn open_url_native(url: &str) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("xdg-open failed: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", url])
            .spawn()
            .map_err(|e| format!("cmd start failed: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("open failed: {}", e))?;
    }

    Ok(())
}

// --- SPRINT 3: FOCUS & DISTRACTION TRACKING SYSTEM ---
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex;

pub struct MonitorState {
    pub is_active: Arc<AtomicBool>,
    pub active_session_id: Arc<Mutex<Option<String>>>,
}

#[tauri::command]
pub async fn start_focus_session(
    db_state: State<'_, DbState>,
    monitor_state: State<'_, MonitorState>,
    app_handle: tauri::AppHandle,
    task_id: String,
    session_type: String,
) -> Result<String, String> {
    let conn = db_state.0.lock().map_err(|e| format!("Failed to lock database: {}", e))?;
    let session_id = Ulid::new().to_string();
    let now = Utc::now().to_rfc3339();

    // 1. Insert focus session
    conn.execute(
        "INSERT INTO focus_sessions (id, task_id, session_type, started_at, ended_at, duration_seconds, interrupted_count, outcome, created_at)
         VALUES (?1, ?2, ?3, ?4, NULL, 0, 0, 'completed', ?5)",
        (&session_id, &task_id, &session_type, &now, &now),
    )
    .map_err(|e| format!("Failed to create focus session: {}", e))?;

    // 2. Initialize today's stats row if missing
    let today = Utc::now().format("%Y-%m-%d").to_string();
    conn.execute(
        "INSERT OR IGNORE INTO user_stats (date, total_focus_seconds, tasks_completed_count, current_streak, experience_points)
         VALUES (?, 0, 0, 0, 0)",
        [today.as_str()],
    )
    .map_err(|e| format!("Failed to initialize user stats: {}", e))?;

    // 3. Update monitor state
    monitor_state.is_active.store(true, Ordering::Relaxed);
    *monitor_state.active_session_id.lock().unwrap() = Some(session_id.clone());

    // 4. Start background window watcher thread
    let is_active_clone = monitor_state.is_active.clone();
    let active_session_clone = monitor_state.active_session_id.clone();
    let app_handle_clone = app_handle.clone();

    std::thread::spawn(move || {
        let blacklist = vec!["facebook", "youtube", "reddit", "netflix", "tiktok", "instagram", "twitter"];
        while is_active_clone.load(Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_secs(5));
            if !is_active_clone.load(Ordering::Relaxed) {
                break;
            }

            // Check active window on Linux via xdotool
            #[cfg(target_os = "linux")]
            {
                let output = std::process::Command::new("xdotool")
                    .args(["getactivewindow", "getwindowname"])
                    .output();

                if let Ok(out) = output {
                    let title = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if !title.is_empty() {
                        let title_lower = title.to_lowercase();
                        for keyword in &blacklist {
                            if title_lower.contains(keyword) {
                                // 1. Notify GNOME/Linux natively
                                let _ = std::process::Command::new("notify-send")
                                    .args([
                                        "Oxide Cảnh báo! ⚠️",
                                        &format!("Phát hiện xao nhãng: {}. Hãy quay lại làm việc!", keyword)
                                    ])
                                    .spawn();

                                // 2. Notify Frontend React
                                let _ = app_handle_clone.emit("focus-distraction", keyword.to_string());

                                // 3. Log to DB and deduct XP
                                if let Some(db_state) = app_handle_clone.try_state::<DbState>() {
                                    if let Ok(conn) = db_state.0.lock() {
                                        let dist_id = Ulid::new().to_string();
                                        let sess_id = active_session_clone.lock().unwrap().clone().unwrap_or_default();
                                        let now_str = Utc::now().to_rfc3339();

                                        let _ = conn.execute(
                                            "INSERT INTO distraction_logs (id, session_id, app_name, window_title, detected_at) VALUES (?, ?, ?, ?, ?)",
                                            [dist_id.as_str(), sess_id.as_str(), *keyword, title.as_str(), now_str.as_str()]
                                        );

                                        let today_str = Utc::now().format("%Y-%m-%d").to_string();
                                        let _ = conn.execute(
                                            "UPDATE user_stats SET experience_points = MAX(0, experience_points - 5) WHERE date = ?",
                                            [today_str.as_str()]
                                        );

                                        // Retrieve updated stats and emit
                                        if let Ok(mut stmt) = conn.prepare("SELECT date, total_focus_seconds, tasks_completed_count, current_streak, experience_points FROM user_stats WHERE date = ?") {
                                            let stats_res: Result<crate::models::UserStats, _> = stmt.query_row([today_str.as_str()], |row: &rusqlite::Row| {
                                                Ok(crate::models::UserStats {
                                                    date: row.get(0)?,
                                                    total_focus_seconds: row.get(1)?,
                                                    tasks_completed_count: row.get(2)?,
                                                    current_streak: row.get(3)?,
                                                    experience_points: row.get(4)?,
                                                })
                                            });
                                            if let Ok(stats) = stats_res {
                                                let _ = app_handle_clone.emit("stats-updated", stats);
                                            }
                                        }
                                    }
                                }
                                break;
                            }
                        }
                    }
                }
            }
        }
    });

    Ok(session_id)
}

#[tauri::command]
pub async fn end_focus_session(
    db_state: State<'_, DbState>,
    monitor_state: State<'_, MonitorState>,
    session_id: String,
    duration_seconds: i32,
    outcome: String,
) -> Result<UserStats, String> {
    let conn = db_state.0.lock().map_err(|e| format!("Failed to lock database: {}", e))?;
    let now = Utc::now().to_rfc3339();

    // 1. Stop background watcher thread
    monitor_state.is_active.store(false, Ordering::Relaxed);
    *monitor_state.active_session_id.lock().unwrap() = None;

    // 2. Update focus session
    conn.execute(
        "UPDATE focus_sessions SET ended_at = ?1, duration_seconds = ?2, outcome = ?3 WHERE id = ?4",
        (&now, duration_seconds, &outcome, &session_id),
    )
    .map_err(|e| format!("Failed to update focus session: {}", e))?;

    // 3. Update task actual duration
    let task_id: String = conn.query_row(
        "SELECT task_id FROM focus_sessions WHERE id = ?",
        [&session_id],
        |row: &rusqlite::Row| row.get(0)
    ).map_err(|e| format!("Failed to find task_id for session: {}", e))?;

    conn.execute(
        "UPDATE tasks SET actual_duration = actual_duration + ?1, updated_at = ?2 WHERE id = ?3",
        (duration_seconds, &now, &task_id),
    )
    .map_err(|e| format!("Failed to update task duration: {}", e))?;

    // 4. Update user stats (XP, streak, completed count)
    let today = Utc::now().format("%Y-%m-%d").to_string();
    let xp_reward = if outcome == "completed" { 10 } else { 0 };
    let task_comp = if outcome == "completed" { 1 } else { 0 };

    conn.execute(
        "UPDATE user_stats 
         SET total_focus_seconds = total_focus_seconds + ?1, 
             tasks_completed_count = tasks_completed_count + ?2,
             experience_points = experience_points + ?3
         WHERE date = ?4",
        (duration_seconds, task_comp, xp_reward, &today),
    )
    .map_err(|e| format!("Failed to update user stats: {}", e))?;

    // Query and return updated UserStats
    let mut stmt = conn.prepare(
        "SELECT date, total_focus_seconds, tasks_completed_count, current_streak, experience_points FROM user_stats WHERE date = ?"
    ).map_err(|e| format!("Failed to prepare select stats: {}", e))?;

    let stats = stmt.query_row([&today], |row: &rusqlite::Row| {
        Ok(UserStats {
            date: row.get(0)?,
            total_focus_seconds: row.get(1)?,
            tasks_completed_count: row.get(2)?,
            current_streak: row.get(3)?,
            experience_points: row.get(4)?,
        })
    })
    .map_err(|e| format!("Failed to fetch updated user stats: {}", e))?;

    // Notify OS GNOME natively
    if outcome == "completed" {
        let _ = std::process::Command::new("notify-send")
            .args([
                "Oxide Pomodoro ⚡",
                "Tuyệt vời! Bạn đã hoàn thành xuất sắc phiên tập trung. Cộng 10 XP!"
            ])
            .spawn();
    } else {
        let _ = std::process::Command::new("notify-send")
            .args([
                "Oxide Pomodoro ⚠️",
                "Phiên tập trung đã bị gián đoạn. Cố gắng ở phiên sau nhé!"
            ])
            .spawn();
    }

    Ok(stats)
}

#[tauri::command]
pub async fn get_user_stats(db_state: State<'_, DbState>) -> Result<UserStats, String> {
    let conn = db_state.0.lock().map_err(|e| format!("Failed to lock database: {}", e))?;
    let today = Utc::now().format("%Y-%m-%d").to_string();

    conn.execute(
        "INSERT OR IGNORE INTO user_stats (date, total_focus_seconds, tasks_completed_count, current_streak, experience_points)
         VALUES (?, 0, 0, 0, 0)",
        [&today],
    )
    .map_err(|e| format!("Failed to initialize user stats: {}", e))?;

    let mut stmt = conn.prepare(
        "SELECT date, total_focus_seconds, tasks_completed_count, current_streak, experience_points FROM user_stats WHERE date = ?"
    ).map_err(|e| format!("Failed to prepare query stats: {}", e))?;

    let stats = stmt.query_row([&today], |row: &rusqlite::Row| {
        Ok(UserStats {
            date: row.get(0)?,
            total_focus_seconds: row.get(1)?,
            tasks_completed_count: row.get(2)?,
            current_streak: row.get(3)?,
            experience_points: row.get(4)?,
        })
    })
    .map_err(|e| format!("Failed to fetch stats: {}", e))?;

    Ok(stats)
}

#[tauri::command]
pub async fn get_active_session(
    db_state: State<'_, DbState>,
    monitor_state: State<'_, MonitorState>,
) -> Result<Option<crate::models::FocusSession>, String> {
    let sess_id_opt = monitor_state.active_session_id.lock().unwrap().clone();
    if let Some(sess_id) = sess_id_opt {
        let conn = db_state.0.lock().map_err(|e| format!("Failed to lock DB: {}", e))?;
        let mut stmt = conn.prepare(
            "SELECT id, task_id, session_type, started_at, ended_at, duration_seconds, interrupted_count, outcome, created_at 
             FROM focus_sessions WHERE id = ?"
        ).map_err(|e| format!("Failed to prepare SQL: {}", e))?;

        let sess = stmt.query_row([&sess_id], |row: &rusqlite::Row| {
            Ok(crate::models::FocusSession {
                id: row.get(0)?,
                task_id: row.get(1)?,
                session_type: row.get(2)?,
                started_at: row.get(3)?,
                ended_at: row.get(4)?,
                duration_seconds: row.get(5)?,
                interrupted_count: row.get(6)?,
                outcome: row.get(7)?,
                created_at: row.get(8)?,
            })
        }).map_err(|e| format!("Failed to fetch session: {}", e))?;

        Ok(Some(sess))
    } else {
        Ok(None)
    }
}



