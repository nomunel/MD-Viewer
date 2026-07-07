# MD Viewer

Local Markdown document viewer built with Tauri.

See [docs/README.md](docs/README.md) for user and author guides.

## Development Setup

Detailed Japanese setup notes are available in [docs/development/setup.md](docs/development/setup.md).

Prerequisites:

- Node.js and npm
- Git LFS
- Rust and Cargo, installed with rustup
- Platform requirements for Tauri v2 on your OS

On Windows, install:

- Node.js LTS
- Git for Windows
- Git LFS
- Rust with rustup
- Microsoft Visual Studio Build Tools with the C++ build tools and Windows SDK
- Microsoft Edge WebView2 Runtime

Clone the repository:

```powershell
git lfs install
git clone https://github.com/nomunel/MD-Viewer.git
cd MD-Viewer
```

Install JavaScript dependencies:

```powershell
npm ci
```

`npm install` also works during ordinary development, but `npm ci` is better for a fresh clone because it uses `package-lock.json` exactly.

Fetch Rust dependencies and verify the lockfile:

```powershell
cargo metadata --manifest-path src-tauri\Cargo.toml --locked --no-deps
```

Run the JavaScript syntax check:

```powershell
npm.cmd run check
```

Run the Tauri app in development mode:

```powershell
npm.cmd run tauri:dev
```

Build the Windows executable:

```powershell
npm.cmd run tauri:build
```

The portable executable is generated at:

```text
src-tauri\target\release\md-viewer.exe
```

Create a release zip:

```powershell
$version = (Get-Content -Raw package.json | ConvertFrom-Json).version
$releaseDir = Resolve-Path 'src-tauri\target\release'
$exe = Join-Path $releaseDir 'md-viewer.exe'
$zip = Join-Path $releaseDir "MD-Viewer-v$version-windows-x64.zip"
Compress-Archive -LiteralPath $exe -DestinationPath $zip -Force
Get-FileHash -Algorithm SHA256 -LiteralPath $zip
```

The build process regenerates `dist/` from `viewer.html` and `src/` before Tauri builds. `dist/`, `node_modules/`, and `src-tauri/target/` are intentionally ignored because they are reproducible local outputs.

If `npm` is blocked by the PowerShell execution policy, use `npm.cmd`:

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run tauri:build
```

If LFS files are missing after clone, run:

```powershell
git lfs pull
```

## Development Commands

Run checks:

```powershell
npm.cmd run check
```

Run the Tauri app in development mode:

```powershell
npm.cmd run tauri:dev
```

Build the Windows executable:

```powershell
npm.cmd run tauri:build
```

## Distribution

Do not commit built executables to the repository root.

For public downloads, create a GitHub Release and attach a packaged build artifact, for example:

- `MD-Viewer-v0.1.0-windows-x64.zip`

For the current portable distribution style, package:

- `src-tauri/target/release/md-viewer.exe`

The repository uses Git LFS for binary assets such as icons and for accidental future binary release artifacts.
