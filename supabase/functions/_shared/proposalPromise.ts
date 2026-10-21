import { isElectronicLife, resolveProposalLogo, escapeBrandText as escape } from './proposalBrand.ts';

// Shared copy for the portal and the standalone printed page.
export const proposalPromise = {
  eyebrow: 'OUR PROMISE TO YOU',
  headline: 'Your perfect system.\nOn your terms.',
  introduction: 'This proposal is the start of a conversation. Together, we’ll shape a system that fits your space, your priorities, and your budget.',
  promises: [
    { title: 'Let’s make it a perfect fit.', body: 'Want to bring the budget down, explore an upgrade, or take a different direction? We’re happy to adjust the equipment, features, and scope until the proposal feels right for you.', highlight: 'Go up. Go down. Make it yours.' },
    { title: 'The best price. Guaranteed.', body: 'For comparable equipment and the same scope of work, we’ll meet or beat the competing price. Share the competing proposal with us so we can compare the details and have the opportunity to make it right.', highlight: 'If we can’t, we’ll buy you dinner!' },
    { title: 'We’re here after installation.', body: 'Our 90-Day Test & Tune includes project adjustments, tuning, and guidance after substantial completion, giving you time to settle in and get comfortable with your system.', highlight: 'A great experience, from proposal to everyday life.' },
  ],
  closing: 'Tell us what you love. Tell us what you’d change. We’ll take it from there.',
  tagline: 'Innovate. Integrate. Inspire.',
};
export const hasElectronicLifePromise = isElectronicLife;
export const proposalPromiseStyles = `
.el-promise{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#0f2347;background:#fff;max-width:850px;margin:0 auto;overflow:hidden;border:1px solid #dbe3ea;border-radius:20px;text-align:left;line-height:1.6}
.el-promise *{box-sizing:border-box}
.el-promise-hero{padding:0 42px 32px;background:linear-gradient(125deg,#0f2347,#153f70);color:#fff;border-top:5px solid #0099cf}
.el-promise-brand{display:flex;align-items:center;gap:20px;margin:0 -42px 28px;padding:22px 42px;background:#fff;border-bottom:1px solid #e2e8f0}
.el-promise-logo{width:260px;max-width:100%;max-height:70px;object-fit:contain}
.el-promise-company{font-size:17px;font-weight:700;letter-spacing:.5px}
.el-promise-eyebrow{font-size:10px;font-weight:700;letter-spacing:2.5px;color:#9ddff6;margin:0 0 14px}
.el-promise h2{font-size:43px;line-height:1.08;letter-spacing:-1.5px;margin:0 0 18px;color:#fff;font-weight:700}
.el-promise-intro{max-width:550px;color:#e1eef7;font-size:14px;line-height:1.75;margin:0}
.el-promise-body{padding:12px 42px 24px}
.el-promise-item{display:flex;gap:20px;padding:23px 0;border-bottom:1px solid #e2e8f0;break-inside:avoid;page-break-inside:avoid}
.el-promise-number{font-size:12px;font-weight:700;color:#007baa;border:1px solid #bde4f1;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px}
.el-promise h3{font-size:19px;line-height:1.3;font-weight:700;letter-spacing:-.35px;margin:0 0 8px;color:#0f2347}
.el-promise-item p{font-size:12px;line-height:1.8;margin:0;color:#4b5563}
.el-promise-item .el-promise-highlight{font-size:12px;margin-top:9px;font-weight:700;color:#007baa}
.el-promise-footer{padding-top:24px;display:flex;gap:20px;justify-content:space-between;align-items:center}
.el-promise-closing{font-size:12px;font-weight:600;max-width:340px;margin:0;color:#334155}
.el-promise-tagline{font-size:10px;font-weight:700;letter-spacing:1px;color:#007baa;margin:0;text-align:right}
@media(max-width:540px){.el-promise-hero{padding:0 22px 28px}.el-promise-brand{margin:0 -22px 25px;padding:20px 22px}.el-promise h2{font-size:35px}.el-promise-body{padding:8px 22px 24px}.el-promise-item{gap:12px}.el-promise-footer{display:block}.el-promise-tagline{text-align:left;margin-top:16px}}
@media print{.el-promise{max-width:none;border:0;border-radius:0;print-color-adjust:exact;-webkit-print-color-adjust:exact}.el-promise-hero{padding:0 32px 24px}.el-promise-brand{margin:0 -32px 22px;padding:16px 32px}.el-promise h2{font-size:36px}.el-promise-body{padding:8px 32px 20px}.el-promise-item{padding:17px 0}.el-promise-footer{padding-top:18px}.el-promise-print-page{break-after:page;page-break-after:always}.el-promise-banner{display:none}.el-promise-details>.el-promise-content{display:block!important}}
`;
export function renderProposalPromise(companyName: string, logoUrl?: string | null): string {
  const logo = resolveProposalLogo(companyName, logoUrl);
  const p = proposalPromise;
  return `<section class="el-promise" aria-label="Our promise to you"><div class="el-promise-hero">
    <div class="el-promise-brand">${logo ? `<img class="el-promise-logo" src="${escape(logo)}" alt="${escape(companyName)}"/>` : `<span class="el-promise-company">${escape(companyName)}</span>`}</div>
    <p class="el-promise-eyebrow">${p.eyebrow}</p><h2>${p.headline.split('\n').map(escape).join('<br>')}</h2><p class="el-promise-intro">${escape(p.introduction)}</p></div>
    <div class="el-promise-body">${p.promises.map((item, i) => `<div class="el-promise-item"><span class="el-promise-number">0${i + 1}</span><div><h3>${escape(item.title)}</h3><p>${escape(item.body)}</p><p class="el-promise-highlight">${escape(item.highlight)}</p></div></div>`).join('')}
    <div class="el-promise-footer"><p class="el-promise-closing">${escape(p.closing)}</p><p class="el-promise-tagline">${escape(p.tagline)}</p></div></div></section>`;
}
