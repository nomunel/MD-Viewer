# 開発環境セットアップ

この手順は、初回 clone から開発起動・ビルドまでを対象にします。

## 前提

Windows では以下をインストールしてください。

- Node.js LTS
- Git for Windows
- Git LFS
- Rust / Cargo
- Microsoft Visual Studio Build Tools
  - C++ build tools
  - Windows SDK
- Microsoft Edge WebView2 Runtime

## 初回 clone

```powershell
git lfs install
git clone https://github.com/nomunel/MD-Viewer.git
cd MD-Viewer
```

Git LFS の実体ファイルが取得できていない場合は、次を実行します。

```powershell
git lfs pull
```

## 依存関係の取得

JavaScript 側の依存関係を取得します。

```powershell
npm ci
```

Rust 側の依存関係と lockfile を確認します。

```powershell
cargo metadata --manifest-path src-tauri\Cargo.toml --locked --no-deps
```

PowerShell の実行ポリシーで `npm` が止まる場合は、`npm.cmd` を使います。

```powershell
npm.cmd ci
```

## 開発起動

```powershell
npm.cmd run tauri:dev
```

## チェック

```powershell
npm.cmd run check
```

## ビルド

```powershell
npm.cmd run tauri:build
```

ビルド時に `dist/` は `viewer.html` と `src/` から再生成されます。

生成される Windows 向けポータブル exe:

```text
src-tauri\target\release\md-viewer.exe
```

## 配布用 zip の作成

```powershell
$version = (Get-Content -Raw package.json | ConvertFrom-Json).version
$releaseDir = Resolve-Path 'src-tauri\target\release'
$exe = Join-Path $releaseDir 'md-viewer.exe'
$zip = Join-Path $releaseDir "MD-Viewer-v$version-windows-x64.zip"
Compress-Archive -LiteralPath $exe -DestinationPath $zip -Force
Get-FileHash -Algorithm SHA256 -LiteralPath $zip
```

## Git 管理しない生成物

以下は再生成可能なため Git 管理しません。

- `dist/`
- `node_modules/`
- `src-tauri/target/`
- `src-tauri/gen/`
