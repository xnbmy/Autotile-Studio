use std::process::Command;

/// 用系统默认浏览器打开指定 URL。
/// 通过系统自带 PowerShell 的 Start-Process 实现，无需 opener 插件；
/// URL 经环境变量传递，规避 PowerShell 引号转义问题。
#[tauri::command]
async fn open_url(url: String) -> Result<(), String> {
  tauri::async_runtime::spawn_blocking(move || {
    let script = "Start-Process $env:AT_URL";
    let mut cmd = Command::new("powershell");
    cmd.args(["-NoProfile", "-NoLogo", "-Command", script])
      .env("AT_URL", &url);
    // CREATE_NO_WINDOW：禁止创建控制台窗口，避免弹出命令框
    #[cfg(windows)]
    {
      use std::os::windows::process::CommandExt;
      cmd.creation_flags(0x08000000);
    }
    let out = cmd.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
      return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(())
  })
  .await
  .map_err(|e| e.to_string())?
}

/// 弹出系统「另存为」对话框，由用户选择目标文件夹与文件名。
/// 通过系统自带 PowerShell + WinForms 实现，无需额外原生依赖。
/// 返回用户确认的完整保存路径；取消对话框返回 null。
#[tauri::command]
async fn choose_save_path(suggested_name: String) -> Result<Option<String>, String> {
  tauri::async_runtime::spawn_blocking(move || {
    // 文件名经环境变量传递，规避 PowerShell 引号转义问题；
    // 先设 stdout 为 UTF-8，否则中文文件名会按 GBK 输出导致乱码
    let script = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; \
      Add-Type -AssemblyName System.Windows.Forms; \
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

/// 将文件直接保存到用户桌面（如导出 AI 生图参考模板）。
/// 桌面路径经 PowerShell 获取（避免引入 dirs crate），stdout 设为 UTF-8 防中文路径乱码。
#[tauri::command]
async fn save_to_desktop(filename: String, data: Vec<u8>) -> Result<String, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let script = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; \
      [Environment]::GetFolderPath('Desktop')";
    let mut cmd = Command::new("powershell");
    cmd.args(["-NoProfile", "-NoLogo", "-Command", script]);
    // CREATE_NO_WINDOW：禁止创建控制台窗口，避免弹出命令框
    #[cfg(windows)]
    {
      use std::os::windows::process::CommandExt;
      cmd.creation_flags(0x08000000);
    }
    let out = cmd.output().map_err(|e| e.to_string())?;
    let desktop = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if desktop.is_empty() {
      return Err("无法获取桌面路径".to_string());
    }
    let path = format!("{}\\{}", desktop.trim_end_matches('\\'), filename);
    std::fs::write(&path, &data).map_err(|e| e.to_string())?;
    Ok(path)
  })
  .await
  .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![open_url, choose_save_path, write_bytes, save_to_desktop])
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
