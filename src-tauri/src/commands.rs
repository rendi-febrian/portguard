use serde::{Deserialize, Serialize};

const KEYRING_SERVICE: &str = "com.rendifebrian.portguard";
const KEYRING_SUDO: &str = "sudo-password";

#[derive(Serialize, Deserialize, Clone)]
pub struct PortInfo {
    pub proto: String,
    pub local_addr: String,
    pub port: u16,
    pub foreign_addr: String,
    pub state: String,
    pub pid: Option<u32>,
    pub process: Option<String>,
    pub fd: Option<u32>,
}

#[derive(Serialize)]
pub struct SystemInfo {
    pub os: String,
    pub arch: String,
}

#[derive(Serialize)]
pub struct FirewallStatus {
    pub backend: String,
    pub enabled: bool,
}

#[tauri::command]
pub fn firewall_status() -> FirewallStatus {
    #[cfg(target_os = "linux")]
    {
        // Real ufw state lives in /etc/ufw/ufw.conf (ENABLED=yes|no), readable without root.
        // systemctl is-active ufw is unreliable — the unit can be active while the firewall is off.
        if let Ok(conf) = std::fs::read_to_string("/etc/ufw/ufw.conf") {
            return FirewallStatus {
                backend: "ufw".to_string(),
                enabled: conf.lines().any(|l| l.trim() == "ENABLED=yes"),
            };
        }
        for (backend, unit) in [("firewalld", "firewalld")] {
            if let Ok(o) = run_output("systemctl", &["is-active", unit]) {
                if String::from_utf8_lossy(&o.stdout).trim() == "active" {
                    return FirewallStatus {
                        backend: backend.to_string(),
                        enabled: true,
                    };
                }
            }
        }
        FirewallStatus {
            backend: "ufw".to_string(),
            enabled: false,
        }
    }
    #[cfg(target_os = "windows")]
    {
        FirewallStatus {
            backend: "netsh".to_string(),
            enabled: true,
        }
    }
    #[cfg(target_os = "macos")]
    {
        FirewallStatus {
            backend: "pf".to_string(),
            enabled: true,
        }
    }
}

#[derive(Serialize, Clone)]
pub struct FirewallRule {
    pub action: String,
    pub ip: Option<String>,
    pub port: Option<u16>,
    pub proto: String,
    pub spec: String,
}

#[tauri::command]
pub fn system_info() -> SystemInfo {
    SystemInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    }
}

fn run_output(cmd: &str, args: &[&str]) -> Result<std::process::Output, String> {
    std::process::Command::new(cmd)
        .args(args)
        .output()
        .map_err(|e| format!("failed to run {}: {}", cmd, e))
}

// ---- Elevated execution (Linux) ----

#[cfg(target_os = "linux")]
fn sudo_password() -> Option<String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_SUDO)
        .ok()
        .and_then(|e| e.get_password().ok())
}

#[cfg(target_os = "linux")]
fn run_elevated(bin: &str, args: &[&str]) -> Result<std::process::Output, String> {
    // If a sudo password is stored in the keyring -> sudo -S (no prompt).
    // Otherwise fall back to pkexec (GUI authorization prompt).
    if let Some(pw) = sudo_password() {
        use std::io::Write;
        let mut cmd = std::process::Command::new("sudo");
        cmd.args(["-S", "-p", ""]);
        cmd.arg(bin).args(args);
        cmd.stdin(std::process::Stdio::piped());
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("failed to run sudo: {}", e))?;
        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.write_all(format!("{}\n", pw).as_bytes());
        }
        let out = child
            .wait_with_output()
            .map_err(|e| format!("sudo failed: {}", e))?;
        return Ok(out);
    }
    let mut cmd = std::process::Command::new("pkexec");
    cmd.arg(bin).args(args);
    cmd.output()
        .map_err(|e| format!("failed to run pkexec: {}", e))
}

#[tauri::command]
pub fn set_sudo_password(password: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_SUDO)
            .map_err(|e| format!("keyring unavailable: {}", e))?;
        entry
            .set_password(&password)
            .map_err(|e| format!("failed to store in keyring: {}", e))?;
        Ok(())
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = password;
        Err("Sudo password storage is only supported on Linux".to_string())
    }
}

#[tauri::command]
pub fn clear_sudo_password() -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_SUDO)
            .map_err(|e| format!("keyring unavailable: {}", e))?;
        entry
            .delete_credential()
            .map_err(|e| format!("failed to delete: {}", e))?;
        Ok(())
    }
    #[cfg(not(target_os = "linux"))]
    {
        Err("Sudo password storage is only supported on Linux".to_string())
    }
}

#[tauri::command]
pub fn has_sudo_password() -> bool {
    #[cfg(target_os = "linux")]
    {
        sudo_password().is_some()
    }
    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}

fn split_addr_port(s: &str) -> (String, u16) {
    if let Some(idx) = s.find("]:") {
        let port = s[idx + 2..].parse().unwrap_or(0);
        (s[1..idx].to_string(), port)
    } else if let Some((a, p)) = s.rsplit_once(':') {
        (a.to_string(), p.parse().unwrap_or(0))
    } else {
        (s.to_string(), 0)
    }
}

fn extract_pid_and_proc(process_field: &str) -> (Option<u32>, Option<String>, Option<u32>) {
    let mut pid = None;
    let mut proc_name = None;
    let mut fd = None;
    if let Some(pid_start) = process_field.find("pid=") {
        let digits: String = process_field[pid_start + 4..]
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect();
        pid = digits.parse().ok();
    }
    if let Some(start) = process_field.find("((\"") {
        let rest = &process_field[start + 3..];
        if let Some(end) = rest.find('"') {
            proc_name = Some(rest[..end].to_string());
        }
    }
    if let Some(fd_start) = process_field.find("fd=") {
        let digits: String = process_field[fd_start + 3..]
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect();
        fd = digits.parse().ok();
    }
    // pid=0 = socket kernel/tak teratribusi — anggap tanpa proses
    if pid == Some(0) {
        return (None, None, None);
    }
    (pid, proc_name.filter(|n| !n.is_empty()), fd)
}

fn parse_ss_line(line: &str) -> Option<PortInfo> {
    let cols: Vec<&str> = line.split_whitespace().collect();
    if cols.len() < 5 {
        return None;
    }
    // Dua format ss:
    //  - ltpn/lunp: State Recv-Q Send-Q Local Peer Process   (col[0] = state)
    //  - tulpn:     Netid State Recv-Q Send-Q Local Peer Proc (col[0] = netid/proto)
    let (state, proto, local_idx, foreign_idx) = if cols[0] == "tcp" || cols[0] == "udp" {
        (cols[1], cols[0], 4, 5)
    } else {
        (cols[0], if cols[0] == "UNCONN" { "udp" } else { "tcp" }, 3, 4)
    };
    if state == "State" || state == "Netid" {
        return None;
    }
    let (local_addr, port) = split_addr_port(cols[local_idx]);
    let (pid, process, fd) = if cols.len() > foreign_idx + 1 {
        extract_pid_and_proc(&cols[foreign_idx + 1..].join(" "))
    } else {
        (None, None, None)
    };
    Some(PortInfo {
        proto: proto.to_string(),
        local_addr,
        port,
        foreign_addr: cols[foreign_idx].to_string(),
        state: state.to_string(),
        pid,
        process,
        fd,
    })
}

#[cfg(target_os = "linux")]
fn list_platform(elevated: bool) -> Result<Vec<PortInfo>, String> {
    // ss -tulpn = tcp + udp listening in one call; proto inferred from state.
    // Elevated so root/system PIDs are visible.
    let output = if elevated {
        run_elevated("ss", &["-tulpn"])?
    } else {
        run_output("ss", &["-tulpn"])?
    };
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let mut out = Vec::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        if let Some(p) = parse_ss_line(line) {
            out.push(p);
        }
    }
    Ok(out)
}

#[cfg(target_os = "windows")]
fn list_platform(elevated: bool) -> Result<Vec<PortInfo>, String> {
    let _ = elevated;
    let output = run_output("netstat", &["-ano"])?;
    let names = tasklist_map();
    let mut out = Vec::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.is_empty() {
            continue;
        }
        let proto = cols[0];
        if proto != "TCP" && proto != "UDP" {
            continue;
        }
        // TCP: Proto Local Foreign State PID | UDP: Proto Local Foreign PID (no State)
        let (foreign, state, pid) = if proto == "UDP" {
            if cols.len() < 4 {
                continue;
            }
            (cols[2].to_string(), String::new(), cols[3].parse().ok())
        } else {
            if cols.len() < 5 {
                continue;
            }
            (cols[2].to_string(), cols[3].to_string(), cols[4].parse().ok())
        };
        let (local_addr, port) = split_addr_port(cols[1]);
        out.push(PortInfo {
            proto: proto.to_lowercase(),
            local_addr,
            port,
            foreign_addr: foreign,
            state,
            pid,
            process: pid.and_then(|p| names.get(&p).cloned()),
            fd: None,
        });
    }
    Ok(out)
}

#[cfg(target_os = "windows")]
fn tasklist_map() -> std::collections::HashMap<u32, String> {
    let mut map = std::collections::HashMap::new();
    if let Ok(o) = run_output("tasklist", &["/fo", "csv", "/nh"]) {
        for line in String::from_utf8_lossy(&o.stdout).lines() {
            // CSV: "image.exe","PID","Session","Session#","Mem"
            let mut it = line.splitn(2, ',');
            let name = it.next().unwrap_or("").trim_matches('"').to_string();
            let pid = it
                .next()
                .unwrap_or("")
                .split(',')
                .next()
                .unwrap_or("")
                .trim_matches('"')
                .parse::<u32>()
                .ok();
            if let Some(p) = pid {
                map.insert(p, name);
            }
        }
    }
    map
}

#[cfg(target_os = "macos")]
fn list_platform(_elevated: bool) -> Result<Vec<PortInfo>, String> {
    let output = run_output("lsof", &["-i", "-P", "-n"])?;
    let mut out = Vec::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() >= 10 && (cols[4] == "IPv4" || cols[4] == "IPv6") {
            let (local_addr, port) = split_addr_port(cols[8]);
            out.push(PortInfo {
                proto: cols[7].to_lowercase(),
                local_addr,
                port,
                foreign_addr: String::new(),
                state: cols
                    .get(9)
                    .map(|s| s.trim_matches(|c| c == '(' || c == ')').to_string())
                    .unwrap_or_default(),
                pid: cols[1].parse().ok(),
                process: Some(cols[0].to_string()),
                fd: None,
            });
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn list_ports(elevated: bool) -> Result<Vec<PortInfo>, String> {
    list_platform(elevated)
}

#[cfg(target_os = "linux")]
fn kill_platform(pid: u32) -> Result<std::process::Output, String> {
    let pid_s = pid.to_string();
    match run_output("kill", &[&pid_s]) {
        Ok(o) if o.status.success() => Ok(o),
        _ => run_elevated("kill", &[&pid_s]),
    }
}

#[cfg(target_os = "windows")]
fn kill_platform(pid: u32) -> Result<std::process::Output, String> {
    run_output("taskkill", &["/PID", &pid.to_string(), "/F"])
}

#[cfg(target_os = "macos")]
fn kill_platform(pid: u32) -> Result<std::process::Output, String> {
    run_output("kill", &[&pid.to_string()])
}

#[tauri::command]
pub fn kill_port(pid: u32) -> Result<String, String> {
    let output = kill_platform(pid)?;
    if output.status.success() {
        Ok(format!("Process {} terminated successfully", pid))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[tauri::command]
pub fn firewall_allow(ip: String, port: String, proto: String) -> Result<String, String> {
    if ip.trim().is_empty() {
        return Err("IP must not be empty".to_string());
    }
    let proto = proto.to_lowercase();
    if proto != "tcp" && proto != "udp" {
        return Err("Protocol must be tcp or udp".to_string());
    }
    // port bisa single ("8080") atau range ("3000-3010"/"3000:3010")
    let p = normalize_port(port.trim());
    if let Err(e) = &p {
        return Err(e.clone());
    }
    let port_arg = p.unwrap();

    #[cfg(target_os = "linux")]
    {
        // ufw needs root — elevated (sudo from keyring) or pkexec prompt fallback
        let args = [
            "allow",
            "from",
            ip.trim(),
            "to",
            "any",
            "port",
            &port_arg, // ufw range syntax: 3000:3010
            "proto",
            &proto,
        ];
        let output = run_elevated("ufw", &args)?;
        if output.status.success() {
            Ok(format!("Firewall: allow {} to port {} {}", ip, port, proto))
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
        }
    }

    #[cfg(target_os = "windows")]
    {
        let rule_name = format!("PortGuard Allow {} {} {}", ip, port, proto);
        let localport = port_arg.replace(':', "-"); // netsh range syntax: 3000-3010
        let rules = [
            "advfirewall",
            "firewall",
            "add",
            "rule",
            &format!("name={}", rule_name),
            "dir=in",
            "action=allow",
            &format!("remoteip={}", ip),
            &format!("localport={}", localport),
            &format!("protocol={}", proto),
        ];
        let output = run_output("netsh", &rules)?;
        if output.status.success() {
            Ok(format!("Firewall: allow {} to port {} {}", ip, port, proto))
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
        }
    }

    #[cfg(target_os = "macos")]
    {
        let _ = (ip, port, proto, port_arg);
        Err("macOS firewall automation is not supported yet".to_string())
    }
}

/// Normalize a port input to ufw syntax: single "8080" or range "3000:3010".
fn normalize_port(raw: &str) -> Result<String, String> {
    let v = raw.trim();
    if v.is_empty() {
        return Err("Port must not be empty".to_string());
    }
    fn valid(p: &str) -> bool {
        match p.parse::<u16>() {
            Ok(n) => n >= 1,
            Err(_) => false,
        }
    }
    if valid(v) {
        return Ok(v.to_string());
    }
    if let Some(sep) = v.find(|c| c == '-' || c == ':') {
        let (a, b) = (v[..sep].trim(), v[sep + 1..].trim());
        if !a.is_empty() && !b.is_empty() && valid(a) && valid(b) && a.parse::<u16>().unwrap() <= b.parse::<u16>().unwrap() {
            return Ok(format!("{}:{}", a, b));
        }
    }
    Err(format!("Invalid port or range: {}", v))
}

/// Delete a firewall rule. On Linux `spec` is the ufw line (e.g. "ufw allow from ... to any port 3000 proto tcp").
#[tauri::command]
pub fn delete_firewall_rule(spec: String) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let tokens: Vec<&str> = spec.split_whitespace().collect();
        if tokens.first() == Some(&"ufw") && tokens.len() >= 2 {
            let mut args = Vec::with_capacity(tokens.len() + 1);
            args.push("delete");
            args.extend_from_slice(&tokens[1..]);
            let output = run_elevated("ufw", &args)?;
            if output.status.success() {
                return Ok(format!("Rule deleted: {}", spec));
            }
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
        Err("Unrecognized firewall rule".to_string())
    }
    #[cfg(target_os = "windows")]
    {
        let output = run_output(
            "netsh",
            &["advfirewall", "firewall", "delete", "rule", &format!("name={}", spec)],
        )?;
        if output.status.success() {
            Ok(format!("Rule deleted: {}", spec))
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
        }
    }
    #[cfg(target_os = "macos")]
    {
        let _ = spec;
        Err("Rule deletion is not supported on macOS yet".to_string())
    }
}

/// Enable or disable the native firewall (UFW on Linux, Windows Defender Firewall on Windows).
#[tauri::command]
pub fn set_firewall_enabled(enabled: bool) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let action = if enabled { "enable" } else { "disable" };
        let output = run_elevated("ufw", &[action])?;
        if output.status.success() {
            Ok(format!("UFW {}", action))
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
        }
    }
    #[cfg(target_os = "windows")]
    {
        let state = if enabled { "on" } else { "off" };
        let output = run_output("netsh", &["advfirewall", "set", "allprofiles", "state", state])?;
        if output.status.success() {
            Ok(format!("Firewall {}", state))
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
        }
    }
    #[cfg(target_os = "macos")]
    {
        let _ = enabled;
        Err("Firewall toggle is not supported on macOS yet".to_string())
    }
}

// ---- Ports: connections, probe, open, process detail, export ----

/// All TCP/UDP sockets (listening + established), same parser as list_ports.
#[tauri::command]
pub fn list_connections(elevated: bool) -> Result<Vec<PortInfo>, String> {
    #[cfg(target_os = "linux")]
    {
        let output = if elevated {
            run_elevated("ss", &["-tunp"])?
        } else {
            run_output("ss", &["-tunp"])?
        };
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
        let mut out = Vec::new();
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            if let Some(p) = parse_ss_line(line) {
                out.push(p);
            }
        }
        Ok(out)
    }
    #[cfg(not(target_os = "linux"))]
    {
        // netstat (Windows) / lsof (macOS) report all sockets already
        let _ = elevated;
        list_platform(false)
    }
}

/// TCP connect probe — true if something answers on host:port within 1.5s.
#[tauri::command]
pub fn probe_port(host: String, port: u16) -> Result<bool, String> {
    use std::net::ToSocketAddrs;
    use std::time::Duration;
    let addr = format!("{}:{}", host, port);
    let addrs: Vec<_> = addr
        .to_socket_addrs()
        .map_err(|e| format!("Failed to resolve {}: {}", addr, e))?
        .collect();
    for a in addrs {
        if std::net::TcpStream::connect_timeout(&a, Duration::from_millis(1500)).is_ok() {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Open a URL in the default browser.
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let o = run_output("xdg-open", &[&url])?;
        if o.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&o.stderr).trim().to_string())
        }
    }
    #[cfg(target_os = "macos")]
    {
        let o = run_output("open", &[&url])?;
        if o.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&o.stderr).trim().to_string())
        }
    }
    #[cfg(target_os = "windows")]
    {
        let o = run_output("cmd", &["/c", "start", "", &url])?;
        if o.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&o.stderr).trim().to_string())
        }
    }
}

#[derive(Serialize)]
pub struct ProcessDetail {
    pub pid: u32,
    pub name: Option<String>,
    pub user: Option<String>,
    pub cmdline: Option<String>,
    pub exe: Option<String>,
    pub memory_kb: Option<u64>,
}

#[cfg(target_os = "linux")]
fn uid_to_name(uid: u32) -> String {
    if let Ok(pw) = std::fs::read_to_string("/etc/passwd") {
        for line in pw.lines() {
            let parts: Vec<&str> = line.split(':').collect();
            if parts.len() >= 3 && parts[2].parse::<u32>().ok() == Some(uid) {
                return parts[0].to_string();
            }
        }
    }
    uid.to_string()
}

/// Process details from /proc (Linux). macOS/Windows return an error for now.
#[tauri::command]
pub fn process_detail(pid: u32) -> Result<ProcessDetail, String> {
    #[cfg(target_os = "linux")]
    {
        let base = format!("/proc/{}", pid);
        let mut d = ProcessDetail {
            pid,
            name: None,
            user: None,
            cmdline: None,
            exe: None,
            memory_kb: None,
        };
        if let Ok(status) = std::fs::read_to_string(format!("{}/status", base)) {
            for line in status.lines() {
                if let Some(v) = line.strip_prefix("Name:") {
                    d.name = Some(v.trim().to_string());
                } else if let Some(v) = line.strip_prefix("Uid:") {
                    let uid = v
                        .split_whitespace()
                        .next()
                        .and_then(|s| s.parse::<u32>().ok());
                    d.user = uid.map(uid_to_name);
                } else if let Some(v) = line.strip_prefix("VmRSS:") {
                    d.memory_kb = v.split_whitespace().next().and_then(|s| s.parse().ok());
                }
            }
        }
        if let Ok(c) = std::fs::read(format!("{}/cmdline", base)) {
            let first: Vec<u8> = c.into_iter().take_while(|&b| b != 0).collect();
            d.cmdline = Some(String::from_utf8_lossy(&first).to_string());
        }
        if let Ok(exe) = std::fs::read_link(format!("{}/exe", base)) {
            d.exe = Some(exe.to_string_lossy().to_string());
        }
        Ok(d)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = pid;
        Err("Process detail is only available on Linux".to_string())
    }
}

fn home_dir() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE").ok()
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME").ok()
    }
}

/// Export the current port list to ~/Downloads as CSV or JSON. Returns the saved path.
#[tauri::command]
pub fn export_ports(ports: Vec<PortInfo>, format: String) -> Result<String, String> {
    let home = home_dir().ok_or("Could not determine your home directory".to_string())?;
    let dir = format!("{}/Downloads", home);
    let _ = std::fs::create_dir_all(&dir);
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let fmt = if format == "json" { "json" } else { "csv" };
    let path = format!("{}/portguard-{}.{}", dir, ts, fmt);
    let content = if fmt == "json" {
        serde_json::to_string_pretty(&ports).map_err(|e| e.to_string())?
    } else {
        ports_to_csv(&ports)
    };
    std::fs::write(&path, content).map_err(|e| format!("Failed to write {}: {}", path, e))?;
    Ok(path)
}

/// Download a release asset into ~/Downloads. Returns the saved path.
#[tauri::command]
pub fn download_release(url: String, dest_name: String) -> Result<String, String> {
    let home = home_dir().ok_or("Could not determine your home directory".to_string())?;
    let dir = format!("{}/Downloads", home);
    let _ = std::fs::create_dir_all(&dir);
    let dest = format!("{}/{}", dir, dest_name);
    let output = run_output("curl", &["-fSL", "--max-time", "300", "-o", &dest, &url])?;
    if output.status.success() {
        Ok(dest)
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// Install a downloaded release artifact (elevated where needed).
#[tauri::command]
pub fn install_release(path: String) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        if path.ends_with(".deb") {
            let out = run_elevated("dpkg", &["-i", &path])?;
            if out.status.success() {
                return Ok("Installed. Restart the app to use the new version.".to_string());
            }
            return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
        }
        if path.ends_with(".AppImage") {
            let _ = run_output("chmod", &["+x", &path]);
            return Ok(format!("AppImage ready to run: {}", path));
        }
        Err("Unsupported installer for Linux".to_string())
    }
    #[cfg(target_os = "windows")]
    {
        if path.ends_with(".msi") {
            let _ = run_output("msiexec", &["/i", &path]);
            Ok("MSI installer launched.".to_string())
        } else if path.ends_with(".exe") {
            let _ = run_output("cmd", &["/c", "start", "", &path]);
            Ok("Installer launched.".to_string())
        } else {
            Err("Unsupported installer for Windows".to_string())
        }
    }
    #[cfg(target_os = "macos")]
    {
        if path.ends_with(".dmg") {
            let _ = run_output("open", &[&path]);
            Ok("DMG mounted — drag the app to Applications.".to_string())
        } else {
            Err("Unsupported installer for macOS".to_string())
        }
    }
}

fn csv_escape(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

fn ports_to_csv(ports: &[PortInfo]) -> String {
    let mut out = String::from("proto,local_addr,port,foreign_addr,state,pid,process\n");
    for p in ports {
        out.push_str(&format!(
            "{},{},{},{},{},{},{}\n",
            p.proto,
            csv_escape(&p.local_addr),
            p.port,
            csv_escape(&p.foreign_addr),
            p.state,
            p.pid.map(|x| x.to_string()).unwrap_or_default(),
            p.process.as_deref().map(csv_escape).unwrap_or_default()
        ));
    }
    out
}

fn parse_ufw_rules(out: &str) -> Vec<FirewallRule> {
    let mut rules = Vec::new();
    for line in out.lines() {
        let tokens: Vec<&str> = line.split_whitespace().collect();
        if tokens.len() < 2 || tokens[0] != "ufw" {
            continue;
        }
        let action = tokens[1].to_string();
        let mut ip: Option<String> = None;
        let mut port: Option<u16> = None;
        let mut proto = String::new();
        let mut i = 2;
        while i < tokens.len() {
            match tokens[i] {
                "from" => {
                    if i + 1 < tokens.len() {
                        ip = Some(tokens[i + 1].to_string());
                    }
                    i += 2;
                }
                "port" => {
                    if i + 1 < tokens.len() {
                        port = tokens[i + 1].parse().ok();
                    }
                    i += 2;
                }
                "proto" => {
                    if i + 1 < tokens.len() {
                        proto = tokens[i + 1].to_string();
                    }
                    i += 2;
                }
                "to" | "any" => i += 1,
                t => {
                    if let Some(idx) = t.find('/') {
                        port = t[..idx].parse().ok();
                        if proto.is_empty() {
                            proto = t[idx + 1..].to_string();
                        }
                    } else if proto.is_empty() {
                        port = t.parse().ok();
                    }
                    i += 1;
                }
            }
        }
        rules.push(FirewallRule {
            action,
            ip,
            port,
            proto,
            spec: line.trim().to_string(),
        });
    }
    rules
}

#[cfg(target_os = "linux")]
fn list_firewall_platform(elevated: bool) -> Result<Vec<FirewallRule>, String> {
    let output = match run_output("ufw", &["show", "added"]) {
        Err(e) => return Err(e),
        Ok(o) => o,
    };
    if output.status.success() {
        return Ok(parse_ufw_rules(&String::from_utf8_lossy(&output.stdout)));
    }
    if !elevated {
        return Err(
            "Reading ufw rules requires root access — click \"Load as admin\" to request authorization"
                .to_string(),
        );
    }
    // ulang elevated (sudo keyring / pkexec)
    let elevated = run_elevated("ufw", &["show", "added"])?;
    if !elevated.status.success() {
        return Err(String::from_utf8_lossy(&elevated.stderr).trim().to_string());
    }
    Ok(parse_ufw_rules(&String::from_utf8_lossy(&elevated.stdout)))
}

#[cfg(target_os = "windows")]
fn list_firewall_platform(_elevated: bool) -> Result<Vec<FirewallRule>, String> {
    let output = run_output(
        "netsh",
        &["advfirewall", "firewall", "show", "rule", "name=all", "dir=in"],
    )?;
    let mut rules = Vec::new();
    let mut cur: Option<FirewallRule> = None;
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let l = line.trim();
        if l.starts_with("Rule Name:") {
            if let Some(r) = cur.take() {
                rules.push(r);
            }
            let name = l
                .splitn(2, ':')
                .nth(1)
                .map(|s| s.trim().to_string())
                .unwrap_or_default();
            cur = Some(FirewallRule {
                action: String::new(),
                ip: None,
                port: None,
                proto: String::new(),
                spec: name,
            });
        } else if let Some(r) = cur.as_mut() {
            if let Some(v) = l.strip_prefix("Action:") {
                r.action = v.trim().to_string();
            } else if let Some(v) = l.strip_prefix("LocalPort:") {
                r.port = v.trim().parse().ok();
            } else if let Some(v) = l.strip_prefix("RemoteIP:") {
                let ip = v.trim().to_string();
                if !ip.is_empty() && ip != "Any" {
                    r.ip = Some(ip);
                }
            } else if let Some(v) = l.strip_prefix("Protocol:") {
                r.proto = v.trim().to_string();
            }
        }
    }
    if let Some(r) = cur.take() {
        rules.push(r);
    }
    Ok(rules
        .into_iter()
        .filter(|r| r.spec.starts_with("PortGuard"))
        .collect())
}

#[cfg(target_os = "macos")]
fn list_firewall_platform(_elevated: bool) -> Result<Vec<FirewallRule>, String> {
    Ok(Vec::new())
}

#[tauri::command]
pub fn list_firewall_rules(elevated: bool) -> Result<Vec<FirewallRule>, String> {
    list_firewall_platform(elevated)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ss_tcp_line_with_process() {
        let p = parse_ss_line(
            "LISTEN 0 4096 127.0.0.1:3060 0.0.0.0:* users:((\"node\",pid=1234,fd=3))",
        )
        .unwrap();
        assert_eq!(p.proto, "tcp");
        assert_eq!(p.local_addr, "127.0.0.1");
        assert_eq!(p.port, 3060);
        assert_eq!(p.pid, Some(1234));
        assert_eq!(p.process.as_deref(), Some("node"));
    }

    #[test]
    fn parses_ss_line_without_process() {
        let p = parse_ss_line("LISTEN 0 4096 0.0.0.0:3306 0.0.0.0:*").unwrap();
        assert_eq!(p.port, 3306);
        assert_eq!(p.local_addr, "0.0.0.0");
        assert_eq!(p.pid, None);
        assert_eq!(p.process, None);
    }

    #[test]
    fn parses_ipv6_and_interface_addrs() {
        assert_eq!(split_addr_port("[::1]:631"), ("::1".to_string(), 631));
        assert_eq!(
            split_addr_port("[fd7a:115c:a1e0::c533:1856]:60995"),
            ("fd7a:115c:a1e0::c533:1856".to_string(), 60995)
        );
        assert_eq!(
            split_addr_port("127.0.0.53%lo:53"),
            ("127.0.0.53%lo".to_string(), 53)
        );
        assert_eq!(split_addr_port("*:15611"), ("*".to_string(), 15611));
        assert_eq!(
            split_addr_port("[::ffff:127.0.0.1]:39835"),
            ("::ffff:127.0.0.1".to_string(), 39835)
        );
    }

    #[test]
    fn parses_udp_unconn_line() {
        let p = parse_ss_line(
            "UNCONN 0 0 224.0.0.251:5353 0.0.0.0:* users:((\"chrome\",pid=6566,fd=199))",
        )
        .unwrap();
        assert_eq!(p.proto, "udp");
        assert_eq!(p.port, 5353);
        assert_eq!(p.state, "UNCONN");
        assert_eq!(p.pid, Some(6566));
    }

    #[test]
    fn skips_header_line() {
        assert!(parse_ss_line(
            "State Recv-Q Send-Q Local Address:Port Peer Address:Port Process",
        )
        .is_none());
    }

    #[test]
    fn parses_tulpn_netid_format() {
        // ss -tulpn: kolom pertama Netid (tcp/udp)
        let p = parse_ss_line(
            "udp UNCONN 0 0 172.18.0.1:50727 0.0.0.0:* users:((\"chrome\",pid=6629,fd=86))",
        )
        .unwrap();
        assert_eq!(p.proto, "udp");
        assert_eq!(p.local_addr, "172.18.0.1");
        assert_eq!(p.port, 50727);
        assert_eq!(p.pid, Some(6629));

        let p = parse_ss_line("tcp LISTEN 0 4096 0.0.0.0:3306 0.0.0.0:*").unwrap();
        assert_eq!(p.proto, "tcp");
        assert_eq!(p.port, 3306);
        assert_eq!(p.pid, None);

        assert!(parse_ss_line(
            "Netid State Recv-Q Send-Q Local Address:Port Peer Address:Port Process"
        )
        .is_none());
    }

    #[test]
    fn pid_zero_is_kernel() {
        let p = parse_ss_line(
            "udp UNCONN 0 0 0.0.0.0:137 0.0.0.0:* users:((\"\",pid=0,fd=4))",
        )
        .unwrap();
        assert_eq!(p.pid, None);
        assert_eq!(p.process, None);
    }

    #[test]
    fn normalizes_port_range() {
        assert_eq!(normalize_port("8080").unwrap(), "8080");
        assert_eq!(normalize_port("3000-3010").unwrap(), "3000:3010");
        assert_eq!(normalize_port("3000:3010").unwrap(), "3000:3010");
        assert!(normalize_port("").is_err());
        assert!(normalize_port("3010-3000").is_err());
        assert!(normalize_port("abc").is_err());
        assert!(normalize_port("0").is_err());
    }

    #[test]
    fn csv_escapes_fields() {
        let p = parse_ss_line(
            "tcp LISTEN 0 4096 127.0.0.1:3060 0.0.0.0:* users:((\"node\",pid=1234,fd=3))",
        )
        .unwrap();
        let csv = ports_to_csv(&[p]);
        assert!(csv.starts_with("proto,local_addr,port,foreign_addr,state,pid,process\n"));
        assert!(csv.contains("tcp,127.0.0.1,3060,0.0.0.0:*,LISTEN,1234,node\n"));
    }

    #[test]
    fn parses_ufw_rules() {
        let rules = parse_ufw_rules(
            "ufw allow 22/tcp\nufw allow from 192.168.1.50 to any port 8080 proto tcp\nufw deny 53",
        );
        assert_eq!(rules.len(), 3);
        assert_eq!(rules[0].action, "allow");
        assert_eq!(rules[0].port, Some(22));
        assert_eq!(rules[0].proto, "tcp");
        assert_eq!(rules[1].ip.as_deref(), Some("192.168.1.50"));
        assert_eq!(rules[1].port, Some(8080));
        assert_eq!(rules[1].proto, "tcp");
        assert_eq!(rules[2].action, "deny");
        assert_eq!(rules[2].port, Some(53));
    }
}