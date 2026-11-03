import React from 'react';
import {createRoot} from 'react-dom/client';
import ProposalFollowUps from '../../../src/components/Reviews/ProposalFollowUps';
import ProposalCheckResponse from '../../../src/components/Reviews/ProposalCheckResponse';
import ProposalCheckHistory from '../../../src/components/Reviews/ProposalCheckHistory';
import '../../../src/index.css';
createRoot(document.getElementById('root')!).render(location.search.includes('email=1')?<ProposalFollowUps/>:location.search.includes('history=1')?<ProposalCheckHistory refreshKey={0}/>:<ProposalCheckResponse/>);
