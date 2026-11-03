import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {NotesPolishButton} from '../../../src/components/Shared/NotesPolishButton';
import '../../../src/index.css';
function App(){const [notes,setNotes]=useState('tv wasnt working replaced hdmi from truck tv works speaker still bad need return');return <div className="p-4"><div className="flex justify-between items-center"><label>Work Order Notes</label><NotesPolishButton value={notes} onApply={setNotes}/></div><textarea aria-label="Work Order Notes" className="w-full border p-3" value={notes} onChange={e=>setNotes(e.target.value)}/></div>}
createRoot(document.getElementById('root')!).render(<App/>);
