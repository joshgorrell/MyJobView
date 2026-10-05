import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { corsHeaders,getSupabaseAdmin,getConnection,qboRequest } from '../_shared/qbo-client.ts';
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS') return new Response(null,{headers:corsHeaders});
 if(req.method!=='POST') return respond({error:'POST required'},405);
 try {
  const caller=createClient(Deno.env.get('SUPABASE_URL') || '',Deno.env.get('SUPABASE_ANON_KEY') || '',{global:{headers:{Authorization:req.headers.get('Authorization') || ''}},auth:{persistSession:false}});
  const {data:{user},error:authError}=await caller.auth.getUser();
  if(authError || !user) return respond({error:'Sign in required'},401);
  const {data:profile}=await caller.from('profiles').select('organization_id,role,is_active').eq('id',user.id).maybeSingle();
  if(profile?.role!=='admin' || !profile.is_active) return respond({error:'Only Admin can configure monitoring billing'},403);
  const input=await req.json();
  if(!['list','save'].includes(input.action) || Object.keys(input).some(k=>!['action','itemId'].includes(k))) return respond({error:'Invalid request'},400);
  const admin=getSupabaseAdmin();const connection=await getConnection(admin,profile.organization_id);
  if(!connection) return respond({error:'Connect QuickBooks Accounting first'},409);
  if(input.action==='list') {
   const items=[];
   for(let start=1;start<=10001;start+=1000){
    const query=`select * from Item where Type = 'Service' and Active = true startposition ${start} maxresults 1000`;
    const result=await qboRequest(admin,connection,'GET',`query?query=${encodeURIComponent(query)}&minorversion=75`);
    if(!result.ok) throw new Error('QuickBooks service items could not be loaded. Please retry.');
    const batch=result.data?.QueryResponse?.Item || [];
    items.push(...batch.filter((i:any)=>i.IncomeAccountRef?.value).map((i:any)=>({id:String(i.Id),name:i.FullyQualifiedName || i.Name,income_account:i.IncomeAccountRef.name || 'Income account '+i.IncomeAccountRef.value})));
    if(batch.length<1000) return respond({items,environment:connection.environment});
   }
   throw new Error('The QuickBooks service catalog is too large to load. Contact support.');
  }
  if(typeof input.itemId!=='string' || !/^\d{1,30}$/.test(input.itemId)) return respond({error:'Choose a QuickBooks service item'},400);
  const result=await qboRequest(admin,connection,'GET',`item/${encodeURIComponent(input.itemId)}`);
  const item=result.data?.Item;
  if(!result.ok || !item || item.Active===false || item.Type!=='Service' || !item.IncomeAccountRef?.value) return respond({error:'Choose an active QuickBooks service item with an income account'},400);
  const {data:saved,error}=await admin.from('quickbooks_settings').update({security_monitoring_item_id:String(item.Id)}).eq('id',connection.id).eq('organization_id',profile.organization_id).eq('realm_id',connection.realm_id).eq('environment',connection.environment).select('id').maybeSingle();
  if(error || !saved) throw new Error('Billing setup could not be saved. Refresh the connection status and try again.');
  return respond({success:true,item:{id:String(item.Id),name:item.FullyQualifiedName || item.Name,income_account:item.IncomeAccountRef.name || 'Income account '+item.IncomeAccountRef.value}});
 }catch(e){return respond({error:e instanceof Error?e.message:'Billing setup failed'},400);}
});
function respond(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json','Cache-Control':'no-store'}});}
