import subprocess, time, os, json, urllib.request, sys, socket, zipfile, threading
from pathlib import Path

base = Path(r'C:\HermesWork\projects\website-article-writer-agent-v3')
os.chdir(base)
out_dir = base / 'output' / 'full-test'
out_dir.mkdir(parents=True, exist_ok=True)
log_file = out_dir / 'run.log'

def log(msg):
    line = f'{time.strftime("%H:%M:%S")} | {msg}'
    print(line)
    with open(log_file, 'a', encoding='utf-8') as f:
        f.write(line + '\n')

log('Starting full E2E test')

# 1. Read the master prompt template
with open(base / 'src' / 'bridgePromptTemplate.js', 'r', encoding='utf-8') as f:
    tpl = f.read()
start = tpl.find('`') + 1
end = tpl.rfind('`')
master_prompt = tpl[start:end]
keyword = 'short haircuts for women over 50 with round faces'
full_prompt = master_prompt.replace('[INSERT KEYWORD HERE]', keyword)
log(f'Master prompt length: {len(full_prompt)} chars')

# 2. Read Mistral keys
with open(base / '.env', 'r', encoding='utf-8') as f:
    env_text = f.read()
keys = []
for line in env_text.splitlines():
    if line.strip().startswith('VITE_MISTRAL_KEYS='):
        val = line.split('=', 1)[1].strip().strip('"')
        keys = [k.strip() for k in val.split(',') if k.strip()]
        break
log(f'Mistral keys loaded: {len(keys)}')

# 3. Free ports if occupied
def port_used(port):
    s = socket.socket(); s.settimeout(1)
    try:
        s.connect(('127.0.0.1', port)); s.close(); return True
    except:
        return False

for port in [19321, 19322]:
    if port_used(port):
        try:
            result = subprocess.run(f'for /f "tokens=5 delims= " %a in (\'netstat -ano ^| findstr :{port}\') do taskkill /F /PID %a',
                shell=True, capture_output=True, text=True)
            log(f'Freed port {port}: {result.stdout.strip()}')
            time.sleep(2)
        except Exception as e:
            log(f'Could not free port {port}: {e}')

env = os.environ.copy()
env['Path'] = r'C:\Program Files\nodejs;' + env.get('Path', '')
env['BIGPICKLE_PORT'] = '19322'
env['BIGPICKLE_CDP_HOST'] = 'http://127.0.0.1:19321'
env['BIGPICKLE_HEADLESS'] = 'false'
env['BIGPICKLE_TIMEOUT_MS'] = '600000'

# 4. Launch Chrome CDP
chrome_exe = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
if not os.path.exists(chrome_exe):
    chrome_exe = os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe')
profile_dir = os.path.abspath(base / 'server' / 'sessions' / 'chrome-cdp-19321')
os.makedirs(profile_dir, exist_ok=True)
log('Launching Chrome CDP')
chrome = subprocess.Popen([chrome_exe,
    '--remote-debugging-port=19321',
    f'--user-data-dir={profile_dir}',
    '--no-first-run',
    '--no-default-browser-check',
    'https://chatgpt.com/?temporary-chat=true'
], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)

# Wait for CDP
for i in range(30):
    time.sleep(1)
    if port_used(19321):
        log('CDP ready on port 19321')
        break
else:
    log('ERROR: CDP did not open')
    sys.exit(1)

# 5. Start bridge server
log('Starting bridge server')
bridge = subprocess.Popen(['node', 'server/index.js'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)

def read_bridge():
    for line in bridge.stdout:
        log(f'[bridge] {line.strip()}')
t = threading.Thread(target=read_bridge, daemon=True)
t.start()
time.sleep(3)

if not port_used(19322):
    log('ERROR: Bridge server did not start')
    sys.exit(1)

# 6. Create full article job
payload = json.dumps({'prompt': full_prompt, 'modelLabel': 'chatgpt-browser', 'mode': 'articleV86'}).encode()
req = urllib.request.Request('http://127.0.0.1:19322/api/bigpickle', data=payload, headers={'Content-Type': 'application/json'}, method='POST')
job = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
job_id = job['jobId']
log(f'Bridge job created: {job_id}')

# 7. Poll for article completion
article = ''
model_name = 'unknown'
max_wait = 600
elapsed = 0
poll = 10
while elapsed < max_wait:
    time.sleep(poll)
    elapsed += poll
    try:
        status = json.loads(urllib.request.urlopen(f'http://127.0.0.1:19322/api/bigpickle/{job_id}', timeout=10).read().decode())
    except Exception as e:
        log(f'Poll error: {e}')
        continue
    st = status.get('status')
    log(f'Article [{elapsed}s] status={st}')
    if st == 'complete':
        result = status.get('result', {})
        article = result.get('content', '')
        model_name = result.get('model', 'unknown')
        log(f'Article complete. Model={model_name} Words={len(article.split())}')
        break
    if st in ('failed', 'error'):
        log(f'Article FAILED: {status.get("error", "unknown")}')
        break

if article:
    (out_dir / 'article.txt').write_text(article, encoding='utf-8')
else:
    log('No article received')

# 8. Generate image prompts with Mistral
if keys:
    key = keys[0]
    def mistral(instruction):
        payload = json.dumps({
            'model': 'mistral-large-latest',
            'messages': [{'role': 'user', 'content': instruction}],
            'max_tokens': 2000
        }).encode()
        req = urllib.request.Request('https://api.mistral.ai/v1/chat/completions', data=payload,
            headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {key}'}, method='POST')
        resp = urllib.request.urlopen(req, timeout=60)
        data = json.loads(resp.read().decode())
        return data['choices'][0]['message']['content']

    try:
        blog = mistral(f'Generate exactly 10 detailed AI image prompts for a blog article about: {keyword}. Each prompt describes a realistic salon photo of a mature woman with a flattering short haircut. Include angle, lighting, hair texture, styling, setting. Number 1-10 only.')
        (out_dir / 'blog-image-prompts.txt').write_text(blog, encoding='utf-8')
        log(f'Blog image prompts: {len(blog)} chars')
    except Exception as e:
        log(f'Blog prompts error: {e}')

    try:
        pin = mistral(f'Generate exactly 10 vertical Pinterest-style image prompts for: {keyword}. Each describes an aspirational, styled photo for a Pinterest pin focusing on elegance, confidence, and modern hairstyle. Number 1-10 only.')
        (out_dir / 'pinterest-image-prompts.txt').write_text(pin, encoding='utf-8')
        log(f'Pinterest prompts: {len(pin)} chars')
    except Exception as e:
        log(f'Pinterest prompts error: {e}')

# 9. Save info
info = {
    'keyword': keyword,
    'chatgpt_model': model_name,
    'article_word_count': len(article.split()),
    'article_chars': len(article),
    'mistral_keys_available': len(keys)
}
(out_dir / 'info.json').write_text(json.dumps(info, indent=2), encoding='utf-8')
log(json.dumps(info, indent=2))

# 10. Zip
try:
    zip_path = base / 'output' / 'full-test.zip'
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for f in out_dir.iterdir():
            zf.write(f, arcname=f.name)
    log(f'Zip created: {zip_path}')
except Exception as e:
    log(f'Zip error: {e}')

# Cleanup
for p in [bridge, chrome]:
    try:
        p.terminate()
        p.wait(timeout=5)
    except:
        p.kill()

log('DONE')
