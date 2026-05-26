use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub position: i32,
    pub is_archived: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Task {
    pub id: String,
    pub project_id: Option<String>,
    pub parent_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: String,
    pub estimated_duration: i32,
    pub actual_duration: i32,
    pub position: i32,
    pub is_daily_focus: i32,
    pub due_date: Option<String>,
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub last_synced_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TaskLink {
    pub id: String,
    pub task_id: String,
    pub title: String,
    pub url: String,
    pub auto_open: i32,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FocusSession {
    pub id: String,
    pub task_id: String,
    pub session_type: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_seconds: i32,
    pub interrupted_count: i32,
    pub outcome: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserStats {
    pub date: String,
    pub total_focus_seconds: i32,
    pub tasks_completed_count: i32,
    pub current_streak: i32,
    pub experience_points: i32,
}
