export function mountServiceForm(root,config,endpoint,id){
 const form=document.createElement('form');
 const heading=document.createElement('h2');heading.textContent='Request service';form.append(heading);
 for(const [label,name,type,max] of [['Name','name','text',120],['Email','email','email',254],['Phone','phone','tel',40],['Service address','address','text',250],['City','city','text',100],['State','state','text',50],['ZIP code','zip','text',12],['Describe the issue','description','textarea',4000],['I agree to be contacted about this request','consent','checkbox',0]]){
 const wrapper=document.createElement('label');wrapper.textContent=label;
 const input=document.createElement(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.name=name;input.required=true;if(max)input.maxLength=max;wrapper.append(input);form.append(wrapper);
 }
 const challenge=document.createElement('div'),status=document.createElement('p'),submit=document.createElement('button');status.setAttribute('role','status');submit.type='submit';submit.textContent='Submit service request';form.append(challenge,submit,status);
 const requestId=crypto.randomUUID();
 form.addEventListener('submit',async event=>{event.preventDefault();submit.disabled=true;try{
 const data=Object.fromEntries(new FormData(form));const botToken=await config.getBotToken(challenge);
 const url=new URL(endpoint);url.pathname=url.pathname.replace(/website-widget-config$/,'submit-website-service');url.searchParams.set('id',id);
 const response=await fetch(url,{method:'POST',credentials:'omit',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,consent:data.consent==='on',requestId,botToken})});
 if(!response.ok)throw Error('Submission failed');status.textContent='Request received. Our service team will contact you to discuss next steps.';for(const control of form.elements)control.disabled=true;
 }catch{status.textContent='Unable to send your request. Please try again.';submit.disabled=false;}});
 root.append(form);
}
