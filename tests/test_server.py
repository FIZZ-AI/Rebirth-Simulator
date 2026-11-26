import contextlib
import base64
import importlib.util
import io
import http.client
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent
if not (ROOT / "server.py").exists():
    ROOT = ROOT.parent
spec = importlib.util.spec_from_file_location("game_server", ROOT / "server.py")
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.settings = patch.object(app, "load_settings", return_value={"key": "test-private-key", "account_token": "", "model": "deepseek-flash"})
        self.settings.start()
        self.http = ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.http.server_port}"

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.settings.stop()

    def request(self, path, body=None, extra=None):
        headers = {"Content-Type": "application/json", **(extra or {})}
        connection = http.client.HTTPConnection("127.0.0.1", self.http.server_port, timeout=5)
        try:
            connection.request("POST" if body is not None else "GET", path, json.dumps(body).encode() if body is not None else None, headers)
            response = connection.getresponse()
            return response.status, response.read().decode()
        finally:
            connection.close()

    def test_static_and_status_never_expose_credentials(self):
        code, content = self.request("/api/status")
        self.assertEqual(code, 200)
        self.assertTrue(json.loads(content)["configured"])
        self.assertNotIn("test-private-key", content)
        for filename in ["/.env", "/.git/config", "/server.py", "/%2eenv", "/../.env"]:
            self.assertEqual(self.request(filename)[0], 404)
        self.assertEqual(self.request("/classic.js")[0], 200)

    def test_reject_cross_origin_invalid_host_and_invalid_body(self):
        for headers in [{"Origin": "https://example.com"}, {"Host": "evil.example"}]:
            self.assertEqual(self.request("/api/chat", {"prompt": "test"}, headers)[0], 403)
        self.assertEqual(self.request("/api/chat", {"prompt": ""})[0], 400)
        self.assertEqual(self.request("/api/chat", ["invalid"])[0], 400)
        self.assertEqual(self.request("/api/chat", {"prompt": "test"}, {"Content-Type": "text/plain"})[0], 415)

    def test_missing_configuration_does_not_call_provider(self):
        with patch.object(app, "load_settings", return_value={"key": "", "account_token": "", "model": "deepseek-flash"}), patch.object(app, "urlopen") as upstream:
            self.assertEqual(self.request("/api/chat", {"prompt": "test"})[0], 503)
            upstream.assert_not_called()

    def test_successful_proxy_uses_fixed_endpoint_and_server_key(self):
        result = {"choices": [{"message": {"content": "你走进了幼儿园。"}}], "model": "deepseek-flash"}
        with patch.object(app, "urlopen", return_value=io.BytesIO(json.dumps(result).encode())) as upstream:
            code, content = self.request("/api/chat", {"prompt": "test", "model": "untrusted", "url": "https://example.com"})
            self.assertEqual(code, 200)
            self.assertEqual(json.loads(content)["content"], "你走进了幼儿园。")
            self.assertNotIn("test-private-key", content)
            req = upstream.call_args.args[0]
            self.assertEqual(req.full_url, "https://api.deepseek.com/chat/completions")
            self.assertEqual(json.loads(req.data)["model"], "deepseek-flash")
            self.assertEqual(req.get_header("Authorization"), "Bearer test-private-key")

    def test_upstream_balance_and_invalid_responses_have_actionable_errors(self):
        with patch.object(app, "urlopen", side_effect=HTTPError("https://api.deepseek.com", 402, "Insufficient balance", {}, None)):
            code, content = self.request("/api/chat", {"prompt": "test"})
            self.assertEqual(code, 402)
            self.assertIn("余额不足", content)
        with patch.object(app, "urlopen", return_value=io.BytesIO(b'{"choices":[]}')):
            self.assertEqual(self.request("/api/chat", {"prompt": "test"})[0], 502)

    def test_photo_route_uses_owner_image_service_without_exposing_credentials(self):
        settings={'key':'test-private-key','account_token':'','model':'deepseek-flash',
                  'image_token':'private-image-token','image_game':'46b3ff0f-be0d-47af-a685-ca14a09d104a','image_model':'flux-1-schnell'}
        encoded=base64.b64encode(b'RIFF1234WEBPtest-pixels').decode()
        with patch.object(app,'load_settings',return_value=settings), patch.object(app,'urlopen',return_value=io.BytesIO(json.dumps({'data':[{'b64_json':encoded}]}).encode())) as upstream:
            code,content=self.request('/api/image',{'age':20,'year':2020,'place':'深圳','seed':314159,'profile':0})
            self.assertEqual(code,200);self.assertTrue(json.loads(content)['image'].startswith('data:image/webp;base64,'))
            self.assertNotIn('private-image-token',content)
            req=upstream.call_args.args[0];self.assertEqual(req.get_header('Authorization'),'Bearer private-image-token')
            self.assertIn('20-year-old',json.loads(req.data)['prompt'])

    def test_invalid_photo_parameters_do_not_call_upstream(self):
        with patch.object(app,'urlopen') as upstream:
            self.assertEqual(self.request('/api/image',{'age':101})[0],400)
            upstream.assert_not_called()


class ConfigurationTests(unittest.TestCase):
    def test_env_file_is_data_and_environment_takes_precedence(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, ".env").write_text('DEEPSEEK_API_KEY="file-key"\nDEEPSEEK_MODEL=deepseek-flash\nUNRELATED=value\n', encoding="utf-8")
            with patch.object(app, "ROOT", Path(folder)), patch.dict(app.os.environ, {"DEEPSEEK_API_KEY": "environment-key"}, clear=True):
                settings = app.load_settings()
                self.assertEqual(settings["key"], "environment-key")
                self.assertEqual(settings["model"], "deepseek-flash")


if __name__ == "__main__":
    unittest.main()
