use rusqlite::Connection;
use std::fs;
use std::path::Path;
use std::sync::Mutex;

pub struct DbState(pub Mutex<Connection>);

/// Initializes the database file, creates parent directories if missing,
/// opens the SQLite connection, and runs migrations.
pub fn init_db(app_data_dir: &Path) -> Result<Connection, String> {
    // Ensure the app data directory exists
    if !app_data_dir.exists() {
        fs::create_dir_all(app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }

    let db_path = app_data_dir.join("oxide.db");
    let mut conn = Connection::open(db_path)
        .map_err(|e| format!("Failed to open SQLite database: {}", e))?;

    // Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON;", [])
        .map_err(|e| format!("Failed to enable foreign keys: {}", e))?;

    run_migrations(&mut conn)?;

    Ok(conn)
}

/// Runs initial migrations to set up the complete schema of Oxide Productivity Suite.
fn run_migrations(conn: &mut Connection) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| format!("Failed to start transaction: {}", e))?;

    // 1. Projects & Organization
    tx.execute(
        "CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            color TEXT DEFAULT '#4dabf7',
            icon TEXT,
            position INTEGER DEFAULT 0,
            is_archived INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );",
        [],
    ).map_err(|e| format!("Error creating projects table: {}", e))?;

    tx.execute(
        "CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL UNIQUE,
            color TEXT DEFAULT '#868e96',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );",
        [],
    ).map_err(|e| format!("Error creating tags table: {}", e))?;

    // 2. Task Management (Supports infinite subtasks)
    tx.execute(
        "CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY NOT NULL,
            project_id TEXT,
            parent_id TEXT,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT CHECK(status IN ('backlog', 'todo', 'in_progress', 'completed')) DEFAULT 'todo',
            priority TEXT CHECK(priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
            estimated_duration INTEGER DEFAULT 0,
            actual_duration INTEGER DEFAULT 0,
            position INTEGER NOT NULL DEFAULT 0,
            is_daily_focus INTEGER DEFAULT 0,
            due_date DATETIME,
            completed_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_synced_at DATETIME,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
            FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE
        );",
        [],
    ).map_err(|e| format!("Error creating tasks table: {}", e))?;

    tx.execute(
        "CREATE TABLE IF NOT EXISTS task_tags (
            task_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            PRIMARY KEY (task_id, tag_id),
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );",
        [],
    ).map_err(|e| format!("Error creating task_tags table: {}", e))?;

    // 3. Automation & System Links
    tx.execute(
        "CREATE TABLE IF NOT EXISTS task_links (
            id TEXT PRIMARY KEY NOT NULL,
            task_id TEXT NOT NULL,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            auto_open INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );",
        [],
    ).map_err(|e| format!("Error creating task_links table: {}", e))?;

    tx.execute(
        "CREATE TABLE IF NOT EXISTS task_recurrence (
            id TEXT PRIMARY KEY NOT NULL,
            task_id TEXT NOT NULL,
            frequency TEXT CHECK(frequency IN ('daily', 'weekly', 'monthly', 'custom')) NOT NULL,
            interval INTEGER DEFAULT 1,
            days_of_week TEXT,
            end_date DATETIME,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );",
        [],
    ).map_err(|e| format!("Error creating task_recurrence table: {}", e))?;

    // 4. Focus Engine & Distraction Tracking
    tx.execute(
        "CREATE TABLE IF NOT EXISTS focus_sessions (
            id TEXT PRIMARY KEY NOT NULL,
            task_id TEXT NOT NULL,
            session_type TEXT CHECK(session_type IN ('focus', 'short_break', 'long_break')) DEFAULT 'focus',
            started_at DATETIME NOT NULL,
            ended_at DATETIME,
            duration_seconds INTEGER DEFAULT 0,
            interrupted_count INTEGER DEFAULT 0,
            outcome TEXT CHECK(outcome IN ('completed', 'interrupted', 'abandoned')) DEFAULT 'completed',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );",
        [],
    ).map_err(|e| format!("Error creating focus_sessions table: {}", e))?;

    tx.execute(
        "CREATE TABLE IF NOT EXISTS distraction_logs (
            id TEXT PRIMARY KEY NOT NULL,
            session_id TEXT NOT NULL,
            app_name TEXT,
            window_title TEXT,
            detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES focus_sessions(id) ON DELETE CASCADE
        );",
        [],
    ).map_err(|e| format!("Error creating distraction_logs table: {}", e))?;

    // 5. AI, Gamification & Settings
    tx.execute(
        "CREATE TABLE IF NOT EXISTS ai_chat_history (
            id TEXT PRIMARY KEY NOT NULL,
            raw_prompt TEXT NOT NULL,
            ai_response TEXT NOT NULL,
            tokens_used INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );",
        [],
    ).map_err(|e| format!("Error creating ai_chat_history table: {}", e))?;

    tx.execute(
        "CREATE TABLE IF NOT EXISTS integrations (
            id TEXT PRIMARY KEY NOT NULL,
            provider TEXT NOT NULL,
            name TEXT NOT NULL,
            api_key_encrypted TEXT,
            is_active INTEGER DEFAULT 1,
            config_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );",
        [],
    ).map_err(|e| format!("Error creating integrations table: {}", e))?;

    tx.execute(
        "CREATE TABLE IF NOT EXISTS user_stats (
            date TEXT PRIMARY KEY NOT NULL,
            total_focus_seconds INTEGER DEFAULT 0,
            tasks_completed_count INTEGER DEFAULT 0,
            current_streak INTEGER DEFAULT 0,
            experience_points INTEGER DEFAULT 0
        );",
        [],
    ).map_err(|e| format!("Error creating user_stats table: {}", e))?;

    tx.execute(
        "CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );",
        [],
    ).map_err(|e| format!("Error creating app_settings table: {}", e))?;

    // Seed default projects and tasks if none exist
    let count: i32 = tx
        .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
        .unwrap_or(0);
    if count == 0 {
        let now = chrono::Utc::now().to_rfc3339();
        tx.execute(
            "INSERT INTO projects (id, name, color, icon, position, is_archived, created_at, updated_at)
             VALUES ('proj_oxide', '🚀 Oxide Development', '#4dabf7', 'rocket', 1, 0, ?1, ?2)",
            [&now, &now],
        ).map_err(|e| format!("Seeding project 1 error: {}", e))?;

        tx.execute(
            "INSERT INTO projects (id, name, color, icon, position, is_archived, created_at, updated_at)
             VALUES ('proj_deep', '🧠 Deep Work & Research', '#be4bdb', 'brain', 2, 0, ?1, ?2)",
            [&now, &now],
        ).map_err(|e| format!("Seeding project 2 error: {}", e))?;

        tx.execute(
            "INSERT INTO tasks (id, project_id, parent_id, title, description, status, priority, estimated_duration, actual_duration, position, is_daily_focus, created_at, updated_at)
             VALUES ('task_1', 'proj_oxide', NULL, 'Thiết lập Multi-window Router ⚡', 'Tạo định tuyến React dựa trên label của Tauri Window.', 'in_progress', 'high', 1800, 0, 1, 1, ?1, ?2)",
            [&now, &now],
        ).map_err(|e| format!("Seeding task 1 error: {}", e))?;

        tx.execute(
            "INSERT INTO tasks (id, project_id, parent_id, title, description, status, priority, estimated_duration, actual_duration, position, is_daily_focus, created_at, updated_at)
             VALUES ('task_2', 'proj_oxide', NULL, 'Cấu hình phím tắt Brain Dump 🧠', 'Đăng ký global shortcut Ctrl+Shift+Space.', 'todo', 'medium', 1200, 0, 2, 1, ?1, ?2)",
            [&now, &now],
        ).map_err(|e| format!("Seeding task 2 error: {}", e))?;
    }

    tx.commit().map_err(|e| format!("Failed to commit transaction: {}", e))?;

    Ok(())
}
