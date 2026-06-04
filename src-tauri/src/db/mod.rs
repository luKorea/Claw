mod pool;

pub use pool::pool;

use crate::error::AppResult;

const INIT_SQL: &str = include_str!("migrations/0001_init.sql");

pub async fn init_pool(app: &tauri::AppHandle) -> AppResult<()> {
    let pool = pool::init(app).await?;
    sqlx::query(INIT_SQL).execute(&pool).await?;
    log::info!("db initialized");
    Ok(())
}
