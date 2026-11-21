import React from 'react';

const screenshots = [
  { src: '/marketing/profitability.png', alt: 'MyJobView project profitability dashboard', eyebrow: 'PROJECT PROFITABILITY', title: 'Know exactly where your margin goes.', body: 'Compare estimated and actual labor, understand job performance, and catch overruns before they become expensive.' },
  { src: '/marketing/sales-order.png', alt: 'MyJobView room-based sales order', eyebrow: 'SALES & PROPOSALS', title: 'Build proposals the way integrators sell.', body: 'Organize equipment, labor, rooms, and classes around the way your team designs and installs systems.' },
  { src: '/marketing/billing.png', alt: 'MyJobView billing and contract summary', eyebrow: 'BILLING & CHANGE ORDERS', title: 'Keep the financial story connected.', body: 'See contract changes, billing schedules, and outstanding amounts alongside the project itself.' },
  { src: '/marketing/customer-portal.png', alt: 'MyJobView customer proposal portal', eyebrow: 'CUSTOMER EXPERIENCE', title: 'Make the experience as good as the installation.', body: 'Give customers a polished place to review proposals, approve work, and stay connected.' },
];

function ProductImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = React.useState(false);
  return <div className="overflow-hidden rounded-2xl border border-sky-800/50 bg-slate-900 shadow-2xl shadow-sky-950/40">
    {failed ? <div className="flex min-h-64 items-center justify-center p-8 text-center text-slate-400">MyJobView product screenshot</div> : <img src={src} alt={alt} className="block w-full" loading="lazy" onError={() => setFailed(true)} />}
  </div>;
}

export default function MarketingHomepage() {
  return <div className="min-h-screen bg-[#070d17] text-white" style={{fontFamily:'Inter, system-ui, sans-serif'}}>
    <header className="border-b border-slate-800/90 bg-[#09111d]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
        <a href="/" className="flex items-center gap-3 text-xl font-extrabold tracking-tight"><img src="/MJV_icon.PNG" alt="" className="h-11 w-11 object-contain" /><span className="whitespace-nowrap">MyJob<span className="text-sky-400">View</span></span></a>
        <nav aria-label="Main navigation" className="hidden items-center gap-7 text-sm text-slate-300 md:flex"><a href="#why" className="hover:text-white">Why MyJobView</a><a href="#platform" className="hover:text-white">Platform</a><a href="#features" className="hover:text-white">Features</a></nav>
        <a href="/dealer-login" className="rounded-lg bg-sky-600 px-5 py-3 text-sm font-bold hover:bg-sky-500">Dealer Login</a>
      </div>
    </header>
    <main>
      <section className="bg-[radial-gradient(ellipse_at_75%_35%,#123f67_0%,#091a2d_40%,#070d17_75%)] px-5 py-20 lg:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
          <div><p className="mb-5 text-xs font-bold uppercase tracking-[.24em] text-sky-400">Built for AV, security & technology integrators</p>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl xl:text-6xl">Stop managing software. <span className="text-sky-400">Start running your business.</span></h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-slate-300">Win more projects. Protect your margins. Keep your crews productive. MyJobView connects sales, installations, service, billing and customers—from the first lead to lifelong support.</p>
            <div className="mt-8 flex flex-wrap gap-3"><a href="#platform" className="rounded-lg bg-sky-600 px-6 py-3 font-bold hover:bg-sky-500">Explore the Platform</a><a href="mailto:info@myjobview.com?subject=MyJobView%20Demo%20Request" className="rounded-lg border border-slate-500 px-6 py-3 font-bold hover:bg-slate-800">Request a Demo</a></div>
            <div className="mt-9 grid gap-3 text-sm text-slate-200 sm:grid-cols-2">{['Real project profitability','Integrated sales and production','Field team accountability','Customer lifecycle management'].map(x=><div key={x}><span className="mr-2 text-sky-400">✓</span>{x}</div>)}</div>
          </div>
          <ProductImage src={screenshots[0].src} alt={screenshots[0].alt} />
        </div>
      </section>
      <div className="border-y border-sky-900 bg-[#0c1829] px-5 py-6"><div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-4 text-sm font-bold text-slate-200">{['Pipeline','Production','Dispatch','Finance','Admin','Customer Portal','Assist'].map(x=><span key={x}>{x}</span>)}</div></div>
      <section id="why" className="mx-auto max-w-7xl px-5 py-20"><p className="text-xs font-bold uppercase tracking-widest text-sky-400">Not another generic job management tool</p><h2 className="mt-4 text-3xl font-extrabold sm:text-5xl">Designed around how integrators <span className="text-sky-400">actually work.</span></h2><p className="mt-4 max-w-3xl text-slate-300">From room-by-room equipment proposals to labor performance, change orders, customer approvals, and ongoing service.</p>
        <div id="platform" className="mt-16 space-y-24">{screenshots.map((s,i)=><article key={s.src} className="grid items-center gap-10 lg:grid-cols-2"><div className={i%2 ? 'lg:order-2' : ''}><p className="text-xs font-bold tracking-widest text-sky-400">{s.eyebrow}</p><h3 className="mt-3 text-3xl font-bold">{s.title}</h3><p className="mt-4 text-lg leading-relaxed text-slate-300">{s.body}</p></div><div className={i%2 ? 'lg:order-1' : ''}><ProductImage src={s.src} alt={s.alt}/></div></article>)}</div>
      </section>
      <section id="features" className="border-t border-slate-800 bg-[#0a1423] px-5 py-20"><div className="mx-auto max-w-7xl"><p className="text-xs font-bold uppercase tracking-widest text-sky-400">One connected platform</p><h2 className="mt-3 text-3xl font-extrabold sm:text-5xl">Every department. One view.</h2><div className="mt-10 grid gap-5 md:grid-cols-3">{[
        ['Labor & profitability','Track time, labor targets, project statistics and team performance.'],
        ['Sales-tax intelligence','Location-based tax rates, classifications, verification and reporting workflows.'],
        ['Service & customer lifecycle','Service requests, customer portal, security monitoring and VIP programs.'],
        ['Dispatch & field operations','Scheduling, work orders, mobile time tracking and technician coordination.'],
        ['Communications & automation','Reminders, customer follow-ups and technician notifications.'],
        ['Dealer-focused integrations','QuickBooks, Twilio and dealer-specific configuration and vendor workflows.'],
      ].map(([name,body])=><div key={name} className="rounded-xl border border-sky-900/70 bg-slate-900/70 p-7"><h3 className="text-xl font-bold">{name}</h3><p className="mt-3 leading-relaxed text-slate-300">{body}</p></div>)}</div></div></section>
      <section className="px-5 py-20 text-center"><h2 className="text-3xl font-extrabold sm:text-5xl">Built for integrators. <span className="text-sky-400">Designed for profitability.</span></h2><p className="mx-auto mt-5 max-w-xl text-slate-300">See how MyJobView connects your business from first lead to ongoing service.</p><a href="mailto:info@myjobview.com?subject=MyJobView%20Demo%20Request" className="mt-8 inline-block rounded-lg bg-sky-600 px-7 py-4 font-bold hover:bg-sky-500">Request a Demo</a></section>
    </main><footer className="border-t border-slate-800 px-5 py-7 text-center text-sm text-slate-400">© {new Date().getFullYear()} MyJobView</footer>
  </div>;
}
