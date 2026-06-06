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
    # Unique per-process scratch name so concurrent writers never collide on one
    # tmp file; removed even when os.replace fails (e.g. Windows file lock).
    tmp = '%s.%d.tmp' % (str(path), os.getpid())
    try:
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, str(path))
    finally:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except OSError:
            pass


_LOCK_TIMEOUT = 0.5   # max seconds to wait for the lock — keeps tool latency low
_LOCK_STALE = 5.0     # steal a lock file older than this (holder crashed)

def update_events(events_path, lock_path, mutate):
    """Serialize the read-modify-write of agent-events.json across concurrent
    hook processes. Parallel tool calls fire hooks at the same time; without this
    they clobber each other's writes (last-writer-wins lost updates). Acquires an
    exclusive lock file, reads current state, applies mutate(existing), and writes
    the result back when mutate returns a dict. Best-effort: after _LOCK_TIMEOUT it
    proceeds without the lock rather than delaying the tool call, and it steals a
    stale lock left by a crashed holder. Never raises."""
    deadline = time.time() + _LOCK_TIMEOUT
    have_lock = False
    while True:
        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.close(fd)
            have_lock = True
            break
        except FileExistsError:
            try:
                if time.time() - os.path.getmtime(lock_path) > _LOCK_STALE:
                    os.remove(lock_path)
                    continue
            except OSError:
                pass
            if time.time() >= deadline:
                break          # give up waiting; a rare lost update beats blocking
            time.sleep(0.01)
        except OSError:
            break              # cannot create a lock at all -> proceed unlocked
    try:
        try:
            existing = json.loads(events_path.read_text(encoding='utf-8'))
        except Exception:
            existing = {'current': None, 'user_message': None, 'last_completed': None}
        result = mutate(existing)
        if result is not None:
            atomic_write(events_path, result)
    finally:
        if have_lock:
            try:
                os.remove(lock_path)
            except OSError:
                pass

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'pre'
    # Script lives in py/; agent-events.json stays at the project root where
    # office.html fetches it (./agent-events.json), so target the parent dir.
    here = Path(__file__).parent.parent
    events_path = here / 'agent-events.json'
    lock_path = str(here / 'agent-events.lock')

    try:
        raw = sys.stdin.buffer.read()
        payload = json.loads(raw.decode('utf-8'))
    except Exception:
        sys.exit(0)

    ts = int(time.time() * 1000)
    tool_name = payload.get('tool_name', '')
    tool_input = payload.get('tool_input') or {}
    agent = TOOL_TO_AGENT.get(tool_name)

    # Derive transcript-dependent values BEFORE locking: last_assistant_text can
    # read multiple MB, and holding the lock across it would serialize every
    # parallel hook behind one slow disk read. The lock then wraps only the quick
    # read-modify-write of the small JSON file.
    user_text = stop_text = narration = label = detail = None

    if mode == 'user':
        user_text = (payload.get('prompt') or '')[:200]
    elif mode == 'stop':
        stop_text = last_assistant_text(payload.get('transcript_path', ''))
        if not stop_text:
            sys.exit(0)
    elif mode == 'pre':
        narration = last_assistant_text(payload.get('transcript_path', ''))
        if agent:
            label = extract_label(tool_name, tool_input)
            detail = extract_detail(tool_name, tool_input)
        elif not narration:
            sys.exit(0)            # unmapped tool, no narration -> nothing to write
    elif mode == 'post':
        if not agent:
            sys.exit(0)
        label = extract_label(tool_name, tool_input)
        detail = extract_detail(tool_name, tool_input)
    else:
        sys.exit(0)

    def mutate(existing):
        if mode == 'user':
            existing['user_message'] = {'text': user_text, 'timestamp': ts}
            return existing
        if mode == 'stop':
            existing['assistant_response'] = {'text': stop_text[:200], 'timestamp': ts}
            return existing
        if mode == 'pre':
            if narration:
                existing['writer_message'] = {'text': narration[:200], 'timestamp': ts}
            if not agent:
                return existing
            existing['current'] = {
                'tool': tool_name, 'agent': agent, 'label': label,
                'detail': detail, 'status': 'active', 'timestamp': ts,
            }
            existing.setdefault('events', [])
            existing['events'].append({'agent': agent, 'label': label, 'detail': detail, 'ts': ts})
            existing['events'] = existing['events'][-10:]
            return existing
        if mode == 'post':
            cur = existing.get('current')
            if cur and cur.get('agent') == agent and cur.get('tool') == tool_name:
                existing['current']['status'] = 'done'
                existing['last_completed'] = {
                    'tool': tool_name, 'agent': agent, 'label': label, 'timestamp': ts,
                }
                return existing
            return None
        return None

    update_events(events_path, lock_path, mutate)
    sys.exit(0)

if __name__ == '__main__':
    try:
        main()
    except Exception:
        sys.exit(0)
