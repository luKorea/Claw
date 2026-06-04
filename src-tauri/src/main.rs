// 防止额外 console window 在 Windows 释放构建
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    claw_client_lib::run();
}
