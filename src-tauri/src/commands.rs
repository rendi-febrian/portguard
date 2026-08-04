use serde::Serialize;

const KEYRING_SERVICE: &str = "com.rendifebrian.portguard";
const KEYRING_SUDO: &str = "sudo-password";

#[derive(Serialize, Clone)]
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
        // State beneran ufw ada di /etc/ufw/ufw.conf (ENABLED=yes|no), readable tanpa root.
        // systemctl is-active ufw nggak akurat — unit bisa aktif walau firewall mati.
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
        .map_err(|e| format!("gagal jalankan {}: {}", cmd, e))
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
    // Kalau password sudo tersimpan di keyring -> sudo -S (tanpa prompt).
    // Kalau tidak -> fallback pkexec (prompt otorisasi GUI).
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
            .map_err(|e| format!("gagal jalankan sudo: {}", e))?;
        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.write_all(format!("{}\n", pw).as_bytes());
        }
        let out = child
            .wait_with_output()
            .map_err(|e| format!("sudo gagal: {}", e))?;
        return Ok(out);
    }
    let mut cmd = std::process::Command::new("pkexec");
    cmd.arg(bin).args(args);
    cmd.output()
        .map_err(|e| format!("gagal jalankan pkexec: {}", e))
}

#[tauri::command]
pub fn set_sudo_password(password: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_SUDO)
            .map_err(|e| format!("keyring tidak tersedia: {}", e))?;
        entry
            .set_password(&password)
            .map_err(|e| format!("gagal menyimpan di keyring: {}", e))?;
        Ok(())
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = password;
        Err("Penyimpanan password sudo didukung di Linux saja".to_string())
    }
}

#[tauri::command]
pub fn clear_sudo_password() -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_SUDO)
            .map_err(|e| format!("keyring tidak tersedia: {}", e))?;
        entry
            .delete_credential()
            .map_err(|e| format!("gagal menghapus: {}", e))?;
        Ok(())
    }
    #[cfg(not(target_os = "linux"))]
    {
        Err("Penyimpanan password sudo didukung di Linux saja".to_string())
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
    // ss -tulpn = tcp + udp listening dalam satu pemanggilan; proto di-infer dari state.
    // Elevated biar PID proses root/system kebaca.
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
fn list_platform(_elevated: bool) -> Result<Vec<PortInfo>, String> {
    let output = run_output("netstat", &["-ano"])?;
    let mut out = Vec::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() >= 5 {
            let proto = cols[0];
            if proto == "TCP" || proto == "UDP" {
                let (local_addr, port) = split_addr_port(cols[1]);
                out.push(PortInfo {
                    proto: proto.to_lowercase(),
                    local_addr,
                    port,
                    foreign_addr: cols[2].to_string(),
                    state: cols[3].to_string(),
                    pid: cols[4].parse().ok(),
                    process: None,
                    fd: None,
                });
            }
        }
    }
    Ok(out)
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
        Ok(format!("Proses {} berhasil dihentikan", pid))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[tauri::command]
pub fn firewall_allow(ip: String, port: u16, proto: String) -> Result<String, String> {
    if ip.trim().is_empty() {
        return Err("IP tidak boleh kosong".to_string());
    }
    let proto = proto.to_lowercase();
    if proto != "tcp" && proto != "udp" {
        return Err("Proto harus tcp atau udp".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        // ufw butuh root — elevated (sudo dari keyring) atau fallback pkexec prompt
        let args = [
            "allow",
            "from",
            ip.trim(),
            "to",
            "any",
            "port",
            &port.to_string(),
            "proto",
            &proto,
        ];
        let output = run_elevated("ufw", &args)?;
        if output.status.success() {
            Ok(format!("Firewall: izinkan {} ke port {} {}", ip, port, proto))
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
        }
    }

    #[cfg(target_os = "windows")]
    {
        let rule_name = format!("PortGuard Allow {} {} {}", ip, port, proto);
        let rules = [
            "advfirewall",
            "firewall",
            "add",
            "rule",
            &format!("name={}", rule_name),
            "dir=in",
            "action=allow",
            &format!("remoteip={}", ip),
            &format!("localport={}", port),
            &format!("protocol={}", proto),
        ];
        let output = run_output("netsh", &rules)?;
        if output.status.success() {
            Ok(format!("Firewall: izinkan {} ke port {} {}", ip, port, proto))
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
        }
    }

    #[cfg(target_os = "macos")]
    {
        // pfctl butuh konfigurasi anchor; belum diotomasi penuh
        let _ = (ip, port, proto);
        Err("macOS: aturan firewall via pfctl belum diotomasi — pakai PF/PFConf manual".to_string())
    }
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
            "Membaca aturan ufw butuh akses root — klik \"Load as admin\" untuk meminta otorisasi"
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