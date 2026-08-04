mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::list_ports,
            commands::kill_port,
            commands::firewall_allow,
            commands::system_info,
            commands::firewall_status,
            commands::list_firewall_rules,
            commands::set_sudo_password,
            commands::clear_sudo_password,
            commands::has_sudo_password,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
