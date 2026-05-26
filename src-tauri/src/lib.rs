use tauri::Manager;

pub mod database;
pub mod models;
pub mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Retrieve application data directory
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())
                .expect("Failed to retrieve app data directory");
            
            // Initialize SQLite DB & run DDL migrations
            let conn = database::init_db(&app_data_dir)
                .expect("Failed to initialize SQLite database and migrations");

            // Manage DbState thread-safely
            app.manage(database::DbState(std::sync::Mutex::new(conn)));

            // Manage MonitorState thread-safely for background active window watcher
            app.manage(commands::MonitorState {
                is_active: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
                active_session_id: std::sync::Arc::new(std::sync::Mutex::new(None)),
            });

            // Initialize System Tray (Tauri V2)
            let quit_item = tauri::menu::MenuItem::with_id(app, "quit", "Thoát Oxide", true, None::<&str>)?;
            let show_item = tauri::menu::MenuItem::with_id(app, "show", "Hiện Workspace", true, None::<&str>)?;
            let tray_menu = tauri::menu::Menu::with_items(app, &[&show_item, &quit_item])?;

            let mut tray_builder = tauri::tray::TrayIconBuilder::new()
                .menu(&tray_menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show().unwrap();
                            let _ = window.set_focus().unwrap();
                        }
                    }
                    _ => {}
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            let _tray = tray_builder.build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::get_projects,
            commands::create_project,
            commands::update_project,
            commands::delete_project,
            commands::get_tags,
            commands::create_tag,
            commands::assign_tag_to_task,
            commands::remove_tag_from_task,
            commands::get_task_tags,
            commands::get_tasks,
            commands::create_task,
            commands::delete_task,
            commands::get_task_links,
            commands::add_task_link,
            commands::delete_task_link,
            commands::execute_blitz_trigger,
            commands::start_focus_session,
            commands::end_focus_session,
            commands::get_user_stats,
            commands::get_active_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
