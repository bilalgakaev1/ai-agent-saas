window.LAVA_AGENT_CONFIG = {
  endpoint: "https://mxpkn8ns.ru/webhook/525c1d91-ca51-409b-9217-fc610f4318bb/chat", 
  timeout: 20000, // ms
  labels: { start:"Анализ", placeholder:"Введите тему..." } 
};


(function () {
  const container = document.getElementById('lava-agent');
  const defaultConfig = {
    endpoint: container.dataset.endpoint || (window.LAVA_AGENT_CONFIG && window.LAVA_AGENT_CONFIG.endpoint) || "",
    timeout: (window.LAVA_AGENT_CONFIG && window.LAVA_AGENT_CONFIG.timeout) || 20000,
    labels: (window.LAVA_AGENT_CONFIG && window.LAVA_AGENT_CONFIG.labels) || {}
  };

  const $inputState = document.getElementById('state-input');
  const $loadingState = document.getElementById('state-loading');
  const $resultsState = document.getElementById('state-results');
  const $query = document.getElementById('lava-query');
  const $start = document.getElementById('lava-start');
  const $new = document.getElementById('lava-new');
  const $retry = document.getElementById('lava-retry');
  const $results = document.getElementById('results');
  const $serviceHint = document.getElementById('service-hint');

  
  if (defaultConfig.labels.start) $start.textContent = defaultConfig.labels.start;
  if (defaultConfig.labels.placeholder) $query.placeholder = defaultConfig.labels.placeholder;

  function show(stateElem){
    [$inputState,$loadingState,$resultsState].forEach(s => s.classList.remove('active'));
    stateElem.classList.add('active');
  }

  
  function uuidv4(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;const v=c==='x'?r:(r&0x3|0x8);return v.toString(16);}); }
  function getSession(){
    try{
      let s = localStorage.getItem('lava_agent_session');
      if(!s){ s = uuidv4(); localStorage.setItem('lava_agent_session', s); }
      return s;
    }catch(e){ return 'tmp-'+Date.now(); }
  }

  
  function esc(s){ if(s===0) return '0'; if(!s) return ''; return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  
  function renderItem(it){
    const title = esc(it.title || it.name || it.text || it.message || 'Результат');
    const url = esc(it.url || it.link || '');
    const desc = esc(it.description || it.meta || it.channel || '');
    const thumb = it.thumbnail || it.image || '';
    return `
      <div class="result-card">
        ${ thumb ? `<img class="thumb" src="${esc(thumb)}" alt="thumb">` : `<div class="thumb" aria-hidden="true"></div>` }
        <div class="meta">
          <h4>${title}</h4>
          ${ desc ? `<p>${desc}</p>` : '' }
          ${ url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">Открыть источник</a>` : '' }
        </div>
      </div>
    `;
  }

  
  function normalizeResp(data){
    if(!data) return [];
    if(Array.isArray(data)) return data;
    if(Array.isArray(data.result)) return data.result;
    if(Array.isArray(data.items)) return data.items;
    if(Array.isArray(data.messages)) return data.messages;
    if(Array.isArray(data.videos)) return data.videos;
    if(Array.isArray(data.reply)) return data.reply;
    if(typeof data === 'object'){
      if(data.text || data.message || data.answer) return [{ title: data.text||data.message||data.answer }];
      
      return [{ title: JSON.stringify(data) }];
    }
    return [{ title: String(data) }];
  }

  
  function showErrorFriendly(msg){
    $results.innerHTML = `<div style="padding:12px;border-radius:10px;background:#fff7f7;border:1px solid #ffe1e1;color:#7a1a1a;">${esc(msg)}</div>`;
    $serviceHint.style.display = 'block';
    $serviceHint.textContent = '';
    show($resultsState);
  }

  
  async function callAgent(query){
    show($loadingState);
    $serviceHint.style.display = 'none';
    $results.innerHTML = '';

    const payload = { action:'sendMessage', chatInput: query, sessionId: getSession() };
    const endpoint = defaultConfig.endpoint;

    
    $start.disabled = true;
    $query.disabled = true;

    
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), defaultConfig.timeout);

    try {
      let data;
      if(!endpoint){
        
        await new Promise(r => setTimeout(r, 900 + Math.random()*900));
        data = [
          { title: `Пример результата для «${query}» — релевантное видео 1`, url:'https://youtube.com/watch?v=abc', description:'Канал A — 2024' },
          { title: `Результат 2 — вдохновение`, url:'https://youtube.com/watch?v=def', description:'Канал B — 2024' }
        ];
      } else {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify(payload),
          signal: ctrl.signal
        });
        clearTimeout(timer);

        if(!resp.ok){
          
          if(resp.status === 404) throw { type:'not-registered', code:404 };
          if(resp.status === 500) throw { type:'server-error', code:500 };
          throw { type:'http', code: resp.status, text: await resp.text().catch(()=>'') };
        }
        
        const j = await resp.json().catch(async ()=>{ const t=await resp.text().catch(()=>null); throw { type:'bad-json', text:t }; });
        data = j;
      }

      const items = normalizeResp(data);
      if(!items.length) {
        show($resultsState);
        $results.innerHTML = `<div class="muted">Ничего не найдено по вашему запросу. Попробуйте уточнить тему.</div>`;
      } else {
        $results.innerHTML = items.map(renderItem).join('');
        show($resultsState);
      }
    } catch(err){
      
      console.error('Agent call error', err);
      if(err && err.type === 'not-registered'){
        showErrorFriendly('Сервис временно недоступен. Пожалуйста, попробуйте чуть позже.');
      } else if(err && err.type === 'server-error'){
        showErrorFriendly('Возникла внутренняя ошибка. Повторите попытку через несколько минут.');
      } else if(err && err.name === 'AbortError'){
        showErrorFriendly('Запрос занял слишком много времени. Попробуйте ещё раз.');
      } else if(err && err.type === 'bad-json'){
        showErrorFriendly('Сервер вернул неожиданный ответ. Попробуйте позже.');
      } else if(err && err.type === 'http'){
        showErrorFriendly('Не удалось получить результат. Попробуйте ещё раз.');
      } else {
        showErrorFriendly('Произошла ошибка сети. Проверьте подключение и повторите.');
      }
      
      $serviceHint.style.display = 'block';
      $serviceHint.textContent = 'Если проблема не исчезает — пожалуйста, попробуйте позже.';
    } finally {
      clearTimeout(timer);
      $start.disabled = false;
      $query.disabled = false;
    }
  }

  
  $start.addEventListener('click', ()=> {
    const q = $query.value.trim();
    if(!q) return;
    callAgent(q);
  });
  $query.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); $start.click(); } });
  $new.addEventListener('click', ()=>{ $query.value=''; show($inputState); $query.focus(); });
  $retry.addEventListener('click', ()=> { const q = $query.value.trim(); if(q) callAgent(q); });

  
  show($inputState);
})();