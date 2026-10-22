// Native side of Slovarik. The UI lives in the webview; Rust only keeps the
// dictionary file safe on disk and talks to the OS (Downloads, file manager).

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use tauri::{AppHandle, Manager};

const DATA_FILE: &str = "slovarik.json";
const BACKUP_FILE: &str = "slovarik.backup.json";

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
fn load_data(app: AppHandle) -> Result<Option<String>, String> {
    let dir = data_dir(&app)?;
    match fs::read_to_string(dir.join(DATA_FILE)) {
        Ok(text) => {
            backup_daily(&dir, &text);
            Ok(Some(text))
        }
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Keeps a copy of the last file that parsed, refreshed at most once a day.
fn backup_daily(dir: &Path, text: &str) {
    let backup = dir.join(BACKUP_FILE);
    let recent = fs::metadata(&backup)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| SystemTime::now().duration_since(t).ok())
        .is_some_and(|age| age < Duration::from_secs(20 * 3600));
    if !recent && serde_json::from_str::<serde_json::Value>(text).is_ok() {
        let _ = fs::write(backup, text);
    }
}

/// Writes to a temp file first so a crash mid-write never leaves a half-written dictionary.
#[tauri::command]
fn save_data(app: AppHandle, contents: String) -> Result<(), String> {
    let dir = data_dir(&app)?;
    let tmp = dir.join(format!("{DATA_FILE}.tmp"));
    fs::write(&tmp, contents.as_bytes()).map_err(|e| e.to_string())?;
    fs::rename(&tmp, dir.join(DATA_FILE)).map_err(|e| e.to_string())
}

/// Saves an export into Downloads and returns the full path.
#[tauri::command]
fn export_file(app: AppHandle, name: String, contents: String) -> Result<String, String> {
    let safe: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        .collect();
    if safe.is_empty() || safe.starts_with('.') {
        return Err("bad file name".into());
    }
    let dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().document_dir())
        .map_err(|e| e.to_string())?;
    let path = free_path(&dir, &safe);
    fs::write(&path, contents.as_bytes()).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

/// "file.json" -> "file (2).json" when the name is taken.
fn free_path(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = name.rsplit_once('.').unwrap_or((name, ""));
    (2..)
        .map(|i| dir.join(if ext.is_empty() { format!("{stem} ({i})") } else { format!("{stem} ({i}).{ext}") }))
        .find(|p| !p.exists())
        .unwrap_or(first)
}

#[tauri::command]
fn open_data_dir(app: AppHandle) -> Result<(), String> {
    let dir = data_dir(&app)?;
    #[cfg(target_os = "windows")]
    let opener = "explorer";
    #[cfg(target_os = "macos")]
    let opener = "open";
    #[cfg(all(unix, not(target_os = "macos")))]
    let opener = "xdg-open";
    std::process::Command::new(opener)
        .arg(dir)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

// The GitHub token for gist sync lives in the OS keychain (Keychain on macOS,
// Credential Manager on Windows), never in the dictionary file that gets synced.
const KEYCHAIN_SERVICE: &str = "io.slovarik.desktop";
const KEYCHAIN_USER: &str = "github-gist-token";

fn token_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER).map_err(|e| e.to_string())
}

#[tauri::command]
fn token_get() -> Result<Option<String>, String> {
    match token_entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn token_set(token: String) -> Result<(), String> {
    token_entry()?.set_password(token.trim()).map_err(|e| e.to_string())
}

#[tauri::command]
fn token_clear() -> Result<(), String> {
    match token_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Opens GitHub's "new token" page with the gist scope preselected.
#[tauri::command]
fn open_token_page() -> Result<(), String> {
    const URL: &str = "https://github.com/settings/tokens/new?scopes=gist&description=Slovarik%20sync";
    // explorer.exe treats a URL with a query string as a path and opens Documents
    // instead; the URL protocol handler hands it to the default browser.
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = std::process::Command::new("rundll32");
        c.args(["url.dll,FileProtocolHandler", URL]);
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = std::process::Command::new("open");
        c.arg(URL);
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(URL);
        c
    };
    cmd.spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_data,
            save_data,
            export_file,
            open_data_dir,
            token_get,
            token_set,
            token_clear,
            open_token_page
        ])
        .run(tauri::generate_context!())
        .expect("error while running Slovarik");
}
