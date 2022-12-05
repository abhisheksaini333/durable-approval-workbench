#!/usr/bin/env python3
"""Exercise real identity, gateway, workflow and provider services with demo accounts."""
import json,time,uuid,urllib.request,urllib.parse,urllib.error
from pathlib import Path
root=Path(__file__).resolve().parents[1]
credentials=json.loads((root/'.local/credentials.json').read_text())
def identity(name):
 user=credentials['users'][name];body=urllib.parse.urlencode({'grant_type':'password','client_id':'switchboard','username':user['username'],'password':user['password']}).encode()
 request=urllib.request.Request('http://localhost:4901/realms/switchboard/protocol/openid-connect/token',data=body,headers={'Content-Type':'application/x-www-form-urlencoded'})
 with urllib.request.urlopen(request,timeout=10) as response:return json.load(response)['access_token']
def api(method,path,token,body=None,key=None):
 headers={'Authorization':'Bearer '+token}
 if body is not None:headers['Content-Type']='application/json'
 if key:headers['Idempotency-Key']=key
 request=urllib.request.Request('http://localhost:4900/api'+path,data=None if body is None else json.dumps(body).encode(),headers=headers,method=method)
 try:
  with urllib.request.urlopen(request,timeout=15) as response:return json.load(response)
 except urllib.error.HTTPError as error:
  problem=json.load(error);raise RuntimeError(str(error.code)+': '+problem.get('detail',problem.get('error','Request failed'))) from None
def wait(id,token,predicate,timeout=30):
 deadline=time.monotonic()+timeout
 while time.monotonic()<deadline:
  state=api('GET','/requests/'+id,token)
  if predicate(state):return state
  time.sleep(.2)
 raise RuntimeError('Timed out waiting for the durable workflow state')
def run():
 owner,security,commercial=(identity(name) for name in ['requester','security','commercial']);key=str(uuid.uuid4());payload={'customer':'Northstar demo '+key[:6],'plan':'enterprise','seats':24}
 first=api('POST','/requests',owner,payload,key);id=first['id'];assert api('POST','/requests',owner,payload,key)['id']==id
 state=wait(id,owner,lambda s:s['status']=='pending')
 first_decision={'id':str(uuid.uuid4()),'stage':'security','choice':'approve','note':'Security evidence reviewed','revision':state['revision']}
 api('POST','/requests/'+id+'/decisions',security,first_decision);api('POST','/requests/'+id+'/decisions',security,first_decision)
 state=wait(id,owner,lambda s:any(r['id']==first_decision['id'] for r in s['receipts']))
 assert next(r for r in state['receipts'] if r['id']==first_decision['id'])['outcome']=='accepted'
 second={'id':str(uuid.uuid4()),'stage':'commercial','choice':'approve','note':'Commercial terms reviewed','revision':state['revision']};api('POST','/requests/'+id+'/decisions',commercial,second)
 state=wait(id,owner,lambda s:s['status'] in ['approved','failed','compensation_failed']);assert state['status']=='approved',state['status'];assert len(state['receipts'])==2
 result={'requestId':id,'status':state['status'],'receipts':len(state['receipts']),'reserved':state['reserved'],'activated':state['activated'],'auditEvents':len(state['audit'])}
 artifacts=root/'artifacts';artifacts.mkdir(exist_ok=True);(artifacts/'demo-latest.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
if __name__=='__main__':run()
