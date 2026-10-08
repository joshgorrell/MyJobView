const brands=[{id:'sony',name:'Sony'},{id:'episode',name:'Episode'}];
const vendors=[{id:'amazon',vendor_name:'Amazon'},{id:'snap',vendor_name:'SnapAV'}];
const base={cost:25,our_price:0,unit_price:99,inventory_type:'inventory',image_url:null,category:'Displays',catalog_category:{name:'Displays'},catalog_subcategory:null,manufacturer:null};
const products=[
  {...base,id:'a',sku:'TV-1',name:'TV-1',manufacturer_model_number:'TV-1',description:'Bedroom television',manufacturer_id:'sony',manufacturers:{name:'Sony'},default_vendor_id:'amazon',default_vendor:{vendor_name:'Amazon'}},
  {...base,id:'b',sku:'TV-2',name:'TV-2',manufacturer_model_number:'TV-2',description:'Living room television',manufacturer_id:'sony',manufacturers:{name:'Sony'},default_vendor_id:'snap',default_vendor:{vendor_name:'SnapAV'}},
  {...base,id:'c',sku:'ES-1',name:'ES-1',manufacturer_model_number:'ES-1',description:'Ceiling speaker',manufacturer_id:'episode',manufacturers:{name:'Episode'},default_vendor_id:'snap',default_vendor:{vendor_name:'SnapAV'},catalog_category:{name:'Speakers'}},
  {...base,id:'d',sku:'MISC-ITEM',name:'MISC-ITEM',manufacturer_model_number:'MISC-ITEM',description:'Miscellaneous item',manufacturer_id:null,manufacturers:null,default_vendor_id:null,default_vendor:null},
];
const profile={id:'tester',can_edit_products:true};
export const useAuth=()=>({profile,loading:false});
export const supabase={from(table:string){const query={select(value:string){if(table==='products')(window as any).productSelect=value;return query;},order(){return query;},then(resolve:any){return Promise.resolve({data:table==='products'?products:table==='manufacturers'?brands:table==='vendors'?vendors:[],error:null}).then(resolve);}};return query;}};
