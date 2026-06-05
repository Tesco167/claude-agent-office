import json, os, tempfile, importlib.util
from pathlib import Path

# Load log-event.py as a module (filename has a hyphen)
spec = importlib.util.spec_from_file_location(
    "log_event", str(Path(__file__).parent / "log-event.py"))
log_event = importlib.util.module_from_spec(spec)
spec.loader.exec_module(log_event)


def _write_transcript(lines):
    fd, path = tempfile.mkstemp(suffix=".jsonl")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        for obj in lines:
            f.write(json.dumps(obj, ensure_ascii=False) + "\n")
    return path


def test_extracts_last_assistant_text():
    path = _write_transcript([
        {"type": "user", "message": {"content": "hi"}},
        {"type": "assistant", "message": {"content": [
            {"type": "text", "text": "first reply"},
        ]}},
        {"type": "assistant", "message": {"content": [
            {"type": "tool_use", "name": "Read", "input": {}},
            {"type": "text", "text": "สวัสดีครับ ทำเสร็จแล้ว"},
        ]}},
    ])
    assert log_event.last_assistant_text(path) == "สวัสดีครับ ทำเสร็จแล้ว"
    os.unlink(path)


def test_returns_none_when_no_assistant_text():
    path = _write_transcript([
        {"type": "user", "message": {"content": "hi"}},
        {"type": "assistant", "message": {"content": [
            {"type": "tool_use", "name": "Read", "input": {}},
        ]}},
    ])
    assert log_event.last_assistant_text(path) is None
    os.unlink(path)


def test_missing_file_returns_none():
    assert log_event.last_assistant_text("/no/such/file.jsonl") is None


if __name__ == "__main__":
    test_extracts_last_assistant_text()
    test_returns_none_when_no_assistant_text()
    test_missing_file_returns_none()
    print("ALL PASS")