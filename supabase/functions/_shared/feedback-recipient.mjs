// Read-only, tenant-scoped recipient resolution. No caller-provided recipient or URL.
const sources = Object.freeze({proposal_check:'proposals',lost_opportunity:'proposals',job_completion:'projects',test_tune:'projects',one_year:'projects',service_completion:'service_requests',support_completion:'tasks'});
async function row(db,table,columns,filters) {
 let query=db.from(table).select(columns);
 for(const [key,value] of Object.entries(filters)) query=query.eq(key,value);
 const {data,error}=await query.maybeSingle();
 if(error) throw new Error('Feedback lookup failed: '+table);
 return data;
}
export async function resolveFeedbackRecipient(db,organizationId,eventId) {
 if(!organizationId || !eventId) throw new Error('Missing feedback identity');
 const event=await row(db,'feedback_timeline_events','id,organization_id,timeline_key,source_id,cancelled_at',{id:eventId,organization_id:organizationId});
 if(!event || event.cancelled_at) return {reason:'event_ineligible'};
 const table=Object.hasOwn(sources,event.timeline_key)?sources[event.timeline_key]:null;
 if(!table) return {reason:'invalid_timeline'};
 const source=await row(db,table,'id,contact_id',{id:event.source_id,organization_id:organizationId});
 if(!source?.contact_id) return {reason:'missing_source_contact'};
 const contact=await row(db,'contacts','id,email,contact_name,full_name,first_name,last_name,company_name',{id:source.contact_id,organization_id:organizationId});
 if(!contact) return {reason:'missing_contact'};
 const email=typeof contact.email==='string'?contact.email.trim():'';
 if(!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) return {reason:'invalid_recipient'};
 const name=[contact.contact_name,contact.full_name,[contact.first_name,contact.last_name].filter(Boolean).join(' '),contact.company_name].find(v=>typeof v==='string'&&v.trim()&&!/[\r\n]/.test(v)) || 'Customer';
 return {eventId:event.id,timelineKey:event.timeline_key,sourceId:source.id,contactId:contact.id,email,customerName:name.trim()};
}
