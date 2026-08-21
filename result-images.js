(() => {
  const memory=new Map(), pending=new Map();
  let observer=null;
  function remember(resultId,dataUrl){if(resultId&&/^data:image\//.test(String(dataUrl||'')))memory.set(String(resultId),String(dataUrl));}
  function source(result){if(!result)return '';return String(result.nameImageDataUrl||memory.get(String(result.id))||'');}
  function forget(resultId){memory.delete(String(resultId||''));pending.delete(String(resultId||''));}
  async function ensure(result){
    if(!result)return '';
    const ready=source(result);if(ready)return ready;
    if(!result.nameImageId||!window.EvaluaCamCloud?.request)return '';
    const id=String(result.id);if(pending.has(id))return pending.get(id);
    const job=window.EvaluaCamCloud.request('getNameImage',{resultId:id}).then(d=>{const url=String(d.dataUrl||'');if(url)remember(id,url);return url}).catch(()=> '').finally(()=>pending.delete(id));
    pending.set(id,job);return job;
  }
  async function loadNode(img){
    if(!img?.isConnected||img.dataset.loaded==='1'||img.dataset.loading==='1')return;
    const id=img.dataset.nameResultId;if(!id)return;
    const result=window.state?.results?.find(r=>String(r.id)===String(id));if(!result)return;
    img.dataset.loading='1';
    const src=await ensure(result);
    const ph=document.querySelector(`[data-name-placeholder="${CSS.escape(id)}"]`);
    if(src){img.src=src;img.hidden=false;img.dataset.loaded='1';if(ph)ph.hidden=true;}
    else if(ph){ph.textContent='Vista del nombre no disponible';ph.classList.add('unavailable');}
    delete img.dataset.loading;
  }
  function hydrate(root=document){
    const nodes=[...root.querySelectorAll('img[data-name-result-id]')];
    if(!('IntersectionObserver' in window)){nodes.slice(0,24).forEach(loadNode);return;}
    if(!observer)observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){observer.unobserve(entry.target);loadNode(entry.target);}}),{rootMargin:'320px 0px'});
    nodes.forEach(img=>{if(img.dataset.loaded!=='1'&&img.dataset.observed!=='1'){img.dataset.observed='1';observer.observe(img)}});
  }
  window.EvaluaCamResultImages={remember,source,ensure,hydrate,forget};
})();
