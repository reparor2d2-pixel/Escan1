(() => {
  const KEY_URL='ec_cloud_api_url';
  let timer=null, syncing=false, hydrated=false, pullTimer=null;
  const cfg=()=>({
    url:String(window.EVALUACAM_CONFIG?.apiUrl||localStorage.getItem(KEY_URL)||'').trim()
  });
  function isConfigured(){return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(cfg().url)}
  function setStatus(message,type=''){
    const el=document.querySelector('#cloudStatus');
    if(el){el.textContent=message;el.dataset.type=type}
    document.body.dataset.cloudStatus=type||'';
  }
  async function request(action,payload={}){
    const c=cfg();
    if(!isConfigured())throw new Error('Falta configurar la URL /exec de Apps Script en google-config.js.');
    const idToken=await window.EvaluaCamAuth?.getIdToken?.();
    if(!idToken)throw new Error('La sesión institucional no está activa.');
    const response=await fetch(c.url,{method:'POST',mode:'cors',credentials:'omit',cache:'no-store',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,idToken,payload})});
    const text=await response.text();
    let data;try{data=JSON.parse(text)}catch{throw new Error('La API devolvió una respuesta no válida. Revise la implementación de Apps Script.')}
    if(!data.ok)throw new Error(data.error||'Operación rechazada por la API.');
    return data;
  }
  function localSnapshot(){return {courses:window.state?.courses||[],exams:window.state?.exams||[],settings:window.state?.settings||{}}}
  function mergeResults(remoteResults){
    const localById=new Map((state.results||[]).map(r=>[String(r.id),r]));
    const merged=(remoteResults||[]).map(remote=>{
      const local=localById.get(String(remote.id));
      if(local?.nameImageDataUrl)window.EvaluaCamResultImages?.remember?.(remote.id,local.nameImageDataUrl);
      localById.delete(String(remote.id));
      return {...local,...remote,nameImageDataUrl:local?.cloudStatus!=='saved'?(local?.nameImageDataUrl||''):''};
    });
    // No perder correcciones creadas sin conexión mientras aún no llegan al servidor.
    for(const local of localById.values())if(local.cloudStatus!=='saved')merged.push(local);
    return merged.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  }
  function applyRemote(remote){
    if(!window.state)return;
    const r=remote||{};
    if(Array.isArray(r.courses))state.courses=r.courses;
    if(Array.isArray(r.exams))state.exams=r.exams;
    if(Array.isArray(r.results))state.results=mergeResults(r.results);
    if(r.settings&&Object.keys(r.settings).length)state.settings={...state.settings,...r.settings};
    window.saveLocalOnly?.();
    window.refreshCourseSelects?.();window.refreshExamSelects?.();window.renderCourses?.();window.renderStats?.();window.renderResults?.();
  }
  async function saveResult(result,imageDataUrl,nameImageDataUrl=''){return request('saveResult',{result,imageDataUrl,nameImageDataUrl})}
  async function pullInitialData({mergeLocal=true}={}){
    if(!isConfigured()||!window.state||!window.EvaluaCamAuth?.currentUser?.())return false;
    setStatus('Cargando sus datos desde Google…','syncing');
    try{
      const d=await request('getInitialData');
      const remote=d.data||{};
      const hasRemote=(remote.courses?.length||0)+(remote.exams?.length||0)+(remote.results?.length||0)>0;
      const hasLocal=(state.courses?.length||0)+(state.exams?.length||0)+(state.results?.length||0)>0;
      if(!hasRemote&&hasLocal&&mergeLocal){
        await request('syncState',localSnapshot());
        for(const result of (state.results||[])){
          try{await saveResult(result,'',result.nameImageDataUrl||'')}catch(_){}
        }
        const fresh=await request('getInitialData');
        applyRemote(fresh.data||{});
      }else{
        applyRemote(remote);
      }
      hydrated=true;
      setStatus('Datos sincronizados. Verá lo mismo en todos sus dispositivos.','ok');
      return true;
    }catch(e){
      hydrated=true;
      setStatus('No se pudo sincronizar: '+e.message,'warn');
      return false;
    }
  }
  async function syncState(){
    if(!isConfigured()||syncing||!window.state||!window.EvaluaCamAuth?.currentUser?.())return;
    if(!hydrated){await pullInitialData();return;}
    syncing=true;setStatus('Guardando cambios en Google…','syncing');
    try{
      const d=await request('syncState',localSnapshot());
      for(const result of (state.results||[]).filter(r=>r.cloudStatus==='pending')){
        try{
          const saved=await saveResult(result,'',result.nameImageDataUrl||'');
          window.EvaluaCamResultImages?.remember?.(result.id,result.nameImageDataUrl||'');Object.assign(result,{captureUrl:result.captureUrl||saved.captureUrl||'',captureId:result.captureId||saved.captureId||'',nameImageUrl:result.nameImageUrl||saved.nameImageUrl||'',nameImageId:result.nameImageId||saved.nameImageId||'',nameImageDataUrl:'',cloudStatus:'saved'});
        }catch(e){result.cloudStatus='pending';break}
      }
      if(d.data)applyRemote(d.data);else window.saveLocalOnly?.();
      setStatus('Todos los cambios están guardados en Google.','ok');
    }catch(e){setStatus('Cambios pendientes: '+e.message,'warn')}
    finally{syncing=false}
  }
  function queueStateSync(){
    if(!isConfigured()||!hydrated)return;
    clearTimeout(timer);timer=setTimeout(syncState,350);
  }
  function bindUI(){
    const url=document.querySelector('#cloudApiUrl');
    const token=document.querySelector('#cloudApiToken');
    if(url){url.value=cfg().url;url.readOnly=!!window.EVALUACAM_CONFIG?.apiUrl;}
    if(token){token.closest('label')?.setAttribute('hidden','');}
    const saveBtn=document.querySelector('#cloudSaveBtn');
    if(saveBtn)saveBtn.onclick=()=>{
      if(!window.EVALUACAM_CONFIG?.apiUrl&&url)localStorage.setItem(KEY_URL,url.value.trim());
      setStatus(isConfigured()?'Conexión configurada.':'Pegue la URL /exec en google-config.js.');
    };
    const testBtn=document.querySelector('#cloudTestBtn');
    if(testBtn)testBtn.onclick=async()=>{try{const d=await request('ping');setStatus('Conexión correcta: '+(d.spreadsheetName||'EvalúaCam'),'ok');await pullInitialData({mergeLocal:true})}catch(e){setStatus('Error: '+e.message,'warn')}};
    if(!isConfigured())setStatus('Administrador: falta pegar la URL /exec en google-config.js.','warn');
  }
  function startPeriodicPull(){
    clearInterval(pullTimer);
    pullTimer=setInterval(()=>{if(document.visibilityState==='visible'&&window.EvaluaCamAuth?.currentUser?.())pullInitialData({mergeLocal:false})},45000);
  }
  window.addEventListener('focus',()=>{if(hydrated)pullInitialData({mergeLocal:false})});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&hydrated)pullInitialData({mergeLocal:false})});
  window.EvaluaCamCloud={request,saveResult,syncState,queueStateSync,pullInitialData,isConfigured};
  window.addEventListener('DOMContentLoaded',()=>{bindUI();startPeriodicPull()});
})();
