import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { validateRegistration } from '../worker/src/index.js';
const files=['index.html','challenge/index.html','about/index.html','transparency/index.html','donate/index.html','contact/index.html','privacy/index.html'];
test('All seven published website routes have semantic content, navbar and footer',()=>{
  for(const path of files){
    assert.ok(existsSync(path),'Missing route: '+path);
    const html=readFileSync(path,'utf8');
    assert.match(html,/<main id="main">/);
    assert.match(html,/<footer>/);
    assert.match(html,/logo-horizontal\.png/);
    assert.match(html,/site\.css/);
  }
});
test('Approved brand assets are present',()=>{
  for(const file of ['assets/logo-horizontal.png','assets/logo-vertical.png','assets/logo-emblem.png']) assert.ok(existsSync(file),file);
});
test('Creator giving and II donation flows stay separate',()=>{
  const home=readFileSync('index.html','utf8'),donate=readFileSync('donate/index.html','utf8');
  assert.match(home,/give directly to that charity/i);
  assert.match(donate,/www\.zeffy\.com\/en-US\/donation-form\/support-influencers-involved/);
  assert.match(donate,/separate international donation method/);
  assert.doesNotMatch(donate,/Donate with PayPal/);
});
test('Form does not fabricate success without a backend',()=>{
  const form=readFileSync('challenge/index.html','utf8');
  const client=readFileSync('assets/site.js','utf8');
  assert.match(form,/id="pioneer-form"/);
  assert.match(form,/id="registration-not-ready"/);
  assert.match(client,/submit\.disabled = true/);
  assert.match(client,/output\.pioneer_id/);
});
const valid={
  creator_name:'A Creator',email:'creator@example.com',country:'USA',charity:'World Central Kitchen',pledge_date:'2026-10-30',
  pledge_confirmed:true,certificate_disclaimer_ack:true,public_opt_in:false,news_opt_in:false,
  collaboration:'not_now',collaboration_types:[],collaboration_email_opt_in:false,
  idempotency_key:'9870d3f0-13aa-45cc-a21d-aec45daeb35f',
  accounts:[{platform:'YouTube',handle:'Creator',url:'https://www.youtube.com/@creator',public:false}]
};
test('Registration normalization preserves anonymous choice and US country',()=>{
  const normalized=validateRegistration(valid);
  assert.equal(normalized.country,'United States');
  assert.equal(normalized.public_opt_in,false);
  assert.equal(normalized.accounts.length,1);
});
test('Rejects fake donation or private consent inference',()=>{
  assert.throws(()=>validateRegistration({...valid,pledge_confirmed:false}));
  assert.throws(()=>validateRegistration({...valid,collaboration_email_opt_in:true}));
  assert.throws(()=>validateRegistration({...valid,news_opt_in:'yes'}));
});
test('Rejects unsafe profile links and invalid account arrays',()=>{
  assert.throws(()=>validateRegistration({...valid,accounts:[]}));
  assert.throws(()=>validateRegistration({...valid,accounts:[{...valid.accounts[0],url:'javascript:alert(1)'}]}));
});
test('Requires explicit per-account public permission',()=>{
  assert.throws(()=>validateRegistration({...valid,accounts:[{...valid.accounts[0],public:'yes'}]}));
});
