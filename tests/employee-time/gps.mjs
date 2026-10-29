import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(path,imports,globals={}) {
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,Date,console:{log(){},error(){}},require:name=>{if(name in imports)return imports[name];throw Error(name);},...globals});return module.exports;
}
let behavior='success',requests=0,cleared=[],position={timestamp:Date.now()-1000,coords:{latitude:0,longitude:0,accuracy:12}};
const geo={getCurrentPosition(ok,fail,options){requests++;assert.equal(options.maximumAge,0);behavior==='success'?ok(position):fail({code:1});},watchPosition:()=>4,clearWatch:id=>cleared.push(id)};
const gps=load('src/lib/gpsTracking.ts',{'./supabase':{supabase:{}},'./reverseGeocode':{}},{navigator:{geolocation:geo},window:{addEventListener(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout:()=>1,clearTimeout(){},setInterval:()=>2,clearInterval(){}}).gpsTrackingService;
let reading=await gps.captureLocationForClockEvent();assert.equal(reading.latitude,0);assert.equal(reading.longitude,0);assert.equal(reading.captured_at,new Date(position.timestamp).toISOString());
behavior='denied';requests=0;reading=await gps.captureLocationForClockEvent(true);assert.equal(reading.method,'failed');assert.equal(reading.latitude,null);assert.equal(requests,1,'Denied permission stops retries and cannot reuse cached location');
// Retired automatic APIs cannot start watches or periodic collection.
const beforeRequests=requests;await gps.startTracking('tech','daily');gps.startPreWarming();await gps.startPostCaptureRefinement('entry');assert.equal(requests,beforeRequests);assert.equal(gps.isTracking,false);assert.equal(gps.watchId,null);assert.equal(gps.preWarmInterval,null);
let saved=[],addresses=[],failWrite=false,networkFailure=false;const helperNavigator={onLine:false};let networkQueue=[];
const helper=load('src/lib/clockEventGps.ts',{'./supabase':{supabase:{rpc:async()=>({data:75,error:null})}},'./offlineStorage':{offlineStorage:{addToSyncQueue:async action=>networkQueue.push(action)}},'./gpsTracking':{gpsTrackingService:{captureLocationForClockEvent:async()=>({latitude:0,longitude:0,accuracy:12,method:'high_accuracy',captured_at:new Date(position.timestamp).toISOString(),attempted_at:new Date().toISOString(),duration_ms:5})}},'./offlineSupport':{offlineSupabaseUpdate:async(table,data,id)=>{saved.push({table,data,id});return {error:networkFailure?Error('Failed to fetch'):failWrite?Error('Save rejected'):null};}},'./reverseGeocode':{updateClockEntryAddress:async(...args)=>addresses.push(args)}},{navigator:helperNavigator});
for(const table of ['daily_clock_entries','time_entries'])for(const out of [false,true]){await helper.saveClockEventGps('entry',table,out);const p=out?'clock_out':'clock_in';assert.equal(saved.at(-1).data[`${p}_latitude`],0);assert.equal(saved.at(-1).data[`${p}_gps_captured_at`],new Date(position.timestamp).toISOString());assert.equal(saved.at(-1).table,table);}
assert.equal(addresses.length,0,'Offline coordinates do not depend on a network geocoder');failWrite=true;await assert.rejects(()=>helper.saveClockEventGps('entry','time_entries',true),/Save rejected/);
console.log('GPS records actual reading timestamps, denial without stale fallback, action-only capture, and durable evidence for all four clock events.');

failWrite=false;helperNavigator.onLine=true;await helper.saveClockEventGps('entry','time_entries',true);assert.equal(addresses.at(-1)[1],0);assert.equal(addresses.at(-1)[2],0);assert.equal(saved.at(-1).data.clock_out_gps_quality_score,75);
networkFailure=true;await helper.saveClockEventGps('entry','time_entries',true);assert.equal(networkQueue.length,1);assert.equal(networkQueue[0].data.id,'entry');
let nativePermission='granted';
const native=load('mobile/src/services/LocationTrackingService.ts',{'expo-location':{Accuracy:{BestForNavigation:1},getCurrentPositionAsync:async()=>{throw Error('No fix');},getForegroundPermissionsAsync:async()=>({status:nativePermission}),getLastKnownPositionAsync:async()=>null},'expo-task-manager':{defineTask(){}},'expo-secure-store':{},'expo-crypto':{},'expo-battery':{},'expo-device':{},'react-native':{Platform:{OS:'ios'}},'./supabase':{},'./OfflineStorage':{}}).locationTrackingService;
native.lastKnownLocation={...position,timestamp:Date.now()-120000};assert.equal(await native.captureHighAccuracyLocation(),null,'Native capture rejects stale last known readings');
native.lastKnownLocation={...position,timestamp:Date.now()-1000};const fallback=await native.captureHighAccuracyLocation();assert.equal(fallback.coords.method,'cached');assert.equal(fallback.timestamp,native.lastKnownLocation.timestamp);
nativePermission='denied';assert.equal(await native.captureHighAccuracyLocation(),null,'Native permission denial cannot reuse a previous location');
console.log('GPS handles zero coordinates, network-loss queueing, and native stale-location/permission fallbacks.');

for (const path of ['src/components/Technician/DailyClock.tsx','src/components/Layout/TimeClockModal.tsx','src/components/Production/WorkOrderTimeControl.tsx','src/components/Production/TechnicianWorkCenter.tsx','src/components/Shared/ClockOutModal.tsx']) {
 const source=fs.readFileSync(path,'utf8');assert.equal(/\.(startTracking|startPreWarming|startPostCaptureRefinement)\(/.test(source),false,`${path} must not start ongoing GPS collection`);
}
assert.equal(fs.readFileSync('mobile/App.tsx','utf8').includes('initializeLocationTracking'),false,'Opening the native app must not request background location');
const nativeClockSource=fs.readFileSync('mobile/src/screens/TimeClockScreen.tsx','utf8');
assert.ok(nativeClockSource.includes('await locationTrackingService.startTracking(profile.id, entryId)'), 'Native Daily Clock starts the authorized workday GPS session');
assert.ok(nativeClockSource.includes('await locationTrackingService.stopTracking()'), 'Native Daily Clock stops workday GPS at clock-out');
for (const retired of ['.startPreWarming(', '.startPostCaptureRefinement(']) assert.equal(nativeClockSource.includes(retired), false, 'Native clocks must not start web refinement');
console.log('Web clocks avoid ongoing GPS collection; native workday tracking starts/stops with Daily Clock and not app opening.');

let nativeSaved=[],nativeRemoved=[],nativeWrites=[],nativeSession='tech';
const nativeGps=load('mobile/src/services/ClockEventGps.ts',{
 './LocationTrackingService':{},'./OfflineStorage':{offlineStorage:{saveClockGps:async(...args)=>nativeSaved.push(args),removeClockGps:async id=>nativeRemoved.push(id)}},
 './supabase':{supabase:{auth:{getSession:async()=>({data:{session:{user:{id:nativeSession}}}})},from:()=>({update:values=>({eq:()=>({eq:()=>({select:async()=>{nativeWrites.push(values);return {data:[{id:'entry'}],error:null};}})})})})}},
});
for (const out of [false,true]) { await nativeGps.saveNativeClockGps('entry','tech',out,Promise.resolve(position),new Date().toISOString());const prefix=out?'clock_out':'clock_in';assert.equal(nativeWrites.at(-1)[`${prefix}_latitude`],0);assert.ok(nativeRemoved.includes(`entry:${prefix}`)); }
nativeSession='other';const before=nativeWrites.length;await nativeGps.saveNativeClockGps('entry','tech',true,Promise.resolve(null),new Date().toISOString());assert.equal(nativeWrites.length,before,'Native GPS cannot sync through a different user account');assert.equal(nativeSaved.at(-1)[3].clock_out_gps_capture_method,'failed');
console.log('Native punch GPS persists before network delivery, handles zero coordinates and records failure without crossing accounts.');


const workOrderClockSource=fs.readFileSync('src/components/Production/WorkOrderTimeControl.tsx','utf8');
const sharedClockOutSource=fs.readFileSync('src/components/Shared/ClockOutModal.tsx','utf8');
assert.match(workOrderClockSource, /captureLocationForClockEvent\(\)/, 'Job clock-in must attempt GPS at the punch');
assert.match(workOrderClockSource, /saveClockEventGps\(data,\s*'time_entries',\s*false,\s*capture\)/, 'Job clock-in must persist GPS evidence');
assert.match(sharedClockOutSource, /captureLocationForClockEvent\(true\)/, 'Clock-out must attempt GPS at the punch');
assert.match(sharedClockOutSource, /saveClockEventGps\(entryId,\s*type === 'daily' \? 'daily_clock_entries' : 'time_entries',\s*true,\s*capture\)/, 'Job clock-out must persist GPS evidence');
assert.ok(workOrderClockSource.indexOf("supabase.rpc('start_work_order_time'") < workOrderClockSource.indexOf("saveClockEventGps(data, 'time_entries'"), 'Server must establish job time before GPS evidence attaches');
assert.ok(sharedClockOutSource.indexOf('await offlineSupabaseUpdate(') < sharedClockOutSource.indexOf('void saveClockEventGps(entryId'), 'Clock-out must persist punch before GPS evidence');
console.log('Customer Job Clock in/out paths are wired to GPS capture and durable evidence without blocking payroll punches.');


const punchAt = '2026-10-29T12:00:00.000Z';
let overlapRows = {daily_clock_breaks: [], time_entries: []};
let overlapError = false;
const overlapSupabase = {
  from(table) {
    const filters = [];
    const query = new Proxy({}, {get(_, method) {
      if (method === 'then') return resolve => {
        if (overlapError) { resolve({data:null,error:new Error('Unable to verify activity')}); return; }
        const data = overlapRows[table].filter(row => filters.every(([op, field, value]) => {
          if (op === 'eq') return row[field] === value;
          if (op === 'lt') return Date.parse(row[field]) < Date.parse(value);
          if (op === 'in') return value.includes(row[field]);
          if (op === 'or') {
            const [nullClause, gtClause] = field.split(',');
            const nullField = nullClause.split('.')[0], gtField = gtClause.split('.')[0];
            const threshold = gtClause.slice(gtField.length + 4);
            return row[nullField] == null || Date.parse(row[gtField]) > Date.parse(threshold);
          }
          return true;
        }));
        resolve({data:data.slice(0,1),error:null});
      };
      return (...args) => { if (['eq','lt','in','or'].includes(method)) filters.push([method,...args]); return query; };
    }});
    return query;
  },
};
const {hasOverlappingActivityAtClockOut} = load('mobile/src/services/OfflineStorage.ts',{
  'expo-sqlite':{}, '@react-native-community/netinfo':{},
  './supabase':{supabase:overlapSupabase},
});
const overlaps = () => hasOverlappingActivityAtClockOut('tech','shift',punchAt);
overlapRows.daily_clock_breaks=[{id:'break',daily_clock_entry_id:'shift',break_start:'2026-10-29T11:30:00Z',break_end:'2026-10-29T12:30:00Z'}];
assert.equal(await overlaps(),true,'Break ending after offline punch still conflicts at punch time');
overlapRows.daily_clock_breaks=[{id:'break',daily_clock_entry_id:'shift',break_start:'2026-10-29T12:30:00Z',break_end:null}];
assert.equal(await overlaps(),false,'Break starting after punch must not create a false conflict');
overlapRows.daily_clock_breaks=[];
overlapRows.time_entries=[{id:'job',technician_id:'tech',clock_in:'2026-10-29T11:00:00Z',clock_out:null,status:'draft'}];
assert.equal(await overlaps(),true,'Open job timer spanning punch conflicts');
overlapRows.time_entries=[{id:'job',technician_id:'tech',clock_in:'2026-10-29T11:00:00Z',clock_out:'2026-10-29T12:20:00Z',status:'approved'}];
assert.equal(await overlaps(),true,'Approved job time ending after punch still conflicts');
overlapRows.time_entries=[{id:'job',technician_id:'tech',clock_in:'2026-10-29T12:20:00Z',clock_out:null,status:'draft'}];
assert.equal(await overlaps(),false,'Job time started after punch does not conflict');
overlapRows.time_entries=[{id:'job',technician_id:'tech',clock_in:'2026-10-29T11:00:00Z',clock_out:null,status:'rejected'}];
assert.equal(await overlaps(),false,'Rejected activity is not payable');
overlapError=true;
await assert.rejects(overlaps(),/Unable to verify activity/,'Failed server verification must not approve a punch');
console.log('Offline Daily Clock-Out checks historical job/break overlap at the punch timestamp and fails closed.');

const nativeOfflineSource=fs.readFileSync('mobile/src/services/OfflineStorage.ts','utf8');
assert.equal((nativeOfflineSource.match(/await hasOverlappingActivityAtClockOut\(event\.technician_id, event\.id, event\.clock_out\)/g)||[]).length,2,
  'Both existing-shift closure and offline-created-shift insertion must check historical activity overlap');
