const APP_VERSION='5.2.1';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const letters=['A','B','C','D','E'];
const currentYear=new Date().getFullYear();
let storageOwner='guest';
const storageKey=k=>storageOwner==='guest'?k:`${k}_${storageOwner}`;
const readStored=(k,fallback)=>{try{return JSON.parse(localStorage.getItem(storageKey(k))||fallback)}catch{return JSON.parse(fallback)}};
const state={
  courses:readStored('ec_courses','[]'),
  exams:readStored('ec_exams','[]'),
  results:readStored('ec_results','[]'),
  settings:readStored('ec_settings','{"minGrade":1,"maxGrade":7,"passGrade":4,"print":{}}'),
  currentKey:[],stream:null,deferredPrompt:null,selectedResultId:null,autoScanTimer:null,autoScanBusy:false,autoScanLocked:false,autoScanStable:0,autoScanLost:0,autoScanLast:null,autoScanOrientation:0,scanCopies:null,autoScanBest:null,scanProbeCanvas:null,autoScanDetection:null,autoScanLastGood:null,autoScanFrameCount:0,scanLastCaptureAt:0,scanStableSince:0,scanStartedAt:0,scanDetectionHistory:[]
};
window.state=state;
const feedbackCaptureCache=new Map();
const feedbackCapturePending=new Map();
const loadedPrintLayoutVersion=+(state.settings?.print?.layoutVersion||0);
const titles={dashboard:['Resumen','Gestione cursos, pruebas, hojas y resultados.'],courses:['Cursos','Cree cursos y revise sus evaluaciones.'],exam:['Crear prueba','Configure la evaluación y su clave de respuestas.'],sheet:['Hoja de respuestas','Genere e imprima hojas listas para escanear.'],scan:['Escanear','Use la cámara del teléfono para corregir.'],results:['Resultados','Compare respuestas del estudiante con la clave correcta.'],settings:['Configuración','Personalice la impresión y vea los cambios en tiempo real.']};
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}
function saveLocalOnly(){
  const resultsForStorage=state.results.map(r=>{
    const copy={...r};
    // Las miniaturas ya sincronizadas viven en Drive y se cargan bajo demanda.
    // Solo conservamos Base64 si el resultado aún está pendiente para no perderlo sin conexión.
    if(copy.cloudStatus==='saved'&&copy.nameImageDataUrl){window.EvaluaCamResultImages?.remember?.(copy.id,copy.nameImageDataUrl);delete copy.nameImageDataUrl;}
    return copy;
  });
  localStorage.setItem(storageKey('ec_courses'),JSON.stringify(state.courses));
  localStorage.setItem(storageKey('ec_exams'),JSON.stringify(state.exams));
  localStorage.setItem(storageKey('ec_results'),JSON.stringify(resultsForStorage));
  localStorage.setItem(storageKey('ec_settings'),JSON.stringify(state.settings));
}
window.saveLocalOnly=saveLocalOnly;
function save(){saveLocalOnly();window.EvaluaCamCloud?.queueStateSync?.();}
window.switchEvaluaCamUser=function(uid){storageOwner=uid||'guest';state.courses=readStored('ec_courses','[]');state.exams=readStored('ec_exams','[]');state.results=readStored('ec_results','[]');state.settings=readStored('ec_settings','{"minGrade":1,"maxGrade":7,"passGrade":4,"print":{}}');refreshCourseSelects?.();refreshExamSelects?.();renderCourses?.();renderStats?.();};
function migrateData(){
  let changed=false;
  state.exams.forEach(exam=>{
    if(!exam.courseId){
      const name=(exam.course||'Sin curso').trim()||'Sin curso';
      let course=state.courses.find(c=>c.name.toLowerCase()===name.toLowerCase());
      if(!course){course={id:crypto.randomUUID(),name,year:new Date(exam.created||Date.now()).getFullYear()||currentYear,created:new Date().toISOString()};state.courses.push(course)}
      exam.courseId=course.id;exam.course=course.name;changed=true;
    }
  });
  state.results.forEach(r=>{const e=state.exams.find(x=>x.id===r.examId);if(e&&!r.courseId){r.courseId=e.courseId;changed=true}});
  const print=state.settings.print||(state.settings.print={});
  if(loadedPrintLayoutVersion<13){
    const minimums={text:140,title:150,instructions:165,headers:175,numbers:175,bubble:120,stroke:145,black:130,contrast:135,sharp:130,marker:145};
    Object.entries(minimums).forEach(([key,value])=>{if(!Number.isFinite(+print[key])||+print[key]<value){print[key]=value;changed=true}});
    if(![1,2,3].includes(+print.copies))print.copies=3;
    print.layoutVersion=13;changed=true;
  }
  if(![1,2].includes(+print.feedbackLayout||0)){print.feedbackLayout=2;changed=true}
  if(changed)save();
}
function closeMenu(){const sidebar=$('.sidebar');sidebar.classList.remove('open');document.body.classList.remove('menu-open');$('#menuBtn').setAttribute('aria-expanded','false')}
function toggleMenu(){const open=!$('.sidebar').classList.contains('open');$('.sidebar').classList.toggle('open',open);document.body.classList.toggle('menu-open',open);$('#menuBtn').setAttribute('aria-expanded',String(open))}
function go(view){if(view!=='scan'&&state.stream)stopCamera();$$('.view').forEach(v=>v.classList.toggle('active',v.id===view));$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('#viewTitle').textContent=titles[view][0];$('#viewSubtitle').textContent=titles[view][1];closeMenu();window.scrollTo({top:0,behavior:'smooth'});if(view==='courses')renderCourses();if(view==='sheet')renderSheet();if(view==='scan')prepareScanScreen();if(view==='results')renderResults();if(view==='dashboard')renderStats();if(view==='settings')renderConfigScreen();}
$$('.nav-item').forEach(b=>b.onclick=()=>go(b.dataset.view));$$('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));$('#menuBtn').onclick=toggleMenu;$('#menuBackdrop').onclick=closeMenu;window.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu()});
for(let i=10;i<=100;i+=5)$('#questionCount').insertAdjacentHTML('beforeend',`<option value="${i}" ${i===20?'selected':''}>${i}</option>`);
$('#courseYear').value=currentYear;
function courseName(id){return state.courses.find(c=>c.id===id)?.name||'Sin curso'}
function refreshCourseSelects(){
  const options=state.courses.length?state.courses.slice().sort((a,b)=>a.name.localeCompare(b.name,'es')).map(c=>`<option value="${c.id}">${esc(c.name)} · ${c.year}</option>`).join(''):'<option value="">Primero cree un curso</option>';
  $('#examCourseSelect').innerHTML=options;
  const current=$('#resultsCourseFilter').value;
  $('#resultsCourseFilter').innerHTML='<option value="">Todos los cursos</option>'+options.replace('<option value="">Primero cree un curso</option>','');
  if([...$('#resultsCourseFilter').options].some(o=>o.value===current))$('#resultsCourseFilter').value=current;
}
$('#saveCourseBtn').onclick=()=>{
  const name=$('#courseName').value.trim(),year=+$('#courseYear').value||currentYear;
  if(!name)return toast('Ingrese el nombre del curso.');
  if(state.courses.some(c=>c.name.toLowerCase()===name.toLowerCase()&&c.year===year))return toast('Ese curso ya existe para el año indicado.');
  {const now=new Date().toISOString();state.courses.push({id:crypto.randomUUID(),name,year,created:now,updatedAt:now,revision:1});}save();$('#courseName').value='';refreshCourseSelects();renderCourses();renderStats();toast('Curso creado correctamente.');
};
function renderCourses(){
  const box=$('#coursesList');
  if(!state.courses.length){box.innerHTML='<div class="empty-state">Aún no hay cursos creados.</div>';return}
  box.innerHTML=state.courses.slice().sort((a,b)=>b.year-a.year||a.name.localeCompare(b.name,'es')).map(c=>{
    const exams=state.exams.filter(e=>e.courseId===c.id),results=state.results.filter(r=>r.courseId===c.id);
    return `<article class="course-card"><div><span class="course-year">${c.year}</span><h3>${esc(c.name)}</h3><p>${exams.length} evaluación(es) · ${results.length} resultado(s)</p></div><div class="course-exams">${exams.length?exams.map(e=>`<button class="exam-chip" data-course-exam="${e.id}">${esc(e.name)} <small>${state.results.filter(r=>r.examId===e.id).length}</small></button>`).join(''):'<span>Sin evaluaciones todavía.</span>'}</div><button class="ghost danger-text" data-delete-course="${c.id}">Eliminar curso</button></article>`
  }).join('');
  $$('[data-course-exam]').forEach(b=>b.onclick=()=>{go('results');$('#resultsCourseFilter').value=state.exams.find(e=>e.id===b.dataset.courseExam)?.courseId||'';refreshResultsExamFilter(b.dataset.courseExam);renderResults()});
  $$('[data-delete-course]').forEach(b=>b.onclick=()=>requestDeleteCourse(b.dataset.deleteCourse));
}
async function requestDeleteCourse(id){
  const course=state.courses.find(c=>c.id===id); if(!course)return;
  const exams=state.exams.filter(e=>e.courseId===id), results=state.results.filter(r=>r.courseId===id);
  const dialog=document.createElement('div');dialog.className='pin-dialog';dialog.innerHTML=`<div class="pin-dialog-card danger-zone"><h3>Eliminar ${esc(course.name)}</h3><p>Se eliminarán ${exams.length} prueba(s), ${results.length} calificación(es) y sus capturas. Esta acción no se puede deshacer.</p><label>Escriba el nombre del curso<input id="confirmCourseName" autocomplete="off"></label><label>PIN de seguridad<input id="confirmDeletePin" type="password" inputmode="numeric" maxlength="8"></label><div class="actions"><button id="cancelDeleteCourse" class="secondary">Cancelar</button><button id="confirmDeleteCourse" class="danger">Eliminar definitivamente</button></div></div>`;document.body.appendChild(dialog);
  dialog.querySelector('#cancelDeleteCourse').onclick=()=>dialog.remove();
  dialog.querySelector('#confirmDeleteCourse').onclick=async()=>{const name=dialog.querySelector('#confirmCourseName').value.trim(),pin=dialog.querySelector('#confirmDeletePin').value;const expected=localStorage.getItem('ec_admin_delete_pin')||'1234';if(name!==course.name)return toast('El nombre del curso no coincide.');if(pin!==expected)return toast('PIN incorrecto.');state.results=state.results.filter(r=>r.courseId!==id);state.exams=state.exams.filter(e=>e.courseId!==id);state.courses=state.courses.filter(c=>c.id!==id);save();dialog.remove();refreshCourseSelects();refreshExamSelects();renderCourses();renderStats();try{await window.EvaluaCamCloud?.request?.('deleteCourse',{courseId:id,pin})}catch(e){toast('El curso se eliminó localmente; revise la sincronización.')}};
}
function renderDashboardHierarchy(){const box=$('#dashboardCourses');if(!box)return;if(!state.courses.length){box.innerHTML='<div class="empty-state">Aún no hay cursos. Cree el primero para comenzar.</div>';return}box.innerHTML=state.courses.slice().sort((a,b)=>b.year-a.year||a.name.localeCompare(b.name,'es')).map(c=>{const exams=state.exams.filter(e=>e.courseId===c.id);return `<article class="dashboard-course"><div class="dashboard-course-head"><div><h4>${esc(c.name)}</h4><small>${c.year} · ${exams.length} prueba(s) · ${state.results.filter(r=>r.courseId===c.id).length} corrección(es)</small></div><button class="secondary compact" data-dashboard-course="${c.id}">Abrir curso</button></div><div class="dashboard-exams">${exams.length?exams.map(e=>{const n=state.results.filter(r=>r.examId===e.id).length;return `<div class="dashboard-exam"><strong>${esc(e.name)}</strong><span>${n} evaluada(s)</span><button class="secondary compact" data-dashboard-exam="${e.id}">Ver resultados</button></div>`}).join(''):'<span class="empty-state">Este curso todavía no tiene pruebas.</span>'}</div></article>`}).join('');$$('[data-dashboard-exam]').forEach(b=>b.onclick=()=>{const e=state.exams.find(x=>x.id===b.dataset.dashboardExam);go('results');$('#resultsCourseFilter').value=e?.courseId||'';refreshResultsExamFilter(e?.id);renderResults()});$$('[data-dashboard-course]').forEach(b=>b.onclick=()=>go('courses'))}
function generateKey(){const n=+$('#questionCount').value,o=+$('#optionCount').value;state.currentKey=Array(n).fill('');const box=$('#answerKey');box.classList.remove('empty-state');box.innerHTML='';for(let i=0;i<n;i++){const row=document.createElement('div');row.className='answer-row';row.innerHTML=`<strong>${i+1}</strong>`+letters.slice(0,o).map(l=>`<label class="bubble-choice"><input type="radio" name="q${i}" value="${l}"><span>${l}</span></label>`).join('');row.onchange=e=>{state.currentKey[i]=e.target.value};box.appendChild(row)}}
$('#generateKeyBtn').onclick=generateKey;$('#clearKeyBtn').onclick=()=>{state.currentKey.fill('');$$('#answerKey input').forEach(i=>i.checked=false)};
$('#saveExamBtn').onclick=()=>{const name=$('#examName').value.trim(),courseId=$('#examCourseSelect').value;if(!courseId)return toast('Primero cree y seleccione un curso.');if(!name)return toast('Ingrese el nombre de la prueba.');if(!state.currentKey.length)return toast('Genere primero la clave de respuestas.');if(state.currentKey.some(x=>!x))return toast('Complete todas las respuestas de la clave.');const now=new Date().toISOString(),exam={id:crypto.randomUUID(),name,courseId,course:courseName(courseId),subject:$('#examSubject').value.trim(),version:$('#examVersion').value||'A',studentIdMode:$('#studentIdMode').value||'name',questions:+$('#questionCount').value,options:+$('#optionCount').value,threshold:+$('#passThreshold').value,key:[...state.currentKey],created:now,updatedAt:now,revision:1,code:String(Math.floor(1000+Math.random()*9000))};state.exams.unshift(exam);save();refreshExamSelects();renderStats();toast('Prueba guardada correctamente.');go('sheet')};
function refreshExamSelects(){const html=state.exams.length?state.exams.map(e=>`<option value="${e.id}">${esc(courseName(e.courseId))} · ${esc(e.name)}</option>`).join(''):'<option value="">No hay pruebas</option>';$('#sheetExamSelect').innerHTML=html;$('#scanExamSelect').innerHTML=html;refreshResultsExamFilter();}
function renderSheet(){
  const id=$('#sheetExamSelect').value,e=state.exams.find(x=>x.id===id)||state.exams[0];
  if(!e){$('#sheetQuestions').innerHTML='<p>No hay una prueba disponible.</p>';$('#sheetCanvasPreview').innerHTML='<div class="empty-state">Cree una evaluación para generar la hoja.</div>';return}
  $('#sheetExamSelect').value=e.id;$('#sheetTitle').textContent=e.name;$('#sheetMeta').textContent=[e.subject,courseName(e.courseId),`Versión ${e.version||'A'}`,`${e.questions} preguntas`].filter(Boolean).join(' · ');
  document.querySelectorAll('.student-code-field').forEach(el=>el.style.display=(e.studentIdMode==='code'||e.studentIdMode==='both')?'block':'none');$('#sheetCode').textContent=e.code;
  const box=$('#sheetQuestions');box.innerHTML='';for(let i=0;i<e.questions;i++){const row=document.createElement('div');row.className='sheet-question';row.innerHTML=`<span class="qnum">${i+1}.</span>`+letters.slice(0,e.options).map(l=>`<span class="sheet-bubble"><i></i>${l}</span>`).join('');box.appendChild(row)}
  renderSheetPagePreview();
}
$('#sheetExamSelect').onchange=renderSheet;
function selectedSheetExam(){const id=$('#sheetExamSelect').value;return state.exams.find(x=>x.id===id)||state.exams[0]}
const printProfiles={
  auto:{black:125,contrast:130,sharp:125,stroke:145,size:124,marker:145},
  laser:{black:118,contrast:122,sharp:120,stroke:138,size:122,marker:140},
  ink:{black:128,contrast:134,sharp:128,stroke:148,size:124,marker:148},
  copy:{black:135,contrast:145,sharp:135,stroke:155,size:126,marker:155},
  max:{black:138,contrast:148,sharp:150,stroke:160,size:128,marker:160}
};
function optimizerValues(){return {black:+$('#blackLevel').value,contrast:+$('#contrast').value,sharp:+$('#sharpness').value,stroke:+$('#bubbleStroke').value,size:+$('#bubbleSize').value,marker:+$('#markerDarkness').value,text:+(state.settings.print?.text||140),title:+(state.settings.print?.title||150),instructions:+(state.settings.print?.instructions||165),headers:+(state.settings.print?.headers||175),numbers:+(state.settings.print?.numbers||175)}}
function applyProfile(name){const p=printProfiles[name]||printProfiles.auto;$('#blackLevel').value=p.black;$('#contrast').value=p.contrast;$('#sharpness').value=p.sharp;$('#bubbleStroke').value=p.stroke;$('#bubbleSize').value=p.size;$('#markerDarkness').value=p.marker;updateOptimizer()}
function updateOptimizer(){const v=optimizerValues();[['blackLevelOut',v.black],['contrastOut',v.contrast],['sharpnessOut',v.sharp],['bubbleStrokeOut',v.stroke],['bubbleSizeOut',v.size],['markerDarknessOut',v.marker]].forEach(([id,n])=>$('#'+id).textContent=n+'%');const copies=+$('#copiesPerPage').value||1;let score=100-Math.abs(v.black-125)*.12-Math.abs(v.contrast-130)*.09-Math.abs(v.sharp-125)*.06-Math.max(0,115-v.stroke)*.18-(copies===3?1:copies===2?2:0);score=Math.max(65,Math.min(99,Math.round(score)));$('#qualityScore').textContent=score+'%';$('#qualityBar').style.width=score+'%';$('#qualityAdvice').textContent=score>=94?'Excelente para impresión y lectura óptica.':score>=85?'Buena calidad. Para copias múltiples, aumente negros y grosor.':'Aumente negros, contraste y grosor de círculos.';renderPrintPreviewStyle()}
function renderPrintPreviewStyle(){const v=optimizerValues();const papers=$$('#printArea,.config-preview-sheet');papers.forEach(paper=>{paper.style.setProperty('--print-black',Math.min(1,(v.black-70)/70));paper.style.setProperty('--bubble-stroke',(1.4*v.stroke/100)+'px');paper.style.setProperty('--bubble-scale',v.size/100);paper.style.setProperty('--text-scale',v.text/100);paper.style.setProperty('--title-scale',v.title/100);paper.style.setProperty('--instructions-scale',v.instructions/100);paper.style.setProperty('--headers-scale',v.headers/100);paper.style.setProperty('--numbers-scale',v.numbers/100);paper.style.filter=`contrast(${v.contrast}%)`});renderSheetPagePreview()}
$('#togglePrintOptimizerBtn').onclick=()=>$('#printOptimizer').classList.toggle('hidden');$('#autoOptimizeBtn').onclick=()=>{applyProfile(+$('#copiesPerPage').value>=3?'copy':'auto');$('#printPreset').value='auto';toast('Calidad optimizada automáticamente.')};$('#printPreset').onchange=e=>{if(e.target.value!=='custom')applyProfile(e.target.value)};['blackLevel','contrast','sharpness','bubbleStroke','bubbleSize','markerDarkness'].forEach(id=>$('#'+id).oninput=()=>{$('#printPreset').value='custom';updateOptimizer()});$('#copiesPerPage').onchange=()=>{if($('#printPreset').value==='auto')applyProfile(+$('#copiesPerPage').value>=3?'copy':'auto');else updateOptimizer();renderSheetPagePreview()};
function getConfiguredRenderExam(baseExam, overrides={}){
  const e={...(baseExam||{name:'Evaluación de Matemáticas',subject:'',courseId:'',options:5,studentIdMode:'name',code:'2025',version:'A',questions:20})};
  if(overrides.questions!=null)e.questions=+overrides.questions;
  if(overrides.version)e.version=overrides.version;
  return e;
}
function answerGridForQuestions(total,copies=1){
  const n=Math.max(1,+total||1),c=Math.max(1,+copies||1);
  let cols;
  if(c>=3){cols=n<=20?2:n<=36?3:4}
  else if(c===2){cols=n<=20?2:n<=45?3:4}
  else{cols=n<=12?1:n<=40?2:n<=60?3:4}
  cols=Math.min(cols,n);
  return {cols,rows:Math.ceil(n/cols)};
}
const LETTER_SHORT_PX=2550;
const LETTER_LONG_PX=3300;
const PX_PER_MM=300/25.4;
function pageGridForCopies(copies){
  copies=+copies||1;
  if(copies===2)return {cols:2,rows:1,landscape:true};
  if(copies===3||copies===4)return {cols:2,rows:2,landscape:false};
  return {cols:1,rows:1,landscape:false};
}
function pageLayoutMetrics(copies,shortSide=LETTER_SHORT_PX){
  copies=+copies||1;const scale=shortSide/LETTER_SHORT_PX,grid=pageGridForCopies(copies),width=grid.landscape?Math.round(LETTER_LONG_PX*scale):shortSide,height=grid.landscape?shortSide:Math.round(LETTER_LONG_PX*scale);
  let mx,my,gx,gy;
  if(copies===1){mx=94*scale;my=96*scale;gx=gy=0}
  else if(copies===2){mx=92*scale;my=104*scale;gx=72*scale;gy=0}
  else{mx=82*scale;my=82*scale;gx=62*scale;gy=62*scale}
  const cellW=(width-mx*2-gx*(grid.cols-1))/grid.cols,cellH=(height-my*2-gy*(grid.rows-1))/grid.rows;
  return {width,height,grid,mx,my,gx,gy,cellW,cellH,aspect:cellW/cellH};
}
function responseSheetAspectForCopies(copies){return pageLayoutMetrics(+copies||1,LETTER_SHORT_PX).aspect}
function sheetGeometryForCopies(copies=1){
  copies=Math.max(1,Math.min(4,+copies||1));
  const ref=pageLayoutMetrics(copies,LETTER_SHORT_PX),xmm=mm=>mm*PX_PER_MM/ref.cellW,ymm=mm=>mm*PX_PER_MM/ref.cellH,compact=copies>=3;
  const markerMm=copies===1?8.2:copies===2?7.8:7.0;
  const safeLeftMm=compact?14.5:16.5,safeRightMm=compact?8.5:10.5;
  return {
    markerX:xmm(3.6),markerTop:ymm(3.6),markerMid:.515,markerBottom:1-ymm(3.6),marker:xmm(markerMm),markerMoat:xmm(2.0),
    safeLeft:xmm(safeLeftMm),safeRight:1-xmm(safeRightMm),titleY:ymm(compact?9.0:10.0),fieldTop:ymm(compact?18.5:21.0),fieldHeight:ymm(compact?10.5:12.5),
    instructionY:ymm(compact?34.5:40.5),answerTop:ymm(compact?42.5:49.0),answerBottom:1-ymm(compact?13.0:16.0),footerY:1-ymm(6.8),
    timingX:xmm(3.8),timingTop:compact?.555:.575,timingStep:ymm(compact?4.45:5.35),timingBarH:ymm(compact?1.85:2.05),
    refCellW:ref.cellW,refCellH:ref.cellH,compact
  };
}
function hash32(text){let h=2166136261>>>0;for(const ch of String(text||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0}return h>>>0}
function examIdentity(exam){const seed=hash32(`${exam?.id||''}|${exam?.code||''}|${exam?.courseId||''}|${exam?.version||'A'}|${exam?.questions||0}`);return seed.toString(36).toUpperCase().padStart(7,'0').slice(-7)}
function timingPatternForExam(exam){let n=hash32(examIdentity(exam)),out=[];for(let i=0;i<10;i++){n=(Math.imul(n,1664525)+1013904223)>>>0;out.push(.38+((n>>>24)&255)/255*.58)}return out}
function activeScanExam(){const id=$('#scanExamSelect')?.value;return state.exams.find(x=>x.id===id)||state.exams[0]||null}
function activeTimingPattern(){return timingPatternForExam(activeScanExam())}
function createLetterSheetCanvas(exam,copies,width=1275){
  const m=pageLayoutMetrics(copies,width),canvas=document.createElement('canvas');canvas.width=m.width;canvas.height=m.height;
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  const slots=[];
  if(copies===3){slots.push([0,0],[1,0],[.5,1])}
  else for(let i=0;i<copies;i++)slots.push([i%m.grid.cols,Math.floor(i/m.grid.cols)]);
  slots.forEach(([col,row])=>{const sx=copies===3&&col===.5?(m.width-m.cellW)/2:m.mx+col*(m.cellW+m.gx),sy=m.my+row*(m.cellH+m.gy);drawResponseSheet(ctx,exam,sx,sy,m.cellW,m.cellH,copies)});
  return canvas;
}
function renderSheetPagePreview(){
  const host=$('#sheetCanvasPreview');if(!host)return;const exam=selectedSheetExam();if(!exam){host.innerHTML='';return}
  const copies=+$('#copiesPerPage').value||1,canvas=createLetterSheetCanvas(getConfiguredRenderExam(exam),copies,1275);canvas.className='sheet-page-preview-canvas';canvas.setAttribute('aria-label',`Vista previa exacta de ${copies} hoja${copies===1?'':'s'} por página Carta`);host.innerHTML='';host.appendChild(canvas);
  const layout=answerGridForQuestions(exam.questions,copies),notice=$('#sheetLayoutNotice');if(notice){notice.className='sheet-layout-notice is-ok';const safety=copies===4&&exam.questions>20?' · Formato económico: se recomienda hasta 20 preguntas.':'';notice.textContent=`EvalúaCam OMR Pro · ${copies} por hoja Carta · ${layout.cols} columna(s) × ${layout.rows} fila(s). Círculos y encabezado preservan tamaño físico para mejorar la lectura por cámara${safety}.`}
}
function setSheetPageStyle(copies){
  let style=$('#sheetPageStyle');if(!style){style=document.createElement('style');style.id='sheetPageStyle';document.head.appendChild(style)}
  const landscape=+copies===2;style.textContent=`@page { size: Letter ${landscape?'landscape':'portrait'}; margin: 0; }`;
  document.body.style.setProperty('--sheet-page-w',landscape?'279.4mm':'215.9mm');document.body.style.setProperty('--sheet-page-h',landscape?'215.9mm':'279.4mm');
}
function clearSheetPageStyle(){const style=$('#sheetPageStyle');if(style)style.remove()}
function preparePrintPages(){
  const copies=+$('#copiesPerPage').value||1,exam=getConfiguredRenderExam(selectedSheetExam()),pages=$('#printPages');pages.innerHTML='';
  if(copies===4&&exam?.questions>20)toast('Para 4 hojas por página y máxima precisión se recomiendan hasta 20 preguntas.');
  const canvas=createLetterSheetCanvas(exam,copies,2550),img=document.createElement('img');img.className='canonical-print-image';img.alt='Hoja de respuestas EvalúaCam OMR Pro lista para imprimir';img.src=canvas.toDataURL('image/png');
  const page=document.createElement('div');page.className='print-page canonical-page';page.appendChild(img);pages.appendChild(page);setSheetPageStyle(copies);
}
$('#printSheetBtn').onclick=()=>{if(!selectedSheetExam())return toast('Primero seleccione una evaluación.');preparePrintPages();document.body.classList.add('printing-sheets');requestAnimationFrame(()=>window.print())};window.addEventListener('afterprint',()=>{document.body.classList.remove('printing-sheets');document.body.classList.remove('printing-feedback');$('#feedbackPrintPages')?.replaceChildren();clearFeedbackPageStyle?.();clearSheetPageStyle?.()});
function wrapText(ctx,text,x,y,maxWidth,lineHeight,maxLines=2){const words=String(text).split(/\s+/);let line='',lines=[];for(const word of words){const test=line?line+' '+word:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word}else line=test}if(line)lines.push(line);lines=lines.slice(0,maxLines);lines.forEach((ln,i)=>ctx.fillText(ln,x,y+i*lineHeight));}
function drawSquareMarker(ctx,mx,my,size,moat){ctx.fillStyle='#fff';ctx.fillRect(mx-moat,my-moat,size+moat*2,size+moat*2);ctx.fillStyle='#000';ctx.fillRect(mx,my,size,size)}
function drawTimingSignature(ctx,w,h,mark,exam,copies){
  const g=sheetGeometryForCopies(copies),pattern=timingPatternForExam(exam),x=w*g.timingX,y0=h*g.timingTop,step=h*g.timingStep,barH=Math.max(2,h*g.timingBarH);
  ctx.fillStyle='#000';pattern.forEach((factor,i)=>ctx.fillRect(x,y0+i*step,mark*factor,barH));
}
function drawFieldBox(ctx,label,x,y,width,height,fontSize,lineWidth){ctx.fillStyle='#000';ctx.font=`700 ${fontSize}px Arial`;ctx.textAlign='left';ctx.fillText(label,x,y-fontSize*.38);ctx.strokeStyle='#000';ctx.lineWidth=lineWidth;ctx.strokeRect(x,y,width,height)}
function drawExamEdgeLabel(ctx,e,w,h,copies,g,mark,moat,rightX,topY,midY){
  const raw=String(e?.name||'Evaluación').trim()||'Evaluación';
  const suffix=e?.version?` · ${e.version}`:'';
  let label=raw+suffix;
  const safeTop=topY+mark+moat*1.55,safeBottom=midY-moat*1.55;
  const available=Math.max(0,safeBottom-safeTop);
  if(available<20)return;
  ctx.save();
  let font=Math.max(8,physicalPx(copies>=3?2.2:2.55,copies,w));
  ctx.font=`700 ${font}px Arial`;
  const maxText=available*.88;
  while(font>6&&ctx.measureText(label).width>maxText){font-=.5;ctx.font=`700 ${font}px Arial`}
  if(ctx.measureText(label).width>maxText){
    while(label.length>6&&ctx.measureText(label+'…').width>maxText)label=label.slice(0,-1);
    label+='…';
  }
  const x=rightX+mark*.50,y=(safeTop+safeBottom)/2;
  ctx.translate(x,y);ctx.rotate(-Math.PI/2);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='rgb(35,35,35)';
  ctx.fillText(label,0,0);
  ctx.restore();
}
function physicalPx(mm,copies,w){const ref=pageLayoutMetrics(copies,LETTER_SHORT_PX);return mm*PX_PER_MM*(w/ref.cellW)}
function responseBubbleMetrics(copies,questions,cols,rowH,colW,w,options){
  copies=Math.max(1,Math.min(4,+copies||1));
  const diameterMm=copies===1?7.0:copies===2?6.6:copies===3?5.9:5.7,gapMm=copies===1?2.0:copies===2?1.8:1.45;
  const desiredR=physicalPx(diameterMm/2,copies,w),edgeGap=physicalPx(gapMm,copies,w),optionStart=Math.min(colW*.34,physicalPx(copies>=3?14.0:18.0,copies,w));
  const maxR=Math.min(rowH*.37,(colW-optionStart)/(options*2.10)),radius=Math.max(5,Math.min(desiredR,maxR));
  const desiredGap=radius*2+edgeGap,maxGap=options>1?(colW-optionStart-radius*1.15)/(options-1):0,actualGap=options>1?Math.max(radius*2+physicalPx(.8,copies,w),Math.min(desiredGap,maxGap)):0;
  const numberX=Math.max(physicalPx(5.0,copies,w),optionStart-physicalPx(copies>=3?4.2:5.2,copies,w));
  return {numberOffset:numberX/colW,optionStartRatio:optionStart/colW,optionBand:actualGap*(options-1),optionGap:actualGap,radius};
}
function drawResponseSheet(ctx,e,x,y,w,h,copies=1){
  const v=optimizerValues(),g=sheetGeometryForCopies(copies),ink=Math.max(0,Math.min(16,Math.round((140-v.black)*.24))),dark=`rgb(${ink},${ink},${ink})`,scale=w/g.refCellW;
  ctx.save();ctx.translate(x,y);ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
  const mark=w*g.marker,moat=w*g.markerMoat,leftX=w*g.markerX,rightX=w*(1-g.markerX)-mark,topY=h*g.markerTop,midY=h*g.markerMid-mark/2,bottomY=h*g.markerBottom-mark;
  [[leftX,topY],[rightX,topY],[leftX,midY],[rightX,midY],[leftX,bottomY],[rightX,bottomY]].forEach(([mx,my])=>drawSquareMarker(ctx,mx,my,mark,moat));
  drawTimingSignature(ctx,w,h,mark,e,copies);
  const left=w*g.safeLeft,right=w*g.safeRight,usable=right-left;
  drawExamEdgeLabel(ctx,e,w,h,copies,g,mark,moat,rightX,topY,midY);
  ctx.fillStyle=dark;ctx.textAlign='left';
  const fy=h*g.fieldTop,boxH=h*g.fieldHeight,labelFont=Math.max(11,physicalPx(copies>=3?3.0:3.4,copies,w)),lineW=Math.max(1.4,physicalPx(.38,copies,w));
  const gap=usable*.045;
  if(e.studentIdMode==='both'){
    const nw=usable*.52,cw=usable*.18;drawFieldBox(ctx,'Nombre',left,fy,nw,boxH,labelFont,lineW);drawFieldBox(ctx,'Código',left+nw+gap,fy,cw,boxH,labelFont*.92,lineW);drawFieldBox(ctx,'Curso',left+nw+gap+cw+gap,fy,usable-nw-cw-gap*2,boxH,labelFont*.92,lineW);
  }else if(e.studentIdMode==='code'){
    const codeW=usable*.64;drawFieldBox(ctx,'Código del estudiante',left,fy,codeW,boxH,labelFont*.92,lineW);drawFieldBox(ctx,'Curso',left+codeW+gap,fy,usable-codeW-gap,boxH,labelFont,lineW);
  }else{
    const nameW=usable*.64;drawFieldBox(ctx,'Nombre del estudiante',left,fy,nameW,boxH,labelFont,lineW);drawFieldBox(ctx,'Curso / Grupo',left+nameW+gap,fy,usable-nameW-gap,boxH,labelFont,lineW);
  }
  ctx.strokeStyle='rgb(125,125,125)';ctx.lineWidth=Math.max(1,physicalPx(.18,copies,w));ctx.beginPath();ctx.moveTo(left,fy+boxH+physicalPx(4.0,copies,w));ctx.lineTo(right,fy+boxH+physicalPx(4.0,copies,w));ctx.stroke();
  ctx.fillStyle=dark;ctx.textAlign='center';ctx.font=`600 ${Math.max(9,physicalPx(copies>=3?2.45:2.8,copies,w))}px Arial`;ctx.fillText('Marque solo una alternativa por pregunta. Rellene completamente el círculo.',(left+right)/2,h*g.instructionY);
  const grid=answerGridForQuestions(e.questions,copies),cols=grid.cols,rows=grid.rows,top=h*g.answerTop,bottom=h*g.answerBottom,colW=usable/cols,availableH=bottom-top,targetPitch=physicalPx(copies===1?14.0:copies===2?11.0:7.4,copies,w),rowH=Math.min(availableH/rows,targetPitch),blockH=rowH*rows,startY=top+Math.max(0,(availableH-blockH)*.16);
  for(let c=1;c<cols;c++){const dx=left+c*colW;ctx.strokeStyle='rgb(205,205,205)';ctx.lineWidth=Math.max(1,physicalPx(.16,copies,w));ctx.beginPath();ctx.moveTo(dx,startY);ctx.lineTo(dx,startY+blockH);ctx.stroke()}
  for(let q=0;q<e.questions;q++){
    const col=Math.floor(q/rows),row=q%rows,baseX=left+col*colW,cy=startY+row*rowH+rowH*.50,bm=responseBubbleMetrics(copies,e.questions,cols,rowH,colW,w,e.options);
    ctx.fillStyle=dark;ctx.font=`700 ${Math.max(10,physicalPx(copies>=3?3.3:3.8,copies,w))}px Arial`;ctx.textAlign='right';ctx.fillText(String(q+1),baseX+colW*bm.numberOffset,cy+physicalPx(1.35,copies,w));
    const optionStart=baseX+colW*bm.optionStartRatio,optionGap=bm.optionGap,r=bm.radius*(v.size/124);
    for(let o=0;o<e.options;o++){
      const cx=optionStart+o*optionGap;ctx.strokeStyle='rgb(120,120,120)';ctx.lineWidth=Math.max(1.2,physicalPx(.34,copies,w)*v.stroke/145);ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='rgb(80,80,80)';ctx.font=`500 ${Math.max(8,r*.94*(v.text/140))}px Arial`;ctx.textAlign='center';ctx.fillText(letters[o],cx,cy+r*.34);
    }
  }
  ctx.fillStyle='rgb(70,70,70)';ctx.textAlign='center';ctx.font=`600 ${Math.max(7,physicalPx(copies>=3?1.9:2.15,copies,w))}px Arial`;ctx.fillText('EvalúaCam · No cubra los cuadrados ni las barras',w/2,h*g.footerY);
  ctx.restore();
}
$('#downloadSheetImageBtn').onclick=()=>{
  const base=selectedSheetExam();if(!base)return toast('Primero seleccione una evaluación.');
  const cfg=state.settings.print||{},copies=+($('#copiesPerPage').value||cfg.copies||1),exam=getConfiguredRenderExam(base);
  const canvas=createLetterSheetCanvas(exam,copies,2550);
  canvas.toBlob(blob=>{if(!blob)return toast('No fue posible generar la imagen.');const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`hoja_${exam.name.replace(/[^a-z0-9áéíóúñ]+/gi,'_')}_${copies}xCarta_HD.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('PNG Carta generado exactamente igual a la vista previa.')},'image/png');
};
applyProfile('auto');
function currentScanCopies(){
  const raw=Number(state.scanCopies??state.settings.scanCopies??0);
  return [0,1,2,3,4].includes(raw)?raw:0;
}
function scanAspectCandidates(mode=currentScanCopies()){
  const values=mode?[mode]:[1,2,3,4];
  return values.map(copies=>({copies,aspect:responseSheetAspectForCopies(copies)}));
}
function markerSpecsForAspect(aspect,copies=1){
  const g=sheetGeometryForCopies(copies),xLeft=g.markerX+g.marker/2;
  const xRight=1-xLeft;
  const top=g.markerTop+g.marker*aspect/2;
  const mid=g.markerMid;
  const bottom=g.markerBottom-g.marker*aspect/2;
  return [
    {id:'tl',x:xLeft,y:top},{id:'tr',x:xRight,y:top},
    {id:'ml',x:xLeft,y:mid},{id:'mr',x:xRight,y:mid},
    {id:'bl',x:xLeft,y:bottom},{id:'br',x:xRight,y:bottom}
  ];
}
function setScanGuide(status,message){
  const frame=$('#scanFrame'),label=$('#scanGuideLabel');
  if(!frame)return;
  frame.classList.remove('scan-searching','scan-adjust','scan-ready','scan-capturing');
  frame.classList.add('scan-'+status);
  if(label)label.textContent=message;
  const live=$('.scan-live-auto span');
  if(live)live.textContent=status==='ready'?'Lista':status==='capturing'?'Capturando':'Automatico';
}
function resizeScanOverlay(){
  const stage=$('#cameraStage'),overlay=$('#scanOverlay');
  if(!stage||!overlay)return;
  const dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);
  if(overlay.width!==Math.round(w*dpr)||overlay.height!==Math.round(h*dpr)){
    overlay.width=Math.round(w*dpr);overlay.height=Math.round(h*dpr);overlay.style.width=w+'px';overlay.style.height=h+'px';
  }
}
function clearScanOverlay(){
  const overlay=$('#scanOverlay');if(!overlay)return;resizeScanOverlay();overlay.getContext('2d').clearRect(0,0,overlay.width,overlay.height);
}
function videoNormalizedToStage(point){
  const stage=$('#cameraStage'),video=$('#video');
  if(!stage||!video?.videoWidth)return null;
  const sw=stage.clientWidth,sh=stage.clientHeight,vw=video.videoWidth,vh=video.videoHeight,scale=Math.max(sw/vw,sh/vh),ox=(sw-vw*scale)/2,oy=(sh-vh*scale)/2;
  return {x:ox+point.x*vw*scale,y:oy+point.y*vh*scale};
}
function drawScanOverlay(detection){
  const overlay=$('#scanOverlay');if(!overlay)return;resizeScanOverlay();
  const dpr=Math.min(2,window.devicePixelRatio||1),ctx=overlay.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,overlay.width,overlay.height);ctx.setTransform(dpr,0,0,dpr,0,0);
  if(!detection?.corners?.length)return;
  const corners=detection.corners.map(videoNormalizedToStage);if(corners.some(p=>!p))return;
  const ready=detection.captureReady,color=ready?'#22c55e':'#f59e0b';
  ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle='rgba(0,0,0,.55)';ctx.lineWidth=8;ctx.beginPath();corners.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();
  ctx.strokeStyle=color;ctx.lineWidth=4;ctx.beginPath();corners.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();
  (detection.markers||[]).filter(Boolean).forEach(p=>{const q=videoNormalizedToStage(p);if(!q)return;ctx.fillStyle='rgba(0,0,0,.62)';ctx.beginPath();ctx.arc(q.x,q.y,11,0,Math.PI*2);ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(q.x,q.y,8,0,Math.PI*2);ctx.stroke()});
  const top=corners.reduce((a,p)=>p.y<a.y?p:a,corners[0]);ctx.font='700 14px system-ui, sans-serif';ctx.textAlign='center';const text=ready?'Hoja detectada':'Mantenga la hoja completa visible',tw=ctx.measureText(text).width+26,tx=(corners[0].x+corners[1].x)/2,ty=Math.max(70,top.y-24);ctx.fillStyle='rgba(15,23,42,.82)';ctx.fillRect(tx-tw/2,ty-20,tw,30);ctx.fillStyle='#fff';ctx.fillText(text,tx,ty);
}
function updateScanGuideGeometry(){
  const frame=$('#scanFrame');if(!frame)return;
  frame.style.width='88%';frame.style.height='80%';frame.dataset.copies=String(currentScanCopies());
  const mode=currentScanCopies(),format=mode===0?'Deteccion automatica de formato':mode===4?'4 por pagina - cuadrícula 2×2':mode===3?'3 por pagina - cuadrícula cámara-segura':mode===2?'2 por pagina - Carta horizontal':'1 por pagina - Carta vertical';
  if($('#scanLiveFormat'))$('#scanLiveFormat').textContent=format;
  resizeScanOverlay();
}
function prepareScanScreen(){
  const select=$('#scanTemplateCopies');if(!select)return;
  const wanted=String(currentScanCopies());if([...select.options].some(o=>o.value===wanted))select.value=wanted;else select.value='0';
  state.scanCopies=Number(select.value);requestAnimationFrame(updateScanGuideGeometry);
}
function drawVideoFrame(video,canvas,targetLong=960){
  if(!video?.videoWidth||!video?.videoHeight)return false;
  const vw=video.videoWidth,vh=video.videoHeight,scale=Math.min(1,targetLong/Math.max(vw,vh));
  canvas.width=Math.max(320,Math.round(vw*scale));canvas.height=Math.max(240,Math.round(vh*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(video,0,0,vw,vh,0,0,canvas.width,canvas.height);return true;
}
function resetAutoScan(){
  state.autoScanLocked=false;state.autoScanStable=0;state.autoScanLost=0;state.autoScanLast=null;state.autoScanBusy=false;state.autoScanDetection=null;state.autoScanLastGood=null;state.autoScanFrameCount=0;state.scanStableSince=0;state.scanDetectionHistory=[];clearScanOverlay();
}
function stopCamera(showMessage=false){
  if(state.autoScanTimer){clearTimeout(state.autoScanTimer);state.autoScanTimer=null}
  if(state.stream){state.stream.getTracks().forEach(t=>t.stop());state.stream=null}
  resetAutoScan();document.body.classList.remove('scan-live');$('#cameraStage')?.classList.remove('is-live');const toolbar=$('.scan-live-toolbar');if(toolbar)toolbar.setAttribute('aria-hidden','true');if($('#video'))$('#video').srcObject=null;$('#cameraPlaceholder')?.classList.remove('hidden');if($('#captureBtn'))$('#captureBtn').disabled=true;setScanGuide('searching','Coloque aproximadamente cada esquina de la hoja dentro de los cuatro visores grandes');if(showMessage)toast('Camara cerrada.');
}
function captureCurrentVideo(auto=false){
  const video=$('#video'),canvas=$('#captureCanvas');if(!video?.videoWidth||state.autoScanBusy)return;
  state.autoScanBusy=true;setScanGuide('capturing',auto?'Hoja detectada - capturando automaticamente...':'Procesando captura...');
  if(!drawVideoFrame(video,canvas,2400)){state.autoScanBusy=false;setScanGuide('adjust','No se pudo obtener la imagen de la camara');return}
  let ok=false;try{ok=processImage(canvas,state.autoScanLastGood)===true}catch(err){console.error(err);toast('No fue posible procesar la captura.');ok=false}
  if(ok){setTimeout(()=>stopCamera(false),350)}else setTimeout(()=>{state.autoScanBusy=false;state.autoScanLocked=false;state.autoScanStable=0;setScanGuide('searching','Vuelva a mostrar la hoja completa')},500);
}
async function startCamera(){
  try{
    stopCamera(false);
    state.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:2560},height:{ideal:1920},frameRate:{ideal:30,min:15}},audio:false});
    const video=$('#video');video.srcObject=state.stream;await video.play();
    const track=state.stream.getVideoTracks()[0];
    try{const caps=track.getCapabilities?.()||{},advanced={};if(caps.focusMode?.includes('continuous'))advanced.focusMode='continuous';if(caps.exposureMode?.includes('continuous'))advanced.exposureMode='continuous';if(caps.whiteBalanceMode?.includes('continuous'))advanced.whiteBalanceMode='continuous';if(caps.zoom&&Number.isFinite(caps.zoom.min))advanced.zoom=caps.zoom.min;if(Object.keys(advanced).length)await track.applyConstraints({advanced:[advanced]})}catch(err){console.debug('Camera tuning unavailable',err)}
    $('#cameraPlaceholder').classList.add('hidden');$('#captureBtn').disabled=false;document.body.classList.add('scan-live');$('#cameraStage').classList.add('is-live');$('.scan-live-toolbar')?.setAttribute('aria-hidden','false');resetAutoScan();state.scanStartedAt=Date.now();setScanGuide('searching','Muestre la hoja completa. La captura esperará enfoque y estabilidad.');requestAnimationFrame(()=>{updateScanGuideGeometry();scheduleAutoScan()});toast('Cámara activa: acerque la hoja a los cuatro visores. No requiere precisión milimétrica.');
  }catch(err){console.error(err);stopCamera(false);toast('No fue posible abrir la camara. Revise los permisos y use HTTPS.')}
}
$('#startCameraBtn').onclick=startCamera;$('#captureBtn').onclick=()=>captureCurrentVideo(false);$('#exitCameraBtn').onclick=()=>stopCamera(true);
$('#scanTemplateCopies').onchange=e=>{state.scanCopies=Number(e.target.value);state.settings.scanCopies=state.scanCopies;save();resetAutoScan();updateScanGuideGeometry();setScanGuide('searching','Acerque la hoja: busco automáticamente sus cuatro esquinas')};
window.addEventListener('resize',()=>requestAnimationFrame(updateScanGuideGeometry));document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.stream)stopCamera(false)});
$('#imageUpload').onchange=e=>{const file=e.target.files[0];if(!file)return;const img=new Image();img.onload=()=>{const c=$('#captureCanvas');c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);processImage(c,null);URL.revokeObjectURL(img.src)};img.src=URL.createObjectURL(file)};
function enhanceImageData(img){
  if(!$('#autoEnhanceScan').checked)return img;
  const d=img.data;let min=255,max=0;for(let i=0;i<d.length;i+=16){const g=d[i]*.299+d[i+1]*.587+d[i+2]*.114;min=Math.min(min,g);max=Math.max(max,g)}
  const range=Math.max(35,max-min);for(let i=0;i<d.length;i+=4){let g=(d[i]*.299+d[i+1]*.587+d[i+2]*.114-min)*255/range;g=g<155?Math.max(0,g*.74):Math.min(255,126+(g-126)*1.2);d[i]=d[i+1]=d[i+2]=g}return img;
}
function downscaleCanvas(source,maxW=900,maxH=1200){
  const scale=Math.min(1,maxW/source.width,maxH/source.height),c=document.createElement('canvas');c.width=Math.max(1,Math.round(source.width*scale));c.height=Math.max(1,Math.round(source.height*scale));const x=c.getContext('2d',{willReadFrequently:true});x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(source,0,0,c.width,c.height);return c;
}
function frameImageQuality(data){
  const w=data.width,h=data.height,d=data.data,step=Math.max(2,Math.round(Math.min(w,h)/220));let n=0,sum=0,sum2=0,edges=0,edgeN=0;
  for(let y=step;y<h-step;y+=step)for(let x=step;x<w-step;x+=step){const i=(y*w+x)*4,g=d[i]*.299+d[i+1]*.587+d[i+2]*.114,ir=(y*w+x+step)*4,id=((y+step)*w+x)*4,gr=d[ir]*.299+d[ir+1]*.587+d[ir+2]*.114,gd=d[id]*.299+d[id+1]*.587+d[id+2]*.114;n++;sum+=g;sum2+=g*g;edges+=Math.abs(g-gr)+Math.abs(g-gd);edgeN+=2}
  const mean=sum/Math.max(1,n),contrast=Math.sqrt(Math.max(0,sum2/Math.max(1,n)-mean*mean)),sharpness=edges/Math.max(1,edgeN);return {mean,contrast,sharpness,lightOk:mean>25&&mean<254,contrastOk:contrast>14,sharpOk:sharpness>2.0};
}
function imageDataToGray(img){const d=img.data,g=new Uint8Array(img.width*img.height);for(let i=0,j=0;i<d.length;i+=4,j++)g[j]=Math.round(d[i]*.299+d[i+1]*.587+d[i+2]*.114);return g}
function otsuThreshold(gray){const hist=new Uint32Array(256);for(let i=0;i<gray.length;i++)hist[gray[i]]++;let sum=0;for(let i=0;i<256;i++)sum+=i*hist[i];let sumB=0,wB=0,best=110,bestVar=-1;for(let t=0;t<256;t++){wB+=hist[t];if(!wB)continue;const wF=gray.length-wB;if(!wF)break;sumB+=t*hist[t];const mB=sumB/wB,mF=(sum-sumB)/wF,v=wB*wF*(mB-mF)*(mB-mF);if(v>bestVar){bestVar=v;best=t}}return best}
function clamp01(v){return Math.max(0,Math.min(1,v))}
function componentMarkerCandidates(gray,w,h,threshold){
  const n=w*h,mask=new Uint8Array(n),stack=new Int32Array(n);for(let i=0;i<n;i++)if(gray[i]<threshold)mask[i]=1;
  const minArea=Math.max(10,n*.000018),maxArea=n*.018,candidates=[];
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const start=y*w+x;if(mask[start]!==1)continue;let head=0,tail=0;stack[tail++]=start;mask[start]=2;let count=0,sumX=0,sumY=0,sumG=0,minX=x,maxX=x,minY=y,maxY=y;
    while(head<tail){const p=stack[head++],py=Math.floor(p/w),px=p-py*w;count++;sumX+=px;sumY+=py;sumG+=gray[p];if(px<minX)minX=px;if(px>maxX)maxX=px;if(py<minY)minY=py;if(py>maxY)maxY=py;
      const y0=Math.max(0,py-1),y1=Math.min(h-1,py+1),x0=Math.max(0,px-1),x1=Math.min(w-1,px+1);for(let ny=y0;ny<=y1;ny++)for(let nx=x0;nx<=x1;nx++){const q=ny*w+nx;if(mask[q]===1){mask[q]=2;stack[tail++]=q}}
    }
    const bw=maxX-minX+1,bh=maxY-minY+1,boxArea=bw*bh;if(boxArea<minArea||boxArea>maxArea||bw<4||bh<4)continue;
    const ratio=bw/bh,fill=count/boxArea;if(ratio<.45||ratio>2.2||fill<.42)continue;
    const pad=Math.max(2,Math.round(Math.max(bw,bh)*.7)),ox0=Math.max(0,minX-pad),ox1=Math.min(w-1,maxX+pad),oy0=Math.max(0,minY-pad),oy1=Math.min(h-1,maxY+pad);let outerSum=0,outerN=0,lightN=0;
    const sampleStep=Math.max(1,Math.floor(Math.max(bw,bh)/12));for(let yy=oy0;yy<=oy1;yy+=sampleStep)for(let xx=ox0;xx<=ox1;xx+=sampleStep){if(xx>=minX&&xx<=maxX&&yy>=minY&&yy<=maxY)continue;const value=gray[yy*w+xx];outerSum+=value;outerN++;if(value>threshold+24)lightN++}
    const innerMean=sumG/count,outerMean=outerSum/Math.max(1,outerN),contrast=outerMean-innerMean,isolation=lightN/Math.max(1,outerN),square=Math.exp(-Math.abs(Math.log(ratio))*1.45),quality=clamp01((fill-.35)/.55)*square*clamp01((contrast-12)/95)*(.45+.55*isolation);
    if(contrast<14||quality<.08)continue;
    candidates.push({x:sumX/count,y:sumY/count,bw,bh,size:Math.sqrt(boxArea),fill,ratio,contrast,isolation,innerMean,outerMean,quality,score:Math.sqrt(boxArea)*quality,threshold});
  }
  return candidates;
}
function mergeMarkerCandidates(list){
  const merged=[];list.sort((a,b)=>b.score-a.score);for(const c of list){let hit=null;for(const m of merged){const dist=Math.hypot(c.x-m.x,c.y-m.y),limit=Math.max(3,Math.min(c.size,m.size)*.62),ratio=Math.max(c.size,m.size)/Math.max(1,Math.min(c.size,m.size));if(dist<limit&&ratio<2.1){hit=m;break}}if(!hit)merged.push({...c});else if(c.score>hit.score)Object.assign(hit,c)}return merged.sort((a,b)=>b.score-a.score).slice(0,52);
}
function detectMarkerCandidates(img){
  const gray=imageDataToGray(img),otsu=otsuThreshold(gray),thresholds=[Math.max(65,Math.min(145,otsu)),Math.max(90,Math.min(178,otsu+30)),155].filter((v,i,a)=>a.indexOf(v)===i),all=[];for(const t of thresholds)all.push(...componentMarkerCandidates(gray,img.width,img.height,t));return {gray,candidates:mergeMarkerCandidates(all),otsu};
}
function pointDistance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function polygonArea(points){let sum=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];sum+=a.x*b.y-b.x*a.y}return sum/2}
function isConvexQuad(points){let sign=0;for(let i=0;i<4;i++){const a=points[i],b=points[(i+1)%4],c=points[(i+2)%4],cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);if(Math.abs(cross)<1e-5)return false;const s=Math.sign(cross);if(sign&&s!==sign)return false;sign=s}return true}
function findMiddleMarker(a,b,candidates,excluded){
  const vx=b.x-a.x,vy=b.y-a.y,len=Math.hypot(vx,vy),len2=len*len,tol=Math.max(4,len*.06);let best=null;
  for(const c of candidates){if(excluded.has(c))continue;const t=((c.x-a.x)*vx+(c.y-a.y)*vy)/len2;if(t<.24||t>.76)continue;const perp=Math.abs(vy*(c.x-a.x)-vx*(c.y-a.y))/len;if(perp>tol)continue;const sizeRatio=Math.max(c.size,(a.size+b.size)/2)/Math.max(1,Math.min(c.size,(a.size+b.size)/2));if(sizeRatio>2.6)continue;const score=clamp01(1-perp/tol)*.38+clamp01(1-Math.abs(t-.5)/.28)*.27+clamp01(1-Math.abs(Math.log(sizeRatio))/.95)*.18+c.quality*.17;if(!best||score>best.score)best={point:c,t,perp,score};
  }
  return best;
}
function buildSideHypotheses(candidates,w,h){
  const points=candidates.slice(0,42),minLen=Math.min(w,h)*.15,diag=Math.hypot(w,h),sides=[];
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){const a=points[i],b=points[j],len=pointDistance(a,b);if(len<minLen||len>diag*.98)continue;const sizeRatio=Math.max(a.size,b.size)/Math.max(1,Math.min(a.size,b.size));if(sizeRatio>2.8)continue;const mid=findMiddleMarker(a,b,points,new Set([a,b])),score=len/diag*.34+(a.quality+b.quality)*.22+(mid?mid.score*.34:.04);sides.push({a,b,mid:mid?.point||null,midScore:mid?.score||0,len,score})}
  return sides.sort((a,b)=>b.score-a.score).slice(0,180);
}
function solveLinear(A,b){const n=b.length;for(let i=0;i<n;i++){let m=i;for(let j=i+1;j<n;j++)if(Math.abs(A[j][i])>Math.abs(A[m][i]))m=j;[A[i],A[m]]=[A[m],A[i]];[b[i],b[m]]=[b[m],b[i]];const p=A[i][i];if(Math.abs(p)<1e-10)return null;for(let k=i;k<n;k++)A[i][k]/=p;b[i]/=p;for(let j=0;j<n;j++)if(j!==i){const f=A[j][i];for(let k=i;k<n;k++)A[j][k]-=f*A[i][k];b[j]-=f*b[i]}}return b}
function homographyLeastSquares(canonical,source){
  if(canonical.length<4||canonical.length!==source.length)return null;const rows=[],values=[];for(let i=0;i<canonical.length;i++){const u=canonical[i].x,v=canonical[i].y,x=source[i].x,y=source[i].y;rows.push([u,v,1,0,0,0,-u*x,-v*x]);values.push(x);rows.push([0,0,0,u,v,1,-u*y,-v*y]);values.push(y)}
  const ata=Array.from({length:8},()=>Array(8).fill(0)),atb=Array(8).fill(0);for(let r=0;r<rows.length;r++)for(let i=0;i<8;i++){atb[i]+=rows[r][i]*values[r];for(let j=0;j<8;j++)ata[i][j]+=rows[r][i]*rows[r][j]}return solveLinear(ata,atb);
}
function mapHomography(H,u,v){const den=H[6]*u+H[7]*v+1;if(Math.abs(den)<1e-9)return null;return {x:(H[0]*u+H[1]*v+H[2])/den,y:(H[3]*u+H[4]*v+H[5])/den}}
function sampleMappedDarkRatio(img,H,u0,v0,u1,v1,cols=18,rows=64){let dark=0,total=0;for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const u=u0+(u1-u0)*(i+.5)/cols,v=v0+(v1-v0)*(j+.5)/rows,p=mapHomography(H,u,v);if(!p)continue;const x=Math.round(p.x),y=Math.round(p.y);if(x<0||y<0||x>=img.width||y>=img.height)continue;const k=(y*img.width+x)*4,g=img.data[k]*.299+img.data[k+1]*.587+img.data[k+2]*.114;if(g<150)dark++;total++}return total?dark/total:0}
function timingSignatureEvidence(img,H,copies=1){
  const g=sheetGeometryForCopies(copies),pattern=activeTimingPattern(),x=g.timingX,y0=g.timingTop,step=g.timingStep,barH=g.timingBarH,mark=g.marker;let sum=0,min=1;
  for(let i=0;i<pattern.length;i++){
    const f=pattern[i],y=y0+i*step,dark=sampleMappedDarkRatio(img,H,x+mark*.03,y-barH*.10,x+mark*Math.max(.14,f-.045),y+barH*1.10,14,5),tail=sampleMappedDarkRatio(img,H,x+mark*Math.min(1.02,f+.06),y-barH*.10,x+mark*1.12,y+barH*1.10,8,5),gap=sampleMappedDarkRatio(img,H,x-mark*.03,y+barH*1.20,x+mark*1.12,y+step*.72,11,3),darkScore=clamp01((dark-.14)/.54),tailScore=clamp01((.36-tail)/.36),gapScore=clamp01((.31-gap)/.31),score=darkScore*(.72+.18*tailScore+.10*gapScore);sum+=score;min=Math.min(min,score);
  }
  const average=sum/pattern.length;return {score:average*.90+min*.10,average,min};
}
function orientationEvidence(img,H,copies=1){
  const g=sheetGeometryForCopies(copies),y1=Math.min(.94,g.timingTop+g.timingStep*10+g.timingBarH),x0=Math.max(.004,g.timingX-g.marker*.08),x1=Math.min(.15,g.timingX+g.marker*1.18),rx0=1-x1,rx1=1-x0;
  const expected=sampleMappedDarkRatio(img,H,x0,g.timingTop-g.timingBarH,x1,y1),controls=[sampleMappedDarkRatio(img,H,rx0,g.timingTop-g.timingBarH,rx1,y1),sampleMappedDarkRatio(img,H,x0,.16,x1,.40),sampleMappedDarkRatio(img,H,rx0,.16,rx1,.40)],other=Math.max(...controls),raw=expected-other*.82,signature=timingSignatureEvidence(img,H,copies),evidence=clamp01((raw-.012)/.14)*.35+signature.score*.65;return {expected,other,raw,signature:signature.score,signatureMin:signature.min,evidence};
}
function orientationMappings(pattern,aspect,copies=1){
  const specs=markerSpecsForAspect(aspect,copies),byId=Object.fromEntries(specs.map(p=>[p.id,p])),a0=pattern.a0,a1=pattern.a1,am=pattern.am,b0=pattern.b0,b1=pattern.b1,bm=pattern.bm;
  const make=(lt,lm,lb,rt,rm,rb)=>{const pairs=[];for(const [id,p] of [['tl',lt],['tr',rt],['ml',lm],['mr',rm],['bl',lb],['br',rb]])if(p)pairs.push({id,canonical:{x:byId[id].x,y:byId[id].y},source:{x:p.x,y:p.y}});return pairs};
  return [make(a0,am,a1,b0,bm,b1),make(b0,bm,b1,a0,am,a1),make(a1,am,a0,b1,bm,b0),make(b1,bm,b0,a1,am,a0)];
}
function findBestMarkerPattern(candidates,img,aspectOptions){
  const w=img.width,h=img.height,sides=buildSideHypotheses(candidates,w,h),patterns=[];
  for(let i=0;i<sides.length;i++)for(let j=i+1;j<sides.length;j++){
    const A=sides[i],B=sides[j];if(A.a===B.a||A.a===B.b||A.b===B.a||A.b===B.b)continue;
    let a0=A.a,a1=A.b,b0=B.a,b1=B.b,bm=B.mid;const same=pointDistance(a0,b0)+pointDistance(a1,b1),flip=pointDistance(a0,b1)+pointDistance(a1,b0);if(flip<same){[b0,b1]=[b1,b0]}
    const quad=[a0,b0,b1,a1];if(!isConvexQuad(quad))continue;const signed=polygonArea(quad),area=Math.abs(signed),coverage=area/(w*h);if(coverage<.025)continue;
    const lenA=pointDistance(a0,a1),lenB=pointDistance(b0,b1),topW=pointDistance(a0,b0),bottomW=pointDistance(a1,b1),avgH=(lenA+lenB)/2,avgW=(topW+bottomW)/2;if(Math.min(avgH,avgW)<Math.min(w,h)*.09)continue;
    const av={x:(a1.x-a0.x)/lenA,y:(a1.y-a0.y)/lenA},bv={x:(b1.x-b0.x)/lenB,y:(b1.y-b0.y)/lenB},dot=Math.max(-1,Math.min(1,av.x*bv.x+av.y*bv.y)),angle=Math.acos(dot);if(angle>.78)continue;
    const sideRatio=Math.max(lenA,lenB)/Math.max(1,Math.min(lenA,lenB)),widthRatio=Math.max(topW,bottomW)/Math.max(1,Math.min(topW,bottomW));if(sideRatio>2.35||widthRatio>2.75)continue;
    const observedAspect=avgW/avgH;let bestFormat=null;for(const option of aspectOptions){const err=Math.abs(Math.log(observedAspect/option.aspect));if(!bestFormat||err<bestFormat.error)bestFormat={...option,error:err}}if(!bestFormat||bestFormat.error>1.18)continue;
    const midA=A.mid,midB=bm,midCount=(midA?1:0)+(midB?1:0),markerSet=[a0,a1,b0,b1,midA,midB].filter(Boolean),sizes=markerSet.map(p=>p.size),allSizeRatio=Math.max(...sizes)/Math.max(1,Math.min(...sizes)),sizeScore=Math.exp(-Math.abs(Math.log(allSizeRatio))*1.55),markerBackground=markerSet.reduce((s,p)=>s+(p.outerMean||0),0)/markerSet.length,coverageScore=clamp01((coverage-.025)/.42),angleScore=clamp01(1-angle/.78),sideScore=clamp01(1-Math.abs(Math.log(sideRatio))/.86),widthScore=clamp01(1-Math.abs(Math.log(widthRatio))/1.02),aspectScore=Math.exp(-bestFormat.error*1.65),markerQuality=markerSet.reduce((s,p)=>s+p.quality,0)/(4+midCount),midScore=midCount/2,geom=.25*coverageScore+.11*angleScore+.07*sideScore+.06*widthScore+.12*aspectScore+.11*markerQuality+.10*midScore+.18*sizeScore;
    patterns.push({a0,a1,am:midA,b0,b1,bm:midB,coverage,observedAspect,format:bestFormat,markerCount:4+midCount,markerBackground,geom,quad});
  }
  patterns.sort((a,b)=>b.geom-a.geom);let best=null;
  for(const p of patterns.slice(0,18))for(const mapping of orientationMappings(p,p.format.aspect,p.format.copies)){
    const H=homographyLeastSquares(mapping.map(x=>x.canonical),mapping.map(x=>x.source));if(!H)continue;const orientation=orientationEvidence(img,H,p.format.copies),confidence=clamp01(p.geom*.74+orientation.evidence*.20+(p.markerCount/6)*.06),score=confidence+orientation.raw*.7;if(!best||score>best.score)best={...p,mapping,H,orientation,confidence,score};
  }
  return best;
}
function detectSheetOnCanvas(canvas,maxW=860,maxH=1180){
  const src=downscaleCanvas(canvas,maxW,maxH),ctx=src.getContext('2d',{willReadFrequently:true}),img=ctx.getImageData(0,0,src.width,src.height),frameQuality=frameImageQuality(img),markerData=detectMarkerCandidates(img),pattern=findBestMarkerPattern(markerData.candidates,img,scanAspectCandidates());
  if(!pattern)return {ok:false,src,img,frameQuality,candidates:markerData.candidates,markerCount:0,confidence:0};
  const sourceById=Object.fromEntries(pattern.mapping.map(p=>[p.id,p.source])),normalize=p=>p?({x:p.x/src.width,y:p.y/src.height}):null,markers=['tl','tr','ml','mr','bl','br'].map(id=>normalize(sourceById[id])),corners=[markers[0],markers[1],markers[5],markers[4]],canonicalSources=pattern.mapping.map(p=>({id:p.id,u:p.canonical.x,v:p.canonical.y,x:p.source.x/src.width,y:p.source.y/src.height})),paperEvidence=pattern.markerBackground>205||pattern.markerBackground-frameQuality.mean>22,timingVerified=pattern.orientation.signature>.48||(pattern.orientation.raw>.15&&pattern.orientation.expected>.15),captureReady=pattern.confidence>.34&&pattern.coverage>.032&&paperEvidence&&pattern.markerCount>=4;
  return {ok:pattern.confidence>.28,src,img,frameQuality,candidates:markerData.candidates,markers,corners,canonicalSources,markerCount:pattern.markerCount,confidence:pattern.confidence,coverage:pattern.coverage,markerBackground:pattern.markerBackground,paperEvidence,timingScore:pattern.orientation.raw,timingDensity:pattern.orientation.expected,timingSignature:pattern.orientation.signature,timingVerified,captureReady,copies:pattern.format.copies,aspect:pattern.format.aspect,sourceAspect:src.width/src.height};
}
function scheduleAutoScan(delay=115){
  if(state.autoScanTimer)clearTimeout(state.autoScanTimer);
  if(state.stream)state.autoScanTimer=setTimeout(autoScanStep,delay);
}
function autoScanStep(){
  const video=$('#video');
  if(!state.stream||!video?.videoWidth)return;
  if(state.autoScanBusy){scheduleAutoScan(90);return}
  const probe=state.scanProbeCanvas||(state.scanProbeCanvas=document.createElement('canvas'));
  if(!drawVideoFrame(video,probe,960)){setScanGuide('adjust','No se pudo leer el video');scheduleAutoScan(180);return}
  const d=detectSheetOnCanvas(probe,920,1220);d.timestamp=Date.now();state.autoScanFrameCount++;state.autoScanDetection=d;drawScanOverlay(d.ok?d:null);
  if(!d.ok){
    state.autoScanStable=0;state.scanStableSince=0;state.autoScanLast=null;state.autoScanLost++;
    const found=d.candidates?.length||0,issue=!d.frameQuality.lightOk?'Mejore la iluminación':!d.frameQuality.contrastOk?'Use un fondo que contraste con el papel':found?'Muestre la hoja completa y sin cubrir los marcadores':'Buscando la hoja… acérquela lentamente';
    setScanGuide('searching',issue);if(state.autoScanLost>=3)state.autoScanLocked=false;scheduleAutoScan(160);return;
  }
  state.autoScanLost=0;state.autoScanLastGood=d;
  const norm=d.corners;let movement=1;if(state.autoScanLast)movement=Math.max(...norm.map((p,i)=>Math.hypot(p.x-state.autoScanLast[i].x,p.y-state.autoScanLast[i].y)));state.autoScanLast=norm.map(p=>({...p}));
  const sharpEnough=d.frameQuality.sharpness>1.55;
  const geometryStrong=d.captureReady&&d.confidence>.48&&d.coverage>.045&&d.markerCount>=5&&d.paperEvidence&&d.timingSignature>.44;
  const stableEnough=movement<.026;
  if(!geometryStrong||!sharpEnough||!stableEnough){
    state.autoScanStable=0;state.scanStableSince=0;
    const msg=!sharpEnough?'Hoja detectada: espere que la cámara enfoque':d.markerCount<5?`${d.markerCount} de 6 marcadores: muestre un poco más de la hoja`:d.timingSignature<=.44?'Acerque ligeramente para leer la firma de la prueba':d.coverage<=.045?'Acerque un poco la cámara':!stableEnough?'Mantenga el teléfono quieto':'Ajuste suavemente el encuadre';
    setScanGuide('adjust',msg);scheduleAutoScan(115);return;
  }
  const now=Date.now();
  if(!state.scanStableSince)state.scanStableSince=now;
  state.autoScanStable++;
  state.scanDetectionHistory.push({t:now,confidence:d.confidence,movement,sharpness:d.frameQuality.sharpness,markers:d.markerCount});
  state.scanDetectionHistory=state.scanDetectionHistory.filter(x=>now-x.t<1800);
  const stableMs=now-state.scanStableSince;
  const requiredMs=d.confidence>.68&&d.markerCount===6?950:1350;
  const requiredFrames=d.confidence>.68&&d.markerCount===6?6:9;
  const remaining=Math.max(0,requiredMs-stableMs);
  const ready=stableMs>=requiredMs&&state.autoScanStable>=requiredFrames&&now-state.scanStartedAt>1200;
  setScanGuide('ready',ready?'Encuadre estable: capturando…':`Mantenga quieto ${Math.max(1,Math.ceil(remaining/250))}`);
  if($('#autoCaptureScan')?.checked!==false&&!state.autoScanLocked&&ready){
    state.autoScanLocked=true;state.scanLastCaptureAt=now;navigator.vibrate?.(25);setScanGuide('capturing','Enfoque confirmado. Capturando…');
    setTimeout(()=>captureCurrentVideo(true),220);return;
  }
  scheduleAutoScan(105);
}
function warpCanvasByHomography(source,H,outW,outH){
  const sw=source.width,sh=source.height,sctx=source.getContext('2d',{willReadFrequently:true}),sd=sctx.getImageData(0,0,sw,sh).data,out=document.createElement('canvas');out.width=outW;out.height=outH;const octx=out.getContext('2d'),od=octx.createImageData(outW,outH),dst=od.data;
  for(let y=0;y<outH;y++){const v=y/(outH-1);for(let x=0;x<outW;x++){const u=x/(outW-1),p=mapHomography(H,u,v),di=(y*outW+x)*4;if(!p){dst[di]=dst[di+1]=dst[di+2]=255;dst[di+3]=255;continue}const sx=Math.max(0,Math.min(sw-1.001,p.x)),sy=Math.max(0,Math.min(sh-1.001,p.y)),x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(sw-1,x0+1),y1=Math.min(sh-1,y0+1),fx=sx-x0,fy=sy-y0,i00=(y0*sw+x0)*4,i10=(y0*sw+x1)*4,i01=(y1*sw+x0)*4,i11=(y1*sw+x1)*4;for(let c=0;c<3;c++){const top=sd[i00+c]*(1-fx)+sd[i10+c]*fx,bottom=sd[i01+c]*(1-fx)+sd[i11+c]*fx;dst[di+c]=top*(1-fy)+bottom*fy}dst[di+3]=255}}
  octx.putImageData(od,0,0);return out;
}
function rectifiedTimingScore(canvas,copies=1){const ctx=canvas.getContext('2d',{willReadFrequently:true}),img=ctx.getImageData(0,0,canvas.width,canvas.height),identity=[canvas.width,0,0,0,canvas.height,0,0,0],e=orientationEvidence(img,identity,copies);return e}
function rectifyFromDetection(canvas,detected){
  if(!detected?.ok||!detected.canonicalSources?.length)return null;
  const canonical=detected.canonicalSources.map(p=>({x:p.u,y:p.v})),source=detected.canonicalSources.map(p=>({x:p.x*canvas.width,y:p.y*canvas.height})),H=homographyLeastSquares(canonical,source);if(!H)return null;
  const outW=920,outH=Math.max(620,Math.min(1900,Math.round(outW/detected.aspect))),out=warpCanvasByHomography(canvas,H,outW,outH),timing=rectifiedTimingScore(out,detected.copies);
  const timingVerified=timing.signature>.36||(timing.raw>.105&&timing.expected>.105);if(detected.paperEvidence===false||timing.expected<.040||timing.raw<.018||!timingVerified){toast('La hoja no corresponde a la evaluación seleccionada o su código único no es legible.');return null;}
  return {canvas:out,quality:detected.confidence,markers:detected.markers,markerCount:detected.markerCount||detected.canonicalSources.length,copies:detected.copies,aspect:detected.aspect,timing};
}
function rectifyByMarkers(canvas,hint=null){
  const hintFresh=hint?.ok&&Date.now()-(hint.timestamp||0)<900&&Math.abs((canvas.width/canvas.height)-(hint.sourceAspect||canvas.width/canvas.height))<.08;
  if(hintFresh){const quick=rectifyFromDetection(canvas,hint);if(quick)return quick}
  const detected=detectSheetOnCanvas(canvas,1000,1350);return rectifyFromDetection(canvas,detected);
}
function bubbleFillScore(data,cx,cy,r){
  let innerSum=0,innerN=0,innerDark=0,bgSum=0,bgN=0;const step=Math.max(1,Math.floor(r/7)),innerR=r*.72,outer0=r*1.18,outer1=r*1.52;
  for(let yy=-outer1;yy<=outer1;yy+=step)for(let xx=-outer1;xx<=outer1;xx+=step){const rr=Math.hypot(xx,yy),px=Math.max(0,Math.min(data.width-1,Math.round(cx+xx))),py=Math.max(0,Math.min(data.height-1,Math.round(cy+yy))),k=(py*data.width+px)*4,g=data.data[k]*.299+data.data[k+1]*.587+data.data[k+2]*.114;if(rr<innerR&&!(Math.abs(xx)<r*.16&&Math.abs(yy)<r*.38)){innerSum+=g;innerN++}else if(rr>outer0&&rr<outer1){bgSum+=g;bgN++}}
  const bg=bgSum/Math.max(1,bgN),inner=innerSum/Math.max(1,innerN);for(let yy=-innerR;yy<=innerR;yy+=step)for(let xx=-innerR;xx<=innerR;xx+=step){const rr=Math.hypot(xx,yy);if(rr>=innerR||Math.abs(xx)<r*.16&&Math.abs(yy)<r*.38)continue;const px=Math.max(0,Math.min(data.width-1,Math.round(cx+xx))),py=Math.max(0,Math.min(data.height-1,Math.round(cy+yy))),k=(py*data.width+px)*4,g=data.data[k]*.299+data.data[k+1]*.587+data.data[k+2]*.114;if(g<bg-26)innerDark++}
  return Math.max(0,bg-inner)+innerDark/Math.max(1,innerN)*68;
}
function robustBubbleScore(data,cx,cy,r){
  const offsets=[[0,0],[-.10,0],[.10,0],[0,-.10],[0,.10]];
  const values=offsets.map(([ox,oy])=>bubbleFillScore(data,cx+ox*r,cy+oy*r,r));
  values.sort((a,b)=>a-b);
  return values[2]*.55+values[3]*.30+values[4]*.15;
}
function median(values){const a=[...values].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function readAnswersFromRectified(rectified,exam){
  const work=rectified.canvas,ctx=work.getContext('2d',{willReadFrequently:true}),w=work.width,h=work.height,data=enhanceImageData(ctx.getImageData(0,0,w,h)),answers=[],scores=[],g=sheetGeometryForCopies(rectified.copies),grid=answerGridForQuestions(exam.questions,rectified.copies),cols=grid.cols,rows=grid.rows,sens=$('#scanSensitivity')?.value||'normal',minScore=sens==='high'?22:sens==='low'?42:30,minGap=sens==='high'?5:sens==='low'?13:8,left=w*g.safeLeft,right=w*g.safeRight,usable=right-left,top=h*g.answerTop,bottom=h*g.answerBottom,colW=usable/cols,availableH=bottom-top,targetPitch=physicalPx(rectified.copies===1?14.0:rectified.copies===2?11.0:7.4,rectified.copies,w),rowH=Math.min(availableH/rows,targetPitch),blockH=rowH*rows,startY=top+Math.max(0,(availableH-blockH)*.16),bubbleScale=Math.max(.80,Math.min(1.35,(+state.settings.print?.bubble||124)/124));
  let ambiguous=0;
  for(let q=0;q<exam.questions;q++){
    const col=Math.floor(q/rows),row=q%rows,baseX=left+col*colW,cy=startY+row*rowH+rowH*.50,bm=responseBubbleMetrics(rectified.copies,exam.questions,cols,rowH,colW,w,exam.options),optionStart=baseX+colW*bm.optionStartRatio,optionGap=bm.optionGap,r=Math.max(7,bm.radius*bubbleScale*.86);
    let best=-1,bestScore=-1,second=-1;const optionScores=[];
    for(let o=0;o<exam.options;o++){
      const score=robustBubbleScore(data,optionStart+o*optionGap,cy,r);optionScores.push(score);
      if(score>bestScore){second=bestScore;bestScore=score;best=o}else if(score>second)second=score;
    }
    const baseline=median(optionScores),confidence=bestScore-second,relative=bestScore-baseline;
    const adaptiveMin=Math.max(minScore,baseline+10),adaptiveGap=Math.max(minGap,Math.min(18,relative*.34));
    const solidRead=bestScore>=adaptiveMin&&confidence>=adaptiveGap&&relative>=12;
    const multiMarked=bestScore>=adaptiveMin&&second>=adaptiveMin*.94&&confidence<adaptiveGap&&relative>=10;
    if(solidRead)answers.push(letters[best]);
    else if(multiMarked){answers.push('*');ambiguous++}
    else{answers.push('');if(bestScore>=adaptiveMin*.78||relative>=8)ambiguous++}
    scores.push({best,bestScore,second,confidence,relative,baseline,optionScores,multiMarked,uncertain:!solidRead||multiMarked});
  }
  return {answers,ambiguous,scores};
}
function cropStudentNameRegion(rectifiedCanvas,exam,copies=1){
  if(!rectifiedCanvas?.width||!rectifiedCanvas?.height||exam?.studentIdMode==='code')return '';
  const w=rectifiedCanvas.width,h=rectifiedCanvas.height,g=sheetGeometryForCopies(copies);
  const x=Math.max(0,Math.round(w*(g.safeLeft-.006)));
  const y=Math.max(0,Math.round(h*(g.fieldTop-.035)));
  const cropW=Math.min(w-x,Math.round(w*(g.safeRight-g.safeLeft+.012)*.68));
  const cropH=Math.min(h-y,Math.round(h*(g.fieldHeight+.055)));
  const out=document.createElement('canvas');out.width=Math.max(720,cropW);out.height=Math.max(150,Math.round(out.width*cropH/cropW));
  const oc=out.getContext('2d');oc.imageSmoothingEnabled=true;oc.imageSmoothingQuality='high';oc.fillStyle='#fff';oc.fillRect(0,0,out.width,out.height);
  oc.drawImage(rectifiedCanvas,x,y,cropW,cropH,0,0,out.width,out.height);
  try{return out.toDataURL('image/jpeg',.90)}catch(_){return ''}
}
function processImage(canvas,hint=null){
  const id=$('#scanExamSelect').value,exam=state.exams.find(x=>x.id===id);if(!exam){toast('Seleccione una prueba.');return false}
  const rectified=rectifyByMarkers(canvas,hint);if(!rectified){setScanGuide('adjust','No se pudo aislar la hoja completa');toast('No se pudo leer la hoja. Muestre la hoja completa, sin cubrir los marcadores, y vuelva a intentarlo.');return false}
  const reading=readAnswersFromRectified(rectified,exam);
  try{state.lastScanCaptureDataUrl=rectified.canvas.toDataURL('image/jpeg',0.88);state.lastStudentNameCropDataUrl=cropStudentNameRegion(rectified.canvas,exam,rectified.copies)}catch(err){state.lastScanCaptureDataUrl='';state.lastStudentNameCropDataUrl=''}
  state.lastReadDiagnostics={ambiguous:reading.ambiguous,alignment:rectified.quality,copies:rectified.copies,markerCount:rectified.markerCount,scores:reading.scores};showScanResult(exam,reading.answers,true,rectified.markerCount);toast('Hoja detectada y corregida automaticamente.');return true;
}
window.EvaluaCamOMR={detectSheetOnCanvas,rectifyByMarkers,readAnswersFromRectified,processImage};

function gradeFromPercent(p,e){const min=+state.settings.minGrade,max=+state.settings.maxGrade,pass=+state.settings.passGrade,thr=e.threshold/100;if(p<=thr)return min+(pass-min)*(p/thr);return pass+(max-pass)*((p-thr)/(1-thr))}
function questionConfidencePct(d){
  if(!d)return 0;
  const gap=Math.max(0,+d.confidence||0),relative=Math.max(0,+d.relative||0),best=Math.max(1,+d.bestScore||1);
  return Math.max(0,Math.min(100,Math.round((gap/Math.max(10,best*.32)*.62+relative/32*.38)*100)));
}
function showScanResult(e,answers,aligned=true,markerCount=6){
  const reviewed=[...answers],diagnostics=state.lastReadDiagnostics?.scores||[];
  const needsManual=new Set(diagnostics.map((d,i)=>(d?.uncertain||!answers[i]||answers[i]==='*')?i:null).filter(i=>i!==null));
  const confirmedManual=new Set();
  const result=$('#scanResult');result.classList.remove('empty-state');
  const calculate=()=>{let correct=0,blank=0,multiple=0;reviewed.forEach((a,i)=>{if(!a)blank++;else if(a==='*')multiple++;if(a===e.key[i])correct++});const pct=Math.round(correct/e.questions*100),grade=gradeFromPercent(correct/e.questions,e).toFixed(1);return {correct,blank,multiple,pct,grade}};
  const unresolved=()=>[...needsManual].filter(i=>!confirmedManual.has(i));
  const render=()=>{const m=calculate(),pending=unresolved();
    const qConfidence=diagnostics.length?Math.round(diagnostics.reduce((sum,d)=>sum+questionConfidencePct(d),0)/diagnostics.length):0;
    const alignmentPct=Math.round((state.lastReadDiagnostics?.alignment||0)*100);
    const overallConfidence=Math.round(alignmentPct*.55+qConfidence*.45);
    const rows=reviewed.map((a,i)=>{const multi=a==='*';const requires=needsManual.has(i)&&!confirmedManual.has(i);const conf=questionConfidencePct(diagnostics[i]);const stateLabel=requires?`Revisar ${conf}%`:needsManual.has(i)?'Confirmada':`Leída ${conf}%`;return `<div class="scan-review-row ${requires?'needs-review':''}"><strong>${i+1}</strong><div class="scan-review-options">${letters.slice(0,e.options).map(l=>`<button type="button" data-review-q="${i}" data-review-a="${l}" class="${a===l?'selected':''}">${l}</button>`).join('')}<button type="button" data-review-q="${i}" data-review-a="" class="blank-choice ${!a?'selected':''}">—</button></div><span>${stateLabel}</span></div>`}).join('');
    result.innerHTML=`<div class="result-summary"><div class="score-ring" style="--score:${m.pct*3.6}deg"><strong>${m.pct}%</strong></div><h3>${m.correct} de ${e.questions} correctas</h3><p class="scan-course">${esc(courseName(e.courseId))} · ${esc(e.name)}</p>${state.lastStudentNameCropDataUrl?`<div class="scan-name-crop"><span>Nombre capturado de la hoja</span><img src="${state.lastStudentNameCropDataUrl}" alt="Nombre manuscrito capturado"></div>`:''}<input id="studentNameScan" class="student-name-input" placeholder="Escriba el nombre para buscar y ordenar (opcional)" autocomplete="off"><div class="scan-confidence ${pending.length?'warn':'ok'}"><strong>Confianza OMR ${overallConfidence}%</strong><span>${pending.length?`${pending.length} respuesta(s) dudosa(s): confírmelas antes de guardar.`:'Lectura revisada y lista para guardar.'}</span></div><div class="result-grid"><div><span>Nota</span><strong>${m.grade}</strong></div><div><span>En blanco</span><strong>${m.blank}</strong></div><div><span>Múltiples</span><strong>${m.multiple}</strong></div></div><p>${aligned?`Hoja rectificada con ${markerCount} marcadores. Las respuestas dudosas requieren confirmación manual.`:'Lectura de respaldo.'}</p><div class="scan-review-list">${rows}</div><div class="scan-result-actions"><button id="saveNextScanBtn" class="primary" ${pending.length?'disabled':''}>Guardar y escanear siguiente</button><button id="saveScanBtn" class="secondary" ${pending.length?'disabled':''}>Guardar y ver resultados</button><button id="rescanBtn" class="ghost">Volver a escanear</button></div></div>`;
    $$('[data-review-q]').forEach(b=>b.onclick=()=>{const i=+b.dataset.reviewQ;reviewed[i]=b.dataset.reviewA;if(needsManual.has(i))confirmedManual.add(i);render()});
    const saveResult=async continueScanning=>{const pendingNow=unresolved();if(pendingNow.length)return toast(`Revise ${pendingNow.length} respuesta(s) dudosa(s) antes de guardar.`);const current=calculate(),student=$('#studentNameScan').value.trim()||'Sin nombre',now=new Date().toISOString(),saved={id:crypto.randomUUID(),examId:e.id,examName:e.name,courseId:e.courseId,student,correct:current.correct,total:e.questions,pct:current.pct,grade:current.grade,date:now,updatedAt:now,revision:1,answers:[...reviewed],scanConfidence:Math.round((state.lastReadDiagnostics?.alignment||0)*100),omrConfidence:overallConfidence,uncertainCount:needsManual.size,markerCount:state.lastReadDiagnostics?.markerCount||markerCount,templateCopies:state.lastReadDiagnostics?.copies||3,nameImageDataUrl:state.lastStudentNameCropDataUrl||'',cloudStatus:'saving'};state.results.unshift(saved);state.selectedResultId=saved.id;window.EvaluaCamResultImages?.remember?.(saved.id,saved.nameImageDataUrl);save();renderStats();toast('Guardando resultado, nombre y respaldo…');try{const remote=await window.EvaluaCamCloud?.saveResult?.(saved,state.lastScanCaptureDataUrl||'',state.lastStudentNameCropDataUrl||'');if(remote?.ok){saved.captureUrl=remote.captureUrl||'';saved.captureId=remote.captureId||'';saved.nameImageUrl=remote.nameImageUrl||'';saved.nameImageId=remote.nameImageId||'';saved.cloudStatus='saved';window.EvaluaCamResultImages?.remember?.(saved.id,saved.nameImageDataUrl);saved.nameImageDataUrl='';save();toast('Resultado, nombre y captura guardados en Google Drive.')}else if(window.EvaluaCamCloud?.isConfigured?.()){saved.cloudStatus='pending';save();toast('Guardado localmente. Se reintentará la sincronización.')}}catch(err){saved.cloudStatus='pending';save();toast('Guardado localmente. Revise la conexión con Google.')}state.lastScanCaptureDataUrl='';state.lastStudentNameCropDataUrl='';if(continueScanning){result.className='empty-state';result.textContent='Resultado guardado. Preparando el siguiente escaneo…';setTimeout(()=>startCamera(),350)}else{go('results');$('#resultsCourseFilter').value=e.courseId;refreshResultsExamFilter(e.id);renderResults()}};
    $('#saveNextScanBtn').onclick=()=>saveResult(true);$('#saveScanBtn').onclick=()=>saveResult(false);$('#rescanBtn').onclick=()=>{result.className='empty-state';result.textContent='Preparando un nuevo escaneo…';setTimeout(()=>startCamera(),180)};
  };
  render();setTimeout(()=>$('#studentNameScan')?.focus(),80);
}
function refreshResultsExamFilter(preselect){const courseId=$('#resultsCourseFilter')?.value||'';const exams=state.exams.filter(e=>!courseId||e.courseId===courseId);const current=preselect||$('#resultsExamFilter')?.value||'';$('#resultsExamFilter').innerHTML='<option value="">Todas las evaluaciones</option>'+exams.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('');if(exams.some(e=>e.id===current))$('#resultsExamFilter').value=current;}
$('#resultsCourseFilter').onchange=()=>{refreshResultsExamFilter();state.selectedResultId=null;renderResults()};$('#resultsExamFilter').onchange=()=>{state.selectedResultId=null;renderResults()};
function filteredResults(){const c=$('#resultsCourseFilter').value,e=$('#resultsExamFilter').value;return state.results.filter(r=>(!c||r.courseId===c)&&(!e||r.examId===e))}
let resultsViewMode='list';
function setResultsView(mode){
  resultsViewMode=mode==='detail'?'detail':'list';
  const layout=$('#resultsLayout'),listTab=$('#resultsListTab'),detailTab=$('#resultsDetailTab');
  if(layout){layout.classList.toggle('list-mode',resultsViewMode==='list');layout.classList.toggle('detail-mode',resultsViewMode==='detail')}
  if(listTab){listTab.classList.toggle('active',resultsViewMode==='list');listTab.setAttribute('aria-selected',String(resultsViewMode==='list'))}
  if(detailTab){detailTab.classList.toggle('active',resultsViewMode==='detail');detailTab.setAttribute('aria-selected',String(resultsViewMode==='detail'))}
  if(resultsViewMode==='detail')setTimeout(()=>$('#resultsDetailPane')?.scrollIntoView({behavior:'smooth',block:'start'}),30);
}
$('#resultsListTab').onclick=()=>setResultsView('list');
$('#resultsDetailTab').onclick=()=>{if(!state.selectedResultId)return toast('Seleccione primero un estudiante.');setResultsView('detail')};
$('#backToResultsList').onclick=()=>setResultsView('list');
function resultNameImageMarkup(r,detail=false){
  const cache=window.EvaluaCamResultImages?.source?.(r)||r.nameImageDataUrl||'';
  const hasRemote=!!r.nameImageId;
  const cls=detail?'detail-name-crop':'student-name-thumb';
  const alt=`Nombre manuscrito de ${esc(r.student)}`;
  if(cache){const inner=`<img class="${cls}" src="${esc(cache)}" alt="${alt}" data-name-result-id="${esc(r.id)}">`;return r.nameImageUrl?`<a href="${esc(r.nameImageUrl)}" target="_blank" rel="noopener" class="${detail?'':'student-name-thumb-link'}">${inner}</a>`:inner;}
  if(hasRemote){const img=`<img class="${cls}" data-name-result-id="${esc(r.id)}" alt="${alt}" hidden>`;const ph=`<span class="name-image-loading" data-name-placeholder="${esc(r.id)}">Cargando nombre…</span>`;return r.nameImageUrl?`<a href="${esc(r.nameImageUrl)}" target="_blank" rel="noopener" class="${detail?'':'student-name-thumb-link'}">${ph}${img}</a>`:`${ph}${img}`;}
  if(r.nameImageUrl)return `<a class="name-image-drive-link" href="${esc(r.nameImageUrl)}" target="_blank" rel="noopener">Ver nombre capturado</a>`;
  return '';
}
function hydrateResultNameImages(){window.EvaluaCamResultImages?.hydrate?.(document)}
function renderResults(){
  refreshResultsExamFilter();const rows=filteredResults(),body=$('#resultsBody'),courseId=$('#resultsCourseFilter').value,examId=$('#resultsExamFilter').value;
  $('#resultsContext').textContent=[courseId?courseName(courseId):'Todos los cursos',examId?state.exams.find(e=>e.id===examId)?.name:'Todas las evaluaciones',`${rows.length} estudiante(s)`].filter(Boolean).join(' · ');
  body.innerHTML=rows.length?rows.map(r=>`<tr><td>${new Date(r.date).toLocaleString('es-CL')}</td><td><div class="student-result-cell">${resultNameImageMarkup(r)}<strong>${esc(r.student)}</strong></div></td><td>${r.correct}/${r.total}</td><td>${r.pct}%</td><td>${r.grade}</td><td><button class="secondary compact" data-detail="${r.id}">Ver respuestas</button>${r.captureUrl?` <a class="secondary compact" href="${esc(r.captureUrl)}" target="_blank" rel="noopener">Ver captura</a>`:''}</td><td><button class="ghost" data-del="${r.id}">Eliminar</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty-state">No hay resultados para esta selección.</td></tr>';
  $$('[data-detail]').forEach(b=>b.onclick=()=>{state.selectedResultId=b.dataset.detail;renderAnswerDetail();setResultsView('detail')});
  $$('[data-del]').forEach(b=>b.onclick=async()=>{const id=b.dataset.del;window.EvaluaCamResultImages?.forget?.(id);state.results=state.results.filter(r=>r.id!==id);if(state.selectedResultId===id)state.selectedResultId=null;save();renderResults();renderStats();try{if(window.EvaluaCamCloud?.isConfigured?.())await window.EvaluaCamCloud.request('deleteResult',{resultId:id})}catch(err){toast('El resultado se eliminó localmente, pero no pudo eliminarse de Google.')}});
  hydrateResultNameImages();
  if(state.selectedResultId&&!rows.some(r=>r.id===state.selectedResultId)){state.selectedResultId=null;setResultsView('list')}renderAnswerDetail();renderQuestionAnalytics(rows);
}
function renderQuestionAnalytics(rows){const box=$('#questionAnalytics');const examId=$('#resultsExamFilter').value,e=state.exams.find(x=>x.id===examId);if(!e||!rows.length){box.innerHTML='';return}const stats=e.key.map((correct,i)=>{const answered=rows.filter(r=>r.answers?.[i]).length,ok=rows.filter(r=>r.answers?.[i]===correct).length;return {q:i+1,pct:answered?Math.round(ok/rows.length*100):0}});box.innerHTML=`<div class="analytics-head"><h3>Análisis por pregunta</h3><p>Porcentaje de respuestas correctas.</p></div><div class="analytics-grid">${stats.map(s=>`<div class="analytic-item ${s.pct<40?'hard':s.pct>80?'easy':''}"><span>P${s.q}</span><strong>${s.pct}%</strong><i style="height:${Math.max(4,s.pct)}%"></i></div>`).join('')}</div>`}
function feedbackPrintLayout(){return Math.max(1,Math.min(2,+(($('#feedbackPrintLayout')?.value)||state.settings.print?.feedbackLayout||2)))}
function feedbackCaptureSource(result){return String(feedbackCaptureCache.get(result?.id)||result?.captureDataUrl||'')}
async function ensureFeedbackCapture(result){
  if(!result?.id)return '';
  const cached=feedbackCaptureSource(result);
  if(cached)return cached;
  if(!result.captureId)return '';
  if(feedbackCapturePending.has(result.id))return feedbackCapturePending.get(result.id);
  const job=(window.EvaluaCamCloud?.request?.('getCaptureImage',{resultId:result.id})||Promise.resolve({dataUrl:''}))
    .then(data=>{const url=String(data?.dataUrl||'');if(url)feedbackCaptureCache.set(result.id,url);return url})
    .catch(()=> '')
    .finally(()=>feedbackCapturePending.delete(result.id));
  feedbackCapturePending.set(result.id,job);
  return job;
}
function feedbackOverlayHtml(result,exam){
  if(!exam)return '';
  const w=920,copies=Math.max(1,Math.min(4,+(result?.templateCopies||1))),aspect=responseSheetAspectForCopies(copies),h=Math.round(w/aspect),g=sheetGeometryForCopies(copies),grid=answerGridForQuestions(exam.questions,copies),cols=grid.cols,rows=grid.rows;
  const left=w*g.safeLeft,right=w*g.safeRight,usable=right-left,top=h*g.answerTop,bottom=h*g.answerBottom,colW=usable/cols,availableH=bottom-top,targetPitch=physicalPx(copies===1?14.0:copies===2?11.0:7.4,copies,w),rowH=Math.min(availableH/rows,targetPitch),blockH=rowH*rows,startY=top+Math.max(0,(availableH-blockH)*.16);
  const bubbleScale=Math.max(.80,Math.min(1.35,(+state.settings.print?.bubble||124)/124));
  let html='';
  for(let q=0;q<exam.questions;q++){
    const col=Math.floor(q/rows),row=q%rows,baseX=left+col*colW,cy=startY+row*rowH+rowH*.50,bm=responseBubbleMetrics(copies,exam.questions,cols,rowH,colW,w,exam.options),optionStart=baseX+colW*bm.optionStartRatio,optionGap=bm.optionGap,ring=Math.max(7,bm.radius*bubbleScale*.96)*2.06;
    const answer=String(result.answers?.[q]||''),correct=String(exam.key?.[q]||''),badgeX=baseX+colW*(bm.numberOffset*.56),badgeW=Math.max(30,rowH*.44),badgeH=Math.max(24,rowH*.34);
    const ringMarkup=(letter,kind)=>{const idx=letters.indexOf(letter);if(idx<0||idx>=exam.options)return '';const cx=optionStart+idx*optionGap;return `<span class="feedback-mark ${kind}" style="left:${(cx-ring/2)/w*100}%;top:${(cy-ring/2)/h*100}%;width:${ring/w*100}%;height:${ring/h*100}%;"></span>`};
    const badgeMarkup=(kind,text)=>`<span class="feedback-badge ${kind}" style="left:${(badgeX-badgeW*.42)/w*100}%;top:${(cy-badgeH/2)/h*100}%;min-width:${badgeW/w*100}%;height:${badgeH/h*100}%;line-height:${badgeH/h*100}%;">${text}</span>`;
    if(answer&&answer!==''&&answer!=='*'){
      html+=ringMarkup(answer,answer===correct?'correct':'wrong');
      if(answer!==correct&&correct)html+=ringMarkup(correct,'correct');
    }else if(answer==='*'){
      if(correct)html+=ringMarkup(correct,'correct');
      html+=badgeMarkup('multiple','M');
    }else{
      html+=badgeMarkup('blank','—');
    }
  }
  return html;
}
function buildFeedbackSheet(result){
  const exam=state.exams.find(x=>x.id===result.examId);
  const src=feedbackCaptureSource(result);
  const item=document.createElement('article');item.className='feedback-sheet';item.innerHTML=`<div class="feedback-stage"><img class="feedback-base-image" src="${esc(src)}" alt="Hoja corregida de ${esc(result.student)}"><div class="feedback-overlay">${feedbackOverlayHtml(result,exam)}</div></div>`;
  return item;
}
function feedbackGroups(results,perPage){const out=[];for(let i=0;i<results.length;i+=perPage)out.push(results.slice(i,i+perPage));return out}
function buildFeedbackPrintPages(results,perPage){
  const host=$('#feedbackPrintPages');if(!host)return;host.innerHTML='';
  feedbackGroups(results,perPage).forEach(group=>{const page=document.createElement('div');page.className=`feedback-print-page mode-${perPage}`;page.dataset.count=String(group.length);group.forEach(r=>page.appendChild(buildFeedbackSheet(r)));host.appendChild(page)});
}
function setFeedbackPageStyle(perPage){
  let style=$('#feedbackPageStyle');if(!style){style=document.createElement('style');style.id='feedbackPageStyle';document.head.appendChild(style)}
  style.textContent=perPage===2?'@page { size: A4 landscape; margin: 0; }':'@page { size: A4 portrait; margin: 0; }';
}
function clearFeedbackPageStyle(){const style=$('#feedbackPageStyle');if(style)style.remove()}
function waitForPrintImages(host){const images=[...(host?.querySelectorAll('img')||[])];if(!images.length)return Promise.resolve();return Promise.all(images.map(img=>img.complete?Promise.resolve():new Promise(res=>{img.addEventListener('load',res,{once:true});img.addEventListener('error',res,{once:true})}))).then(()=>new Promise(res=>setTimeout(res,80)))}
async function printFeedbackResults(results,{perPage=feedbackPrintLayout(),single=false}={}){
  const selected=(results||[]).filter(Boolean);
  if(!selected.length)return toast('No hay resultados para imprimir.');
  const skipped=[];toast(`Preparando ${selected.length} hoja(s) corregida(s)…`);
  await Promise.all(selected.map(async r=>{if(!feedbackCaptureSource(r)){const src=await ensureFeedbackCapture(r);if(src)r.captureDataUrl=src}if(!feedbackCaptureSource(r))skipped.push(r.id)}));
  const ready=selected.filter(r=>feedbackCaptureSource(r));
  if(!ready.length)return toast('No se encontraron capturas para imprimir estas retroalimentaciones.');
  buildFeedbackPrintPages(ready,single?1:perPage);setFeedbackPageStyle(single?1:perPage);document.body.classList.add('printing-feedback');
  await waitForPrintImages($('#feedbackPrintPages'));
  if(skipped.length)toast(`Se omitieron ${skipped.length} hoja(s) sin captura disponible.`);
  requestAnimationFrame(()=>setTimeout(()=>window.print(),60));
}
function renderAnswerDetail(){
  const box=$('#answerDetail'),r=state.results.find(x=>x.id===state.selectedResultId);if(!r){box.className='empty-state';box.innerHTML='Seleccione un estudiante de la lista para ver su hoja corregida.';return}
  const e=state.exams.find(x=>x.id===r.examId);if(!e){box.className='empty-state';box.textContent='No se encontró la evaluación asociada.';return}
  const items=e.key.map((correct,i)=>{const answer=r.answers?.[i]||'';const status=answer===correct?'correct':answer?'wrong':'blank';const shown=answer==='*'?'Múltiple':(answer||'—');const label=status==='correct'?'Correcta':status==='wrong'?(answer==='*'?'Incorrecta (múltiple)':'Incorrecta'):'Sin respuesta';return `<tr class="${status}"><td>${i+1}</td><td><span class="answer-pill student-answer">${shown}</span></td><td><span class="answer-pill correct-answer">${correct}</span></td><td>${label}</td></tr>`}).join('');
  const confidence=Number.isFinite(+r.omrConfidence)?`<span class="detail-confidence">Confianza OMR ${Math.round(+r.omrConfidence)}%</span>`:'';
  box.className='';box.innerHTML=`<div class="detail-header"><div><span class="eyebrow">HOJA CORREGIDA</span><h2>${esc(r.student)}</h2>${resultNameImageMarkup(r,true)}<p>${esc(courseName(r.courseId))} · ${esc(e.name)}</p>${confidence}</div><div class="detail-score"><strong>${r.grade}</strong><span>${r.correct}/${r.total} · ${r.pct}%</span></div></div><div class="legend"><span><i class="dot correct-dot"></i>Correcta</span><span><i class="dot wrong-dot"></i>Incorrecta</span><span><i class="dot blank-dot"></i>Sin respuesta</span></div><div class="table-wrap answer-comparison"><table><thead><tr><th>Pregunta</th><th>Respuesta estudiante</th><th>Respuesta correcta</th><th>Resultado</th></tr></thead><tbody>${items}</tbody></table></div><button id="printCorrectedBtn" class="secondary">Imprimir hoja corregida</button>`;
  hydrateResultNameImages();
  $('#printCorrectedBtn').onclick=()=>printFeedbackResults([r],{single:true});
}
$('#exportCsvBtn').onclick=()=>{const data=filteredResults();if(!data.length)return toast('No hay resultados para exportar.');const maxQ=Math.max(...data.map(r=>r.total||0));const qHeaders=Array.from({length:maxQ},(_,i)=>`P${i+1}`);const rows=[['Curso','Evaluación','Fecha','Estudiante','Correctas','Total','Porcentaje','Nota',...qHeaders],...data.map(r=>[courseName(r.courseId),r.examName,new Date(r.date).toLocaleString('es-CL'),r.student,r.correct,r.total,r.pct,r.grade,...Array.from({length:maxQ},(_,i)=>r.answers?.[i]||'')])];const csv=rows.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(';')).join('\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='resultados_evaluacam.csv';a.click();URL.revokeObjectURL(a.href)};
$('#clearResultsBtn').onclick=()=>{if(!window.EvaluaCamAuth?.isAdmin?.())return toast('Solo el administrador puede borrar todos los resultados.');const pin=prompt('Ingrese el PIN de seguridad:');if(pin!==(localStorage.getItem('ec_admin_delete_pin')||'1234'))return toast('PIN incorrecto.');if(confirm('¿Borrar todos los resultados?')){state.results=[];state.selectedResultId=null;save();renderResults();renderStats()}};
$('#feedbackPrintLayout').value=String(state.settings.print?.feedbackLayout||2);
$('#feedbackPrintLayout').onchange=e=>{state.settings.print={...state.settings.print,feedbackLayout:+e.target.value||2};saveLocalOnly();};
$('#printFeedbackBtn').onclick=()=>printFeedbackResults(filteredResults(),{perPage:feedbackPrintLayout()});
function renderStats(){const avg=state.results.length?Math.round(state.results.reduce((a,b)=>a+b.pct,0)/state.results.length):null;$('#statExams').textContent=state.exams.length;$('#statScans').textContent=state.results.length;$('#statAverage').textContent=avg===null?'—':avg+'%';$('#statLast').textContent=state.exams[0]?.name||'—';renderDashboardHierarchy()}
const printDefaults={copies:3,questions:20,version:'A',text:140,title:150,instructions:165,headers:175,numbers:175,black:130,contrast:135,sharp:130,stroke:145,bubble:124,marker:145,safeMargins:true,feedbackLayout:2,layoutVersion:13};
state.settings.print={...printDefaults,...(state.settings.print||{})};
function setCfg(id,value){const el=$('#'+id);if(el)el.value=value}
function configValues(){return {copies:+$('#cfgCopies').value,questions:+$('#cfgQuestions').value,version:$('#cfgVersion').value,text:+$('#cfgText').value,title:+$('#cfgTitle').value,instructions:+$('#cfgInstructions').value,headers:+$('#cfgHeaders').value,numbers:+$('#cfgNumbers').value,black:+$('#cfgBlack').value,contrast:+$('#cfgContrast').value,sharp:+$('#cfgSharp').value,stroke:+$('#cfgStroke').value,bubble:+$('#cfgBubble').value,marker:+$('#cfgMarker').value,safeMargins:$('#cfgSafeMargins').checked,feedbackLayout:feedbackPrintLayout(),layoutVersion:13}}
function applyConfigToMain(v){setCfg('copiesPerPage',v.copies);setCfg('blackLevel',v.black);setCfg('contrast',v.contrast);setCfg('sharpness',v.sharp);setCfg('bubbleStroke',v.stroke);setCfg('bubbleSize',v.bubble);setCfg('markerDarkness',v.marker);renderPrintPreviewStyle();updateOptimizer()}
function makePreviewSheet(e,questions,version){const paper=$('#printArea').cloneNode(true);paper.removeAttribute('id');paper.classList.add('config-preview-sheet');paper.querySelector('[id="sheetTitle"]').textContent=e?.name||'Evaluación de Matemáticas';paper.querySelector('[id="sheetMeta"]').textContent=`${questions} preguntas · Versión ${version}`;paper.querySelector('[id="sheetCode"]').textContent=(e?.code||'2025')+'-'+version;const box=paper.querySelector('[id="sheetQuestions"]');box.removeAttribute('id');box.innerHTML='';const opts=e?.options||5;for(let i=0;i<questions;i++){const row=document.createElement('div');row.className='sheet-question';row.innerHTML=`<span class="qnum">${i+1}.</span>`+letters.slice(0,opts).map(l=>`<span class="sheet-bubble"><i></i>${l}</span>`).join('');box.appendChild(row)}paper.querySelectorAll('[id]').forEach(x=>x.removeAttribute('id'));return paper}
function updateConfigPreview(){
  const v=configValues();state.settings.print={...state.settings.print,...v};
  const outs={cfgTextOut:v.text+'%',cfgTitleOut:v.title+'%',cfgInstructionsOut:v.instructions+'%',cfgHeadersOut:v.headers+'%',cfgNumbersOut:v.numbers+'%',cfgBlackOut:v.black+'%',cfgContrastOut:v.contrast+'%',cfgSharpOut:v.sharp+'%',cfgStrokeOut:v.stroke+'%',cfgBubbleOut:v.bubble+'%',cfgMarkerOut:v.marker+'%'};Object.entries(outs).forEach(([id,val])=>$('#'+id).textContent=val);
  applyConfigToMain(v);
  const base=state.exams.find(x=>x.id===$('#sheetExamSelect').value)||state.exams[0],exam=getConfiguredRenderExam(base,{questions:v.questions,version:v.version});
  const grid=$('#configPreviewGrid');grid.className=`config-preview-grid canonical-preview copies-${v.copies}`;grid.innerHTML='';
  const canvas=createLetterSheetCanvas(exam,v.copies,1275);canvas.className='canonical-preview-canvas';canvas.setAttribute('aria-label','Vista previa exacta de la página Carta final');grid.appendChild(canvas);grid.classList.toggle('show-safe-margins',v.safeMargins);
  $('#cfgPreviewMode').textContent=v.copies===4?'4 hojas por Carta · cuadrícula 2×2':v.copies===3?'3 hojas por Carta · cámara-segura':v.copies===2?'2 hojas por Carta · horizontal':'1 hoja por Carta · máxima precisión';
  let score=100-Math.abs(v.black-125)*.11-Math.abs(v.contrast-130)*.08-Math.abs(v.sharp-125)*.05-Math.max(0,135-v.stroke)*.12-Math.max(0,118-v.bubble)*.10-Math.max(0,140-v.headers)*.08-Math.max(0,140-v.numbers)*.08-(v.copies===3?1:0);score=Math.max(60,Math.min(99,Math.round(score)));$('#cfgQualityScore').textContent=score+'%';$('#cfgQualityBar').style.width=score+'%';$('#cfgQualityLabel').textContent=score>=94?'Excelente':score>=86?'Muy buena':'Mejorable';$('#cfgQualityText').textContent=v.copies>=3?'Geometría compacta cámara-segura: se preserva el tamaño físico de círculos, marcadores y campos.':score>=94?'La vista previa y el PNG usan exactamente la misma geometría Carta.':'Aumente contraste, negros o grosor de círculos.';
}
function renderConfigScreen(){const p={...printDefaults,...state.settings.print};$('#cfgQuestions').innerHTML=Array.from({length:19},(_,i)=>10+i*5).map(n=>`<option value="${n}">${n} preguntas</option>`).join('');Object.entries({cfgCopies:p.copies,cfgQuestions:p.questions,cfgVersion:p.version,cfgText:p.text,cfgTitle:p.title,cfgInstructions:p.instructions,cfgHeaders:p.headers,cfgNumbers:p.numbers,cfgBlack:p.black,cfgContrast:p.contrast,cfgSharp:p.sharp,cfgStroke:p.stroke,cfgBubble:p.bubble,cfgMarker:p.marker}).forEach(([id,val])=>setCfg(id,val));$('#cfgSafeMargins').checked=p.safeMargins!==false;$('#minGrade').value=state.settings.minGrade;$('#maxGrade').value=state.settings.maxGrade;$('#passGrade').value=state.settings.passGrade;updateConfigPreview()}
['cfgCopies','cfgQuestions','cfgVersion','cfgText','cfgTitle','cfgInstructions','cfgHeaders','cfgNumbers','cfgBlack','cfgContrast','cfgSharp','cfgStroke','cfgBubble','cfgMarker','cfgSafeMargins'].forEach(id=>$('#'+id).addEventListener('input',updateConfigPreview));
$('#cfgAutoBtn').onclick=()=>{Object.entries({cfgText:140,cfgTitle:150,cfgInstructions:165,cfgHeaders:175,cfgNumbers:175,cfgBlack:130,cfgContrast:135,cfgSharp:130,cfgStroke:145,cfgBubble:120,cfgMarker:145}).forEach(([id,val])=>setCfg(id,val));updateConfigPreview();toast('Optimización automática aplicada.')};
$('#resetPrintConfigBtn').onclick=()=>{state.settings.print={...printDefaults};renderConfigScreen();toast('Configuración restablecida.')};
$('#savePrintConfigBtn').onclick=()=>{state.settings={...state.settings,minGrade:+$('#minGrade').value,maxGrade:+$('#maxGrade').value,passGrade:+$('#passGrade').value,print:configValues()};save();applyConfigToMain(state.settings.print);toast('Configuración de impresión guardada.')};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferredPrompt=e;$('#installBtn').classList.remove('hidden')});$('#installBtn').onclick=async()=>{if(state.deferredPrompt){state.deferredPrompt.prompt();await state.deferredPrompt.userChoice;state.deferredPrompt=null;$('#installBtn').classList.add('hidden')}};
if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(()=>{});}
migrateData();refreshCourseSelects();refreshExamSelects();renderConfigScreen();renderStats();renderResults();renderSheet();

window.addEventListener('DOMContentLoaded',()=>{const pin=$('#adminDeletePin');if(pin)pin.value=localStorage.getItem('ec_admin_delete_pin')||'1234';$('#saveAdminPinBtn')?.addEventListener('click',()=>{if(!window.EvaluaCamAuth?.isAdmin?.())return toast('Acceso restringido.');const value=pin.value.trim();if(!/^\d{4,8}$/.test(value))return toast('Use un PIN numérico de 4 a 8 dígitos.');localStorage.setItem('ec_admin_delete_pin',value);toast('PIN administrativo actualizado.');});});
