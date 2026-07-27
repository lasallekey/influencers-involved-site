const REGISTRY_URL='https://script.google.com/macros/s/AKfycbzQnkOlGKFGbj6xuqK67L_x--H1j_iYDIifE2ogFfqljC79AlSTpUt7B9X0aTZPa4mt/exec';

const menuButton=document.querySelector('.menu');
const navLinks=document.querySelector('.links');
menuButton.addEventListener('click',()=>{const open=navLinks.classList.toggle('open');menuButton.setAttribute('aria-expanded',String(open));});
document.querySelectorAll('.links a').forEach(a=>a.addEventListener('click',()=>navLinks.classList.remove('open')));
document.getElementById('year').textContent=new Date().getFullYear();

const dateInput=document.getElementById('pledgeDate');
dateInput.value=new Date().toISOString().slice(0,10);

const form=document.getElementById('pledgeForm');
const submitButton=document.getElementById('submitPledge');
const formStatus=document.getElementById('formStatus');
const certificateSection=document.getElementById('certificateSection');
const preview=document.getElementById('certificatePreview');
const canvas=document.getElementById('certificateCanvas');
const ctx=canvas.getContext('2d');
const caption=document.getElementById('shareCaption');
const shareStatus=document.getElementById('shareStatus');
let currentPledge=null;

function normalizeHandle(value){
  const clean=String(value||'').trim();
  return clean?(clean.startsWith('@')?clean:'@'+clean):'';
}
function formatDate(value){
  return new Date(value+'T12:00:00').toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'});
}
function makePledgeId(date){
  const random=crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().slice(0,6).padStart(6,'0');
  return 'II-'+date.replaceAll('-','')+'-'+random;
}
function roundedRect(context,x,y,w,h,r){
  context.beginPath();context.roundRect(x,y,w,h,r);context.fill();
}
function wrap(context,text,x,y,maxWidth,lineHeight,maxLines=4){
  const words=String(text).split(/\s+/);let line='',lines=[];
  for(const word of words){
    const test=line?line+' '+word:word;
    if(context.measureText(test).width>maxWidth&&line){lines.push(line);line=word;}else line=test;
  }
  if(line)lines.push(line);
  lines=lines.slice(0,maxLines);
  lines.forEach((item,index)=>context.fillText(item,x,y+index*lineHeight));
}
function drawLogo(context,x,y,size){
  context.fillStyle='#0b2035';roundedRect(context,x,y,size,size,size*.28);
  context.fillStyle='#fff';context.fillRect(x+size*.25,y+size*.22,size*.15,size*.56);
  context.fillStyle='#f05245';context.fillRect(x+size*.60,y+size*.22,size*.15,size*.56);
  context.fillStyle='#f3bd4f';
  context.beginPath();context.arc(x+size*.325,y+size*.15,size*.06,0,Math.PI*2);context.fill();
  context.beginPath();context.arc(x+size*.675,y+size*.85,size*.06,0,Math.PI*2);context.fill();
}
function drawCertificate(data){
  const W=1080,H=1080;
  ctx.clearRect(0,0,W,H);
  const gradient=ctx.createLinearGradient(0,0,W,H);
  gradient.addColorStop(0,'#0b2035');gradient.addColorStop(.7,'#173d5d');gradient.addColorStop(1,'#1f4d72');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,W,H);
  ctx.fillStyle='rgba(243,189,79,.18)';ctx.beginPath();ctx.arc(930,120,250,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='rgba(240,82,69,.17)';ctx.beginPath();ctx.arc(100,970,290,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fff';roundedRect(ctx,58,58,964,964,34);
  drawLogo(ctx,92,88,118);
  ctx.textAlign='left';ctx.fillStyle='#0b2035';ctx.font='900 37px Arial';ctx.fillText('INFLUENCERS INVOLVED',236,132);
  ctx.fillStyle='#c9382e';ctx.font='900 22px Arial';ctx.fillText('THE 1% INFLUENCE CHALLENGE',236,170);
  ctx.fillStyle='#d7e0e9';ctx.fillRect(92,230,896,2);
  ctx.textAlign='center';ctx.fillStyle='#c9382e';ctx.font='900 25px Arial';ctx.fillText('FOUNDING PIONEER CERTIFICATE',540,290);
  ctx.fillStyle='#7a5a13';ctx.font='900 18px Arial';ctx.fillText('ONE OF THE CREATORS HELPING BEGIN THE MOVEMENT',540,328);
  ctx.fillStyle='#52677d';ctx.font='600 22px Arial';ctx.fillText('Presented to',540,378);
  ctx.fillStyle='#0b2035';ctx.font='900 55px Arial';wrap(ctx,data.displayName,540,445,770,62,2);
  ctx.fillStyle='#c9382e';ctx.font='800 25px Arial';ctx.fillText((data.handle?data.handle+' · ':'')+data.platform,540,535);
  ctx.fillStyle='#52677d';ctx.font='600 24px Arial';ctx.fillText('for making the Pioneer Pledge',540,602);
  ctx.fillStyle='#0b2035';ctx.font='900 34px Arial';ctx.fillText('1% OF MY CREATOR INCOME',540,660);
  ctx.fillStyle='#52677d';ctx.font='600 24px Arial';ctx.fillText('to support',540,730);
  ctx.fillStyle='#0b2035';ctx.font='900 35px Arial';wrap(ctx,data.cause,540,790,800,43,3);
  ctx.fillStyle='#f05245';roundedRect(ctx,275,890,530,62,31);
  ctx.fillStyle='#fff';ctx.font='900 23px Arial';ctx.fillText('I AM A PIONEER. WHO WILL JOIN ME?',540,929);
  ctx.textAlign='left';ctx.fillStyle='#52677d';ctx.font='600 18px Arial';ctx.fillText(formatDate(data.date),92,978);
  ctx.textAlign='right';ctx.fillText(data.id,988,978);
  ctx.textAlign='center';ctx.fillStyle='#0b2035';ctx.font='900 20px Arial';ctx.fillText('INFLUENCERSINVOLVED.ORG',540,1012);
  ctx.fillStyle='#6f7f90';ctx.font='500 13px Arial';ctx.fillText('Pioneer pledge statement · Not a donation receipt or proof of payment',540,1040);
  preview.src=canvas.toDataURL('image/png');
}
function buildCaption(data){
  return `I am proud to become a Founding Pioneer in the 1% Influence Challenge. I pledge 1% of my creator income to support ${data.cause}.

I believe influence can do more than reach people—it can move people to give. I am challenging another creator to become a Pioneer with me.

Join the first circle: https://influencersinvolved.org

#InfluencersInvolved #FoundingPioneer #OnePercentInfluence #CreatorPhilanthropy`;
}
function postToRegistry(fields){
  const transport=document.createElement('form');
  transport.method='POST';
  transport.action=REGISTRY_URL;
  transport.target='registrySink';
  transport.style.display='none';
  Object.entries(fields).forEach(([name,value])=>{
    const input=document.createElement('input');
    input.type='hidden';input.name=name;input.value=String(value??'');
    transport.appendChild(input);
  });
  document.body.appendChild(transport);
  transport.submit();
  window.setTimeout(()=>transport.remove(),3000);
}
function referralSource(){
  const params=new URLSearchParams(location.search);
  return params.get('utm_source')||params.get('ref')||document.referrer||'Direct';
}
form.addEventListener('submit',event=>{
  event.preventDefault();
  formStatus.textContent='';shareStatus.textContent='';
  if(!form.checkValidity()){
    form.reportValidity();
    formStatus.textContent='Please complete the Pioneer Registry form.';
    return;
  }
  submitButton.disabled=true;
  submitButton.textContent='Saving your Pioneer Pledge…';
  const displayPreference=document.getElementById('publicDisplayPreference').value;
  const data={
    id:makePledgeId(dateInput.value),
    displayName:document.getElementById('displayName').value.trim(),
    handle:normalizeHandle(document.getElementById('handle').value),
    profileUrl:document.getElementById('profileUrl').value.trim(),
    platform:document.getElementById('platform').value,
    email:document.getElementById('email').value.trim(),
    country:document.getElementById('country').value.trim(),
    region:document.getElementById('region').value.trim(),
    audienceBand:document.getElementById('audienceBand').value,
    cause:document.getElementById('cause').value.trim(),
    date:dateInput.value,
    publicDisplayPreference:displayPreference
  };
  const publicConsent=['Name and handle','Handle only'].includes(displayPreference)?'Yes':'No';
  postToRegistry({
    pledgeId:data.id,
    displayName:data.displayName,
    handle:data.handle,
    profileUrl:data.profileUrl,
    platform:data.platform,
    email:data.email,
    country:data.country,
    region:data.region,
    audienceBand:data.audienceBand,
    cause:data.cause,
    pledgeDate:data.date,
    publicDisplayPreference:data.publicDisplayPreference,
    publicListingConsent:publicConsent,
    nextPhaseContactConsent:'Yes',
    generalContactConsent:'Yes',
    referralSource:referralSource()
  });
  currentPledge=data;
  drawCertificate(data);
  caption.value=buildCaption(data);
  certificateSection.classList.add('show');
  formStatus.textContent='Your pledge was sent to the Pioneer Registry. Check your email to confirm your place.';
  submitButton.disabled=false;
  submitButton.textContent='Claim my place and create my certificate';
  certificateSection.scrollIntoView({behavior:'smooth',block:'start'});
  window.setTimeout(loadPioneerStats,3500);
});

document.getElementById('downloadCertificate').addEventListener('click',()=>{
  if(!currentPledge)return;
  const link=document.createElement('a');
  link.download=`II-pioneer-${currentPledge.displayName.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'certificate'}.png`;
  link.href=canvas.toDataURL('image/png');link.click();
  shareStatus.textContent='Certificate downloaded.';
});
document.getElementById('copyCaption').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(caption.value);shareStatus.textContent='Caption copied.';}
  catch{caption.select();document.execCommand('copy');shareStatus.textContent='Caption copied.';}
});
document.getElementById('shareCertificate').addEventListener('click',()=>{
  if(!currentPledge)return;
  canvas.toBlob(async blob=>{
    const file=new File([blob],'II-pioneer-certificate.png',{type:'image/png'});
    try{
      if(navigator.canShare&&navigator.canShare({files:[file]})){
        await navigator.share({title:'My Founding Pioneer Pledge',text:caption.value,files:[file]});
      }else if(navigator.share){
        await navigator.share({title:'My Founding Pioneer Pledge',text:caption.value,url:'https://influencersinvolved.org'});
      }else{
        await navigator.clipboard.writeText(caption.value);
        shareStatus.textContent='Caption copied. Download the certificate to post it.';
      }
    }catch(error){
      if(error.name!=='AbortError')shareStatus.textContent='Download the image and copy the caption to share.';
    }
  },'image/png');
});
document.getElementById('newPledge').addEventListener('click',()=>{
  form.reset();dateInput.value=new Date().toISOString().slice(0,10);
  certificateSection.classList.remove('show');currentPledge=null;
  formStatus.textContent='';shareStatus.textContent='';
  document.getElementById('pledge').scrollIntoView({behavior:'smooth'});
});
document.getElementById('copyEmail').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText('grants@influencersinvolved.org');document.getElementById('emailStatus').textContent='Contact email copied.';}
  catch{document.getElementById('emailStatus').textContent='Email: grants@influencersinvolved.org';}
});

window.renderPioneerStats=function(data){
  const values={
    totalPledges:data.totalPledges||0,
    emailVerifiedPioneers:data.emailVerifiedPioneers||0,
    verifiedCharitableActions:data.verifiedCharitableActions||0,
    platformsRepresented:data.platformsRepresented||0,
    countriesRepresented:data.countriesRepresented||0
  };
  Object.entries(values).forEach(([id,value])=>{const element=document.getElementById(id);if(element)element.textContent=value;});
  const list=document.getElementById('publicPioneers');
  list.replaceChildren();
  const pioneers=Array.isArray(data.pioneers)?data.pioneers:[];
  if(!pioneers.length){
    const empty=document.createElement('div');empty.className='empty-state';
    empty.textContent='The public Pioneer roll will appear here as creators confirm their pledges and choose to be listed.';
    list.appendChild(empty);return;
  }
  pioneers.forEach(item=>{
    const card=document.createElement('article');card.className='pioneer-profile';
    const heading=document.createElement('h3');
    const label=item.name||item.handle||'Pioneer';
    if(item.profileUrl&&/^https:\/\//i.test(item.profileUrl)){
      const link=document.createElement('a');link.href=item.profileUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent=label;heading.appendChild(link);
    }else heading.textContent=label;
    const meta=document.createElement('p');meta.textContent=[item.handle&&item.name?item.handle:'',item.platform,item.status].filter(Boolean).join(' · ');
    const cause=document.createElement('p');cause.textContent=item.cause?'Pledged for: '+item.cause:'';
    card.append(heading,meta,cause);list.appendChild(card);
  });
};
function loadPioneerStats(){
  const existing=document.getElementById('pioneerStatsScript');if(existing)existing.remove();
  const script=document.createElement('script');script.id='pioneerStatsScript';
  script.src=REGISTRY_URL+'?action=stats&callback=renderPioneerStats&_='+Date.now();
  script.onerror=()=>{document.getElementById('statsStatus').textContent='Live progress is temporarily unavailable.';};
  document.body.appendChild(script);
}
loadPioneerStats();