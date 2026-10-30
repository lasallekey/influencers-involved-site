/**
 * NEW Pioneer Registry Worker. No legacy data is read, imported or modified.
 * Deploy separately with a new D1 binding and only after owner approval.
 * Secrets: IP_HASH_PEPPER, RESEND_API_KEY (if email enabled). Never in git.
 */
const SITE = 'https://influencersinvolved.org';
const CONSENT_VERSION = 'ii-pioneer-v1-2026-10';
const encoder = new TextEncoder();
const allowedPlatforms = new Set(['YouTube','Instagram','TikTok','Facebook','Twitch','LinkedIn','X','Other']);
const validCollaborations = new Set(['yes','maybe','not_now']);
const validCollabTypes = new Set(['create','fundraise','awareness']);
function isoTime() { return new Date().toISOString(); }
function isBool(v){return typeof v==='boolean'}
function trim(v,max){return typeof v==='string' && v.trim().length<=max ? v.trim() : ''}
function isSafeHttps(v){try{const u=new URL(v);return u.protocol==='https:' && Boolean(u.hostname) && !u.username && !u.password && v.length<=500;}catch{return false}}
function niceCountry(v){
  const country=trim(v,64);
  const s=country.toLowerCase().replace(/\./g,'');
  if(['us','usa','u s a','united states','united states of america'].includes(s)) return 'United States';
  if(['uk','united kingdom','great britain'].includes(s)) return 'United Kingdom';
  if(!/^[\p{L}0-9 .,'’()\-]{2,64}$/u.test(country)) return '';
  return country;
}
function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}})}
function cors(origin,env){
  const approved=[SITE,'https://www.influencersinvolved.org'];
  if(env.STAGING_ALLOWED_ORIGIN)approved.push(env.STAGING_ALLOWED_ORIGIN);
  return approved.includes(origin) ? {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'} : {'Vary':'Origin'};
}
async function sha256(raw) {
  const bytes=await crypto.subtle.digest('SHA-256',encoder.encode(raw));
  return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
}
function randomToken() {
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
}
function randomId() {
  const bytes=crypto.getRandomValues(new Uint8Array(10));
  const code=Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();
  return 'II-'+new Date().getUTCFullYear()+'-'+code;
}
function error(message,status=400,headers={}){return json({error:message},status,headers)}
export function validateRegistration(d) {
  if(!d || typeof d!=='object' || Array.isArray(d))throw Error('Invalid registration.');
  if(trim(d.company_website,200))throw Error('Request could not be accepted.');
  const creator=trim(d.creator_name,120), email=trim(d.email,254);
  const country=niceCountry(d.country), charity=trim(d.charity,160);
  const date=trim(d.pledge_date,10);
  if(creator.length<2 || country.length<2 || charity.length<2)throw Error('Complete required creator, country and charity fields.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\r\n]/.test(email))throw Error('Enter a valid email address.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date)throw Error('Enter a valid pledge date.');
  if(Date.parse(date)>Date.now()+86400000)throw Error('The pledge date cannot be in the future.');
  if(d.pledge_confirmed!==true || d.certificate_disclaimer_ack!==true)throw Error('Confirm the pledge and certificate disclosure.');
  if(!isBool(d.public_opt_in) || !isBool(d.news_opt_in) || !isBool(d.collaboration_email_opt_in))throw Error('Invalid consent selection.');
  if(!validCollaborations.has(d.collaboration))throw Error('Invalid collaboration selection.');
  if(!Array.isArray(d.collaboration_types) || d.collaboration_types.some(x=>!validCollabTypes.has(x)))throw Error('Invalid collaboration interest.');
  if(d.collaboration==='not_now' && (d.collaboration_types.length>0 || d.collaboration_email_opt_in))throw Error('Invalid collaboration contact permission.');
  const key=trim(d.idempotency_key,120);
  if(!/^[a-zA-Z0-9-]{18,120}$/.test(key))throw Error('Please refresh the form and try again.');
  if(!Array.isArray(d.accounts) || d.accounts.length===0 || d.accounts.length>10)throw Error('Provide between 1 and 10 social profiles.');
  const accounts=d.accounts.map(a=>{
    if(!a || typeof a!=='object')throw Error('Invalid social account.');
    const platform=trim(a.platform,40),handle=trim(a.handle,120),url=trim(a.url,500);
    if(!allowedPlatforms.has(platform) || !handle || !isSafeHttps(url) || !isBool(a.public))throw Error('Enter a valid platform, handle and HTTPS profile URL.');
    return {platform,handle,url,public:a.public};
  });
  return {
    creator_name:creator,email,email_normalized:email.toLowerCase(),country,charity,pledge_date:date,
    public_opt_in:d.public_opt_in,news_opt_in:d.news_opt_in,
    collaboration:d.collaboration,collaboration_types:[...new Set(d.collaboration_types)],
    collaboration_email_opt_in:d.collaboration_email_opt_in,
    accounts,idempotency_key:key
  };
}
async function rateLimit(request,env,limit=15) {
  if(!env.IP_HASH_PEPPER)throw new Error('Backend not configured');
  const ip=request.headers.get('CF-Connecting-IP') || 'local';
  const now=Math.floor(Date.now()/1000), reset=now-(now%86400)+86400;
  const key=await sha256(env.IP_HASH_PEPPER+':'+ip+':'+new Date().toISOString().slice(0,10));
  await env.DB.prepare('INSERT INTO rate_limits(ip_hash,hits,reset_at) VALUES(?,1,?) ON CONFLICT(ip_hash) DO UPDATE SET hits=CASE WHEN reset_at<=? THEN 1 ELSE hits+1 END, reset_at=?').bind(key,reset,now,reset).run();
  const row=await env.DB.prepare('SELECT hits FROM rate_limits WHERE ip_hash=?').bind(key).first();
  return (row?.hits||0)>limit;
}
async function readJson(request){
  const len=Number(request.headers.get('Content-Length')||0);
  if(len>65000)throw Error('Request too large.');
  const raw=await request.text();
  if(raw.length>65000)throw Error('Request too large.');
  try{return JSON.parse(raw)}catch{throw Error('Invalid JSON request.')}
}
async function sendVerification(env,email,token,requestUrl){
  if(!env.RESEND_API_KEY || !env.EMAIL_FROM)return false;
  const verifyUrl=new URL('/api/verify',requestUrl);
  verifyUrl.searchParams.set('token',token);
  const body={
    from:env.EMAIL_FROM,
    to:[email],
    subject:'Verify your Influencers Involved Pioneer email',
    html:'<p>Thank you for joining the 1% Influence Challenge.</p>'+
      '<p>Confirm your email using this one-time link (expires in 48 hours):</p>'+
      '<p><a href="'+verifyUrl.href+'">Verify email address</a></p>'+
      '<p>Your pledge and optional certificate are valid without verification. Verification only enables eligible public listing and approved communications.</p>'+
      '<p>If you did not register, disregard this message.</p>'
  };
  try {
    const result=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
    return result.ok;
  }catch{return false}
}
async function register(request,env,headers){
  if(await rateLimit(request,env))return error('Too many requests. Try again later.',429,headers);
  let d;
  try{d=validateRegistration(await readJson(request))}catch(e){return error(e.message,400,headers)}
  const existing=await env.DB.prepare('SELECT id,email_normalized FROM pioneers WHERE idempotency_key=?').bind(d.idempotency_key).first();
  if(existing){
    if(existing.email_normalized!==d.email_normalized)return error('Request could not be accepted.',409,headers);
    return json({pioneer_id:existing.id,email_status:'not_sent',saved:true,idempotent:true},200,headers);
  }
  const id=randomId(),created=isoTime(),now=Math.floor(Date.now()/1000);
  const canEmail=Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
  const token=canEmail?randomToken():null,hash=token?await sha256(token):null;
  const stmts=[
    env.DB.prepare('INSERT INTO pioneers(id,idempotency_key,creator_name,email,email_normalized,country,charity,pledge_date,public_opt_in,news_opt_in,collaboration,collaboration_types,collaboration_email_opt_in,consent_version,consent_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
     .bind(id,d.idempotency_key,d.creator_name,d.email,d.email_normalized,d.country,d.charity,d.pledge_date,Number(d.public_opt_in),Number(d.news_opt_in),d.collaboration,JSON.stringify(d.collaboration_types),Number(d.collaboration_email_opt_in),CONSENT_VERSION,created,created),
    ...d.accounts.map(a=>env.DB.prepare('INSERT INTO social_accounts(pioneer_id,platform,handle,profile_url,public_opt_in) VALUES(?,?,?,?,?)')
      .bind(id,a.platform,a.handle,a.url,Number(a.public))),
  ];
  if(hash)stmts.push(env.DB.prepare('INSERT INTO email_verifications(token_hash,pioneer_id,expires_at,created_at) VALUES(?,?,?,?)').bind(hash,id,now+172800,now));
  try {
    await env.DB.batch(stmts); // D1 batch executes transactionally
  } catch(e) {
    const retry=await env.DB.prepare('SELECT id,email_normalized FROM pioneers WHERE idempotency_key=?').bind(d.idempotency_key).first();
    if(retry && retry.email_normalized===d.email_normalized)return json({pioneer_id:retry.id,email_status:'not_sent',saved:true,idempotent:true},200,headers);
    return error('We could not confirm your registration. If you have already joined, contact us.',409,headers);
  }
  const sent=token?await sendVerification(env,d.email,token,request.url):false;
  return json({pioneer_id:id,email_status:sent?'sent':'not_sent',saved:true},201,headers);
}
async function publicRegistry(env,headers){
  const counts=await env.DB.prepare('SELECT (SELECT COUNT(*) FROM pioneers) AS pioneers,(SELECT COUNT(*) FROM social_accounts) AS social_accounts').first();
  const people=await env.DB.prepare('SELECT id,creator_name FROM pioneers WHERE public_opt_in=1 AND verified_at IS NOT NULL ORDER BY created_at DESC LIMIT 25').all();
  const list=[];
  for(const p of people.results||[]){
    const profiles=await env.DB.prepare('SELECT platform,handle,profile_url AS url FROM social_accounts WHERE pioneer_id=? AND public_opt_in=1 ORDER BY id LIMIT 10').bind(p.id).all();
    list.push({creator_name:p.creator_name,accounts:profiles.results||[]});
  }
  return json({pioneers:counts?.pioneers||0,social_accounts:counts?.social_accounts||0,public_pioneers:list},200,{...headers,'Cache-Control':'public, max-age=60'});
}
const htmlReply=(ok,text)=>new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email verification — Influencers Involved</title><style>body{font:18px/1.6 system-ui;max-width:680px;margin:13vh auto;padding:0 25px;color:#143257}a{color:#1269b6}</style><h1>'+ (ok?'Email verified':'Verification link unavailable')+'</h1><p>'+text+'</p><p><a href="'+SITE+'/challenge/">Return to the Challenge</a></p></html>',{status:ok?200:410,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function verify(url,env){
  const token=url.searchParams.get('token')||'';
  if(!/^[0-9a-f]{64}$/.test(token))return htmlReply(false,'This link is invalid or expired.');
  const hash=await sha256(token),now=Math.floor(Date.now()/1000);
  const row=await env.DB.prepare('SELECT pioneer_id FROM email_verifications WHERE token_hash=? AND used_at IS NULL AND expires_at>?').bind(hash,now).first();
  if(!row)return htmlReply(false,'This link is expired or has already been used. Contact II if you need assistance.');
  await env.DB.batch([
    env.DB.prepare('UPDATE pioneers SET verified_at=COALESCE(verified_at,?) WHERE id=? AND EXISTS(SELECT 1 FROM email_verifications WHERE token_hash=? AND used_at IS NULL AND expires_at>?)').bind(isoTime(),row.pioneer_id,hash,now),
    env.DB.prepare('UPDATE email_verifications SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>?').bind(now,hash,now)
  ]);
  return htmlReply(true,'Your email is confirmed. Your Pioneer pledge was already valid; verification helps protect public recognition and any contact preferences you selected.');
}
async function resend(request,env,headers){
  if(await rateLimit(request,env,12))return error('Too many requests. Try again later.',429,headers);
  let input;try{input=await readJson(request)}catch{return error('Invalid request.',400,headers)}
  const email=trim(input?.email,254).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return error('Enter a valid email.',400,headers);
  const accepted=json({accepted:true,message:'If this address has an unverified Pioneer pledge, a confirmation email may be sent.'},202,headers);
  if(!env.RESEND_API_KEY || !env.EMAIL_FROM)return accepted;
  const p=await env.DB.prepare('SELECT id,email FROM pioneers WHERE email_normalized=? AND verified_at IS NULL').bind(email).first();
  if(!p)return accepted;
  const now=Math.floor(Date.now()/1000);
  const recent=await env.DB.prepare('SELECT MAX(created_at) AS recent FROM email_verifications WHERE pioneer_id=?').bind(p.id).first();
  if(recent?.recent && recent.recent>now-300)return accepted;
  const token=randomToken(),hash=await sha256(token);
  await env.DB.batch([
    env.DB.prepare('UPDATE email_verifications SET used_at=? WHERE pioneer_id=? AND used_at IS NULL').bind(now,p.id),
    env.DB.prepare('INSERT INTO email_verifications(token_hash,pioneer_id,expires_at,created_at) VALUES(?,?,?,?)').bind(hash,p.id,now+172800,now)
  ]);
  await sendVerification(env,p.email,token,request.url);
  return accepted;
}
export default {
  async fetch(request,env){
    const u=new URL(request.url),origin=request.headers.get('Origin')||'',c=cors(origin,env);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:c});
    if(!env.DB)return error('Database not configured.',503,c);
    if(u.pathname==='/api/health' && request.method==='GET')return json({ok:true,service:'II Pioneer Registry',environment:'unpublished'},200,c);
    if(u.pathname==='/api/public' && request.method==='GET')return publicRegistry(env,c);
    if(u.pathname==='/api/verify' && request.method==='GET')return verify(u,env);
    if(u.pathname==='/api/register' && request.method==='POST'){
      if(!origin || !c['Access-Control-Allow-Origin'])return error('Origin not allowed.',403,c);
      if(!request.headers.get('Content-Type')?.startsWith('application/json'))return error('JSON required.',415,c);
      try{return await register(request,env,c)}catch{return error('Registration service unavailable. Your pledge was not confirmed; contact us if you previously submitted.',503,c)}
    }
    if(u.pathname==='/api/resend' && request.method==='POST'){
      if(!origin || !c['Access-Control-Allow-Origin'])return error('Origin not allowed.',403,c);
      try{return await resend(request,env,c)}catch{return error('Email service temporarily unavailable.',503,c)}
    }
    return error('Not found.',404,c);
  }
};
