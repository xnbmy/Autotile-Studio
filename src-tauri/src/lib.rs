use std::process::Command;

/// 弹出系统「另存为」对话框，由用户选择目标文件夹与文件名。
/// 通过系统自带 PowerShell + WinForms 实现，无需额外原生依赖。
/// 返回用户确认的完整保存路径；取消对话框返回 null。
#[tauri::command]
async fn choose_save_path(suggested_name: String) -> Result<Option<String>, String> {
  tauri::async_runtime::spawn_blocking(move || {
    // 文件名经环境变量传递，规避 PowerShell 引号转义问题
    let script = "Add-Type -AssemblyName System.Windows.Forms; \
      $d = New-Object System.Windows.Forms.SaveFileDialog; \
      $d.Filter = 'PNG 图片 (*.png)|*.png'; \
      $d.FileName = [IO.Path]::GetFileName($env:AT_SUGGESTED) -replace '\\.[^.]+$', '.png'; \
      $d.AddExtension = $true; \
      $d.DefaultExt = 'png'; \
      $d.OverwritePrompt = $true; \
      if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $d.FileName }";
    let mut cmd = Command::new("powershell");
    cmd.args(["-NoProfile", "-NoLogo", "-STA", "-Command", script])
      .env("AT_SUGGESTED", &suggested_name);
    // CREATE_NO_WINDOW：禁止创建控制台窗口，避免导出时弹出命令框
    #[cfg(windows)]
    {
      use std::os::windows::process::CommandExt;
      cmd.creation_flags(0x08000000);
    }
    let out = cmd.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
      return Ok(None); // 取消对话框或异常均视为取消
    }
    let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if path.is_empty() { Ok(None) } else { Ok(Some(path)) }
  })
  .await
  .map_err(|e| e.to_string())?
}

/// 将字节写入指定路径（配合 choose_save_path 使用）。
#[tauri::command]
async fn write_bytes(path: String, data: Vec<u8>) -> Result<(), String> {
  tauri::async_runtime::spawn_blocking(move || std::fs::write(&path, &data).map_err(|e| e.to_string()))
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![choose_save_path, write_bytes])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
