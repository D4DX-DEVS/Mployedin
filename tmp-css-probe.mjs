import { chromium } from '@playwright/test';
const b=await chromium.launch();const p=await (await b.newContext()).newPage();
const css=[];
p.on('response',async r=>{ if(/\.css(\?|$)/.test(r.url())){ try{css.push([r.url(),await r.text()])}catch{} }});
await p.goto('http://localhost:3888/en/login',{waitUntil:'networkidle'});
await p.waitForTimeout(1500);
for(const [u,t] of css){
  console.log('---',u,t.length);
  const m=t.match(/--page-gutter[^;]*;|--page-gap[^;]*;/g);
  console.log('tokens:',m?m.slice(0,8):'NONE');
  const g=t.match(/\.page-container[^{]*\{[^}]*\}/g);
  console.log('rules:',g?g.slice(0,6):'NONE');
  console.log('nudge14:',/rebuild nudge 14/.test(t));
}
await b.close();
