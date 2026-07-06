# MD Viewer

Local Markdown document viewer built with Tauri.

See [docs/README.md](docs/README.md) for user and author guides.

## Development

Prerequisites:

- Node.js and npm
- Rust and Cargo
- Platform requirements for Tauri v2

Setup:

```powershell
npm install
```

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

The build process regenerates `dist/` from `viewer.html` and `src/` before Tauri builds. `dist/`, `node_modules/`, and `src-tauri/target/` are intentionally ignored because they are reproducible local outputs.

## Distribution

Do not commit built executables to the repository root.

For public downloads, create a GitHub Release and attach a packaged build artifact, for example:

- `MD-Viewer-v0.1.0-windows-x64.zip`

For the current portable distribution style, package:

- `src-tauri/target/release/md-viewer.exe`

The repository uses Git LFS for binary assets such as icons and for accidental future binary release artifacts.
