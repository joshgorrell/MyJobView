export function mountLeadForm(root, config, endpoint, id) {
  const form = document.createElement('form');
  const heading = document.createElement('h2');
  heading.textContent = config.branding?.name ? 'Tell '+config.branding.name+' about your project' : 'Tell us about your project';
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
  const choices = Array.isArray(config.interests) ? config.interests.filter(x=>typeof x==='string') : [];
  if (choices.length) {
    const group=document.createElement('fieldset');
    const legend=document.createElement('legend'); legend.textContent='Services of interest (select up to 12)'; group.append(legend);
    for(const choice of choices) {
      const label=document.createElement('label');
      const checkbox=document.createElement('input'); checkbox.type='checkbox'; checkbox.name='interestChoice'; checkbox.value=choice;
      label.append(checkbox,document.createTextNode(choice)); group.append(label);
    }
    form.append(group);
  } else field('Services of interest (comma separated)','interests');
  field('Project details (optional)','description','text',false);
  field('I agree to be contacted about this inquiry','consent','checkbox');
  const status=document.createElement('p'); status.setAttribute('role','status');
  const submit=document.createElement('button'); submit.type='submit'; submit.textContent='Request consultation';
  if(/^#[0-9a-f]{6}$/i.test(config.branding?.color ?? '')) submit.style.backgroundColor=config.branding.color;
  const challenge=document.createElement('div'); form.append(challenge,submit,status);
  const requestId=crypto.randomUUID();
  form.addEventListener('submit',async event=>{
    event.preventDefault(); submit.disabled=true;
    try {
      const fields=new FormData(form); const data=Object.fromEntries(fields);
      const interests=choices.length?fields.getAll('interestChoice'):String(data.interests).split(',').map(x=>x.trim()).filter(Boolean);
      if(!interests.length || interests.length>12){status.textContent='Please select between 1 and 12 services.';submit.disabled=false;return;}
      const botToken=await config.getBotToken(challenge);
      const url=new URL(endpoint); url.pathname=url.pathname.replace(/website-widget-config$/,'submit-website-lead'); url.searchParams.set('id',id);
      const response=await fetch(url,{method:'POST',credentials:'omit',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,interests,consent:data.consent==='on',requestId,botToken})});
      if(!response.ok) throw new Error('Submission failed');
      status.textContent='Thank you. Your inquiry has been received.';
      for(const control of form.elements) control.disabled=true;
    } catch { status.textContent='Unable to send your inquiry. Please try again.'; submit.disabled=false; }
  });
  root.append(form);
}
