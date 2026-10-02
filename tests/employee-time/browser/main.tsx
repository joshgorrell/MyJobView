import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../../src/index.css';
import {DailyLaunchpad} from '../../../src/components/Layout/DailyLaunchpad';
function App(){const [open,setOpen]=useState(true);return open?<DailyLaunchpad onClose={()=>setOpen(false)} onNavigate={(tab,params)=>{(window as any).__navigation={tab,params};}}/>:<button>Closed</button>;}
createRoot(document.getElementById('root')!).render(<App/>);
