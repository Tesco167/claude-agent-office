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

def _collapse(s, limit=160):
    """Flatten whitespace/newlines to single spaces for a marquee-friendly line."""
    return ' '.join(str(s).split())[:limit]

def extract_detail(tool_name, tool_input):
    """Second line for the Editor: a flowing summary of WHAT changed.
    Returns '' for tools that don't edit files."""
    if tool_name == 'Edit':
        old = tool_input.get('old_string', '') or ''
        new = tool_input.get('new_string', '') or ''
        added = new.count('\n') + (1 if new else 0)
        removed = old.count('\n') + (1 if old else 0)
        tag = '↻ all' if tool_input.get('replace_all') else f'+{added}/-{removed}'
        preview = _collapse(new) or '(deleted)'
        return f'{tag}  »  {preview}'
    if tool_name == 'Write':
        content = tool_input.get('content', '') or ''
        lines = content.count('\n') + (1 if content else 0)
        return f'write {lines} lines  »  {_collapse(content)}'
    if tool_name == 'NotebookEdit':
        src = tool_input.get('new_source', '') or ''
        return f'cell  »  {_collapse(src)}'
    # Reader tools
    if tool_name == 'Read':
        return f'open  »  {_collapse(tool_input.get("file_path", ""))}'
    if tool_name == 'Glob':
        pat = tool_input.get('pattern', '') or ''
        loc = tool_input.get('path', '') or ''
        return f'glob  »  {_collapse(pat + ("  in " + loc if loc else ""))}'
    if tool_name == 'Grep':
        pat = tool_input.get('pattern', '') or ''
        loc = tool_input.get('path', '') or tool_input.get('glob', '') or '.'
        return f'grep  »  {_collapse(pat)}  in {_collapse(loc, 60)}'
    # Searcher tools
    if tool_name == 'Bash':
        return f'run  »  {_collapse(tool_input.get("command", ""))}'
    if tool_name == 'WebSearch':
        return f'search  »  {_collapse(tool_input.get("query", ""))}'
    if tool_name == 'WebFetch':
        return f'fetch  »  {_collapse(tool_input.get("url", ""))}'
    return ''

def last_assistant_text(transcript_path):
    """Return the latest assistant text message from a JSONL transcript, or None.

    Reads only the tail of the file outward, so cost stays bounded even when the
    transcript grows to tens of MB — this runs on EVERY PreToolUse hook, so a full
    read_text() here would re-load the whole transcript on every tool call and slow
    the machine down as the session grows. The latest assistant message lives at the
    end of the file; the window only widens if a huge tool_result line pushes the
    assistant text further back than the initial 256KB."""
    try:
        size = os.path.getsize(transcript_path)
    except Exception:
        return None
    window = 256 * 1024
    while True:
        start = max(0, size - window)
        try:
            with open(transcript_path, 'rb') as f:
                f.seek(start)
                chunk = f.read()
        except Exception:
            return None
        lines = chunk.decode('utf-8', 'ignore').splitlines()
        if start > 0 and lines:
            lines = lines[1:]   # drop the (likely truncated) first partial line
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
        if start == 0:
            return None         # scanned the whole file, nothing found
        window *= 4             # assistant text is further back — widen and retry

def atomic_write(path, data):
    tmp = str(path) + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, str(path))

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'pre'
    # Script lives in py/; agent-events.json stays at the project root where
    # office.html fetches it (./agent-events.json), so target the parent dir.
    here = Path(__file__).parent.parent
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

    # The assistant's narration accompanying this tool call is the latest
    # assistant text in the transcript → the Writer voices it (flowing, 1 row).
    # Captured for every PreToolUse, even tools with no office agent.
    if mode == 'pre':
        narration = last_assistant_text(payload.get('transcript_path', ''))
        if narration:
            existing['writer_message'] = {'text': narration[:200], 'timestamp': ts}
        if not agent:
            atomic_write(events_path, existing)   # persist narration even for unmapped tools
            sys.exit(0)

    if not agent:
        sys.exit(0)

    label = extract_label(tool_name, tool_input)
    detail = extract_detail(tool_name, tool_input)

    if mode == 'pre':
        existing['current'] = {
            'tool': tool_name,
            'agent': agent,
            'label': label,
            'detail': detail,
            'status': 'active',
            'timestamp': ts,
        }
        existing.setdefault('events', [])
        existing['events'].append({'agent': agent, 'label': label, 'detail': detail, 'ts': ts})
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
