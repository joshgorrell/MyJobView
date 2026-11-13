// CORS permits browser transport only; the underlying handler still authenticates every POST.
export function withTechsafeBrowserCors(handler){
 return async request=>{
  const origin=request.headers.get('origin');
  const allowed=typeof origin==='string'&&/^https:\/\/(?:[a-z0-9-]+\.)?myjobview\.com$/.test(origin);
  if(origin&&!allowed)return new Response(null,{status:403});
  const headers=allowed?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
   'Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}:{};
  if(request.method==='OPTIONS')return new Response(null,{status:allowed?204:403,headers});
  const response=await handler(request);
  const resultHeaders=new Headers(response.headers);
  for(const [key,value] of Object.entries(headers))resultHeaders.set(key,value);
  return new Response(response.body,{status:response.status,headers:resultHeaders});
 };
}
