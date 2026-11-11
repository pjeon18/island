// Island as a desktop pet: a transparent, frameless, always-on-top window that
// shows only the island. The web app detects Tauri and switches to float mode.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, PhysicalPosition};

/// Seconds since the last keyboard or mouse input, system-wide. This is the
/// only thing the island learns about your computer: never which app or what
/// you are doing.
#[tauri::command]
fn idle_seconds() -> u64 {
    user_idle::UserIdle::get_time().map(|t| t.as_seconds()).unwrap_or(0)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![idle_seconds])
        .setup(|app| {
            // start in the bottom-right corner of the main screen
            if let Some(win) = app.get_webview_window("main") {
                if let (Ok(Some(monitor)), Ok(size)) = (win.current_monitor(), win.outer_size()) {
                    let screen = monitor.size();
                    let margin = (32.0 * monitor.scale_factor()) as i32;
                    let x = screen.width as i32 - size.width as i32 - margin;
                    let y = screen.height as i32 - size.height as i32 - margin * 3;
                    let _ = win.set_position(PhysicalPosition::new(x.max(0), y.max(0)));
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Island");
}
