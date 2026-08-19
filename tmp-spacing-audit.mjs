import { chromium } from '@playwright/test';
import fs from 'fs';
const BASE='http://localhost:3888';
const {static:ROUTES}=JSON.parse(fs.readFileSync('tmp-routes.json','utf8'));
const CREDS={
  admin:['admin@mployedin.com','Admin@1234'],
  employer:['employer@mployedin.com','Employer@1234'],
  'job-seeker':['jobseeker@mployedin.com','JobSeeker@1234'],
  agent:['agent@mployedin.com','Agent@1234'],
  'super-agent':['superagent@mployedin.com','SuperAgent@1234'],
};
const roleOf=r=>Object.keys(CREDS).find(x=>r===`/${x}`||r.startsWith(`/${x}/`))||'public';
const SIZES=[[390,844,'mobile'],[768,1024,'tablet'],[1440,900,'desktop']];

const MEASURE=`()=>{
  const c=document.querySelector('.page-container');
  const main=document.querySelector('.dashboard-main')||document.body;
  const doc=document.documentElement;
  const out={overflow:doc.scrollWidth-doc.clientWidth,container:!!c};
  const host=c||main;
  const cs=getComputedStyle(host);
  out.gap=cs.rowGap; out.pad=cs.paddingTop+'/'+cs.paddingLeft; out.display=cs.display;
  const kids=[...host.children].filter(e=>{const s=getComputedStyle(e);return s.display!=='none'&&e.getBoundingClientRect().height>0});
  out.kids=kids.length;
  const gaps=[];
  for(let i=1;i<kids.length;i++){
    const a=kids[i-1].getBoundingClientRect(),b=kids[i].getBoundingClientRect();
    gaps.push(Math.round(b.top-a.bottom));
  }
  out.gaps=gaps;
  out.uniq=[...new Set(gaps)].sort((x,y)=>x-y);
  return out;
}`;

const b=await chromium.launch();
const results=[];
const byRole={};
for(const role of Object.keys(CREDS)) byRole[role]=ROUTES.filter(r=>roleOf(r)===role);
byRole.public=ROUTES.filter(r=>roleOf(r)==='public');

for(const [role,routes] of Object.entries(byRole)){
  if(!routes.length) continue;
  const ctx=await b.newContext();
  const p=await ctx.newPage();
  if(CREDS[role]){
    await p.goto(BASE+'/en/login',{waitUntil:'networkidle'});
    await p.fill('input[type="email"]',CREDS[role][0]);
    await p.fill('input[type="password"]',CREDS[role][1]);
    await p.click('button[type="submit"]');
    await p.waitForURL(u=>!u.pathname.includes('/login'),{timeout:45000}).catch(()=>{});
    await p.waitForTimeout(1500);
    if(p.url().includes('/login')){console.log('LOGIN-FAIL',role);await ctx.close();continue;}
  }
  for(const r of routes){
    const url=BASE+'/en'+(r==='/'?'':r);
    try{
      const resp=await p.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
      if(resp && resp.status()>=400){results.push({role,route:r,error:'HTTP '+resp.status()});continue;}
      if(p.url().includes('/login')){results.push({role,route:r,error:'redirected-to-login'});continue;}
      await p.waitForTimeout(900);
      const row={role,route:r};
      for(const [w,h,tag] of SIZES){
        await p.setViewportSize({width:w,height:h});
        await p.waitForTimeout(350);
        row[tag]=await p.evaluate(MEASURE);
      }
      await p.setViewportSize({width:1440,height:900});
      results.push(row);
    }catch(e){results.push({role,route:r,error:String(e).slice(0,120)});}
  }
  await ctx.close();
  console.log('done role',role,routes.length);
}
await b.close();
fs.writeFileSync('tmp-spacing-audit.json',JSON.stringify(results,null,1));
console.log('TOTAL',results.length);
