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
const native=load('mobile/src/services/LocationTrackingService.ts',{'expo-location':{Accuracy:{BestForNavigation:1},getCurrentPositionAsync:async()=>{throw Error('No fix');},getForegroundPermissionsAsync:async()=>({status:nativePermission}),getLastKnownPositionAsync:async()=>null},'expo-task-manager':{},'expo-battery':{},'expo-device':{},'react-native':{Platform:{OS:'ios'}},'./supabase':{},'./OfflineStorage':{}}).locationTrackingService;
native.lastKnownLocation={...position,timestamp:Date.now()-120000};assert.equal(await native.captureHighAccuracyLocation(),null,'Native capture rejects stale last known readings');
native.lastKnownLocation={...position,timestamp:Date.now()-1000};const fallback=await native.captureHighAccuracyLocation();assert.equal(fallback.coords.method,'cached');assert.equal(fallback.timestamp,native.lastKnownLocation.timestamp);
nativePermission='denied';assert.equal(await native.captureHighAccuracyLocation(),null,'Native permission denial cannot reuse a previous location');
console.log('GPS handles zero coordinates, network-loss queueing, and native stale-location/permission fallbacks.');

for (const path of ['src/components/Technician/DailyClock.tsx','src/components/Layout/TimeClockModal.tsx','src/components/Production/WorkOrderTimeControl.tsx','src/components/Production/TechnicianWorkCenter.tsx','src/components/Shared/ClockOutModal.tsx','mobile/src/screens/TimeClockScreen.tsx']) {
 const source=fs.readFileSync(path,'utf8');assert.equal(/\.(startTracking|startPreWarming|startPostCaptureRefinement)\(/.test(source),false,`${path} must not start ongoing GPS collection`);
}
assert.equal(fs.readFileSync('mobile/App.tsx','utf8').includes('initializeLocationTracking'),false,'Opening the native app must not request background location');
console.log('Clock flows never start GPS watches, pre-warming, refinement or background tracking.');
