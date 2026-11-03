import {Linking} from 'react-native';
import {supabase} from './supabase';
/** Open the canonical web workflows rather than building a second native Work Order/calendar. */
export async function openMJV(userId:string,params:Record<string,string>) {
  const {data:profile,error:profileError}=await supabase.from('profiles').select('organization_id').eq('id',userId).single();
  if(profileError) throw profileError;
  const {data:settings,error}=await supabase.from('company_settings').select('app_url').eq('organization_id',profile.organization_id).maybeSingle();
  if(error) throw error;
  if(!settings?.app_url) throw new Error('Ask your administrator to configure the MJV app URL in Company Settings.');
  const url=new URL(settings.app_url);
  if(url.protocol!=='https:') throw new Error('The MJV app URL must use HTTPS.');
  url.pathname='/';url.search='';url.hash='';
  for(const [key,value] of Object.entries(params)) url.searchParams.set(key,value);
  await Linking.openURL(url.toString());
}
