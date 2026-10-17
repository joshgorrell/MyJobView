const brands=[{id:'sony',name:'Sony'},{id:'episode',name:'Episode'}];
const vendors=[{id:'amazon',vendor_name:'Amazon'},{id:'snap',vendor_name:'SnapAV'}];
const base={is_active:true,is_discontinued:false,cost:25,our_price:0,unit_price:99,inventory_type:'inventory',image_url:null,category:'Displays',catalog_category:{name:'Displays'},catalog_subcategory:null,manufacturer:null};
const products=[
  {...base,id:'a',sku:'TV-1',name:'TV-1',manufacturer_model_number:'TV-1',description:'Bedroom television',manufacturer_id:'sony',manufacturers:{name:'Sony'},default_vendor_id:'amazon',default_vendor:{vendor_name:'Amazon'}},
  {...base,id:'b',is_discontinued:true,sku:'TV-2',name:'TV-2',manufacturer_model_number:'TV-2',description:'Living room television',manufacturer_id:'sony',manufacturers:{name:'Sony'},default_vendor_id:'snap',default_vendor:{vendor_name:'SnapAV'}},
  {...base,id:'c',sku:'ES-1',name:'ES-1',manufacturer_model_number:'ES-1',description:'Ceiling speaker',manufacturer_id:'episode',manufacturers:{name:'Episode'},default_vendor_id:'snap',default_vendor:{vendor_name:'SnapAV'},catalog_category:{name:'Speakers'},catalog_subcategory:{name:'In-ceiling'}},
  {...base,id:'d',sku:'MISC-ITEM',name:'MISC-ITEM',manufacturer_model_number:'MISC-ITEM',description:'Miscellaneous item',manufacturer_id:null,manufacturers:null,default_vendor_id:null,default_vendor:null},
];
const profile={id:'tester',can_edit_products:true};
export const useAuth=()=>({profile,loading:false});
if(new URLSearchParams(location.search).has('lifecycle')) products.push({...products[0],id:'archived',sku:'OLD-TV',name:'OLD-TV',manufacturer_model_number:'OLD-TV',is_active:false});
export const supabase={from(table:string){let operation='',patch:any={},id='';const query={select(value:string){if(table==='products')(window as any).productSelect=value;return query;},update(value:any){operation='update';patch=value;return query;},delete(){operation='delete';return query;},eq(column:string,value:string){if(column==='id')id=value;return query;},order(){return query;},then(resolve:any){let error:any=null;if(table==='products'&&operation){const item=products.find(p=>p.id===id);if(operation==='update'&&item)Object.assign(item,patch);if(operation==='delete')error={code:'23503',message:'Product is in use'};}return Promise.resolve({data:table==='products'?[...products]:table==='manufacturers'?brands:table==='vendors'?vendors:[],error}).then(resolve);}};return query;}};
