#!/usr/bin/env python3
"""Local game server and DeepSeek proxy. Python standard library only."""
import argparse
import base64
import json
import os
import re
from pathlib import Path
import socket
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
STATIC = {"/": "index.html", "/index.html": "index.html", "/styles.css": "styles.css",
          "/game.js": "game.js", "/classic.js": "classic.js", "/service-config.js": "service-config.js"}
SLOTS = threading.BoundedSemaphore(2)
PHOTO_PROFILES = json.loads((ROOT / 'cloudflare' / 'photo-profiles.json').read_text())


def load_settings():
    settings = {}
    env_file = ROOT / ".env"
    if env_file.is_file():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key.strip() in ("DEEPSEEK_API_KEY", "DEEPSEEK_MODEL", "DEEPSEEK_ACCOUNT_TOKEN", "PLAYKIT_GAME_ID", "PLAYKIT_DEVELOPER_TOKEN", "PLAYKIT_IMAGE_MODEL"):
                settings[key.strip()] = value.strip().strip("\"'")
    return {"account_token": os.environ.get("DEEPSEEK_ACCOUNT_TOKEN", settings.get("DEEPSEEK_ACCOUNT_TOKEN", "")), "key": os.environ.get("DEEPSEEK_API_KEY", settings.get("DEEPSEEK_API_KEY", "")),
            "model": os.environ.get("DEEPSEEK_MODEL", settings.get("DEEPSEEK_MODEL", "deepseek-flash")),
            "image_token": os.environ.get("PLAYKIT_DEVELOPER_TOKEN", settings.get("PLAYKIT_DEVELOPER_TOKEN", "")),
            "image_game": os.environ.get("PLAYKIT_GAME_ID", settings.get("PLAYKIT_GAME_ID", "")),
            "image_model": os.environ.get("PLAYKIT_IMAGE_MODEL", settings.get("PLAYKIT_IMAGE_MODEL", "flux-1-schnell"))}


def valid_photo(body):
    return (isinstance(body, dict) and type(body.get('age')) is int and 0 <= body['age'] <= 100
            and type(body.get('year')) is int and 1900 <= body['year'] <= 2200
            and isinstance(body.get('place'), str) and 0 < len(body['place'].strip()) <= 80
            and type(body.get('seed')) is int and 1 <= body['seed'] <= 2147483647
            and type(body.get('profile')) is int and 0 <= body['profile'] < len(PHOTO_PROFILES))


def photo_prompt(body):
    subject = 'a newborn baby' if body['age'] == 0 else f"a {body['age']}-year-old person"
    period = 'black and white archival family photography' if body['year'] < 1970 else 'color family album photography'
    return (f"Photorealistic portrait of {subject}, a fictional character, in {body['place'].strip()} in the year {body['year']}. "
            f"Fixed character appearance: {PHOTO_PROFILES[body['profile']]}. Depict the exact age with age-appropriate facial proportions and visible aging. "
            f"Fully clothed in everyday clothes appropriate to the year, single person, head and shoulders, natural daylight, {period}. "
            "Ordinary life, candid authentic photograph. No text, no emoji, no illustration, no cartoon.")


def image_data_url(encoded):
    if not isinstance(encoded, str) or len(encoded) > 6000000:
        raise ValueError('Invalid image data')
    data = base64.b64decode(encoded, validate=True)
    mime = 'image/png' if data.startswith(b'\x89PNG\r\n\x1a\n') else 'image/jpeg' if data.startswith(b'\xff\xd8\xff') else 'image/webp' if data.startswith(b'RIFF') and data[8:12] == b'WEBP' else None
    if not mime:
        raise ValueError('Invalid image format')
    return f'data:{mime};base64,{encoded}'


class Handler(BaseHTTPRequestHandler):
    def send_json(self, code, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def valid_request_origin(self):
        host = self.headers.get("Host", "")
        allowed = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
        if host not in allowed:
            return False
        origin = self.headers.get("Origin")
        return not origin or origin == "http://" + host

    def do_GET(self):
        if not self.valid_request_origin():
            return self.send_json(403, {"error": "只接受本机同源请求。"})
        route = urlsplit(self.path).path
        if route == "/api/status":
            settings = load_settings()
            return self.send_json(200, {"configured": bool(settings["key"] or settings["account_token"]), "model": settings["model"], "photosConfigured": bool(settings.get("image_token") and settings.get("image_game"))})
        filename = STATIC.get(route)
        if not filename:
            return self.send_json(404, {"error": "文件不存在。"})
        data = (ROOT / filename).read_bytes()
        mime = "text/css" if filename.endswith(".css") else "text/javascript" if filename.endswith(".js") else "text/html"
        self.send_response(200)
        self.send_header("Content-Type", mime + "; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if not self.valid_request_origin():
            return self.send_json(403, {"error": "只接受本机同源请求。"})
        photo = self.path == '/api/image'
        if self.path not in ("/api/chat", "/api/image"):
            return self.send_json(404, {"error": "接口不存在。"})
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            return self.send_json(415, {"error": "请使用 JSON 请求。"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 131072:
                return self.send_json(413, {"error": "请求过大或为空。"})
            self.connection.settimeout(10)
            body = json.loads(self.rfile.read(length))
            prompt = body.get("prompt") if isinstance(body, dict) else None
            if photo and not valid_photo(body):
                return self.send_json(400, {"error": "照片的年龄、年份或人物资料无效。"})
            if not photo and (not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 60000):
                return self.send_json(400, {"error": "故事内容无效或过长。"})
        except (ValueError, UnicodeError, socket.timeout):
            return self.send_json(400, {"error": "请求格式不正确。"})
        settings = load_settings()
        if photo and not (settings.get('image_token') and re.fullmatch(r'[\da-fA-F]{8}(-[\da-fA-F]{4}){3}-[\da-fA-F]{12}', settings.get('image_game', ''))):
            return self.send_json(503, {"error": "人物照片服务暂不可用，可以稍后重试。"})
        if not photo and not (settings["key"] or settings["account_token"]):
            return self.send_json(503, {"error": "尚未配置 DeepSeek 密钥，请在本机 .env 中设置 DEEPSEEK_API_KEY。"})
        if not SLOTS.acquire(blocking=False):
            return self.send_json(429, {"error": "已有推演正在进行，请稍后重试。"})
        try:
            payload = {"model": settings["model"], "messages": [{"role": "user", "content": prompt}],
                       "stream": False, "max_tokens": 2048, "thinking": {"type": "disabled"}}
            if photo:
                payload = {'model': settings['image_model'], 'prompt': photo_prompt(body), 'seed': body['seed'], 'n': 1, 'size': '512x512'}
                req = Request(f"https://api.playkit.ai/ai/{settings['image_game']}/v2/image", json.dumps(payload).encode(), headers={'Authorization': 'Bearer ' + settings['image_token'], 'Content-Type': 'application/json'})
            else:
                req = Request("https://api.deepseek.com/chat/completions", json.dumps(payload).encode(),
                              headers={**({"Authorization": "Bearer " + settings["key"]} if settings["key"] else {"x-dsh-auth-token": settings["account_token"]}), "Content-Type": "application/json"})
            with urlopen(req, timeout=85 if photo else 45) as response:
                result = json.load(response)
            if photo:
                return self.send_json(200, {'image': image_data_url(result['data'][0]['b64_json'])})
            content = result["choices"][0]["message"]["content"]
            if not isinstance(content, str) or not content.strip():
                raise ValueError("Empty text")
            self.send_json(200, {"content": content, "model": result.get("model", settings["model"])})
        except HTTPError as error:
            if photo:
                return self.send_json(503, {"error": "人物照片生成失败，文字进度已保留，可以重试。"})
            messages = {401: "DeepSeek 密钥无效，请检查本机配置。", 402: "DeepSeek 余额不足。",
                        400: "DeepSeek 模型或请求参数无效，请检查 DEEPSEEK_MODEL。", 404: "DeepSeek 模型不存在，请检查 DEEPSEEK_MODEL。",
                        429: "DeepSeek 请求繁忙，请稍后重试。"}
            self.send_json(error.code if error.code in messages else 502,
                           {"error": messages.get(error.code, "DeepSeek 服务暂时不可用，请稍后重试。")})
        except (TimeoutError, socket.timeout):
            self.send_json(504, {"error": "照片生成超时，请重试。" if photo else "DeepSeek 响应超时，请重试。"})
        except (URLError, ValueError, KeyError, IndexError, TypeError):
            self.send_json(502, {"error": "照片服务响应异常，请稍后重试。" if photo else "DeepSeek 网络或响应异常，请稍后重试。"})
        finally:
            SLOTS.release()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--open", action="store_true", help="打开默认浏览器")
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"投胎模拟器已启动：http://127.0.0.1:{server.server_port}/", flush=True)
    print("经典模式无需配置；DeepSeek 模式读取本机 .env 或环境变量。按 Ctrl+C 停止。", flush=True)
    if args.open:
        webbrowser.open(f"http://127.0.0.1:{server.server_port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
