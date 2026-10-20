import socket
import threading
import time
import urllib.request

import pytest
import uvicorn

from redsky_ocr.cli import listening_socket


def has_ipv6() -> bool:
    try:
        with socket.socket(socket.AF_INET6, socket.SOCK_STREAM) as probe:
            probe.bind(("::1", 0))
        return True
    except OSError:
        return False


async def ok_app(scope, receive, send):
    await send({"type": "http.response.start", "status": 200, "headers": []})
    await send({"type": "http.response.body", "body": b"ok"})


def serve(sock: socket.socket) -> uvicorn.Server:
    server = uvicorn.Server(uvicorn.Config(ok_app, log_config=None, access_log=False))
    threading.Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True).start()
    deadline = time.monotonic() + 5
    while not server.started:
        assert time.monotonic() < deadline, "server did not start"
        time.sleep(0.02)
    return server


def get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=3) as response:
        return response.read()


def test_ipv4_host_serves_ipv4():
    sock = listening_socket("127.0.0.1", 0)
    server = serve(sock)
    try:
        assert get(f"http://127.0.0.1:{sock.getsockname()[1]}/") == b"ok"
    finally:
        server.should_exit = True


@pytest.mark.skipif(not has_ipv6(), reason="no IPv6 on this host")
def test_ipv6_any_host_also_serves_ipv4():
    sock = listening_socket("::", 0)
    assert sock.getsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY) == 0
    server = serve(sock)
    port = sock.getsockname()[1]
    try:
        assert get(f"http://127.0.0.1:{port}/") == b"ok"
        assert get(f"http://[::1]:{port}/") == b"ok"
    finally:
        server.should_exit = True
