export const proposalChoices = {
  love_it: { label: 'Love it!', steps: ['Ready to proceed', 'Ask a question', 'Discuss next steps'] },
  considering: { label: 'Still considering', steps: ['Need more information', 'Discuss pricing', 'Contact me later'] },
  needs_work: { label: 'Needs work', steps: ['Change the scope', 'Adjust the budget', 'Explain what needs changing'] },
  off_base: { label: 'Way off base', steps: ['Budget is off', 'Scope misses the mark', 'Request a conversation'] },
  declined: { label: 'Declined', steps: ['Share why', 'Send a closing message', 'Reconsider options'] },
} as const;
export type ProposalChoice = keyof typeof proposalChoices;
export const isProposalChoice = (v: unknown): v is ProposalChoice => typeof v === 'string' && Object.prototype.hasOwnProperty.call(proposalChoices, v);
