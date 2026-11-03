import assert from'node:assert/strict';import{Client}from'pg';
const connect=async()=>{const c=new Client({connectionString:process.env.TEMPLATE_DATABASE_URL});await c.connect();return c},root=await connect(),a=await connect(),b=await connect();
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
try{for(const c of[a,b]){await c.query("select set_config('test.uid',$1,false)",[id(10)]);await c.query('set role authenticated')}
 await Promise.all([a.query('select set_company_proposal_template_default($1)',[id(40)]),b.query('select set_company_proposal_template_default($1)',[id(44)])]);
 assert.equal(Number((await root.query('select count(*) from proposal_report_templates where organization_id=$1 and is_default',[id(1)])).rows[0].count),1);
 const outcomes=await Promise.allSettled([a.query('select set_company_proposal_template_default($1)',[id(41)]),b.query('select set_company_proposal_template_default($1)',[id(40)])]);assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);assert.equal((await root.query('select id from proposal_report_templates where organization_id=$1 and is_default',[id(1)])).rows[0].id,id(40));
 console.log('Real PostgreSQL: concurrent company-default switches serialize and invalid requests cannot clear the default.');
}finally{await Promise.all([root.end(),a.end(),b.end()]);}
