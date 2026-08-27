import { chromium } from '@playwright/test';
import fs from 'fs';
const BASE='http://localhost:3888';
const EMP=['/employer/jobs','/employer/interviews','/employer/candidates'];
const SIZES=[[390,844,'mobile'],[768,1024,'tablet'],[1440,900,'desktop']];
const MEASURE=()=>{
  const doc=document.documentElement;
  const c=document.querySelector('.page-container');
  const hdr=document.querySelector('.dashboard-page-header,.page-header-root');
  const s=hdr?getComputedStyle(hdr):null;
  const kids=c?[...c.children].filter(e=>getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().height>0):[];
  const gaps=[];
  for(let i=1;i<kids.length;i++){const a=kids[i-1].getBoundingClientRect(),b=kids[i].getBoundingClientRect();gaps.push(Math.round(b.top-a.bottom));}
  return {
    ovf:doc.scrollWidth-doc.clientWidth,
    gap:c?getComputedStyle(c).rowGap:null,
    uniqGaps:[...new Set(gaps)].sort((x,y)=>x-y),
    hdr:hdr?`pad=${s.padding} bd=${s.borderTopWidth} rad=${s.borderTopLeftRadius}`:'none',
  };
};
const b=await chromium.launch();
async function run(role,creds,routes){
  const ctx=await b.newContext(); const p=await ctx.newPage();
  await p.goto(BASE+'/en/login',{waitUntil:'domcontentloaded',timeout:120000});
  await p.waitForSelector('input[type="email"]',{timeout:120000});
  await p.fill('input[type="email"]',creds[0]); await p.fill('input[type="password"]',creds[1]);
  await p.click('button[type="submit"]');
  await p.waitForURL(u=>!u.pathname.includes('/login'),{timeout:90000}).catch(()=>{});
  await p.waitForTimeout(12000);
  if(p.url().includes('/login')){console.log('LOGIN-FAIL',role);await ctx.close();return [];}
  const out=[];
  for(const r of routes){
    const row={role,route:r};
    for(const [w,h,name] of SIZES){
      await p.setViewportSize({width:w,height:h});
      try{
        const resp=await p.goto(BASE+'/en'+r,{waitUntil:'networkidle',timeout:90000});
        if(resp&&resp.status()>=400){row[name]={err:'HTTP '+resp.status()};continue;}
        await p.waitForSelector('.page-container',{timeout:20000}).catch(()=>{});
        await p.waitForTimeout(900);
        row[name]=await p.evaluate(MEASURE);
      }catch(e){row[name]={err:String(e).slice(0,60)};}
    }
    out.push(row); console.log(r,'ok');
  }
  await ctx.close(); return out;
}
const res=[
 ...await run('employer',['employer@mployedin.com','Employer@1234'],EMP),
 ...await run('agent',['agent@mployedin.com','Agent@1234'],['/agent','/agent/employers']),
 ...await run('admin',['admin@mployedin.com','Admin@1234'],['/admin','/admin/employers']),
];
fs.writeFileSync('tmp-emp-sweep.json',JSON.stringify(res,null,1));
await b.close();
