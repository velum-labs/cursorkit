#!/usr/bin/env python3
import fcntl
import os
import pty
import re
import select
import signal
import socket
import struct
import subprocess
import sys
import termios
import tempfile
import time
from typing import Optional


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODEL_NAME = os.environ.get("E2E_MODEL_NAME", "cursor-rpc-e2e-local")
MODEL_FILTER = os.environ.get("E2E_MODEL_FILTER", "e2e")
CURSOR_AGENT_ARGS = ["--debug"] if os.environ.get("E2E_CURSOR_AGENT_DEBUG") else []
PAUSE_ON_FAILURE_SECONDS = int(os.environ.get("E2E_PAUSE_ON_FAILURE_SECONDS", "0"))
DEBUG_URL_PATTERN = re.compile(rb"Debug info: (http://127\.0\.0\.1:\d+)")
HARDCODED_RESPONSE = os.environ.get(
    "E2E_HARDCODED_RESPONSE", "pong-from-cursor-rpc-e2e"
)
EXISTING_ENDPOINT = os.environ.get("E2E_BRIDGE_ENDPOINT")


def main() -> int:
    if not has_command("cursor-agent"):
        print("cursor-agent not found on PATH", file=sys.stderr)
        return 2

    if EXISTING_ENDPOINT is not None:
        run_list_models(EXISTING_ENDPOINT)
        run_interactive_agent(EXISTING_ENDPOINT)
        return 0

    port = free_port()
    endpoint = f"http://127.0.0.1:{port}"
    with tempfile.NamedTemporaryFile("w+", prefix="cursor-rpc-bridge-", suffix=".log") as log_file:
        bridge = start_bridge(port, log_file)
        try:
            wait_for_bridge(log_file, bridge)
            run_list_models(endpoint)
            run_interactive_agent(endpoint)
            return 0
        except Exception:
            log_file.flush()
            log_file.seek(0)
            print("\n--- bridge log ---", file=sys.stderr)
            print(log_file.read(), file=sys.stderr)
            print("--- end bridge log ---\n", file=sys.stderr)
            raise
        finally:
            stop_process(bridge)


def has_command(command: str) -> bool:
    return (
        subprocess.run(
            ["zsh", "-lc", f"command -v {command}"],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        ).returncode
        == 0
    )


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def start_bridge(port: int, log_file) -> subprocess.Popen:
    env = os.environ.copy()
    env.update(
        {
            "BRIDGE_PORT": str(port),
            "CURSOR_UPSTREAM_BASE_URL": env.get(
                "CURSOR_UPSTREAM_BASE_URL", "https://api2.cursor.sh"
            ),
            "MODEL_BASE_URL": env.get("MODEL_BASE_URL", "http://localhost:8080/v1"),
            "MODEL_NAME": MODEL_NAME,
            "MODEL_API_KEY": env.get("MODEL_API_KEY", "local"),
            "BRIDGE_HARDCODED_RESPONSE": HARDCODED_RESPONSE,
            "BRIDGE_LOG_LEVEL": env.get("BRIDGE_LOG_LEVEL", "debug"),
        }
    )
    return subprocess.Popen(
        ["pnpm", "exec", "tsx", "src/cli.ts", "serve"],
        cwd=ROOT,
        env=env,
        stdout=log_file,
        stderr=subprocess.STDOUT,
    )


def wait_for_bridge(log_file, process: subprocess.Popen) -> None:
    deadline = time.time() + 20
    while time.time() < deadline:
        log_file.flush()
        log_file.seek(0)
        output = log_file.read()
        if "bridge listening" in output:
            return
        if process.poll() is not None:
            raise RuntimeError("bridge exited before listening:\n" + output)
        time.sleep(0.1)
    raise TimeoutError("bridge did not start:\n" + output)


def run_list_models(endpoint: str) -> None:
    result = subprocess.run(
        ["cursor-agent", *CURSOR_AGENT_ARGS, "--endpoint", endpoint, "--list-models"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=30,
        check=False,
    )
    if result.returncode != 0 or MODEL_NAME not in result.stdout:
        raise AssertionError(
            "cursor-agent --list-models did not include local model\n"
            f"exit={result.returncode}\n{result.stdout}"
        )


def run_interactive_agent(endpoint: str) -> None:
    master_fd, slave_fd = pty.openpty()
    set_window_size(slave_fd, rows=40, cols=120)
    process = subprocess.Popen(
        ["cursor-agent", *CURSOR_AGENT_ARGS, "--endpoint", endpoint],
        cwd=ROOT,
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        close_fds=True,
    )
    os.close(slave_fd)
    transcript = b""
    debug_url_printed = False
    try:
        transcript += read_for(master_fd, 5)
        debug_url_printed = print_debug_url(transcript, debug_url_printed)
        os.write(master_fd, f"/model {MODEL_FILTER}".encode("utf-8") + b"\x1b[13u")
        chunk, found = read_until(master_fd, b"Models matching", 10)
        transcript += chunk
        debug_url_printed = print_debug_url(transcript, debug_url_printed)
        if not found:
            raise AssertionError(
                "interactive /model picker did not open\n"
                + transcript.decode(errors="replace")
            )

        chunk = read_for(master_fd, 2)
        transcript += chunk
        debug_url_printed = print_debug_url(transcript, debug_url_printed)
        rendered_picker = transcript.decode(errors="replace")
        if (
            f"→ {MODEL_NAME}" not in rendered_picker
            or "no matches" in rendered_picker.lower()
        ):
            raise AssertionError(
                "interactive /model picker did not show local model\n"
                + rendered_picker
            )

        os.write(master_fd, b"\x1b[13u")
        transcript += read_for(master_fd, 2)
        debug_url_printed = print_debug_url(transcript, debug_url_printed)
        os.write(master_fd, b"hi from cursor-rpc e2e\x1b[13u")
        chunk, found = read_until(
            master_fd,
            HARDCODED_RESPONSE.encode("utf-8"),
            30,
            abort_markers=[b"AI Model Not Found", b"Model name is not valid"],
        )
        transcript += chunk
        debug_url_printed = print_debug_url(transcript, debug_url_printed)
        if not found:
            pause_for_debug_inspection()
            raise AssertionError(
                "interactive prompt did not reach local model\n"
                + transcript.decode(errors="replace")
            )
    finally:
        os.write(master_fd, b"\x03")
        stop_process(process)
        os.close(master_fd)


def read_for(fd: int, seconds: float) -> bytes:
    deadline = time.time() + seconds
    output = b""
    while time.time() < deadline:
        ready, _, _ = select.select([fd], [], [], 0.1)
        if ready:
            try:
                chunk = os.read(fd, 8192)
            except OSError:
                break
            if not chunk:
                break
            output += chunk
    return output


def set_window_size(fd: int, rows: int, cols: int) -> None:
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))


def read_until(
    fd: int, marker: bytes, timeout: float, abort_markers: Optional[list[bytes]] = None
) -> tuple[bytes, bool]:
    deadline = time.time() + timeout
    output = b""
    abort_markers = abort_markers or []
    while time.time() < deadline:
        ready, _, _ = select.select([fd], [], [], 0.1)
        if not ready:
            continue
        try:
            chunk = os.read(fd, 8192)
        except OSError:
            break
        if not chunk:
            break
        output += chunk
        if marker in output:
            return output, True
        for abort_marker in abort_markers:
            if abort_marker in output:
                raise AssertionError(
                    "interactive agent failed:\n" + output.decode(errors="replace")
                )
    return output, False


def print_debug_url(transcript: bytes, already_printed: bool) -> bool:
    if already_printed:
        return True
    match = DEBUG_URL_PATTERN.search(transcript)
    if match is None:
        return False
    print(f"cursor-agent debug URL: {match.group(1).decode()}", flush=True)
    return True


def pause_for_debug_inspection() -> None:
    if PAUSE_ON_FAILURE_SECONDS <= 0:
        return
    print(
        f"pausing {PAUSE_ON_FAILURE_SECONDS}s for debug inspection",
        flush=True,
    )
    time.sleep(PAUSE_ON_FAILURE_SECONDS)


def stop_process(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    process.send_signal(signal.SIGTERM)
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"cursor-agent e2e failed: {error}", file=sys.stderr)
        raise SystemExit(1)
