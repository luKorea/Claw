mod commands;
mod db;
mod error;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .setup(|app| {
            // 初始化 SQLite 池
            let app_handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                if let Err(e) = db::init_pool(&app_handle).await {
                    log::error!("failed to init db pool: {e}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings::get_api_key_status,
            commands::settings::set_api_key,
            commands::settings::delete_api_key,
            commands::settings::get_api_key,
            commands::settings::list_configured_providers,
            commands::conversation::list_conversations,
            commands::conversation::get_conversation,
            commands::conversation::create_conversation,
            commands::conversation::update_conversation,
            commands::conversation::delete_conversation,
            commands::conversation::list_messages,
            commands::conversation::save_message,
            commands::conversation::delete_message,
            commands::prompt::list_prompt_presets,
            commands::prompt::create_prompt_preset,
            commands::prompt::update_prompt_preset,
            commands::prompt::delete_prompt_preset,
            commands::models::list_provider_models,
            commands::minimax::stream_minimax_anthropic,
            commands::minimax::cancel_minimax_stream,
            commands::custom_provider::stream_custom_provider,
            commands::custom_provider::cancel_custom_provider_stream,
            commands::tool::read_text_file,
            commands::tool::list_dir,
            commands::tool::write_text_file,
            commands::tool::pick_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
