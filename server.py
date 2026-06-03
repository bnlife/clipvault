"""
ClipVault — 本地 PWA 服务器
用法: python server.py
生成自签证书 → 启动 HTTPS → 打印地址
媳妇 iPhone 同 WiFi 下 Safari 打开地址 → 添加到主屏幕
"""
import os
import ssl
import socket
import subprocess
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 8443
HOST = "0.0.0.0"

# ---- 生成自签证书 ----
CERT_FILE = "cert.pem"
KEY_FILE = "key.pem"

if not os.path.exists(CERT_FILE) or not os.path.exists(KEY_FILE):
    print("正在生成自签证书（首次运行，约 10 秒）...")
    subprocess.run([
        "openssl", "req", "-x509", "-newkey", "rsa:2048",
        "-keyout", KEY_FILE, "-out", CERT_FILE,
        "-days", "3650", "-nodes",
        "-subj", "/CN=ClipVault"
    ], check=True)
    print("证书已生成。")

# ---- 获取本机 IP ----
def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    finally:
        s.close()
    return ip

IP = get_local_ip()

# ---- 启动 HTTPS 服务器 ----
os.chdir(os.path.dirname(os.path.abspath(__file__)))
httpd = HTTPServer((HOST, PORT), SimpleHTTPRequestHandler)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(CERT_FILE, KEY_FILE)
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)

print("=" * 50)
print(f"  ClipVault 已启动")
print(f"  媳妇在 Safari 打开:")
print(f"  https://{IP}:{PORT}")
print(f"  点 「添加到主屏幕」")
print("=" * 50)
httpd.serve_forever()
