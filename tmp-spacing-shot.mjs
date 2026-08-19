import { chromium } from '@playwright/test';
const BASE='http://localhost:3888';
const b=await chromium.launch();
const p=await (await b.newContext()).newPage();
p.on('console',m=>{const t=m.text();if(/error|fail|invalid/i.test(t))console.log('CONSOLE:',t.slice(0,200));});
await p.goto(BASE+'/en/login',{waitUntil:'networkidle'});
console.log('landed:',p.url());
console.log('inputs:',await p.evaluate(()=>[...document.querySelectorAll('input')].map(i=>i.type+'|'+i.name+'|'+i.id).join(' , ')));
await p.fill('input[type="email"]','admin@mployedin.com');
await p.fill('input[type="password"]','Admin@1234');
const [resp]=await Promise.all([
  p.waitForResponse(r=>r.url().includes('/api/auth')&&r.request().method()==='POST',{timeout:30000}).catch(()=>null),
  p.click('button[type="submit"]'),
]);
if(resp)console.log('auth resp:',resp.status(),resp.url(),(await resp.text().catch(()=>'')).slice(0,300));
await p.waitForTimeout(6000);
console.log('after:',p.url());
console.log('body:',(await p.evaluate(()=>document.body.innerText)).slice(0,400).replace(/\n+/g,' | '));
await b.close();
