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
const MEASURE=()=>{
  const doc=document.documentElement;
  const c=document.querySelector('.page-container');
  const out={overflow:doc.scrollWidth-doc.clientWidth,container:!!c};
  const host=c||document.querySelector('.dashboard-main')||document.body;
  out.gap=getComputedStyle(host).rowGap;
  const kids=[...host.children].filter(e=>getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().height>0);
  const gaps=[];
  for(let i=1;i<kids.length;i++){const a=kids[i-1].getBoundingClientRect(),b=kids[i].getBoundingClientRect();gaps.push(Math.round(b.top-a.bottom));}
  out.uniqGaps=[...new Set(gaps)].sort((x,y)=>x-y);
  // panels that ended up with no inner padding at all = codemod regression
  out.padless=[...document.querySelectorAll('.workspace-panel-surface,.card-base')].filter(e=>{
    const s=getComputedStyle(e); if(parseFloat(s.paddingTop)>0||parseFloat(s.paddingLeft)>0) return false;
    return [...e.children].some(ch=>{const cs=getComputedStyle(ch);return parseFloat(cs.paddingTop)===0&&parseFloat(cs.paddingLeft)===0&&ch.textContent.trim().length>0;});
  }).length;
  return out;
};
const b=await chromium.launch();
const results=[]; const byRole={};
for(const role of Object.keys(CREDS)) byRole[role]=ROUTES.filter(r=>roleOf(r)===role);
byRole.public=ROUTES.filter(r=>roleOf(r)==='public');
for(const [role,routes] of Object.entries(byRole)){
  if(!routes.length) continue;
  const ctx=await b.newContext(); const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
  if(CREDS[role]){
    await p.goto(BASE+'/en/login',{waitUntil:'domcontentloaded',timeout:90000});
    await p.waitForSelector('input[type="email"]',{timeout:90000});
    await p.fill('input[type="email"]',CREDS[role][0]);
    await p.fill('input[type="password"]',CREDS[role][1]);
    await p.click('button[type="submit"]');
    await p.waitForURL(u=>!u.pathname.includes('/login'),{timeout:60000}).catch(()=>{});
    await p.waitForTimeout(1500);
    if(p.url().includes('/login')){console.log('LOGIN-FAIL',role);await ctx.close();continue;}
  }
  let i=0;
  for(const r of routes){
    i++; const url=BASE+'/en'+(r==='/'?'':r);
    try{
      errs.length=0;
      const resp=await p.goto(url,{waitUntil:'networkidle',timeout:90000});
      if(resp&&resp.status()>=400){results.push({role,route:r,error:'HTTP '+resp.status()});continue;}
      if(p.url().includes('/login')){results.push({role,route:r,error:'auth-redirect'});continue;}
      // dev-mode streams a loading.tsx skeleton first; measuring before the real
      // page lands reports "no container" and zero gaps for every route.
      await p.waitForSelector('.page-container',{timeout:20000}).catch(()=>{});
      await p.waitForTimeout(1200);
      const row={role,route:r};
      for(const [w,h,tag] of SIZES){
        await p.setViewportSize({width:w,height:h});
        await p.waitForTimeout(400);
        row[tag]=await p.evaluate(MEASURE);
      }
      if(errs.length)row.jsError=errs[0];
      results.push(row);
    }catch(e){results.push({role,route:r,error:String(e).slice(0,100)});}
    if(i%15===0)console.log(role,i+'/'+routes.length);
  }
  await ctx.close(); console.log('DONE',role,routes.length);
  fs.writeFileSync('tmp-spacing-audit.json',JSON.stringify(results,null,1));
}
await b.close();
fs.writeFileSync('tmp-spacing-audit.json',JSON.stringify(results,null,1));
console.log('TOTAL',results.length);
