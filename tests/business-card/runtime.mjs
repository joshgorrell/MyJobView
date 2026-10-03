import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function harness(path, imports={}, globals={}) {
  let cursor=0; const values=[], deps=[], effects=[];
  const react={useState(initial){const i=cursor++;if(!(i in values))values[i]=initial;return [values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v}];},useRef(initial){const i=cursor++;return values[i] ||= {current:initial}},useEffect(fn,next){const i=cursor++;if(!deps[i]||next.some((v,j)=>v!==deps[i][j])){deps[i]=next;effects.push(fn)}}};
  const jsx=(type,props)=>({type,props});const module={exports:{}};
  const source=fs.readFileSync(path,'utf8').replaceAll('import.meta.env.VITE_SUPABASE_URL',"'https://fixture.example'").replaceAll('import.meta.env.VITE_SUPABASE_ANON_KEY',"'fixture'");
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,URL,console:{error(){}},...globals,require(name){if(name==='react')return react;if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};if(name==='lucide-react')return new Proxy({},{get:(_,key)=>key});if(name in imports)return imports[name];throw Error(name)}});
  return {render(props,name){cursor=0;return module.exports[name](props)},async settle(props,name){for(const effect of effects.splice(0))effect();for(let i=0;i<10;i++)await new Promise(setImmediate);return this.render(props,name)}};
}
function nodes(tree){if(!tree||typeof tree!=='object')return [];if(Array.isArray(tree))return tree.flatMap(nodes);return [tree,...nodes(tree.props?.children)]}
function text(tree){if(Array.isArray(tree))return tree.map(text).join('');if(!tree||typeof tree!=='object')return tree==null?'':String(tree);return text(tree.props?.children)}
const identity=harness('src/components/BusinessCard/BusinessCardIdentity.tsx');
const props={fullName:'Josh Gorrell',title:'President',email:'josh@electroniclife.com',phone:'785-845-5100',linkedinUrl:'https://linkedin.com/in/josh',photoUrl:'photo',company:{company_name:'Electronic Life',website:'http:www.electroniclife.com'}};
let tree=identity.render(props,'BusinessCardIdentity');
assert.equal(nodes(tree).filter(n=>n.type==='a').length,4);
assert.equal(nodes(tree).find(n=>n.type==='a'&&text(n).includes('Website')).props.href,'https://www.electroniclife.com/');
assert.ok(nodes(tree).some(n=>n.type==='img'&&n.props.src==='/images/electronic-life-card-banner.webp'));
assert.ok(text(tree).includes('INNOVATE. INTEGRATE. INSPIRE.'));
for(const [company,banner] of [[{...props.company,business_card_banner_url:'https://example.com/custom.png'},'https://example.com/custom.png'],[{company_name:'Other Dealer',website:null},null],[{...props.company,business_card_banner_url:''},null]]){
 tree=identity.render({...props,company},'BusinessCardIdentity');
 const banners=nodes(tree).filter(n=>n.type==='img'&&n.props.alt==='');
 assert.equal(banners.length,banner?1:0);if(banner)assert.equal(banners[0].props.src,banner);
}
const calls=[];let fail=false;
const settings={company_name:'Electronic Life',company_logo_url:'logo',organization_id:'org-a',business_card_banner_url:'https://example.com/original.png'};
const records={company_settings:settings,organizations:{id:'org-a'},business_cards:{...props,id:'card',user_id:'owner',slug:'josh',full_name:'Josh Gorrell',is_active:true,email:props.email,phone:props.phone,title:props.title},company_offices:[]};
const supabase={from(table){let single=false;const query=new Proxy({},{get(_,key){if(key==='then')return done=>Promise.resolve({data:single?records[table]:Array.isArray(records[table])?records[table]:[records[table]],error:null}).then(done);if(['single','maybeSingle'].includes(key))return()=>{single=true;return query};return (...args)=>{calls.push({table,key,args});return query}}});return query;},rpc:async(name,args)=>{calls.push({name,args});return {data:name==='get_business_card_branding'?settings:null,error:fail?{message:'Failed'}:null}},auth:{getUser:async()=>({data:{user:{id:'admin-a'}},error:null})},storage:{from(bucket){return {upload:async(path,file,options)=>{calls.push({upload:path,bucket,options});return {error:null}},getPublicUrl:path=>({data:{publicUrl:'https://fixture.example/storage/v1/object/public/'+bucket+'/'+path}}),remove:async(paths)=>{calls.push({remove:paths});return {error:null}}}}}};
const identityMock={BusinessCardIdentity:'Identity',BusinessCardFooter:'Footer'};
const auth={useAuth:()=>({profile:{organization_id:'viewer-org'},user:{id:'admin-a'}})};
const page=harness('src/components/BusinessCard/BusinessCardPage.tsx',{'../../lib/supabase':{supabase},'../../contexts/AuthContext':auth,'./UserBusinessCardEditor':{UserBusinessCardEditor:'Editor'},'../../lib/businessCardLinks':{getBusinessCardUrl:()=>''},'./BusinessCardIdentity':identityMock});
page.render({slug:'josh'},'BusinessCardPage');tree=await page.settle({slug:'josh'},'BusinessCardPage');
assert.ok(calls.some(c=>c.name==='get_business_card_branding'&&c.args.p_slug==='josh'));
assert.ok(calls.some(c=>c.table==='company_offices'&&c.key==='eq'&&c.args[1]==='org-a'));
assert.ok(!calls.some(c=>c.table==='company_settings'));
const admin=harness('src/components/Admin/CompanySettings.tsx',{'../../lib/supabase':{supabase},'../../lib/utils':{formatCurrency:v=>String(v)},'../../lib/timezoneUtils':{TIMEZONE_OPTIONS:[],clearTimezoneCache(){}},'../../lib/subdomainConfig':{validateSubdomain:()=>({valid:true})},'../ui/ConfirmModal':{default:'Confirm'},'../BusinessCard/BusinessCardIdentity':identityMock},{crypto:{randomUUID:()=> 'random-uuid'}});
admin.render({},'CompanySettings');tree=await admin.settle({},'CompanySettings');
async function upload(type='image/png',size=12){const input=nodes(tree).find(n=>n.type==='input'&&n.props.id==='business-card-artwork');await input.props.onChange({target:{files:[{type,size}],value:'test'}});tree=admin.render({},'CompanySettings');}
await upload();
assert.ok(calls.some(c=>c.upload==='admin-a/dealer-banner-random-uuid.png'&&c.bucket==='business-card-photos'));
assert.ok(calls.some(c=>c.name==='set_business_card_banner'&&c.args.p_url.includes('admin-a/dealer-banner')));
assert.equal(calls.filter(c=>c.remove).length,0,'Successful replacement must not delete previous saved artwork');
const saved=nodes(tree).find(n=>n.type==='Identity').props.company.business_card_banner_url;
fail=true;await upload();assert.equal(nodes(tree).find(n=>n.type==='Identity').props.company.business_card_banner_url,saved);assert.equal(calls.filter(c=>c.remove).length,1);assert.ok(text(tree).includes('previous artwork is unchanged'));
const count=calls.filter(c=>c.upload).length;await upload('image/svg+xml');await upload('image/png',6*1024*1024);assert.equal(calls.filter(c=>c.upload).length,count);
fail=false;await nodes(tree).find(n=>n.type==='button'&&text(n)==='Remove Artwork').props.onClick();tree=admin.render({},'CompanySettings');assert.equal(nodes(tree).find(n=>n.type==='Identity').props.company.business_card_banner_url,'');
await nodes(tree).find(n=>n.type==='button'&&text(n)==='Use Electronic Life Artwork').props.onClick();tree=admin.render({},'CompanySettings');assert.equal(nodes(tree).find(n=>n.type==='Identity').props.company.business_card_banner_url,null);
console.log('Default/custom/removed artwork, safe website links, card-owner branding, upload paths, save failures, validation, removal and reset passed.');
