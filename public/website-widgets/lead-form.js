export function mountLeadForm(root, config, endpoint, id) {
  const form = document.createElement('form');
  const heading = document.createElement('h2');
  heading.textContent = 'Tell us about your project';
  form.append(heading);
  function field(label, name, type='text', required=true) {
    const wrapper = document.createElement('label');
    wrapper.textContent = label;
    const input = document.createElement('input');
    input.name=name; input.type=type; input.required=required;
    wrapper.append(input); form.append(wrapper); return input;
  }
  field('Name','name'); field('Email','email','email'); field('Phone','phone','tel');
  const type = document.createElement('select'); type.name='projectType'; type.setAttribute('aria-label','Project type');
  for(const value of ['residential','commercial']) { const option=document.createElement('option'); option.value=value; option.textContent=value; type.append(option); }
  form.append(type);
  field('ZIP code','zip'); field('Timeline','timeline'); field('Budget (optional)','budget','text',false);
  field('Services of interest (comma separated)','interests');
  field('Project details (optional)','description','text',false);
  field('I agree to be contacted about this inquiry','consent','checkbox');
  const status=document.createElement('p'); status.setAttribute('role','status');
  const submit=document.createElement('button'); submit.type='submit'; submit.textContent='Request consultation';
  const challenge=document.createElement('div'); form.append(challenge,submit,status);
  const requestId=crypto.randomUUID();
  form.addEventListener('submit',async event=>{
    event.preventDefault(); submit.disabled=true;
    try {
      const data=Object.fromEntries(new FormData(form));
      const botToken=await config.getBotToken(challenge);
      const url=new URL(endpoint); url.pathname=url.pathname.replace(/website-widget-config$/,'submit-website-lead'); url.searchParams.set('id',id);
      const response=await fetch(url,{method:'POST',credentials:'omit',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,interests:String(data.interests).split(',').map(x=>x.trim()).filter(Boolean),consent:data.consent==='on',requestId,botToken})});
      if(!response.ok) throw new Error('Submission failed');
      status.textContent='Thank you. Your inquiry has been received.';
      for(const control of form.elements) control.disabled=true;
    } catch { status.textContent='Unable to send your inquiry. Please try again.'; submit.disabled=false; }
  });
  root.append(form);
}
