"""Isolated PR77 API checks. Pass a local config file; never production.
Config: url, staging_project_ref, key (publishable), password (synthetic fixture users only).
"""
import datetime as dt
import json
import sys
import urllib.request
import urllib.error
from zoneinfo import ZoneInfo

cfg=json.load(open(sys.argv[1]))
assert cfg["staging_project_ref"] != "bqtsuzvuvqvgidipbsis", "Never use production"
assert cfg["url"] == "https://" + cfg["staging_project_ref"] + ".supabase.co", "Explicit staging target required"
def uid(n): return f"77000000-0000-0000-0000-{n:012}"
def req(path, method="GET", body=None, token=None):
    headers={"apikey":cfg["key"],"Content-Type":"application/json","Prefer":"return=representation"}
    if token: headers["Authorization"]="Bearer "+token
    request=urllib.request.Request(cfg["url"]+path,data=None if body is None else json.dumps(body).encode(),headers=headers,method=method)
    try:
        with urllib.request.urlopen(request,timeout=25) as r:
            raw=r.read()
            return r.status,json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw=e.read()
        return e.code,json.loads(raw) if raw else None
def ok(result, label):
    status,body=result
    assert status<300, (label,status,body)
    return body
def reject(result, message):
    status,body=result
    assert status>=400 and message in body.get("message",""),(status,body)
def check_notification_access(tokens, alerts):
    alert=alerts[0]["id"]
    assert ok(req("/rest/v1/notifications?id=eq."+alert,token=tokens["foreign"]),"foreign notification read")==[]
    changed=ok(req("/rest/v1/notifications?id=eq."+alert,"PATCH",{"is_read":True},tokens["admin"]),"notification acknowledgment")
    assert len(changed)==1 and changed[0]["is_read"] is True
    reject(req("/rest/v1/notifications?id=eq."+alert,"PATCH",{"title":"Unauthorized rewrite"},tokens["admin"]),"permission denied")
    deleted=ok(req("/rest/v1/notifications?id=eq."+alert,"DELETE",token=tokens["admin"]),"recipient deletion")
    assert len(deleted)==1

tokens={}
for name in ["tech","daily","admin","foreign","inactive"]:
    body=ok(req("/auth/v1/token?grant_type=password","POST",{"email":f"pr77-{name}@example.invalid","password":cfg["password"]}),"synthetic login")
    tokens[name]=body["access_token"]
print("Synthetic password authentication passed.",flush=True)
tech=tokens["tech"];admin=tokens["admin"];daily=tokens["daily"]
assert req("/rest/v1/rpc/start_work_order_time","POST",{"p_work_order_id":uid(50)})[0]>=400
start=ok(req("/rest/v1/rpc/start_work_order_time","POST",{"p_work_order_id":uid(50)},tech),"WO start")
assert start==ok(req("/rest/v1/rpc/start_work_order_time","POST",{"p_work_order_id":uid(50)},tech),"WO start retry")
now=dt.datetime.now(dt.timezone.utc)
day=now.astimezone(ZoneInfo("America/Chicago")).date().isoformat()
reject(req("/rest/v1/daily_clock_entries","POST",{"technician_id":uid(10),"entry_date":day,"clock_in":now.isoformat()},tech),"Job Time employees do not use")
for prefix in ["clock_in","clock_out"]:
    values={prefix+"_latitude":39,prefix+"_longitude":-95,prefix+"_gps_accuracy":12,prefix+"_gps_capture_method":"high_accuracy",prefix+"_gps_duration_ms":800,prefix+"_gps_attempted_at":now.isoformat(),prefix+"_gps_captured_at":now.isoformat()}
    if prefix=="clock_out": values.update(clock_out=dt.datetime.now(dt.timezone.utc).isoformat(),status="submitted")
    row=ok(req("/rest/v1/time_entries?id=eq."+start,"PATCH",values,tech),"job clock GPS save")
    assert len(row)==1 and row[0][prefix+"_latitude"]==39 and row[0][prefix+"_gps_captured_at"]
assert len(ok(req("/rest/v1/travel_bonus_requests?work_order_id=eq."+uid(50),token=tech),"travel read"))==1
print("Work Order start/retry/stop, GPS metadata, travel and Daily Clock rejection passed.",flush=True)
previous=now-dt.timedelta(days=1)
request={"id":uid(70),"technician_id":uid(10),"project_id":uid(40),"entry_date":previous.astimezone(ZoneInfo("America/Chicago")).date().isoformat(),"clock_in":(previous-dt.timedelta(hours=2)).isoformat(),"clock_out":(previous-dt.timedelta(hours=1)).isoformat(),"reason":"Synthetic API programming"}
ok(req("/rest/v1/manual_job_time_requests","POST",request,tech),"manual request")
for name in ["foreign","inactive"]:
    reject(req("/rest/v1/rpc/review_manual_job_time_request","POST",{"p_request_id":uid(70),"p_action":"approve"},tokens[name]),"Time review permission required")
approved=ok(req("/rest/v1/rpc/review_manual_job_time_request","POST",{"p_request_id":uid(70),"p_action":"approve"},admin),"manager review")
assert approved==ok(req("/rest/v1/rpc/review_manual_job_time_request","POST",{"p_request_id":uid(70),"p_action":"approve"},admin),"manager retry")
print("Tenant/inactive-manager rejection and idempotent manual approval passed.",flush=True)
ok(req("/rest/v1/daily_clock_entries","POST",{"id":uid(80),"technician_id":uid(11),"entry_date":day,"clock_in":(now-dt.timedelta(hours=1)).isoformat()},daily),"daily clock start")
for prefix in ["clock_in","clock_out"]:
    values={prefix+"_latitude":39,prefix+"_longitude":-95,prefix+"_gps_accuracy":10,prefix+"_gps_capture_method":"high_accuracy",prefix+"_gps_duration_ms":900,prefix+"_gps_attempted_at":now.isoformat(),prefix+"_gps_captured_at":now.isoformat()}
    if prefix=="clock_out": values["clock_out"]=dt.datetime.now(dt.timezone.utc).isoformat()
    row=ok(req("/rest/v1/daily_clock_entries?id=eq."+uid(80),"PATCH",values,daily),"daily GPS save")
    assert len(row)==1 and row[0][prefix+"_gps_captured_at"]
    ok(req("/rest/v1/daily_clock_entries?id=eq."+uid(80),"PATCH",values,daily),"repeat daily GPS save")
alerts=ok(req("/rest/v1/notifications?related_id=eq."+uid(80)+"&type=eq.home_clock",token=admin),"manager home alerts")
assert len(alerts)==2, ("home clock alerts",len(alerts))
check_notification_access(tokens, alerts)
print("Daily clock start/stop, GPS metadata and one home alert per action passed.",flush=True)
print("Hosted HTTP API scenarios passed.",flush=True)
