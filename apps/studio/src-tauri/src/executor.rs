//! Bounded child-process execution, independent of Tauri so it can be tested
//! without an app handle.
//!
//! Lessons from configr's companion app's executor, applied rather than copied (plan §6.2):
//! one id — the task id IS the registry key, so cancel cannot no-op; the whole
//! process tree is killed (Unix process group, Windows Job Object with
//! kill-on-close); stdout and stderr are drained concurrently so a child blocked
//! on a full pipe cannot deadlock; output is capped to a head and a tail; a
//! watchdog ends a run that overstays its timeout; and the prompt travels on
//! stdin, never on argv.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

/// Bytes kept from the start and from the end of each stream.
const HEAD_BYTES: usize = 64 * 1024;
const TAIL_BYTES: usize = 64 * 1024;
const POLL: Duration = Duration::from_millis(50);

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RunRequest {
    pub task_id: String,
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub stdin: Option<String>,
    /// Absolute working directory, already validated by the caller.
    #[serde(default)]
    pub cwd: Option<PathBuf>,
    pub timeout_ms: u64,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RunStatus {
    Ok,
    Failed,
    Cancelled,
    Timeout,
    NotFound,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RunOutcome {
    pub task_id: String,
    pub status: RunStatus,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u128,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OutputEvent {
    pub task_id: String,
    pub stream: &'static str,
    pub line: String,
}

/// Head + tail of a stream, with a marker where bytes were dropped.
#[derive(Default)]
struct Capped {
    head: String,
    tail: String,
    dropped: usize,
}

impl Capped {
    fn push(&mut self, line: &str) {
        let line = format!("{line}\n");
        if self.head.len() + line.len() <= HEAD_BYTES {
            self.head.push_str(&line);
            return;
        }
        self.tail.push_str(&line);
        while self.tail.len() > TAIL_BYTES {
            let cut = self.tail.find('\n').map(|i| i + 1).unwrap_or(self.tail.len());
            self.dropped += cut;
            self.tail.drain(..cut);
        }
    }

    fn into_string(self) -> String {
        if self.dropped == 0 && self.tail.is_empty() {
            return self.head;
        }
        format!("{}…[{} bytes dropped]…\n{}", self.head, self.dropped, self.tail)
    }
}

/// What a running task needs for cancellation: the child, and on Windows the job that owns its tree.
struct Running {
    child: Child,
    /// Taken (dropped) to kill: the job holds kill-on-close, and closing its last
    /// handle is how a Job Object terminates every process in it.
    #[cfg(windows)]
    job: Option<win32job::Job>,
}

/// The live task registry: the task id is the only handle anyone holds.
#[derive(Default, Clone)]
pub struct Registry(Arc<Mutex<HashMap<String, Arc<Mutex<Option<Running>>>>>>);

impl Registry {
    /// Kill the whole tree of a task. Returns false when no such task is running.
    pub fn cancel(&self, task_id: &str) -> bool {
        let slot = self.0.lock().ok().and_then(|map| map.get(task_id).cloned());
        let Some(slot) = slot else { return false };
        let Ok(mut guard) = slot.lock() else { return false };
        match guard.as_mut() {
            Some(running) => {
                kill_tree(running);
                true
            }
            None => false,
        }
    }
}

/// Windows cannot run `.cmd` shims (npm, npx, claude) by bare name; find the shim on PATH.
fn resolve_program(program: &str) -> String {
    if !cfg!(windows) || Path::new(program).extension().is_some() || program.contains(['\\', '/']) {
        return program.to_string();
    }
    let path = std::env::var_os("PATH").unwrap_or_default();
    for dir in std::env::split_paths(&path) {
        for ext in ["exe", "cmd", "bat"] {
            let candidate = dir.join(format!("{program}.{ext}"));
            if candidate.is_file() {
                return candidate.to_string_lossy().into_owned();
            }
        }
    }
    program.to_string()
}

#[cfg(unix)]
fn configure(command: &mut Command) {
    use std::os::unix::process::CommandExt;
    // Its own process group, so the whole tree can be signalled by negative pid.
    command.process_group(0);
}

#[cfg(windows)]
fn configure(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(unix)]
fn kill_tree(running: &mut Running) {
    // `kill -- -<pgid>`: the group is the child's pid because of process_group(0).
    // A subprocess rather than libc, so this crate stays free of unsafe code.
    let _ = Command::new("kill").args(["-9", "--", &format!("-{}", running.child.id())]).status();
    let _ = running.child.kill();
}

#[cfg(windows)]
fn kill_tree(running: &mut Running) {
    // Every descendant was assigned to the job at spawn, and the job carries
    // kill-on-close: dropping the handle ends all of them.
    drop(running.job.take());
    let _ = running.child.kill();
}

#[cfg(windows)]
fn own_tree(child: &Child) -> Result<win32job::Job, String> {
    use std::os::windows::io::AsRawHandle;
    let job = win32job::Job::create().map_err(|e| e.to_string())?;
    let mut info = job.query_extended_limit_info().map_err(|e| e.to_string())?;
    info.limit_kill_on_job_close();
    job.set_extended_limit_info(&info).map_err(|e| e.to_string())?;
    job.assign_process(child.as_raw_handle() as isize).map_err(|e| e.to_string())?;
    Ok(job)
}

fn spawn_drain<R: std::io::Read + Send + 'static>(
    reader: R,
    task_id: String,
    stream: &'static str,
    sink: Arc<dyn Fn(OutputEvent) + Send + Sync>,
) -> thread::JoinHandle<Capped> {
    thread::spawn(move || {
        let mut capped = Capped::default();
        for line in BufReader::new(reader).lines().map_while(Result::ok) {
            capped.push(&line);
            sink(OutputEvent { task_id: task_id.clone(), stream, line });
        }
        capped
    })
}

/// Run one bounded child to completion (or timeout / cancel), streaming lines to `sink`.
pub fn run(registry: &Registry, request: RunRequest, sink: Arc<dyn Fn(OutputEvent) + Send + Sync>) -> RunOutcome {
    let started = Instant::now();
    let outcome = |status: RunStatus, exit_code: Option<i32>, stdout: String, stderr: String| RunOutcome {
        task_id: request.task_id.clone(),
        status,
        exit_code,
        stdout,
        stderr,
        duration_ms: started.elapsed().as_millis(),
    };

    let mut command = Command::new(resolve_program(&request.program));
    // Nothing Studio runs reports home: the seedr CLI's install analytics stay off.
    command.args(&request.args).env("NO_COLOR", "1").env("SEEDR_NO_TELEMETRY", "1").stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    if let Some(cwd) = &request.cwd {
        command.current_dir(cwd);
    }
    configure(&mut command);

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return outcome(RunStatus::NotFound, None, String::new(), format!("{} not found on PATH", request.program));
        }
        Err(error) => return outcome(RunStatus::Failed, None, String::new(), error.to_string()),
    };

    #[cfg(windows)]
    let job = match own_tree(&child) {
        Ok(job) => job,
        Err(error) => {
            let _ = child.kill();
            return outcome(RunStatus::Failed, None, String::new(), format!("job object: {error}"));
        }
    };

    // The prompt goes in before anything can block on output, then stdin closes.
    if let Some(mut stdin) = child.stdin.take() {
        if let Some(text) = &request.stdin {
            let _ = stdin.write_all(text.as_bytes());
        }
        drop(stdin);
    }

    let stdout = child.stdout.take().map(|r| spawn_drain(r, request.task_id.clone(), "stdout", sink.clone()));
    let stderr = child.stderr.take().map(|r| spawn_drain(r, request.task_id.clone(), "stderr", sink.clone()));

    let slot = Arc::new(Mutex::new(Some(Running {
        child,
        #[cfg(windows)]
        job: Some(job),
    })));
    if let Ok(mut map) = registry.0.lock() {
        map.insert(request.task_id.clone(), slot.clone());
    }

    let deadline = started + Duration::from_millis(request.timeout_ms);
    let mut status = RunStatus::Ok;
    let mut exit_code = None;
    loop {
        let Ok(mut guard) = slot.lock() else { break };
        let Some(running) = guard.as_mut() else { break };
        match running.child.try_wait() {
            Ok(Some(exit)) => {
                exit_code = exit.code();
                if !exit.success() {
                    status = RunStatus::Failed;
                }
                // Killed by signal (cancel) shows as no exit code on Unix.
                if status == RunStatus::Failed && exit_code.is_none() && cancelled(&request.task_id, registry) {
                    status = RunStatus::Cancelled;
                }
                break;
            }
            Ok(None) => {
                if Instant::now() >= deadline {
                    kill_tree(running);
                    status = RunStatus::Timeout;
                    let _ = running.child.wait();
                    break;
                }
            }
            Err(error) => {
                status = RunStatus::Failed;
                let _ = error;
                break;
            }
        }
        drop(guard);
        thread::sleep(POLL);
    }
    if let Ok(mut guard) = slot.lock() {
        if let Some(mut running) = guard.take() {
            let _ = running.child.wait();
        }
    }
    if let Ok(mut map) = registry.0.lock() {
        map.remove(&request.task_id);
    }
    let cancelled_flag = take_cancel_flag(&request.task_id, registry);
    if cancelled_flag && status != RunStatus::Timeout {
        status = RunStatus::Cancelled;
    }

    let out = stdout.and_then(|h| h.join().ok()).unwrap_or_default().into_string();
    let err = stderr.and_then(|h| h.join().ok()).unwrap_or_default().into_string();
    outcome(status, exit_code, out, err)
}

// Cancellation is recorded per task so the wait loop can tell "killed by us" from "died".
static CANCELLED: Mutex<Vec<String>> = Mutex::new(Vec::new());

pub fn mark_cancelled(task_id: &str) {
    if let Ok(mut list) = CANCELLED.lock() {
        list.push(task_id.to_string());
    }
}

/// Withdraw a mark that found nothing to kill; see `cancel_process`.
pub fn clear_cancel_flag(task_id: &str) {
    if let Ok(mut list) = CANCELLED.lock() {
        list.retain(|t| t != task_id);
    }
}

fn cancelled(task_id: &str, _registry: &Registry) -> bool {
    CANCELLED.lock().map(|list| list.iter().any(|t| t == task_id)).unwrap_or(false)
}

fn take_cancel_flag(task_id: &str, _registry: &Registry) -> bool {
    let Ok(mut list) = CANCELLED.lock() else { return false };
    let before = list.len();
    list.retain(|t| t != task_id);
    list.len() != before
}

/// A GUI app does not inherit the shell's PATH on macOS and Linux; ask the login
/// shell once so `claude`, `npx` and `git` resolve as they do in a terminal.
pub fn enrich_path() {
    if cfg!(windows) {
        return;
    }
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    let Ok(output) = Command::new(&shell).args(["-lc", "echo \"$PATH\""]).output() else { return };
    let shell_path = String::from_utf8_lossy(&output.stdout);
    let Some(line) = shell_path.lines().last().filter(|l| !l.trim().is_empty()) else { return };
    let current = std::env::var("PATH").unwrap_or_default();
    let merged: Vec<String> = line.split(':').chain(current.split(':')).filter(|s| !s.is_empty()).fold(Vec::new(), |mut acc, s| {
        if !acc.iter().any(|a| a == s) {
            acc.push(s.to_string());
        }
        acc
    });
    std::env::set_var("PATH", merged.join(":"));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn quiet() -> Arc<dyn Fn(OutputEvent) + Send + Sync> {
        Arc::new(|_| {})
    }

    fn node(task: &str, script: &str, timeout_ms: u64) -> RunRequest {
        RunRequest { task_id: task.into(), program: "node".into(), args: vec!["-e".into(), script.into()], stdin: None, cwd: None, timeout_ms }
    }

    #[test]
    fn captures_output_and_exit_code() {
        let registry = Registry::default();
        let outcome = run(&registry, node("ok", "console.log('hi'); console.error('warn'); process.exit(3)", 10_000), quiet());
        assert_eq!(outcome.status, RunStatus::Failed);
        assert_eq!(outcome.exit_code, Some(3));
        assert_eq!(outcome.stdout, "hi\n");
        assert_eq!(outcome.stderr, "warn\n");
    }

    #[test]
    fn delivers_stdin_and_streams_lines() {
        let registry = Registry::default();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink_seen = seen.clone();
        let sink: Arc<dyn Fn(OutputEvent) + Send + Sync> = Arc::new(move |e| sink_seen.lock().expect("lock").push((e.stream, e.line)));
        let mut request = node("stdin", "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log('got:'+d))", 10_000);
        request.stdin = Some("prompt text".into());
        let outcome = run(&registry, request, sink);
        assert_eq!(outcome.status, RunStatus::Ok);
        assert_eq!(outcome.stdout, "got:prompt text\n");
        assert_eq!(*seen.lock().expect("lock"), vec![("stdout", "got:prompt text".to_string())]);
    }

    #[test]
    fn a_missing_program_is_not_found() {
        let registry = Registry::default();
        let outcome = run(&registry, RunRequest { task_id: "nf".into(), program: "definitely-not-a-program-xyz".into(), args: vec![], stdin: None, cwd: None, timeout_ms: 1000 }, quiet());
        assert_eq!(outcome.status, RunStatus::NotFound);
    }

    #[test]
    fn the_watchdog_ends_an_overstaying_child() {
        let registry = Registry::default();
        let outcome = run(&registry, node("slow", "setTimeout(()=>{}, 60000)", 400), quiet());
        assert_eq!(outcome.status, RunStatus::Timeout);
        assert!(outcome.duration_ms < 10_000, "took {} ms", outcome.duration_ms);
        assert!(registry.0.lock().expect("lock").is_empty(), "task must be unregistered");
    }

    #[test]
    fn cancel_kills_the_grandchild_too() {
        let registry = Registry::default();
        let marker = std::env::temp_dir().join(format!("seedr-executor-grandchild-{}", std::process::id()));
        let _ = std::fs::remove_file(&marker);
        let script = format!(
            "const cp=require('child_process');const g=cp.spawn(process.execPath,['-e','setTimeout(()=>{{}},60000)'],{{stdio:'ignore'}});require('fs').writeFileSync({:?},String(g.pid));setTimeout(()=>{{}},60000)",
            marker.to_string_lossy()
        );
        let worker_registry = registry.clone();
        let handle = thread::spawn(move || run(&worker_registry, node("tree", &script, 60_000), quiet()));

        let grandchild_pid = loop {
            if let Ok(text) = std::fs::read_to_string(&marker) {
                if let Ok(pid) = text.trim().parse::<u32>() {
                    break pid;
                }
            }
            thread::sleep(Duration::from_millis(50));
        };
        mark_cancelled("tree");
        assert!(registry.cancel("tree"), "cancel must find the running task");
        let outcome = handle.join().expect("join");
        assert_eq!(outcome.status, RunStatus::Cancelled);

        thread::sleep(Duration::from_millis(300));
        assert!(!pid_alive(grandchild_pid), "grandchild {grandchild_pid} survived the cancel");
        let _ = std::fs::remove_file(&marker);
    }

    #[test]
    fn cancelling_an_unknown_task_is_a_no() {
        assert!(!Registry::default().cancel("nope"));
    }

    #[test]
    fn a_withdrawn_cancel_mark_does_not_taint_the_tasks_next_run() {
        let registry = Registry::default();
        // The command sequence for a cancel that found nothing running:
        mark_cancelled("reused-id");
        assert!(!registry.cancel("reused-id"));
        clear_cancel_flag("reused-id");

        let outcome = run(&registry, RunRequest { task_id: "reused-id".into(), program: "node".into(), args: vec!["-e".into(), "console.log('fine')".into()], stdin: None, cwd: None, timeout_ms: 30_000 }, quiet());
        assert_eq!(outcome.status, RunStatus::Ok, "stderr: {}", outcome.stderr);
    }

    #[test]
    fn output_is_capped_with_a_marker() {
        let registry = Registry::default();
        let outcome = run(&registry, node("big", "for(let i=0;i<40000;i++)console.log('line '+i+' '+'x'.repeat(20))", 30_000), quiet());
        assert_eq!(outcome.status, RunStatus::Ok);
        assert!(outcome.stdout.len() < HEAD_BYTES + TAIL_BYTES + 200);
        assert!(outcome.stdout.contains("bytes dropped"));
        assert!(outcome.stdout.starts_with("line 0 "));
        assert!(outcome.stdout.trim_end().ends_with("line 39999 xxxxxxxxxxxxxxxxxxxx"));
    }

    #[cfg(unix)]
    fn pid_alive(pid: u32) -> bool {
        Command::new("kill").args(["-0", &pid.to_string()]).status().map(|s| s.success()).unwrap_or(false)
    }

    #[cfg(windows)]
    fn pid_alive(pid: u32) -> bool {
        let output = Command::new("tasklist").args(["/FI", &format!("PID eq {pid}"), "/NH"]).output();
        output.map(|o| String::from_utf8_lossy(&o.stdout).contains(&pid.to_string())).unwrap_or(false)
    }
}
