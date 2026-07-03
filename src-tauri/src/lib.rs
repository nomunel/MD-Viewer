use serde::Serialize;
use std::{
  fs,
  path::{Path, PathBuf},
};
use tauri::ipc::Response;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const PREVIEW_FILE: &str = "Preview.html";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownIndex {
  root_path: String,
  folder_name: String,
  paths: Vec<String>,
}

#[tauri::command]
async fn choose_document_root(app: tauri::AppHandle) -> Result<Option<String>, String> {
  let selected = app
    .dialog()
    .file()
    .set_title("Markdown ドキュメントルートを選択")
    .blocking_pick_folder();

  let Some(path) = selected else {
    return Ok(None);
  };

  let path = path.into_path().map_err(|error| error.to_string())?;
  let root = resolve_document_root(&path_to_string(&path))?;
  Ok(Some(path_to_string(&root)))
}

#[tauri::command]
fn index_markdown(root: String) -> Result<MarkdownIndex, String> {
  let root = resolve_document_root(&root)?;
  let mut paths = Vec::new();
  collect_markdown_paths(&root, "", &mut paths)?;
  paths.sort_by(|left, right| left.to_lowercase().cmp(&right.to_lowercase()));

  Ok(MarkdownIndex {
    folder_name: root
      .file_name()
      .and_then(|name| name.to_str())
      .unwrap_or("Markdown 文書")
      .to_string(),
    root_path: path_to_string(&root),
    paths,
  })
}

#[tauri::command]
fn read_text_file(root: String, path: String) -> Result<String, String> {
  let file = resolve_document_file(&root, &path)?;
  fs::read_to_string(&file).map_err(|error| format!("Failed to read {}: {error}", path_to_string(&file)))
}

#[tauri::command]
fn read_binary_file(root: String, path: String) -> Result<Response, String> {
  let file = resolve_document_file(&root, &path)?;
  let bytes = fs::read(&file).map_err(|error| format!("Failed to read {}: {error}", path_to_string(&file)))?;
  Ok(Response::new(bytes))
}

#[tauri::command]
fn open_file(app: tauri::AppHandle, root: String, path: String) -> Result<(), String> {
  let file = resolve_document_file(&root, &path)?;
  app
    .opener()
    .open_path(path_to_string(&file), None::<&str>)
    .map_err(|error| error.to_string())
}

fn resolve_document_root(path: &str) -> Result<PathBuf, String> {
  let trimmed = path.trim().trim_matches(|ch| ch == '"' || ch == '\'');
  if trimmed.is_empty() {
    return Err("Document root path is empty.".to_string());
  }

  let root = fs::canonicalize(PathBuf::from(trimmed))
    .map_err(|error| format!("Document root does not exist: {trimmed} ({error})"))?;
  if !root.is_dir() {
    return Err(format!("Document root is not a directory: {}", path_to_string(&root)));
  }

  Ok(root)
}

fn resolve_document_file(root: &str, relative_path: &str) -> Result<PathBuf, String> {
  let root = resolve_document_root(root)?;
  let relative = parse_relative_path(relative_path)?;
  let file = fs::canonicalize(root.join(relative))
    .map_err(|error| format!("File does not exist: {relative_path} ({error})"))?;

  if !file.starts_with(&root) {
    return Err("Path is outside the document root.".to_string());
  }
  if !file.is_file() {
    return Err(format!("Path is not a file: {}", path_to_string(&file)));
  }

  Ok(file)
}

fn parse_relative_path(value: &str) -> Result<PathBuf, String> {
  let normalized = value.replace('\\', "/");
  let mut path = PathBuf::new();

  for part in normalized.split('/') {
    if part.is_empty() || part == "." {
      continue;
    }
    if part == ".." {
      return Err("Path is outside the document root.".to_string());
    }
    if part.contains('\0') {
      return Err("Path contains an invalid character.".to_string());
    }
    path.push(part);
  }

  if path.as_os_str().is_empty() {
    return Err("File path is empty.".to_string());
  }

  Ok(path)
}

fn collect_markdown_paths(directory: &Path, base: &str, paths: &mut Vec<String>) -> Result<(), String> {
  for entry in fs::read_dir(directory).map_err(|error| format!("Failed to read directory {}: {error}", path_to_string(directory)))? {
    let entry = entry.map_err(|error| error.to_string())?;
    let file_type = entry.file_type().map_err(|error| error.to_string())?;
    let name = entry.file_name().to_string_lossy().to_string();

    if name.starts_with('.') {
      continue;
    }

    let relative = if base.is_empty() {
      name.clone()
    } else {
      format!("{base}/{name}")
    };

    if file_type.is_dir() {
      collect_markdown_paths(&entry.path(), &relative, paths)?;
    } else if file_type.is_file() && is_markdown_file(&name) {
      paths.push(relative.replace('\\', "/"));
    }
  }

  Ok(())
}

fn is_markdown_file(name: &str) -> bool {
  if name.eq_ignore_ascii_case(PREVIEW_FILE) {
    return false;
  }

  Path::new(name)
    .extension()
    .and_then(|extension| extension.to_str())
    .map(|extension| extension.eq_ignore_ascii_case("md"))
    .unwrap_or(false)
}

fn path_to_string(path: &Path) -> String {
  path.to_string_lossy().replace('\\', "/")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      choose_document_root,
      index_markdown,
      read_text_file,
      read_binary_file,
      open_file
    ])
    .run(tauri::generate_context!())
    .expect("error while running Tauri application");
}
