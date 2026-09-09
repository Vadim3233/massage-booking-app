// Starts a local Vite server with dummy Supabase settings and intercepts backend traffic.
// Uses installed Microsoft Edge by default; REG01_BROWSER_CHANNEL can select another Playwright channel.
// No live signup, email, Google login or database mutation.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
const base = 'http://127.0.0.1:5186';
const server = await createServer({
 logger: undefined,
 define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:54329'), 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('sb_publishable_reg01_local_test') },
 server: {host:'127.0.0.1',port:5186,strictPort:true},
});
await server.listen();
let browser;
try { browser = await chromium.launch({ channel: process.env.REG01_BROWSER_CHANNEL || 'msedge', headless: true }); }
catch (error) { await server.close(); throw error; }
const results = [];
await mkdir('test-results/reg01', {recursive:true});
const user = {id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'jo@example.test',email_confirmed_at:'2026-09-09T12:00:00Z',app_metadata:{provider:'email',providers:['email']},user_metadata:{first_name:'Jo',last_name:'Client',mobile:'+44 7700 900123'},identities:[{provider:'email'}]};
function session(u=user) { const encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url'); return { access_token:encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:u.id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})+'.test-signature', refresh_token:'local-test-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:u }; }
async function fixture(options={}) {
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage(); const requests=[]; const errors=[]; const consoleErrors=[]; let active=options.active||false; let resendMode=options.resend||'success';
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',message=>{if(message.type()==='error') consoleErrors.push(message.text());});
 if(options.session) await context.addInitScript(data=>localStorage.setItem('sb-127-auth-token',JSON.stringify(data)),options.session);
 await page.route('http://127.0.0.1:54329/**',async route=>{
  const request=route.request();const path=new URL(request.url()).pathname; requests.push({path,url:request.url(),body:request.postData(),headers:request.headers()});
  const respond=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(path.endsWith('/signup')) {
   if(options.delay) await new Promise(r=>setTimeout(r,options.delay));
   if(options.signup==='network') return route.abort('connectionfailed');
   if(options.signup==='error') return respond({code:'unexpected_failure',msg:'internal private diagnostic'},500);
   if(options.signup==='duplicateHidden') return respond({user:{...user,identities:[]},session:null});
   if(options.signup==='existing') return respond({code:'user_already_exists',msg:'User already registered'},422);
   if(options.signup==='rate') return respond({code:'over_email_send_rate_limit',msg:'rate limit'},429);
   if(options.signup==='malformed') return respond({});
   if(options.signup==='session') return respond(session());
   return respond({user:{...user,email_confirmed_at:null},session:null});
  }
  if(path.endsWith('/resend')) {
   if(resendMode==='network') return route.abort('connectionfailed');
   if(resendMode==='rate') return respond({code:'over_email_send_rate_limit',msg:'rate limit'},429);
   if(resendMode==='error') return respond({code:'unexpected_failure',msg:'private detail'},500);
   return respond({});
  }
  if(path.endsWith('/token')) return respond(session(options.session?.user||user));
  if(path.endsWith('/user')) return respond(options.session?.user||user);
  if(path.endsWith('/authorize')) return route.fulfill({contentType:'text/html',body:'Google authorization initiated'});
  if(path.endsWith('/current_user_is_booking_admin')) return respond(false);
  if(path.endsWith('/get_my_client_access')) return respond({status:active?'ACTIVE':'NONE',profile_complete:active,missing_fields:active?[]:['mobile']});
  if(path.endsWith('/activate_my_client_account')) {active=true;return respond({status:'ACTIVE',profile_complete:true,missing_fields:[]});}
  return respond([]);
 });
 await page.goto(base+'/?view=client&register=1');
 return {page,context,requests,errors,consoleErrors,setResend:m=>{resendMode=m;}};
}
async function fill(page,overrides={}) { const values={firstName:'Jo',lastName:'Client',mobile:'+44 7700 900123',email:'jo@example.test',password:'password8',confirmPassword:'password8',...overrides}; for(const [name,value] of Object.entries(values)) await page.locator('#reg-'+name).fill(value); }
async function visible(page,text){ await page.getByText(text,{exact:false}).first().waitFor(); }
async function check(name,fn) {try {await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',error:e.message});throw e;} }
try {
 await check('blank and every invalid field: submission remains enabled, errors visible, first invalid focused',async()=>{
  const f=await fixture(); const {page}=f;
  await page.getByRole('button',{name:'Create account',exact:true}).waitFor();
  assert.equal(await page.getByRole('alert').count(),0);
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  assert.equal(await page.locator('[aria-invalid="true"]').count(),6);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'reg-firstName');
  for(const [field,value,message] of [['firstName','','Enter your first name.'],['lastName','','Enter your last name.'],['mobile','000000000000000','Enter a valid mobile number.'],['email','invalid','Enter a valid email address.'],['password','short','Password must be at least 8 characters.'],['confirmPassword','different','Passwords do not match.']]) {
   await fill(page,{[field]:value}); await page.getByRole('button',{name:'Create account',exact:true}).click(); await visible(page,message); assert.equal(await page.evaluate(()=>document.activeElement.id),'reg-'+field);
  }
  assert.equal(f.requests.filter(r=>r.path.endsWith('/signup')).length,0);
  await f.context.close();
 });
 await check('live mismatch validation and independent accessible password controls',async()=>{
  const f=await fixture();await fill(f.page,{confirmPassword:'different'});await visible(f.page,'Passwords do not match.');
  await f.page.locator('#reg-confirmPassword').fill('password8');assert.equal(await f.page.getByText('Passwords do not match.',{exact:true}).count(),0);
  const first=f.page.getByRole('button',{name:'Show password',exact:true}).first();await first.focus();await f.page.keyboard.press('Enter');
  assert.equal(await f.page.locator('#reg-password').getAttribute('type'),'text');assert.equal(await f.page.locator('#reg-confirmPassword').getAttribute('type'),'password');
  await f.page.getByRole('button',{name:'Show password',exact:true}).click();assert.equal(await f.page.locator('#reg-confirmPassword').getAttribute('type'),'text');
  await f.context.close();
 });
 await check('signup user plus null session: loading, one request, confirmation and no activation/sign-in workaround',async()=>{
  const f=await fixture({delay:500});await fill(f.page);await f.page.getByRole('button',{name:'Create account',exact:true}).click();
  await f.page.getByRole('button',{name:'Creating account…'}).waitFor();assert.equal(await f.page.getByRole('button',{name:'Creating account…'}).isDisabled(),true);
  await visible(f.page,'Check your email');assert.equal(f.requests.filter(r=>r.path.endsWith('/signup')).length,1);
  assert.equal(f.requests.filter(r=>(r.path.endsWith("activate_my_client_account") || r.path.endsWith("/token"))).length,0);
  const req=f.requests.find(r=>r.path.endsWith('/signup'));const body=JSON.parse(req.body);assert.equal(body.data.first_name,'Jo');assert.equal(body.data.mobile,'+44 7700 900123');
  await f.page.getByRole('button',{name:'Resend confirmation email'}).click();await visible(f.page,'Confirmation email requested');assert.equal(await f.page.getByRole('button',{name:'Resend confirmation email'}).isDisabled(),true);
  assert.equal(f.requests.filter(r=>r.path.endsWith('/resend')).length,1);
  await f.page.getByRole('button',{name:'Use a different email'}).click();await f.page.locator('#reg-email').waitFor();assert.equal(await f.page.locator('#reg-email').inputValue(),'');
  await f.context.close();
 });
 for(const [mode,message] of [['duplicateHidden','already exists'],['existing','already exists'],['error',"couldn't create your account"],['network','Connection problem'],['rate','Too many requests'],['malformed',"couldn't create your account"]]) await check('signup feedback: '+mode,async()=>{
  const f=await fixture({signup:mode});await fill(f.page);await f.page.getByRole('button',{name:'Create account',exact:true}).click();await visible(f.page,message);assert.equal(await f.page.getByRole('button',{name:'Create account',exact:true}).isEnabled(),true);assert.equal(await f.page.getByText('private diagnostic').count(),0);await f.context.close();
 });
 for(const [mode,message] of [['rate','Too many requests'],['error',"couldn't resend the confirmation email"],['network','Connection problem']]) await check('resend feedback: '+mode,async()=>{
  const f=await fixture({resend:mode});await fill(f.page);await f.page.getByRole('button',{name:'Create account',exact:true}).click();await visible(f.page,'Check your email');await f.page.getByRole('button',{name:'Resend confirmation email'}).click();await visible(f.page,message);await f.context.close();
 });
 await check('signup session: authenticated profile continuation then client home',async()=>{
  const f=await fixture({signup:'session'});await fill(f.page);await f.page.getByRole('button',{name:'Create account',exact:true}).click();await visible(f.page,'Complete your profile');
  assert.equal(f.requests.filter(r=>r.path.endsWith('/activate_my_client_account')).length,0);
  await f.page.getByRole('button',{name:'Continue',exact:true}).click();await visible(f.page,'Welcome back');
  const activation=f.requests.find(r=>r.path.endsWith('/activate_my_client_account'));assert.ok(activation.headers.authorization?.startsWith('Bearer '));assert.equal(f.errors.length,0);await f.context.close();
 });
 await check('return after confirmation/sign-in activates profile, existing client opens home',async()=>{
  const f=await fixture();await f.page.getByRole('button',{name:'Sign in',exact:true}).click();await f.page.getByLabel('Email address',{exact:true}).fill('jo@example.test');await f.page.getByLabel('Password',{exact:true}).fill('password8');await f.page.getByRole('button',{name:'Sign in',exact:true}).click();await visible(f.page,'Complete your profile');await f.page.getByRole('button',{name:'Continue',exact:true}).click();await visible(f.page,'Welcome back');await f.page.reload();await visible(f.page,'Welcome back');assert.equal(f.errors.length,0);await f.context.close();
 });
 await check('Google initiation uses provider and client callback; Back returns from registration to sign-in',async()=>{
  const f=await fixture();await f.page.getByRole('button',{name:'Sign in',exact:true}).click();await f.page.getByRole('button',{name:'Create account',exact:true}).click();await f.page.goBack();await visible(f.page,'Welcome');assert.equal(await f.page.locator('#reg-firstName').count(),0);
  await f.page.getByRole('button',{name:'Continue with Google'}).click();await visible(f.page,'Google authorization initiated');const req=f.requests.find(r=>r.path.endsWith('/authorize'));const url=new URL(req.url);assert.equal(url.searchParams.get('provider'),'google');assert.ok(url.searchParams.get('redirect_to').includes('clientAuth=callback'));await f.context.close();
 });
 await check('new Google user fills missing mobile; existing Google user enters home',async()=>{
  const googleUser={...user,app_metadata:{provider:'google',providers:['google']},user_metadata:{full_name:'Jo Client'},identities:[{provider:'google'}]};
  const f=await fixture({session:session(googleUser)});await visible(f.page,'Complete your profile');
  await f.page.getByLabel('Mobile number',{exact:true}).fill('+33 6 12 34 56 78');await f.page.getByRole('button',{name:'Continue',exact:true}).click();await visible(f.page,'Welcome back');
  assert.equal(f.requests.filter(r=>r.path.endsWith('/signup')).length,0);await f.context.close();
  const existing=await fixture({session:session(googleUser),active:true});await visible(existing.page,'Welcome back');assert.equal(existing.requests.filter(r=>r.path.endsWith('/activate_my_client_account')).length,0);await existing.context.close();
 });
 await check('an unconfirmed session cannot call activation; confirmation page includes Sign in',async()=>{
  const f=await fixture({session:session({...user,email_confirmed_at:null})});await visible(f.page,'Check your email');assert.equal(f.requests.filter(r=>r.path.endsWith('/activate_my_client_account')).length,0);assert.equal(await f.page.getByRole('button',{name:'Sign in',exact:true}).count(),1);await f.context.close();
 });
 await check('mobile/tablet/desktop layout and console',async()=>{
  const f=await fixture();for(const width of [360,390,412,768,1440]) {await f.page.setViewportSize({width,height:900});await f.page.locator('#reg-firstName').waitFor();assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await f.page.screenshot({path:'test-results/reg01/registration-'+width+'.png',fullPage:true});}
  assert.deepEqual(f.errors,[]);assert.deepEqual(f.consoleErrors,[]);await f.context.close();
 });
} finally {await browser.close();await server.close();console.log(JSON.stringify(results,null,2));}
