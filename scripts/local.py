#!/usr/bin/env python3
"""Start and stop only Switchboard-owned host processes."""
import argparse,json,os,signal,subprocess,time,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1];local=root/'.local';local.mkdir(exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('action',choices=['start','stop']);args=parser.parse_args()
record=local/'processes.json'
def alive(pid):
 try:os.kill(pid,0);return True
 except ProcessLookupError:return False
def stop():
 if not record.exists():return
 saved=json.loads(record.read_text())
 for item in saved:
  if not alive(item['pid']):continue
  command=subprocess.check_output(['ps','-p',str(item['pid']),'-o','command='],text=True).strip()
  if item['entry'] not in command:raise SystemExit('Refusing to signal a PID that no longer belongs to this application')
  os.killpg(item['pid'],signal.SIGTERM)
 deadline=time.monotonic()+15
 while any(alive(x['pid']) for x in saved) and time.monotonic()<deadline:time.sleep(.2)
 for item in saved:
  if alive(item['pid']):os.killpg(item['pid'],signal.SIGKILL)
 record.unlink()
if args.action=='stop':stop();print('Switchboard host processes stopped.');raise SystemExit(0)
if record.exists() and any(alive(x['pid']) for x in json.loads(record.read_text())):raise SystemExit('Switchboard processes are already running; use stop first')
node=os.environ.get('SWITCHBOARD_NODE') or subprocess.check_output(['which','node'],text=True).strip()
major=subprocess.check_output([node,'-p','process.versions.node.split(".")[0]'],text=True).strip()
if major!='16':raise SystemExit('Use Node16.16 (nvm use) or set SWITCHBOARD_NODE to its absolute executable path')
if not (root/'dist/src/worker.js').exists() or not (root/'web/dist/index.html').exists():raise SystemExit('Run npm run build first')
started=[]
try:
 for name,entry in [('provider','dist/src/provisioner/main.js'),('worker','dist/src/worker.js'),('gateway','dist/src/server/main.js')]:
  full=str(root/entry)
  with (local/(name+'.log')).open('ab') as log:process=subprocess.Popen([node,full],cwd=root,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  started.append({'name':name,'pid':process.pid,'entry':full});record.write_text(json.dumps(started,indent=2)+'\n');record.chmod(0o600)
 deadline=time.monotonic()+360
 while time.monotonic()<deadline:
  if any(not alive(x['pid']) for x in started):raise RuntimeError('An application process exited; inspect .local/*.log')
  try:
   with urllib.request.urlopen('http://127.0.0.1:4900/ready',timeout=4) as response:
    if response.status!=200:raise RuntimeError('Gateway unavailable')
   with urllib.request.urlopen('http://127.0.0.1:4900/config.json',timeout=4) as response:issuer=json.load(response)['issuer']
   with urllib.request.urlopen(issuer+'/.well-known/openid-configuration',timeout=4) as response:
    if response.status==200:break
  except Exception:time.sleep(1)
 else:raise RuntimeError('Gateway readiness timed out; inspect .local/*.log')
 print('Switchboard is ready at http://localhost:4900. Demo account passwords are in .local/credentials.json.')
except Exception:
 stop();raise
