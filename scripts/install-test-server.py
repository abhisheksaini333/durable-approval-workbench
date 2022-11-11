#!/usr/bin/env python3
"""Install the explicitly pinned Temporal test server instead of the SDK latest alias."""
import hashlib,platform,subprocess,tarfile
from pathlib import Path
root=Path(__file__).resolve().parents[1];tools=root/'.tools';tools.mkdir(exist_ok=True)
osname={'Darwin':'macOS','Linux':'linux'}.get(platform.system())
if not osname:raise SystemExit('Supported test hosts: macOS and Linux')
archive=tools/'temporal-test-server-1.14.0.tar.gz';target=tools/'temporal-test-server-1.14.0'
url=f'https://github.com/temporalio/sdk-java/releases/download/v1.14.0/temporal-test-server_1.14.0_{osname}_amd64.tar.gz'
subprocess.run(['curl','--fail','--location','--silent','--show-error',url,'--output',str(archive)],check=True)
if osname=='macOS' and hashlib.sha256(archive.read_bytes()).hexdigest()!='27044bcef271e5f4516efb54b1b7738a6ca1cdc3a7eb864b77e6257fed12f170':raise SystemExit('Test server archive checksum mismatch')
with tarfile.open(archive) as bundle:
 members=[m for m in bundle.getmembers() if m.isfile()]
 if len(members)!=1:raise SystemExit('Unexpected test server archive layout')
 target.write_bytes(bundle.extractfile(members[0]).read());target.chmod(0o755)
print('Pinned Temporal test server installed:',hashlib.sha256(target.read_bytes()).hexdigest())
