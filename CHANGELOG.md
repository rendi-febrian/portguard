# Changelog

All notable changes to PortGuard are documented here. Releases are built automatically for Linux, Windows, and macOS via GitHub Actions.

## [0.2.3] - 2026

### Fixed
- **Duplicate instances**: launching PortGuard from the app menu/dock while it is already running in the tray now focuses the existing window instead of starting a second instance (`tauri-plugin-single-instance`).

## [0.2.2] - 2026

### Fixed
- **Windows**: UDP sockets were not shown (netstat UDP rows have no State column — they are now parsed correctly).
- **Windows**: process names were empty — they are now resolved from `tasklist` (e.g. `chrome.exe`, `node.exe`).
- **Settings**: the Linux-only sudo password section is hidden on Windows/macOS, with a platform note (Windows: run as Administrator; macOS: password prompt).

## [0.2.1] - 2026

First cross-platform release — Windows (`exe`/`msi`) and macOS (`dmg`) builds produced by GitHub Actions.

### Fixed
- Non-Linux builds failed to compile (`list_connections` referenced a Linux-only helper). Fixed and verified in CI for all three OS.

## [0.2.0] - 2026

### Ports
- Listening / Connections mode toggle (all TCP/UDP sockets via `ss -tunp`).
- Well-known service names (SSH, MySQL, Redis, Postgres, ...) shown as badges.
- Open in browser and TCP probe from the detail panel.
- Process details on Linux: user, memory (RSS), executable path, command line.
- Export CSV / JSON to the Downloads folder.

### Firewall
- Delete rules.
- Port ranges (`3000-3010`) and CIDR subnets (`192.168.1.0/24`).
- Enable / Disable the native firewall (UFW / Windows Defender).

### UX
- System tray; close hides to tray (Show / Quit from the tray menu).
- Watch mode — notifications when listening ports open or close.
- Persisted settings (filters, auto-refresh interval, theme).
- Light / Dark theme toggle.
- Update checker — auto-checks on startup, picks the right installer per platform, downloads and installs it.

## [0.1.0] - 2026

Initial release.

- List listening TCP/UDP ports, PID, and process name (Linux).
- Admin mode to see root/system PIDs.
- Kill the process owning a port.
- Firewall allow rule: IP → port/proto (UFW / netsh).
- Active firewall rules list.
- Auto-refresh with interval and progress indicator.
- Search and filter (protocol, address).
- Sudo password stored in the OS keyring (encrypted) for prompt-free elevated operations.
