/* II frontend — no personal data is stored in the browser or shared with analytics */
(() => {
  'use strict';
  const config = window.II_CONFIG || {};
  const base = typeof config.apiBase === 'string' ? config.apiBase.replace(/\/+$/,'') : '';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const menu = $('#site-menu');
  const menuButton = $('#menu-toggle');
  if (menu && menuButton) {
    menuButton.addEventListener('click', () => {
      const open = menu.classList.toggle('open');
      menuButton.setAttribute('aria-expanded', String(open));
    });
    $$('a', menu).forEach(link => link.addEventListener('click', () => {
      menu.classList.remove('open');
      menuButton.setAttribute('aria-expanded','false');
    }));
  }

  const collabInputs = $$('input[name="collaboration"]');
  const collabExtra = $('#collab-extra');
  collabInputs.forEach(input => input.addEventListener('change', () => {
    if (collabExtra) collabExtra.hidden = !['yes','maybe'].includes(input.value);
  }));

  const charity = $('#charity');
  const charityOther = $('#charity-other-field');
  if (charity && charityOther) charity.addEventListener('change', () => {
    charityOther.hidden = charity.value !== 'Other';
    const field = $('#other-charity');
    if (field) field.required = charity.value === 'Other';
  });

  const repeater = $('#social-repeater');
  const add = $('#add-social');
  if (add && repeater) {
    add.addEventListener('click', () => {
      if ($$('.social-entry',repeater).length >= 10) return;
      const source = $('.social-entry',repeater);
      const next = source.cloneNode(true);
      $$('input, select',next).forEach(input => {
        if (input.type === 'checkbox') input.checked = false;
        else input.value = '';
      });
      const num = $$('.social-entry',repeater).length + 1;
      const heading = $('h3',next);
      if (heading) heading.textContent = 'Social account ' + num;
      const remove = $('.remove-social',next);
      if (remove) {
        remove.hidden = false;
        remove.addEventListener('click', () => next.remove());
      }
      // Inputs are within a repeated group; identify them by class, not duplicated IDs.
      repeater.append(next);
      $('.platform',next)?.focus();
    });
  }

  const form = $('#pioneer-form');
  if (form) {
    const alert = $('#form-message');
    const submit = $('#submit-pledge');
    const registrationReady = Boolean(base);
    if (!registrationReady) {
      const warning = $('#registration-not-ready');
      if (warning) warning.hidden = false;
      if (submit) {
        submit.disabled = true;
        submit.textContent = 'Registration opens after secure backend setup';
      }
    }
    const idempotency = window.crypto?.randomUUID ? window.crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    form.addEventListener('submit',async event => {
      event.preventDefault();
      if (!registrationReady || !form.reportValidity()) return;
      if (alert) { alert.textContent = ''; alert.removeAttribute('role'); }
      if (submit) { submit.disabled = true; submit.textContent = 'Submitting…'; }
      try {
        const socials = $$('.social-entry',repeater).map(row => ({
          platform: $('.platform',row)?.value || '',
          handle: $('.social-handle',row)?.value.trim() || '',
          url: $('.social-url',row)?.value.trim() || '',
          public: $('.public-profile',row)?.checked || false
        }));
        const collab = $('input[name="collaboration"]:checked')?.value || 'not_now';
        const data = {
          creator_name: $('#creator-name').value.trim(),
          email: $('#private-email').value.trim(),
          country: $('#country').value,
          pledge_date: $('#pledge-date').value,
          charity: charity.value === 'Other' ? $('#other-charity').value.trim() : charity.value,
          pledge_confirmed: $('#pledge-confirmation').checked,
          certificate_disclaimer_ack: $('#certificate-ack').checked,
          public_opt_in: $('input[name="visibility"]:checked')?.value === 'public',
          news_opt_in: $('#news-opt-in').checked,
          collaboration: collab,
          collaboration_types: collab === 'not_now' ? [] : $$('input[name="collab-kind"]:checked').map(e=>e.value),
          collaboration_email_opt_in: collab !== 'not_now' && $('#collab-email-opt-in').checked,
          accounts: socials,
          idempotency_key: idempotency,
          company_website: $('#website-confirmation').value // hidden honeypot, never fill normally
        };
        const result = await fetch(base + '/api/register', {
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)
        });
        const output = await result.json().catch(() => ({}));
        if(!result.ok || !output.pioneer_id) throw new Error(output.error || 'We could not confirm your registration. Please try again.');
        renderSuccess(output, data);
      } catch (error) {
        if (alert) { alert.textContent = error.message || 'Registration could not be confirmed.'; alert.setAttribute('role','alert'); }
        if (submit) { submit.disabled = false; submit.textContent = 'Submit pledge & join'; }
      }
    });
  }

  function renderSuccess(result, data) {
    const area = $('#registration-success');
    if (!area) return;
    area.hidden = false;
    const frm = $('#pioneer-form');
    if (frm) frm.hidden = true;
    $('#new-pioneer-id').textContent = result.pioneer_id;
    const status = $('#verification-status');
    if (status) {
      status.textContent = result.email_status === 'sent' ? 'Please check your inbox for your optional email-verification link.' : 'Your pledge is saved. Email verification is not currently available; your certificate remains valid.';
    }
    const certificate = $('#certificate');
    if (certificate) {
      const publicName = data.public_opt_in ? data.creator_name : 'Anonymous Pioneer';
      $('#certificate-recipient').textContent = publicName;
      $('#certificate-charity').textContent = data.charity;
      $('#certificate-date').textContent = data.pledge_date;
      $('#certificate-id').textContent = result.pioneer_id;
    }
    area.scrollIntoView({behavior:'smooth',block:'start'});
  }
  const print = $('#print-certificate');
  if(print) print.addEventListener('click',()=>window.print());

  async function loadRegistry() {
    const stats = $('#registry-stats');
    const list = $('#pioneer-list');
    if (!stats || !base) return;
    try {
      const res = await fetch(base + '/api/public', {method:'GET',cache:'no-store'});
      if (!res.ok) return;
      const data = await res.json();
      const numbers = [
        ['Pioneer pledges',data.pioneers],
        ['Social accounts',data.social_accounts]
      ];
      stats.replaceChildren();
      for(const [label,value] of numbers){
        const item=document.createElement('div'),num=document.createElement('strong'),name=document.createElement('span');
        num.textContent=Number.isInteger(value)?String(value):'—';name.textContent=label;
        item.append(num,name);stats.append(item);
      }
      if(list) {
        list.replaceChildren();
        for(const pioneer of (Array.isArray(data.public_pioneers)?data.public_pioneers:[])){
          const item=document.createElement('article'),heading=document.createElement('h3');
          item.className='pioneer-person';heading.textContent=pioneer.creator_name;item.append(heading);
          for(const account of (pioneer.accounts||[])){
            try {
              const safe=new URL(account.url);
              if(safe.protocol!=='https:')continue;
              const p=document.createElement('p'),a=document.createElement('a');
              a.href=safe.href;a.target='_blank';a.rel='noopener noreferrer';
              a.textContent=(account.platform||'Profile')+' · '+(account.handle||'');
              p.append(a);item.append(p);
            }catch{}
          }
          list.append(item);
        }
      }
      const empty=$('#registry-empty');
      if(empty)empty.hidden=(data.public_pioneers||[]).length>0;
    }catch{
      // Avoid claims about unavailable or unverified public registry counts.
    }
  }
  loadRegistry();
})();