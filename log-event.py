import json, sys, os, time
from pathlib import Path
from urllib.parse import urlparse
# Claude Code hook — maps tool calls to office agents

TOOL_TO_AGENT = {
    'Read': 'reader', 'Glob': 'reader', 'Grep': 'reader',
    'Edit': 'coder', 'Write': 'coder', 'NotebookEdit': 'coder',
    'Bash': 'searcher', 'WebSearch': 'searcher', 'WebFetch': 'searcher',
}

TOOL_ICONS = {
    'Read': '📖', 'Glob': '📂', 'Grep': '🔍',
    'Edit': '✏️', 'Write': '💾', 'NotebookEdit': '📓',
    'Bash': '💻', 'WebSearch': '🌐', 'WebFetch': '🔗',
}

def extract_label(tool_name, tool_input):
    icon = TOOL_ICONS.get(tool_name, '⚙️')
    if tool_name in ('Read', 'Edit', 'Write', 'NotebookEdit'):
        path = tool_input.get('file_path', '') or tool_input.get('notebook_path', '')
        return f"{icon} {os.path.basename(path)}"
    if tool_name == 'Grep':
        pat = str(tool_input.get('pattern', ''))[:22]
        return f"{icon} \"{pat}\""
    if tool_name == 'Glob':
        return f"{icon} {str(tool_input.get('pattern', ''))[:22]}"
    if tool_name == 'Bash':
        cmd = str(tool_input.get('command', ''))[:28]
        return f"{icon} {cmd}"
    if tool_name == 'WebSearch':
        return f"{icon} {str(tool_input.get('query', ''))[:24]}"
    if tool_name == 'WebFetch':
        host = urlparse(str(tool_input.get('url', ''))).netloc[:22]
        return f"{icon} {host}"
    return f"{icon} {tool_name}"

def last_assistant_text(transcript_path):
    """Return the latest assistant text message from a JSONL transcript, or None."""
    try:
        lines = Path(transcript_path).read_text(encoding='utf-8').splitlines()
    except Exception:
        return None
    for ln in reversed(lines):
        try:
            obj = json.loads(ln)
        except Exception:
            continue
        if obj.get('type') != 'assistant':
            continue
        content = obj.get('message', {}).get('content', [])
        if not isinstance(content, list):
            continue
        texts = [c.get('text') for c in content
                 if isinstance(c, dict) and c.get('type') == 'text' and c.get('text')]
        if texts:
            return texts[-1]
    return None

def atomic_write(path, data):
    tmp = str(path) + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, str(path))

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'pre'
    here = Path(__file__).parent
    events_path = here / 'agent-events.json'

    try:
        raw = sys.stdin.buffer.read()
        payload = json.loads(raw.decode('utf-8'))
    except Exception:
        sys.exit(0)

    try:
        existing = json.loads(events_path.read_text(encoding='utf-8'))
    except Exception:
        existing = {'current': None, 'user_message': None, 'last_completed': None}

    ts = int(time.time() * 1000)

    if mode == 'user':
        text = (payload.get('prompt') or '')[:200]
        existing['user_message'] = {'text': text, 'timestamp': ts}
        atomic_write(events_path, existing)
        sys.exit(0)

    if mode == 'stop':
        transcript_path = payload.get('transcript_path', '')
        text = last_assistant_text(transcript_path)
        if text:
            existing['assistant_response'] = {'text': text[:200], 'timestamp': ts}
            atomic_write(events_path, existing)
        sys.exit(0)

    tool_name = payload.get('tool_name', '')
    tool_input = payload.get('tool_input') or {}
    agent = TOOL_TO_AGENT.get(tool_name)

    if not agent:
        sys.exit(0)

    label = extract_label(tool_name, tool_input)

    if mode == 'pre':
        existing['current'] = {
            'tool': tool_name,
            'agent': agent,
            'label': label,
            'status': 'active',
            'timestamp': ts,
        }
        existing.setdefault('events', [])
        existing['events'].append({'agent': agent, 'label': label, 'ts': ts})
        existing['events'] = existing['events'][-10:]
    elif mode == 'post':
        if (existing.get('current')
                and existing['current'].get('agent') == agent
                and existing['current'].get('tool') == tool_name):
            existing['current']['status'] = 'done'
            existing['last_completed'] = {
                'tool': tool_name,
                'agent': agent,
                'label': label,
                'timestamp': ts,
            }
        else:
            sys.exit(0)

    atomic_write(events_path, existing)
    sys.exit(0)

if __name__ == '__main__':
    try:
        main()
    except Exception:
        sys.exit(0)
