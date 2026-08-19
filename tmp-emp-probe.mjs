import { chromium } from '@playwright/test';
const BASE='http://localhost:3888';
const b=await chromium.launch();
const p=await (await b.newContext()).newPage();
await p.goto(BASE+'/en/login',{waitUntil:'networkidle'});
await p.fill('input[type="email"]','employer@mployedin.com');
await p.fill('input[type="password"]','Employer@1234');
await p.click('button[type="submit"]');
await p.waitForURL(u=>!u.pathname.includes('/login'),{timeout:60000}).catch(()=>{});
await p.waitForTimeout(2000);
for (const [w,h,tag] of [[1440,900,'desktop'],[768,1024,'tablet'],[390,844,'mobile']]){
  await p.setViewportSize({width:w,height:h});
  await p.goto(BASE+'/en/employer',{waitUntil:'networkidle'}).catch(()=>{});
  await p.waitForTimeout(2500);
  const r=await p.evaluate(()=>{
    const vh=innerHeight, vw=innerWidth;
    const fixedBottom=[...document.querySelectorAll('body *')].filter(e=>{
      const s=getComputedStyle(e); if(s.position!=='fixed'&&s.position!=='sticky')return false;
      const r=e.getBoundingClientRect(); return r.height>30&&r.bottom>vh-4&&r.width>vw*0.6;
    }).map(e=>({cls:(e.className||'').toString().slice(0,50),h:Math.round(e.getBoundingClientRect().height)}));
    const pane=document.querySelector('.dashboard-main');
    const paneBottomPad=pane?getComputedStyle(pane).paddingBottom:'n/a';
    const pc=document.querySelector('.page-container');
    const last=pc?pc.lastElementChild:null;
    // scroll pane to bottom, then see how much of last section the nav covers
    if(pane)pane.scrollTop=pane.scrollHeight;
    const navH=fixedBottom.reduce((m,x)=>Math.max(m,x.h),0);
    const lastRect=last?last.getBoundingClientRect():null;
    const hiddenByNav=lastRect?Math.round(Math.max(0,lastRect.bottom-(vh-navH))):0;
    // horizontal overflow scan
    const over=[...document.querySelectorAll('.page-container *')].filter(e=>e.scrollWidth-e.clientWidth>4&&e.clientWidth>200)
      .map(e=>({cls:(e.className||'').toString().slice(0,60),over:e.scrollWidth-e.clientWidth}));
    // priority actions grid
    const grids=[...document.querySelectorAll('.page-container [class*="grid"]')].map(e=>{
      const s=getComputedStyle(e);const n=e.children.length;
      const cols=s.gridTemplateColumns.split(' ').filter(Boolean).length;
      return cols>1?{cols,n,orphan:n%cols!==0,gap:s.gap,cls:(e.className||'').toString().slice(0,45)}:null;
    }).filter(Boolean);
    // logo in header
    const hdr=document.querySelector('header');
    const logo=hdr?!!hdr.querySelector('img'):false;
    // panel inner padding variety
    const pads=[...document.querySelectorAll('.page-container > *')].map(e=>getComputedStyle(e).padding);
    return {vw,vh,fixedBottom,paneBottomPad,hiddenByNav,over:over.slice(0,6),grids:grids.slice(0,8),logo,pads};
  });
  console.log('###',tag,JSON.stringify(r,null,1));
}
await b.close();
