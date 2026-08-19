import { chromium } from '@playwright/test';
const BASE='http://localhost:3888', OUT=process.env.OUT;
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
  await p.waitForTimeout(3000);
  // scroll the inner pane to force lazy content, then flatten it so fullPage works
  await p.evaluate(async()=>{
    const pane=document.querySelector('.dashboard-main')||document.scrollingElement;
    for(let y=0;y<pane.scrollHeight;y+=500){pane.scrollTop=y;await new Promise(r=>setTimeout(r,120));}
    pane.scrollTop=0;
  });
  await p.waitForTimeout(800);
  const info=await p.evaluate(()=>{
    const pane=document.querySelector('.dashboard-main');
    const paneH=pane?pane.scrollHeight:0;
    // flatten internal scroll so a fullPage screenshot captures the whole page
    for(let e=pane;e&&e!==document.body;e=e.parentElement){
      const s=getComputedStyle(e);
      if(s.overflow!=='visible'||s.overflowY!=='visible'){e.style.overflow='visible';e.style.overflowY='visible';}
      if(s.height!=='auto') e.style.height='auto';
      if(s.maxHeight!=='none') e.style.maxHeight='none';
    }
    document.documentElement.style.height='auto';document.body.style.height='auto';
    return {paneH};
  });
  await p.waitForTimeout(600);
  await p.screenshot({path:`${OUT}/emp2-${tag}.png`,fullPage:true});
  console.log(tag,'paneScrollHeight',info.paneH,'viewport',h);
}
await b.close();
