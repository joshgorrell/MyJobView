import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../../src/index.css';
import {DailyLaunchpad} from '../../../src/components/Layout/DailyLaunchpad';
import {TimeButton} from '../../../src/components/Layout/QuickClockButton';
function App(){const [open,setOpen]=useState(true);const navigate=(tab:string,params?:Record<string,string>)=>{(window as any).__navigation={tab,params};};if(location.search.includes('salary'))return <TimeButton onNavigate={navigate}/>;return open?<DailyLaunchpad onClose={()=>setOpen(false)} onNavigate={navigate}/>:<button>Closed</button>;}
createRoot(document.getElementById('root')!).render(<App/>);
