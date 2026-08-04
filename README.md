<p align="center">
  <img src="app-icon.svg" width="120" alt="PortGuard logo" />
</p>

<h1 align="center">PortGuard</h1>

<p align="center">
  Network port manager — see which ports are listening, identify the process behind each one, kill it, and manage firewall allow rules from a single desktop app.
</p>

<p align="center">
  <strong>Linux</strong> · Windows · macOS
</p>

<p align="center">
  Built with <strong>Tauri 2</strong> + <strong>React</strong> + <strong>TypeScript</strong> + <strong>Rust</strong>.
</p>

## Features

- **Listening ports** — TCP/UDP, local & foreign address, state, PID, and process name.
- **Admin mode** — see every PID, including root/system processes (via `pkexec` or `sudo`).
- **Kill process** — terminate the process owning a port, with confirmation.
- **Firewall allow** — allow a specific IP to reach one port (`ufw` on Linux, `netsh` on Windows).
- **Active firewall rules** — view rules currently installed on your host.
- **Auto-refresh** — configurable interval (5–60s) with a visible progress indicator.
- **Filter & search** — by protocol (TCP/UDP), wildcard/specific address, and keyword (port, PID, process, address).
- **Sudo without prompts** — store the sudo password once in the OS keyring (encrypted); elevated operations run automatically.
- **Update checker** — compare the running version against the latest GitHub release.

## Requirements

- **Linux**: `ss` (iproute2), `ufw` for firewall features. Desktop with polkit (GNOME/KDE).
- **Windows**: `netstat`, `netsh` (built into Windows).
- **macOS**: `lsof`. Firewall via `pf` is not fully automated yet.

## Install

### Linux (Debian/Ubuntu)

Download from [GitHub Releases](https://github.com/rendi-febrian/portguard/releases):

```bash
# .deb package
sudo dpkg -i PortGuard_0.1.0_amd64.deb

# or AppImage (no install needed)
chmod +x PortGuard_0.1.0_amd64.AppImage
./PortGuard_0.1.0_amd64.AppImage
```

### Windows / macOS

Build from source (see Development), or wait for an official release.

## Usage

1. **Ports** — the listening-port list loads automatically. Click a row for details, ✕ to kill.
2. **Admin mode** (amber shield toggle) — enable to see every PID. On Linux this shows an authorization prompt unless a sudo password is stored in **Settings**.
3. **Firewall** — enter an IP + port + protocol, click **Allow**. Active rules appear in the card next to it.
4. **Settings** — store/remove the sudo password in the OS keyring.

### Linux notes

- `ss -tulpn` without root only shows PIDs of processes you own. Root/system processes (e.g. ports 22, 3306, 80) require Admin mode.
- Some kernel-owned sockets (e.g. multicast `224.0.0.251:5353`) have no PID at all — that is expected.
- Reading/writing `ufw` rules requires root: click **Load as admin**, or store your password in Settings.

## Development

Prerequisites: [Rust](https://rustup.rs), [Node.js](https://nodejs.org) ≥ 18, and the Tauri system dependencies — see [Tauri prerequisites](https://tauri.app/start/prerequisites/).

```bash
# Linux (Debian/Ubuntu)
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev

npm install
npm run tauri dev        # development mode
npm run tauri build      # release build (.deb/.AppImage/.msi/.dmg)
```

### Tests

```bash
cd src-tauri && cargo test
```

## Project Structure

```
src/                  React frontend (UI, views, components)
src-tauri/            Rust backend (commands, parsing, firewall)
  src/commands.rs     All commands: list_ports, kill_port, firewall_allow, sudo keyring
  src/lib.rs          Command registration + app entry
app-icon.svg          App logo source
```

## Tech Stack

- **Tauri 2** — cross-platform desktop framework
- **React + TypeScript + Vite** — UI
- **Tailwind CSS v4** — styling
- **Rust** — system access (`ss`, `kill`, `ufw`, `netsh`, `lsof`, keyring)
- **OS keyring** (Linux Secret Service) — encrypted sudo password storage

## License

[MIT](./LICENSE) — © Rendi Febrian
