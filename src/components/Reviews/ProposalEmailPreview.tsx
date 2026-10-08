import { useEffect, useRef } from 'react';
import { isProposalChoice, type ProposalChoice } from '../../../supabase/functions/_shared/proposalCheckOptions';
/** Scripts stay disabled. Intercept links before the srcDoc document navigates. */
export default function ProposalEmailPreview({html,onChoice}:{html:string;onChoice:(choice:ProposalChoice)=>void}) {
 const frame=useRef<HTMLIFrameElement>(null);const cleanup=useRef<(()=>void)|null>(null);
 useEffect(()=>()=>cleanup.current?.(),[html]);
 function loaded(){cleanup.current?.();const document=frame.current?.contentDocument;if(!document)return;
  function click(event:MouseEvent){const anchor=(event.target as Element)?.closest?.('a');if(!anchor)return;event.preventDefault();const href=anchor.getAttribute('href')||'';let choice=href.match(/^#proposal-check-preview-(.+)$/)?.[1];if(!choice){try{choice=new URL(href,window.location.origin).searchParams.get('choice')||undefined}catch{}}
   if(isProposalChoice(choice))onChoice(choice);
  }
  document.addEventListener('click',click);cleanup.current=()=>document.removeEventListener('click',click);
 }
 return <iframe ref={frame} title="Proposal follow-up email preview" sandbox="allow-same-origin" referrerPolicy="no-referrer" onLoad={loaded} srcDoc={html} className="h-[400px] w-full bg-white sm:h-[500px]"/>;
}
