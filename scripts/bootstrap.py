#!/usr/bin/env python3
"""Create local credentials and realm input without writing secrets into source."""
import json,os,secrets,uuid
from pathlib import Path
root=Path(__file__).resolve().parents[1];local=root/'.local';local.mkdir(exist_ok=True)
def atomic(path,value):
 temp=path.with_name(path.name+'.tmp-'+secrets.token_hex(4))
 fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w') as f:f.write(value)
 os.replace(temp,path)
path=local/'credentials.json'
if path.exists():credentials=json.loads(path.read_text())
else:
 old={}
 if (local/'postgres.env').exists():old=dict(line.split('=',1) for line in (local/'postgres.env').read_text().splitlines() if '=' in line)
 credentials={'databasePassword':old.get('POSTGRES_PASSWORD') or secrets.token_urlsafe(32),'providerToken':secrets.token_urlsafe(40),'adminPassword':secrets.token_urlsafe(32),'users':{}}
 for name,roles,tenant in [('requester',['requester'],'acme'),('security',['security-reviewer'],'acme'),('commercial',['commercial-reviewer'],'acme'),('operator',['operator'],'acme'),('self-review',['requester','security-reviewer'],'acme'),('outsider',['requester'],'other')]:
  credentials['users'][name]={'username':name,'id':str(uuid.uuid4()),'password':secrets.token_urlsafe(18),'roles':roles,'tenant':tenant}
 atomic(path,json.dumps(credentials,indent=2)+'\n')
realm={'realm':'switchboard','enabled':True,'sslRequired':'external','registrationAllowed':False,'resetPasswordAllowed':False,'bruteForceProtected':True,'accessTokenLifespan':300,'roles':{'realm':[{'name':r} for r in ['requester','security-reviewer','commercial-reviewer','operator']]},'clients':[{'clientId':'switchboard','enabled':True,'publicClient':True,'protocol':'openid-connect','standardFlowEnabled':True,'directAccessGrantsEnabled':True,'redirectUris':['http://localhost:4900/*'],'webOrigins':['http://localhost:4900'],'attributes':{'pkce.code.challenge.method':'S256'},'protocolMappers':[{'name':'tenant','protocol':'openid-connect','protocolMapper':'oidc-usermodel-attribute-mapper','config':{'user.attribute':'tenant_id','claim.name':'tenant_id','jsonType.label':'String','access.token.claim':'true','id.token.claim':'true'}},{'name':'api-audience','protocol':'openid-connect','protocolMapper':'oidc-audience-mapper','config':{'included.custom.audience':'switchboard-api','access.token.claim':'true','id.token.claim':'false'}}]}],'users':[]}
for user in credentials['users'].values():realm['users'].append({'id':user['id'],'username':user['username'],'enabled':True,'emailVerified':True,'email':user['username']+'@switchboard.example','firstName':user['username'].title(),'lastName':'Demo','attributes':{'tenant_id':[user['tenant']]},'realmRoles':user['roles'],'credentials':[{'type':'password','value':user['password'],'temporary':False}]})
atomic(local/'switchboard-realm.json',json.dumps(realm,indent=2)+'\n')
atomic(local/'docker.env','POSTGRES_PASSWORD='+credentials['databasePassword']+'\nKEYCLOAK_ADMIN_PASSWORD='+credentials['adminPassword']+'\n')
env={'DATABASE_URL':'postgresql://switchboard:'+credentials['databasePassword']+'@127.0.0.1:4902/switchboard','PROVIDER_TOKEN':credentials['providerToken'],'OIDC_ISSUER':'http://localhost:4901/realms/switchboard','PUBLIC_ORIGIN':'http://localhost:4900','PROVIDER_URL':'http://127.0.0.1:4903','TEMPORAL_ADDRESS':'127.0.0.1:4904','TEMPORAL_NAMESPACE':'default','TASK_QUEUE':'switchboard'}
existing={}
if (root/'.env').exists():existing=dict(line.split('=',1) for line in (root/'.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
atomic(root/'.env',''.join(key+'='+value+'\n' for key,value in {**env,**existing}.items()))
print('Local credentials are ready in .local/credentials.json; secret values were not printed.')
