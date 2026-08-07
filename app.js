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
  currentKey:[],stream:null,deferredPrompt:null,selectedResultId:null,autoScanTimer:null,autoScanBusy:false,autoScanLocked:false,autoScanStable:0,autoScanLost:0,autoScanLast:null,autoScanOrientation:0,scanCopies:null,autoScanBest:null,scanProbeCanvas:null,autoScanDetection:null,autoScanLastGood:null,autoScanFrameCount:0,scanLastCaptureAt:0,scanStableSince:0,scanStartedAt:0,scanDetectionHistory:[],lastScanSessionId:null,resultsPage:1,resultsPageSize:25,resultsSearch:''
};
window.state=state;
const loadedPrintLayoutVersion=+(state.settings?.print?.layoutVersion||0);
const titles={dashboard:['Resumen','Gestione cursos, pruebas, hojas y resultados.'],courses:['Cursos','Cree cursos y revise sus evaluaciones.'],exam:['Crear prueba','Configure la evaluación y su clave de respuestas.'],sheet:['Hoja de respuestas','Genere e imprima hojas listas para escanear.'],scan:['Escanear','Use la cámara del teléfono para corregir.'],results:['Resultados','Compare respuestas del estudiante con la clave correcta.'],settings:['Configuración','Personalice la impresión y vea los cambios en tiempo real.']};
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}
function compactResultForStorage(r){
  const copy={...r};
  delete copy.namePreviewDataUrl;delete copy.pendingCaptureDataUrl;
  if(copy.cloudStatus==='saved')copy.nameImageDataUrl='';
  return copy;
}
function saveLocalOnly(){
  try{
    localStorage.setItem(storageKey('ec_courses'),JSON.stringify(state.courses));
    localStorage.setItem(storageKey('ec_exams'),JSON.stringify(state.exams));
    localStorage.setItem(storageKey('ec_results'),JSON.stringify(state.results.map(compactResultForStorage)));
    localStorage.setItem(storageKey('ec_settings'),JSON.stringify(state.settings));
  }catch(err){console.warn('Local cache full',err);}
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
  state.exams.forEach(exam=>{if(!exam.language){exam.language='es';changed=true}});
  state.results.forEach(r=>{const e=state.exams.find(x=>x.id===r.examId);if(e&&!r.courseId){r.courseId=e.courseId;changed=true}});
  const print=state.settings.print||(state.settings.print={});
  if(loadedPrintLayoutVersion<12){
    const minimums={text:140,title:150,instructions:165,headers:175,numbers:175,bubble:120,stroke:145,black:130,contrast:135,sharp:130,marker:145};
    Object.entries(minimums).forEach(([key,value])=>{if(!Number.isFinite(+print[key])||+print[key]<value){print[key]=value;changed=true}});
    if(![1,2,3].includes(+print.copies))print.copies=3;
    print.layoutVersion=12;changed=true;
  }
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
  state.courses.push({id:crypto.randomUUID(),name,year,created:new Date().toISOString()});save();$('#courseName').value='';refreshCourseSelects();renderCourses();renderStats();toast('Curso creado correctamente.');
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
$('#saveExamBtn').onclick=()=>{const name=$('#examName').value.trim(),courseId=$('#examCourseSelect').value;if(!courseId)return toast('Primero cree y seleccione un curso.');if(!name)return toast('Ingrese el nombre de la prueba.');if(!state.currentKey.length)return toast('Genere primero la clave de respuestas.');if(state.currentKey.some(x=>!x))return toast('Complete todas las respuestas de la clave.');const exam={id:crypto.randomUUID(),name,courseId,course:courseName(courseId),subject:$('#examSubject').value.trim(),version:$('#examVersion').value||'A',studentIdMode:$('#studentIdMode').value||'name',language:$('#templateLanguage')?.value||'es',questions:+$('#questionCount').value,options:+$('#optionCount').value,threshold:+$('#passThreshold').value,key:[...state.currentKey],created:new Date().toISOString(),code:String(Math.floor(1000+Math.random()*9000))};state.exams.unshift(exam);save();refreshExamSelects();renderStats();toast('Prueba guardada correctamente.');go('sheet')};
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
  auto:{black:120,contrast:125,sharp:120,stroke:135,size:115,marker:140},
  laser:{black:110,contrast:115,sharp:115,stroke:125,size:112,marker:130},
  ink:{black:125,contrast:130,sharp:125,stroke:140,size:116,marker:145},
  copy:{black:135,contrast:145,sharp:135,stroke:150,size:120,marker:155},
  max:{black:135,contrast:145,sharp:150,stroke:160,size:122,marker:160}
};
function optimizerValues(){return {black:+$('#blackLevel').value,contrast:+$('#contrast').value,sharp:+$('#sharpness').value,stroke:+$('#bubbleStroke').value,size:+$('#bubbleSize').value,marker:+$('#markerDarkness').value,text:+(state.settings.print?.text||140),title:+(state.settings.print?.title||150),instructions:+(state.settings.print?.instructions||165),headers:+(state.settings.print?.headers||175),numbers:+(state.settings.print?.numbers||175)}}
function applyProfile(name){const p=printProfiles[name]||printProfiles.auto;$('#blackLevel').value=p.black;$('#contrast').value=p.contrast;$('#sharpness').value=p.sharp;$('#bubbleStroke').value=p.stroke;$('#bubbleSize').value=p.size;$('#markerDarkness').value=p.marker;updateOptimizer()}
function updateOptimizer(){const v=optimizerValues();[['blackLevelOut',v.black],['contrastOut',v.contrast],['sharpnessOut',v.sharp],['bubbleStrokeOut',v.stroke],['bubbleSizeOut',v.size],['markerDarknessOut',v.marker]].forEach(([id,n])=>$('#'+id).textContent=n+'%');const copies=+$('#copiesPerPage').value||1;let score=100-Math.abs(v.black-125)*.12-Math.abs(v.contrast-130)*.09-Math.abs(v.sharp-125)*.06-Math.max(0,115-v.stroke)*.18-(copies===3?1:copies===2?2:0);score=Math.max(65,Math.min(99,Math.round(score)));$('#qualityScore').textContent=score+'%';$('#qualityBar').style.width=score+'%';$('#qualityAdvice').textContent=score>=94?'Excelente para impresión y lectura óptica.':score>=85?'Buena calidad. Para copias múltiples, aumente negros y grosor.':'Aumente negros, contraste y grosor de círculos.';renderPrintPreviewStyle()}
function renderPrintPreviewStyle(){const v=optimizerValues();const papers=$$('#printArea,.config-preview-sheet');papers.forEach(paper=>{paper.style.setProperty('--print-black',Math.min(1,(v.black-70)/70));paper.style.setProperty('--bubble-stroke',(1.4*v.stroke/100)+'px');paper.style.setProperty('--bubble-scale',v.size/100);paper.style.setProperty('--text-scale',v.text/100);paper.style.setProperty('--title-scale',v.title/100);paper.style.setProperty('--instructions-scale',v.instructions/100);paper.style.setProperty('--headers-scale',v.headers/100);paper.style.setProperty('--numbers-scale',v.numbers/100);paper.style.filter=`contrast(${v.contrast}%)`});renderSheetPagePreview()}
$('#togglePrintOptimizerBtn').onclick=()=>$('#printOptimizer').classList.toggle('hidden');$('#autoOptimizeBtn').onclick=()=>{applyProfile(+$('#copiesPerPage').value>=3?'copy':'auto');$('#printPreset').value='auto';toast('Calidad optimizada automáticamente.')};$('#printPreset').onchange=e=>{if(e.target.value!=='custom')applyProfile(e.target.value)};['blackLevel','contrast','sharpness','bubbleStroke','bubbleSize','markerDarkness'].forEach(id=>$('#'+id).oninput=()=>{$('#printPreset').value='custom';updateOptimizer()});$('#copiesPerPage').onchange=()=>{if($('#printPreset').value==='auto')applyProfile(+$('#copiesPerPage').value>=3?'copy':'auto');else updateOptimizer();renderSheetPagePreview()};
function getConfiguredRenderExam(baseExam, overrides={}){
  const e={...(baseExam||{name:'Evaluación de Matemáticas',subject:'',courseId:'',options:5,studentIdMode:'name',language:'es',code:'2025',version:'A',questions:20})};
  if(overrides.questions!=null)e.questions=+overrides.questions;
  if(overrides.version)e.version=overrides.version;
  return e;
}
function answerGridForQuestions(total,options=4,copies=1){
  let cols=total<=10?1:total<=20?2:total<=35?2:total<=50?3:4;
  if(copies===3&&total>20)cols=Math.max(cols,3);
  if(options>=5&&total>30)cols=Math.max(cols,3);
  cols=Math.max(1,Math.min(cols,total));
  return {cols,rows:Math.ceil(total/cols)};
}
const SHEET_GEOMETRY={
  markerX:.035,markerTop:.035,markerMid:.500,markerBottom:.965,marker:.045,markerMoat:.012,
  safeLeft:.115,safeRight:.885,titleY:.045,metaY:.073,fieldTop:.112,fieldHeight:.050,
  instructionY:.207,answerTop:.247,answerBottom:.910,footerY:.957,
  timingX:.047
};
function hash32(text){let h=2166136261>>>0;for(const ch of String(text||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0}return h>>>0}
function examIdentity(exam){const seed=hash32(`${exam?.id||''}|${exam?.code||''}|${exam?.courseId||''}|${exam?.version||'A'}|${exam?.questions||0}|${exam?.options||4}`);return seed.toString(36).toUpperCase().padStart(7,'0').slice(-7)}
function activeScanExam(){const id=$('#scanExamSelect')?.value;return state.exams.find(x=>x.id===id)||state.exams[0]||null}
function timingTrackForExam(exam){
  let n=hash32(`${examIdentity(exam)}|${exam?.questions||0}|${exam?.options||4}`),y=SHEET_GEOMETRY.answerTop+.020;const bars=[];
  for(let i=0;i<10;i++){
    n=(Math.imul(n,1664525)+1013904223)>>>0;
    const width=.018+(((n>>>24)&255)/255)*.024;
    const height=.0065+(((n>>>20)&15)/15)*.0035;
    const gap=.006+(((n>>>16)&15)/15)*.0045;
    bars.push({x:SHEET_GEOMETRY.timingX,y,w:width,h:height});y+=height+gap;
  }
  return bars;
}
function activeTimingTrack(){return timingTrackForExam(activeScanExam())}
function pageGridForCopies(copies){return copies===3?{cols:3,rows:1,landscape:true}:copies===2?{cols:2,rows:1,landscape:true}:{cols:1,rows:1,landscape:false}}
function pageLayoutMm(copies){
  const grid=pageGridForCopies(copies),pageW=grid.landscape?297:210,pageH=grid.landscape?210:297;
  const margin=copies===3?6:7,gap=copies===3?4:copies===2?5:0;
  const cellW=(pageW-margin*2-gap*(grid.cols-1))/grid.cols,cellH=(pageH-margin*2-gap*(grid.rows-1))/grid.rows;
  return {pageW,pageH,grid,margin,gap,cellW,cellH,aspect:cellW/cellH,orientation:grid.landscape?'landscape':'portrait'};
}
function pageLayoutMetrics(copies,shortSide=1240){
  const mm=pageLayoutMm(copies),scale=shortSide/210;
  return {width:Math.round(mm.pageW*scale),height:Math.round(mm.pageH*scale),grid:mm.grid,mx:mm.margin*scale,my:mm.margin*scale,gx:mm.gap*scale,gy:mm.gap*scale,cellW:mm.cellW*scale,cellH:mm.cellH*scale,aspect:mm.aspect,orientation:mm.orientation};
}
function responseSheetAspectForCopies(copies){return pageLayoutMm(+copies||1).aspect}
function xmlEsc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]))}
function templateLabels(exam){return exam?.language==='en'?{name:'Name',className:'Class',code:'Code',instruction:'Mark one answer only. Fill the circle completely.'}:{name:'Nombre',className:'Curso',code:'Código',instruction:'Marque una sola alternativa. Rellene completamente el círculo.'}}
function answerLayoutForSheet(exam,copies,w,h){
  const grid=answerGridForQuestions(exam.questions,exam.options,copies),left=w*SHEET_GEOMETRY.safeLeft,right=w*SHEET_GEOMETRY.safeRight,top=h*SHEET_GEOMETRY.answerTop,bottom=h*SHEET_GEOMETRY.answerBottom,usable=right-left,colW=usable/grid.cols,rowH=(bottom-top)/grid.rows;
  const diameter=Math.max(w*.018,Math.min(rowH*.66,colW/(exam.options+2.05)*.92,w*(copies===3?.055:.040)))*(+(state.settings.print?.bubble||120)/120);
  const edgeGap=Math.max(diameter*.14,w*.0024),numberW=Math.min(colW*.16,diameter*1.55),numberGap=Math.max(diameter*.28,w*.004);
  const answersW=exam.options*diameter+(exam.options-1)*edgeGap,blockW=numberW+numberGap+answersW,columnPad=Math.max(0,(colW-blockW)/2),positions=[];
  for(let q=0;q<exam.questions;q++){
    const col=Math.floor(q/grid.rows),row=q%grid.rows,baseX=left+col*colW+columnPad,cy=top+row*rowH+rowH*.50,numberX=baseX+numberW*.78,bubbleStart=baseX+numberW+numberGap+diameter/2;
    positions.push({q,col,row,numberX,cy,r:diameter/2,bubbles:Array.from({length:exam.options},(_,o)=>bubbleStart+o*(diameter+edgeGap))});
  }
  return {...grid,left,right,top,bottom,usable,colW,rowH,diameter,positions};
}
function svgText(x,y,text,size,attrs=''){return `<text x="${x.toFixed(3)}" y="${y.toFixed(3)}" font-family="Arial,Helvetica,sans-serif" font-size="${size.toFixed(3)}" ${attrs}>${xmlEsc(text)}</text>`}
function sheetSvgContent(exam,copies,w,h){
  const v=optimizerValues(),labels=templateLabels(exam),layout=answerLayoutForSheet(exam,copies,w,h),mark=w*SHEET_GEOMETRY.marker,moat=w*SHEET_GEOMETRY.markerMoat,leftMark=w*SHEET_GEOMETRY.markerX,rightMark=w*(1-SHEET_GEOMETRY.markerX)-mark,topMark=h*SHEET_GEOMETRY.markerTop,midMark=h*SHEET_GEOMETRY.markerMid-mark/2,bottomMark=h*SHEET_GEOMETRY.markerBottom-mark;
  const black='#000',gray='#777',lineGray='#666',parts=[`<rect x="0" y="0" width="${w}" height="${h}" fill="#fff"/>`,`<rect x="0.4" y="0.4" width="${w-.8}" height="${h-.8}" fill="none" stroke="#bbb" stroke-width="0.25"/>`];
  const marker=(x,y,s=mark)=>parts.push(`<rect x="${(x-moat).toFixed(3)}" y="${(y-moat).toFixed(3)}" width="${(s+moat*2).toFixed(3)}" height="${(s+moat*2).toFixed(3)}" fill="#fff"/><rect x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${s.toFixed(3)}" height="${s.toFixed(3)}" fill="#000"/>`);
  [[leftMark,topMark],[rightMark,topMark],[leftMark,midMark],[rightMark,midMark],[leftMark,bottomMark],[rightMark,bottomMark]].forEach(p=>marker(p[0],p[1]));
  if(exam.questions>50){const s=mark*.72;[.36,.68].forEach(y=>{marker(leftMark+(mark-s)/2,h*y-s/2,s);marker(rightMark+(mark-s)/2,h*y-s/2,s)})}
  if(layout.cols>=3){const s=mark*.50,x=w/2-s/2;marker(x,topMark+(mark-s)/2,s);marker(x,bottomMark+(mark-s)/2,s)}
  timingTrackForExam(exam).forEach(b=>parts.push(`<rect x="${(w*b.x).toFixed(3)}" y="${(h*b.y).toFixed(3)}" width="${(w*b.w).toFixed(3)}" height="${(h*b.h).toFixed(3)}" fill="#000"/>`));
  const left=w*SHEET_GEOMETRY.safeLeft,right=w*SHEET_GEOMETRY.safeRight,usable=right-left,titleSize=Math.max(3.2,Math.min(5.2,w*.034*(v.title/150))),metaSize=Math.max(2.1,Math.min(3.2,w*.021*(v.headers/175)));
  parts.push(svgText(left,h*SHEET_GEOMETRY.titleY,exam.name||'Evaluación',titleSize,'font-weight="800" dominant-baseline="middle"'));
  parts.push(svgText(right,h*SHEET_GEOMETRY.titleY,`EV-${exam.code||'0000'} · ${examIdentity(exam)}`,metaSize,'font-weight="700" text-anchor="end" dominant-baseline="middle"'));
  parts.push(svgText(left,h*SHEET_GEOMETRY.metaY,[courseName(exam.courseId),`Versión ${exam.version||'A'}`,`${exam.questions} preguntas`].filter(Boolean).join(' · '),metaSize,'font-weight="700" dominant-baseline="middle"'));
  const fieldY=h*SHEET_GEOMETRY.fieldTop,fieldH=h*SHEET_GEOMETRY.fieldHeight,fieldGap=w*.030,nameW=usable*.62,classW=usable-nameW-fieldGap,labelSize=Math.max(2.4,Math.min(4.0,w*.025*(v.headers/175))),stroke=Math.max(.28,.38*(v.stroke/145));
  parts.push(svgText(left,fieldY-labelSize*.55,labels.name,labelSize,'font-weight="800"'));
  parts.push(`<rect x="${left.toFixed(3)}" y="${fieldY.toFixed(3)}" width="${nameW.toFixed(3)}" height="${fieldH.toFixed(3)}" fill="#fff" stroke="#000" stroke-width="${stroke.toFixed(3)}"/>`);
  const classX=left+nameW+fieldGap;parts.push(svgText(classX,fieldY-labelSize*.55,labels.className,labelSize,'font-weight="800"'));
  parts.push(`<rect x="${classX.toFixed(3)}" y="${fieldY.toFixed(3)}" width="${classW.toFixed(3)}" height="${fieldH.toFixed(3)}" fill="#fff" stroke="#000" stroke-width="${stroke.toFixed(3)}"/>`);
  if(exam.studentIdMode==='both'||exam.studentIdMode==='code')parts.push(svgText(left,fieldY+fieldH+labelSize*.95,`${labels.code}: __________________`,Math.max(2.0,labelSize*.72),'font-weight="700"'));
  parts.push(svgText(left,h*SHEET_GEOMETRY.instructionY,labels.instruction,Math.max(2.0,Math.min(3.1,w*.019*(v.instructions/165))),'font-weight="700" dominant-baseline="middle"'));
  layout.positions.forEach(pos=>{
    const numberSize=Math.max(2.4,Math.min(4.0,pos.r*1.28*(v.numbers/175)));parts.push(svgText(pos.numberX,pos.cy,String(pos.q+1),numberSize,'font-weight="800" text-anchor="end" dominant-baseline="middle" fill="#000"'));
    pos.bubbles.forEach((cx,o)=>{parts.push(`<circle cx="${cx.toFixed(3)}" cy="${pos.cy.toFixed(3)}" r="${pos.r.toFixed(3)}" fill="none" stroke="${lineGray}" stroke-width="${Math.max(.22,.30*(v.stroke/145)).toFixed(3)}"/>`);parts.push(svgText(cx,pos.cy,letters[o],Math.max(1.9,pos.r*.95*(v.text/140)),`font-weight="600" text-anchor="middle" dominant-baseline="middle" fill="${gray}"`))});
  });
  const leftTextY=h*.55,rightTextY=h*.55,verticalSize=Math.max(2.2,Math.min(3.5,w*.021));
  parts.push(`<text x="${(w*.030).toFixed(3)}" y="${leftTextY.toFixed(3)}" transform="rotate(-90 ${(w*.030).toFixed(3)} ${leftTextY.toFixed(3)})" font-family="Arial,Helvetica,sans-serif" font-size="${verticalSize.toFixed(3)}" font-weight="800" text-anchor="middle">EvalúaCam</text>`);
  parts.push(`<text x="${(w*.970).toFixed(3)}" y="${rightTextY.toFixed(3)}" transform="rotate(90 ${(w*.970).toFixed(3)} ${rightTextY.toFixed(3)})" font-family="Arial,Helvetica,sans-serif" font-size="${Math.max(2.0,verticalSize*.82).toFixed(3)}" font-weight="700" text-anchor="middle">${xmlEsc((exam.name||'Evaluación').slice(0,42))}</text>`);
  parts.push(svgText(w/2,h*SHEET_GEOMETRY.footerY,`EvalúaCam Vector OMR · ${examIdentity(exam)} · ${layout.cols} columnas`,Math.max(1.45,w*.0092),'font-weight="700" text-anchor="middle" dominant-baseline="middle"'));
  return parts.join('');
}
function buildA4PageSvg(exam,copies,className='evaluacam-vector-page'){
  const p=pageLayoutMm(copies),groups=[];
  for(let i=0;i<copies;i++){const col=i%p.grid.cols,row=Math.floor(i/p.grid.cols),x=p.margin+col*(p.cellW+p.gap),y=p.margin+row*(p.cellH+p.gap);groups.push(`<g transform="translate(${x.toFixed(3)} ${y.toFixed(3)})">${sheetSvgContent(exam,copies,p.cellW,p.cellH)}</g>`)}
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" width="${p.pageW}mm" height="${p.pageH}mm" viewBox="0 0 ${p.pageW} ${p.pageH}" preserveAspectRatio="xMidYMid meet" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" data-orientation="${p.orientation}" data-copies="${copies}"><rect width="100%" height="100%" fill="#fff"/>${groups.join('')}</svg>`;
}
function renderSheetPagePreview(){
  const host=$('#sheetCanvasPreview');if(!host)return;const exam=selectedSheetExam();if(!exam){host.innerHTML='';return}
  const copies=+$('#copiesPerPage').value||1,renderExam=getConfiguredRenderExam(exam);host.innerHTML=buildA4PageSvg(renderExam,copies,'sheet-page-preview-svg');
  const layout=answerGridForQuestions(renderExam.questions,renderExam.options,copies),notice=$('#sheetLayoutNotice');if(notice){notice.className='sheet-layout-notice is-ok';notice.textContent=`Plantilla vectorial A4: ${layout.cols} columna(s), ${layout.rows} fila(s), marcadores fiduciales y pista de sincronización calculados en milímetros.`}
}
function ensurePrintPageStyle(orientation){let style=$('#dynamicPrintPageStyle');if(!style){style=document.createElement('style');style.id='dynamicPrintPageStyle';document.head.appendChild(style)}style.textContent=`@page{size:A4 ${orientation};margin:0}`}
function preparePrintPages(){
  const copies=+$('#copiesPerPage').value||1,exam=getConfiguredRenderExam(selectedSheetExam()),pages=$('#printPages'),p=pageLayoutMm(copies);pages.innerHTML='';ensurePrintPageStyle(p.orientation);
  const page=document.createElement('div');page.className=`print-page canonical-page ${p.orientation}`;page.innerHTML=buildA4PageSvg(exam,copies,'canonical-print-svg');pages.appendChild(page);
}
$('#printSheetBtn').onclick=()=>{if(!selectedSheetExam())return toast('Primero seleccione una evaluación.');preparePrintPages();document.body.classList.add('printing-sheets');requestAnimationFrame(()=>window.print())};window.addEventListener('afterprint',()=>document.body.classList.remove('printing-sheets'));
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1200)}
$('#downloadSheetSvgBtn').onclick=()=>{const base=selectedSheetExam();if(!base)return toast('Primero seleccione una evaluación.');const copies=+$('#copiesPerPage').value||1,exam=getConfiguredRenderExam(base),svg=buildA4PageSvg(exam,copies);downloadBlob(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),`hoja_${exam.name.replace(/[^a-z0-9áéíóúñ]+/gi,'_')}_${copies}xA4_vector.svg`);toast('SVG vectorial generado.')};
$('#downloadSheetImageBtn').onclick=async()=>{const base=selectedSheetExam();if(!base)return toast('Primero seleccione una evaluación.');const copies=+$('#copiesPerPage').value||1,exam=getConfiguredRenderExam(base),svg=buildA4PageSvg(exam,copies),p=pageLayoutMm(copies),blob=new Blob([svg],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{const dpi=300,canvas=document.createElement('canvas');canvas.width=Math.round(p.pageW/25.4*dpi);canvas.height=Math.round(p.pageH/25.4*dpi);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);canvas.toBlob(out=>out&&downloadBlob(out,`hoja_${exam.name.replace(/[^a-z0-9áéíóúñ]+/gi,'_')}_${copies}xA4_300dpi.png`),'image/png');toast('PNG de 300 ppp generado desde el SVG.')};img.onerror=()=>{URL.revokeObjectURL(url);toast('No fue posible convertir el SVG a PNG.')};img.src=url};
applyProfile('auto');

function currentScanCopies(){
  const raw=Number(state.scanCopies??state.settings.scanCopies??0);
  return [0,1,2,3,4].includes(raw)?raw:0;
}
function scanAspectCandidates(mode=currentScanCopies()){
  const values=mode?[mode]:[3,1,2,4];
  return values.map(copies=>({copies,aspect:responseSheetAspectForCopies(copies)}));
}
function markerSpecsForAspect(aspect){
  const xLeft=SHEET_GEOMETRY.markerX+SHEET_GEOMETRY.marker/2;
  const xRight=1-xLeft;
  const top=SHEET_GEOMETRY.markerTop+SHEET_GEOMETRY.marker*aspect/2;
  const mid=SHEET_GEOMETRY.markerMid;
  const bottom=SHEET_GEOMETRY.markerBottom-SHEET_GEOMETRY.marker*aspect/2;
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
  const mode=currentScanCopies(),format=mode===0?'Deteccion automatica de formato':mode===3?'3 por pagina - horizontal':mode===2?'2 por pagina - horizontal':mode===4?'4 por pagina - legado':'1 por pagina - vertical';
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
  if(!drawVideoFrame(video,canvas,2000)){state.autoScanBusy=false;setScanGuide('adjust','No se pudo obtener la imagen de la camara');return}
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
function timingSignatureEvidence(img,H){
  const track=activeTimingTrack();let sum=0,min=1;
  for(const b of track){
    const dark=sampleMappedDarkRatio(img,H,b.x+b.w*.08,b.y+b.h*.08,b.x+b.w*.92,b.y+b.h*.92,12,5);
    const tail=sampleMappedDarkRatio(img,H,b.x+b.w*1.08,b.y,b.x+b.w*1.62,b.y+b.h,7,4);
    const gap=sampleMappedDarkRatio(img,H,b.x,b.y+b.h*1.12,b.x+b.w*1.12,b.y+b.h*1.65,8,3);
    const score=clamp01((dark-.18)/.62)*(.72+.18*clamp01((.34-tail)/.34)+.10*clamp01((.30-gap)/.30));sum+=score;min=Math.min(min,score);
  }
  const average=sum/Math.max(1,track.length);return {score:average*.90+min*.10,average,min};
}
function orientationEvidence(img,H){
  const track=activeTimingTrack(),x0=Math.min(...track.map(b=>b.x)),x1=Math.max(...track.map(b=>b.x+b.w)),y0=Math.min(...track.map(b=>b.y)),y1=Math.max(...track.map(b=>b.y+b.h));
  const expected=sampleMappedDarkRatio(img,H,x0-.004,y0-.005,x1+.006,y1+.006),controls=[sampleMappedDarkRatio(img,H,1-x1-.006,y0-.005,1-x0+.004,y1+.006),sampleMappedDarkRatio(img,H,x0-.004,.08,x1+.006,.20)],other=Math.max(...controls),raw=expected-other*.72,signature=timingSignatureEvidence(img,H),evidence=clamp01((raw-.012)/.14)*.32+signature.score*.68;return {expected,other,raw,signature:signature.score,signatureMin:signature.min,evidence};
}
function orientationMappings(pattern,aspect){
  const specs=markerSpecsForAspect(aspect),byId=Object.fromEntries(specs.map(p=>[p.id,p])),a0=pattern.a0,a1=pattern.a1,am=pattern.am,b0=pattern.b0,b1=pattern.b1,bm=pattern.bm;
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
  for(const p of patterns.slice(0,18))for(const mapping of orientationMappings(p,p.format.aspect)){
    const H=homographyLeastSquares(mapping.map(x=>x.canonical),mapping.map(x=>x.source));if(!H)continue;const orientation=orientationEvidence(img,H),confidence=clamp01(p.geom*.74+orientation.evidence*.20+(p.markerCount/6)*.06),score=confidence+orientation.raw*.7;if(!best||score>best.score)best={...p,mapping,H,orientation,confidence,score};
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
function rectifiedTimingScore(canvas){const ctx=canvas.getContext('2d',{willReadFrequently:true}),img=ctx.getImageData(0,0,canvas.width,canvas.height),identity=[canvas.width,0,0,0,canvas.height,0,0,0],e=orientationEvidence(img,identity);return e}
function rectifyFromDetection(canvas,detected){
  if(!detected?.ok||!detected.canonicalSources?.length)return null;
  const canonical=detected.canonicalSources.map(p=>({x:p.u,y:p.v})),source=detected.canonicalSources.map(p=>({x:p.x*canvas.width,y:p.y*canvas.height})),H=homographyLeastSquares(canonical,source);if(!H)return null;
  const outW=920,outH=Math.max(620,Math.min(1900,Math.round(outW/detected.aspect))),out=warpCanvasByHomography(canvas,H,outW,outH),timing=rectifiedTimingScore(out);
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
  const work=rectified.canvas,ctx=work.getContext('2d',{willReadFrequently:true}),w=work.width,h=work.height,data=enhanceImageData(ctx.getImageData(0,0,w,h)),answers=[],scores=[],layout=answerLayoutForSheet(exam,rectified.copies||1,w,h),sens=$('#scanSensitivity')?.value||'normal',minScore=sens==='high'?22:sens==='low'?42:30,minGap=sens==='high'?5:sens==='low'?13:8;
  let ambiguous=0;
  for(const pos of layout.positions){
    const r=Math.max(6,pos.r*.84);let best=-1,bestScore=-1,second=-1;const optionScores=[];
    for(let o=0;o<exam.options;o++){
      const score=robustBubbleScore(data,pos.bubbles[o],pos.cy,r);optionScores.push(score);
      if(score>bestScore){second=bestScore;bestScore=score;best=o}else if(score>second)second=score;
    }
    const baseline=median(optionScores),confidence=bestScore-second,relative=bestScore-baseline,adaptiveMin=Math.max(minScore,baseline+10),adaptiveGap=Math.max(minGap,Math.min(18,relative*.34)),solidRead=bestScore>=adaptiveMin&&confidence>=adaptiveGap&&relative>=12,multiMarked=bestScore>=adaptiveMin&&second>=adaptiveMin*.94&&confidence<adaptiveGap&&relative>=10;
    if(solidRead)answers.push(letters[best]);else if(multiMarked){answers.push('*');ambiguous++}else{answers.push('');if(bestScore>=adaptiveMin*.78||relative>=8)ambiguous++}
    scores.push({best,bestScore,second,confidence,relative,baseline,optionScores,multiMarked,uncertain:!solidRead||multiMarked});
  }
  return {answers,ambiguous,scores};
}
function cropStudentNameRegion(rectifiedCanvas,exam){
  if(!rectifiedCanvas?.width||!rectifiedCanvas?.height||exam?.studentIdMode==='code')return '';
  const w=rectifiedCanvas.width,h=rectifiedCanvas.height;
  const x=Math.max(0,Math.round(w*(SHEET_GEOMETRY.safeLeft-.012)));
  const y=Math.max(0,Math.round(h*(SHEET_GEOMETRY.fieldTop-.060)));
  const cropW=Math.min(w-x,Math.round(w*(SHEET_GEOMETRY.safeRight-SHEET_GEOMETRY.safeLeft+.024)));
  const cropH=Math.min(h-y,Math.round(h*(SHEET_GEOMETRY.fieldHeight+.078)));
  const out=document.createElement('canvas');out.width=Math.max(720,cropW);out.height=Math.max(150,Math.round(out.width*cropH/cropW));
  const oc=out.getContext('2d');oc.imageSmoothingEnabled=true;oc.imageSmoothingQuality='high';oc.fillStyle='#fff';oc.fillRect(0,0,out.width,out.height);
  oc.drawImage(rectifiedCanvas,x,y,cropW,cropH,0,0,out.width,out.height);
  try{return out.toDataURL('image/jpeg',.90)}catch(_){return ''}
}
function processImage(canvas,hint=null){
  const id=$('#scanExamSelect').value,exam=state.exams.find(x=>x.id===id);if(!exam){toast('Seleccione una prueba.');return false}
  const rectified=rectifyByMarkers(canvas,hint);if(!rectified){setScanGuide('adjust','No se pudo aislar la hoja completa');toast('No se pudo leer la hoja. Muestre la hoja completa, sin cubrir los marcadores, y vuelva a intentarlo.');return false}
  const reading=readAnswersFromRectified(rectified,exam);
  try{state.lastScanCaptureDataUrl=rectified.canvas.toDataURL('image/jpeg',0.88);state.lastStudentNameCropDataUrl=cropStudentNameRegion(rectified.canvas,exam)}catch(err){state.lastScanCaptureDataUrl='';state.lastStudentNameCropDataUrl=''}
  state.lastScanSessionId=crypto.randomUUID();state.lastReadDiagnostics={ambiguous:reading.ambiguous,alignment:rectified.quality,copies:rectified.copies,markerCount:rectified.markerCount,scores:reading.scores};showScanResult(exam,reading.answers,true,rectified.markerCount);toast('Hoja detectada y corregida automaticamente.');return true;
}
window.EvaluaCamOMR={detectSheetOnCanvas,rectifyByMarkers,readAnswersFromRectified,processImage};

function gradeFromPercent(p,e){const min=+state.settings.minGrade,max=+state.settings.maxGrade,pass=+state.settings.passGrade,thr=e.threshold/100;if(p<=thr)return min+(pass-min)*(p/thr);return pass+(max-pass)*((p-thr)/(1-thr))}
function showScanResult(e,answers,aligned=true,markerCount=6){
  const reviewed=[...answers],diagnostics=state.lastReadDiagnostics?.scores||[],scanResultId=state.lastScanSessionId||crypto.randomUUID();
  let saving=false,savedOnce=false;
  const result=$('#scanResult');result.classList.remove('empty-state');
  const calculate=()=>{let correct=0,blank=0,multiple=0;reviewed.forEach((a,i)=>{if(!a)blank++;else if(a==='*')multiple++;if(a===e.key[i])correct++});const pct=Math.round(correct/e.questions*100),grade=gradeFromPercent(correct/e.questions,e).toFixed(1);return {correct,blank,multiple,pct,grade}};
  const setSaveButtons=(disabled,label='Guardando…')=>{['#saveNextScanBtn','#saveScanBtn'].forEach(sel=>{const b=$(sel);if(b){b.disabled=disabled;if(disabled){b.dataset.oldText=b.textContent;b.textContent=label}else if(b.dataset.oldText){b.textContent=b.dataset.oldText;delete b.dataset.oldText}}})};
  const render=()=>{const m=calculate();
    const rows=reviewed.map((a,i)=>{const multi=a==='*';const uncertain=diagnostics[i]?.uncertain||!a||multi;const stateLabel=multi?'Múltiple':uncertain?'Revisar':'Leída';return `<div class="scan-review-row ${uncertain?'needs-review':''}"><strong>${i+1}</strong><div class="scan-review-options">${letters.slice(0,e.options).map(l=>`<button type="button" data-review-q="${i}" data-review-a="${l}" class="${a===l?'selected':''}">${l}</button>`).join('')}<button type="button" data-review-q="${i}" data-review-a="" class="blank-choice ${!a?'selected':''}">—</button></div><span>${stateLabel}</span></div>`}).join('');
    result.innerHTML=`<div class="result-summary"><div class="score-ring" style="--score:${m.pct*3.6}deg"><strong>${m.pct}%</strong></div><h3>${m.correct} de ${e.questions} correctas</h3><p class="scan-course">${esc(courseName(e.courseId))} · ${esc(e.name)}</p>${state.lastStudentNameCropDataUrl?`<div class="scan-name-crop"><span>Nombre capturado de la hoja</span><img src="${state.lastStudentNameCropDataUrl}" alt="Nombre manuscrito capturado"></div>`:''}<input id="studentNameScan" class="student-name-input" placeholder="Escriba el nombre para buscar y ordenar (opcional)" autocomplete="off"><div class="result-grid"><div><span>Nota</span><strong>${m.grade}</strong></div><div><span>En blanco</span><strong>${m.blank}</strong></div><div><span>Múltiples</span><strong>${m.multiple}</strong></div></div><p>${aligned?`Hoja rectificada con ${markerCount} marcadores. Las respuestas con más de una alternativa se consideran incorrectas.`:'Lectura de respaldo.'}</p><div class="scan-review-list">${rows}</div><div class="scan-result-actions"><button id="saveNextScanBtn" class="primary">Guardar y escanear siguiente</button><button id="saveScanBtn" class="secondary">Guardar y ver resultados</button><button id="rescanBtn" class="ghost">Volver a escanear</button></div></div>`;
    $$('[data-review-q]').forEach(b=>b.onclick=()=>{if(saving||savedOnce)return;reviewed[+b.dataset.reviewQ]=b.dataset.reviewA;render()});
    const saveResult=async continueScanning=>{
      if(saving||savedOnce)return toast('Este escaneo ya se está guardando.');
      const existing=state.results.find(r=>r.id===scanResultId);
      if(existing){savedOnce=true;return toast('Este resultado ya fue guardado.');}
      saving=true;setSaveButtons(true);
      const current=calculate(),student=$('#studentNameScan').value.trim()||'Sin nombre',saved={id:scanResultId,scanSessionId:scanResultId,examId:e.id,examName:e.name,courseId:e.courseId,student,correct:current.correct,total:e.questions,pct:current.pct,grade:current.grade,date:new Date().toISOString(),answers:[...reviewed],scanConfidence:Math.round((state.lastReadDiagnostics?.alignment||0)*100),markerCount:state.lastReadDiagnostics?.markerCount||markerCount,nameImageDataUrl:state.lastStudentNameCropDataUrl||'',cloudStatus:'pending'};
      const captureData=state.lastScanCaptureDataUrl||'',nameData=state.lastStudentNameCropDataUrl||'';saved.pendingCaptureDataUrl=captureData;
      state.results.unshift(saved);state.selectedResultId=saved.id;saveLocalOnly();renderStats();savedOnce=true;saving=false;
      state.lastScanCaptureDataUrl='';state.lastStudentNameCropDataUrl='';state.lastScanSessionId=null;
      toast('Resultado guardado. El respaldo se sube en segundo plano.');
      const backgroundUpload=async()=>{
        try{
          if(window.EvaluaCamCloud?.isConfigured?.()){
            const remote=await window.EvaluaCamCloud.saveResult(saved,captureData,nameData);
            if(remote?.ok){Object.assign(saved,{captureUrl:remote.captureUrl||'',captureId:remote.captureId||'',nameImageUrl:remote.nameImageUrl||'',nameImageId:remote.nameImageId||'',namePreviewDataUrl:nameData,nameImageDataUrl:'',pendingCaptureDataUrl:'',cloudStatus:'saved'});saveLocalOnly();if(document.querySelector('#results.view.active'))renderResults();}
          }
        }catch(err){saved.cloudStatus='pending';saved.pendingCaptureDataUrl=captureData;saveLocalOnly();window.EvaluaCamCloud?.queueStateSync?.();}
      };
      backgroundUpload();
      if(continueScanning){result.className='empty-state';result.textContent='Resultado guardado. Preparando el siguiente escaneo…';setTimeout(()=>startCamera(),120)}else{go('results');$('#resultsCourseFilter').value=e.courseId;refreshResultsExamFilter(e.id);renderResults()}
    };
    $('#saveNextScanBtn').onclick=()=>saveResult(true);$('#saveScanBtn').onclick=()=>saveResult(false);$('#rescanBtn').onclick=()=>{if(saving||savedOnce)return;state.lastScanSessionId=null;result.className='empty-state';result.textContent='Preparando un nuevo escaneo…';setTimeout(()=>startCamera(),140)};
  };
  render();setTimeout(()=>$('#studentNameScan')?.focus(),50);
}
function refreshResultsExamFilter(preselect){const courseId=$('#resultsCourseFilter')?.value||'';const exams=state.exams.filter(e=>!courseId||e.courseId===courseId);const current=preselect||$('#resultsExamFilter')?.value||'';$('#resultsExamFilter').innerHTML='<option value="">Todas las evaluaciones</option>'+exams.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('');if(exams.some(e=>e.id===current))$('#resultsExamFilter').value=current;}
$('#resultsCourseFilter').onchange=()=>{refreshResultsExamFilter();state.selectedResultId=null;state.resultsPage=1;renderResults()};$('#resultsExamFilter').onchange=()=>{state.selectedResultId=null;state.resultsPage=1;renderResults()};
function filteredResults(){const c=$('#resultsCourseFilter').value,e=$('#resultsExamFilter').value;return state.results.filter(r=>(!c||r.courseId===c)&&(!e||r.examId===e))}
function resultNameImageSrc(r){return r?.namePreviewDataUrl||r?.nameImageDataUrl||''}
async function loadVisibleNamePreviews(rows){
  if(!window.EvaluaCamCloud?.isConfigured?.()||!document.querySelector('#results.view.active'))return;
  const ids=(rows||[]).filter(r=>r.nameImageId&&!resultNameImageSrc(r)).map(r=>r.id);if(!ids.length)return;
  state.namePreviewLoading=state.namePreviewLoading||new Set();const pending=ids.filter(id=>!state.namePreviewLoading.has(id));if(!pending.length)return;pending.forEach(id=>state.namePreviewLoading.add(id));
  try{const d=await window.EvaluaCamCloud.request('getNamePreviews',{resultIds:pending});const previews=d.previews||{};let changed=false;pending.forEach(id=>{const r=state.results.find(x=>x.id===id);if(r&&previews[id]){r.namePreviewDataUrl=previews[id];changed=true}});if(changed&&document.querySelector('#results.view.active'))renderResults()}catch(_){}finally{pending.forEach(id=>state.namePreviewLoading.delete(id))}
}
let resultsViewMode='list';
function setResultsView(mode){
  resultsViewMode=mode==='detail'?'detail':'list';
  const layout=$('#resultsLayout'),listTab=$('#resultsListTab'),detailTab=$('#resultsDetailTab');
  if(layout){layout.classList.toggle('list-mode',resultsViewMode==='list');layout.classList.toggle('detail-mode',resultsViewMode==='detail')}
  if(listTab){listTab.classList.toggle('active',resultsViewMode==='list');listTab.setAttribute('aria-selected',String(resultsViewMode==='list'))}
  if(detailTab){detailTab.classList.toggle('active',resultsViewMode==='detail');detailTab.setAttribute('aria-selected',String(resultsViewMode==='detail'))}
  if(resultsViewMode==='detail'){renderQuestionAnalytics(filteredResults());setTimeout(()=>$('#resultsDetailPane')?.scrollIntoView({behavior:'smooth',block:'start'}),30)}
}
$('#resultsListTab').onclick=()=>setResultsView('list');
$('#resultsDetailTab').onclick=()=>{if(!state.selectedResultId)return toast('Seleccione primero un estudiante.');setResultsView('detail')};
$('#backToResultsList').onclick=()=>setResultsView('list');
function renderResults(){
  refreshResultsExamFilter();const allRows=filteredResults(),body=$('#resultsBody'),courseId=$('#resultsCourseFilter').value,examId=$('#resultsExamFilter').value;
  const search=(state.resultsSearch||'').trim().toLowerCase(),rows=search?allRows.filter(r=>String(r.student||'').toLowerCase().includes(search)):allRows;
  const size=state.resultsPageSize||25,pages=Math.max(1,Math.ceil(rows.length/size));state.resultsPage=Math.min(Math.max(1,state.resultsPage||1),pages);const start=(state.resultsPage-1)*size,pageRows=rows.slice(start,start+size);
  $('#resultsContext').textContent=[courseId?courseName(courseId):'Todos los cursos',examId?state.exams.find(e=>e.id===examId)?.name:'Todas las evaluaciones',`${allRows.length} estudiante(s)`].filter(Boolean).join(' · ');
  body.innerHTML=pageRows.length?pageRows.map(r=>{const img=resultNameImageSrc(r);return `<tr><td>${new Date(r.date).toLocaleString('es-CL')}</td><td><div class="student-result-cell">${img?`<img loading="lazy" decoding="async" class="student-name-thumb" src="${esc(img)}" alt="Nombre manuscrito de ${esc(r.student)}">`:''}<strong>${esc(r.student)}</strong></div></td><td>${r.correct}/${r.total}</td><td>${r.pct}%</td><td>${r.grade}</td><td><button class="secondary compact" data-detail="${r.id}">Ver respuestas</button>${r.captureUrl?` <a class="secondary compact" href="${esc(r.captureUrl)}" target="_blank" rel="noopener">Ver captura</a>`:''}</td><td><button class="ghost" data-del="${r.id}">Eliminar</button></td></tr>`}).join(''):'<tr><td colspan="7" class="empty-state">No hay resultados para esta selección.</td></tr>';
  const pager=$('#resultsPagination');if(pager)pager.innerHTML=`<button class="ghost compact" id="resultsPrevPage" ${state.resultsPage<=1?'disabled':''}>← Anterior</button><span>Página ${state.resultsPage} de ${pages} · ${rows.length} resultado(s)</span><button class="ghost compact" id="resultsNextPage" ${state.resultsPage>=pages?'disabled':''}>Siguiente →</button>`;
  $('#resultsPrevPage')?.addEventListener('click',()=>{state.resultsPage--;renderResults()});$('#resultsNextPage')?.addEventListener('click',()=>{state.resultsPage++;renderResults()});
  loadVisibleNamePreviews(pageRows);
  $$('[data-detail]').forEach(b=>b.onclick=()=>{state.selectedResultId=b.dataset.detail;renderAnswerDetail();setResultsView('detail')});
  $$('[data-del]').forEach(b=>b.onclick=async()=>{const id=b.dataset.del;state.results=state.results.filter(r=>r.id!==id);if(state.selectedResultId===id)state.selectedResultId=null;saveLocalOnly();renderResults();renderStats();try{if(window.EvaluaCamCloud?.isConfigured?.())await window.EvaluaCamCloud.request('deleteResult',{resultId:id})}catch(err){toast('El resultado se eliminó localmente, pero no pudo eliminarse de Google.')}});
  if(state.selectedResultId&&!allRows.some(r=>r.id===state.selectedResultId)){state.selectedResultId=null;setResultsView('list')}renderAnswerDetail();if(resultsViewMode==='detail')renderQuestionAnalytics(allRows);
}
$('#resultsStudentSearch')?.addEventListener('input',e=>{state.resultsSearch=e.target.value;state.resultsPage=1;renderResults()});
function renderAnswerDetail(){
  const box=$('#answerDetail'),r=state.results.find(x=>x.id===state.selectedResultId);if(!r){box.className='empty-state';box.textContent='Seleccione un estudiante de la lista.';return}
  const e=state.exams.find(x=>x.id===r.examId);if(!e){box.className='empty-state';box.textContent='No se encontró la evaluación asociada.';return}
  const items=e.key.map((correct,i)=>{const answer=r.answers?.[i]||'';const status=answer===correct?'correct':answer?'wrong':'blank';const shown=answer==='*'?'Múltiple':(answer||'—');const label=status==='correct'?'Correcta':status==='wrong'?(answer==='*'?'Incorrecta (múltiple)':'Incorrecta'):'Sin respuesta';return `<tr class="${status}"><td>${i+1}</td><td><span class="answer-pill student-answer">${shown}</span></td><td><span class="answer-pill correct-answer">${correct}</span></td><td>${label}</td></tr>`}).join('');
  const img=resultNameImageSrc(r);box.className='';box.innerHTML=`<div class="detail-header"><div><span class="eyebrow">HOJA CORREGIDA</span><h2>${esc(r.student)}</h2>${img?`<img loading="lazy" decoding="async" class="detail-name-crop" src="${esc(img)}" alt="Nombre manuscrito capturado">`:''}<p>${esc(courseName(r.courseId))} · ${esc(e.name)}</p></div><div class="detail-score"><strong>${r.grade}</strong><span>${r.correct}/${r.total} · ${r.pct}%</span></div></div><div class="legend"><span><i class="dot correct-dot"></i>Correcta</span><span><i class="dot wrong-dot"></i>Incorrecta</span><span><i class="dot blank-dot"></i>Sin respuesta</span></div><div class="table-wrap answer-comparison"><table><thead><tr><th>Pregunta</th><th>Respuesta estudiante</th><th>Respuesta correcta</th><th>Resultado</th></tr></thead><tbody>${items}</tbody></table></div><div class="actions"><button id="printParentFeedbackBtn" class="primary">Imprimir retroalimentación</button><button id="printCorrectedBtn" class="secondary">Imprimir detalle</button></div>`;
  $('#printCorrectedBtn').onclick=()=>window.print();$('#printParentFeedbackBtn').onclick=()=>printFeedbackReports([r]);
}
function feedbackAnswerText(answer){return answer==='*'?'Múltiple':answer||'—'}
function buildFeedbackReport(r){
  const e=state.exams.find(x=>x.id===r.examId);if(!e)return '';
  const answers=e.key.map((correct,i)=>{const a=r.answers?.[i]||'',ok=a===correct,status=ok?'Correcta':a==='*'?'Múltiple':a?'Incorrecta':'Sin respuesta';return `<div class="feedback-answer ${ok?'ok':'bad'}"><b>${i+1}</b><span><small>Alumno</small>${esc(feedbackAnswerText(a))}</span><span><small>Correcta</small>${esc(correct)}</span><em>${status}</em></div>`}).join('');
  return `<section class="feedback-page ${e.questions>60?'feedback-dense':''}"><header><div><span>RETROALIMENTACIÓN DE EVALUACIÓN</span><h1>${esc(e.name)}</h1><p>${esc(courseName(r.courseId))}${e.subject?' · '+esc(e.subject):''}</p></div><div class="feedback-grade"><small>Nota</small><strong>${esc(r.grade)}</strong><span>${r.correct}/${r.total} · ${r.pct}%</span></div></header><div class="feedback-student"><div><small>Estudiante</small><strong>${esc(r.student)}</strong></div><div><small>Fecha</small><strong>${new Date(r.date).toLocaleDateString('es-CL')}</strong></div><div><small>Versión</small><strong>${esc(e.version||'A')}</strong></div></div><div class="feedback-head"><b>N°</b><span>Respuesta del estudiante</span><span>Respuesta correcta</span><em>Resultado</em></div><div class="feedback-grid">${answers}</div><footer>EvalúaCam · Documento de retroalimentación para apoderado</footer></section>`;
}
function printFeedbackReports(rows){
  const valid=(rows||[]).filter(r=>state.exams.some(e=>e.id===r.examId));if(!valid.length)return toast('No hay resultados para imprimir.');
  const host=$('#parentFeedbackPrint');host.innerHTML=valid.map(buildFeedbackReport).join('');document.body.classList.add('printing-feedback');requestAnimationFrame(()=>window.print());
}
window.addEventListener('afterprint',()=>{document.body.classList.remove('printing-feedback');const host=$('#parentFeedbackPrint');if(host)host.innerHTML=''});
$('#printFeedbackAllBtn')?.addEventListener('click',()=>{const examId=$('#resultsExamFilter').value;if(!examId)return toast('Seleccione una evaluación para imprimir las retroalimentaciones.');printFeedbackReports(filteredResults())});
$('#exportCsvBtn').onclick=()=>{
  const data=filteredResults();if(!data.length)return toast('No hay resultados para exportar.');
  const maxQ=Math.max(...data.map(r=>r.total||0)),qHeaders=Array.from({length:maxQ},(_,i)=>`P${i+1}`);
  const rows=[['Curso','Evaluación','Fecha','Estudiante','Correctas','Total','Porcentaje','Nota',...qHeaders],...data.map(r=>[courseName(r.courseId),r.examName,new Date(r.date).toLocaleString('es-CL'),r.student,r.correct,r.total,r.pct,r.grade,...Array.from({length:maxQ},(_,i)=>r.answers?.[i]==='*'?'Múltiple':(r.answers?.[i]||''))])];
  const csv=rows.map(row=>row.map(v=>`"${String(v).replaceAll('\"','\"\"')}"`).join(';')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='resultados_evaluacam.csv';a.click();URL.revokeObjectURL(a.href);
};
$('#clearResultsBtn').onclick=()=>{if(!window.EvaluaCamAuth?.isAdmin?.())return toast('Solo el administrador puede borrar todos los resultados.');const pin=prompt('Ingrese el PIN de seguridad:');if(pin!==(localStorage.getItem('ec_admin_delete_pin')||'1234'))return toast('PIN incorrecto.');if(confirm('¿Borrar todos los resultados?')){state.results=[];state.selectedResultId=null;save();renderResults();renderStats()}};
function renderStats(){const avg=state.results.length?Math.round(state.results.reduce((a,b)=>a+b.pct,0)/state.results.length):null;$('#statExams').textContent=state.exams.length;$('#statScans').textContent=state.results.length;$('#statAverage').textContent=avg===null?'—':avg+'%';$('#statLast').textContent=state.exams[0]?.name||'—';if($('#dashboard.view.active'))renderDashboardHierarchy()}
const printDefaults={copies:3,questions:20,version:'A',text:140,title:150,instructions:165,headers:175,numbers:175,black:130,contrast:135,sharp:130,stroke:145,bubble:120,marker:145,safeMargins:true,layoutVersion:12};
state.settings.print={...printDefaults,...(state.settings.print||{})};
function setCfg(id,value){const el=$('#'+id);if(el)el.value=value}
function configValues(){return {copies:+$('#cfgCopies').value,questions:+$('#cfgQuestions').value,version:$('#cfgVersion').value,text:+$('#cfgText').value,title:+$('#cfgTitle').value,instructions:+$('#cfgInstructions').value,headers:+$('#cfgHeaders').value,numbers:+$('#cfgNumbers').value,black:+$('#cfgBlack').value,contrast:+$('#cfgContrast').value,sharp:+$('#cfgSharp').value,stroke:+$('#cfgStroke').value,bubble:+$('#cfgBubble').value,marker:+$('#cfgMarker').value,safeMargins:$('#cfgSafeMargins').checked,layoutVersion:12}}
function applyConfigToMain(v){setCfg('copiesPerPage',v.copies);setCfg('blackLevel',v.black);setCfg('contrast',v.contrast);setCfg('sharpness',v.sharp);setCfg('bubbleStroke',v.stroke);setCfg('bubbleSize',v.bubble);setCfg('markerDarkness',v.marker);renderPrintPreviewStyle();updateOptimizer()}
function makePreviewSheet(e,questions,version){const paper=$('#printArea').cloneNode(true);paper.removeAttribute('id');paper.classList.add('config-preview-sheet');paper.querySelector('[id="sheetTitle"]').textContent=e?.name||'Evaluación de Matemáticas';paper.querySelector('[id="sheetMeta"]').textContent=`${questions} preguntas · Versión ${version}`;paper.querySelector('[id="sheetCode"]').textContent=(e?.code||'2025')+'-'+version;const box=paper.querySelector('[id="sheetQuestions"]');box.removeAttribute('id');box.innerHTML='';const opts=e?.options||5;for(let i=0;i<questions;i++){const row=document.createElement('div');row.className='sheet-question';row.innerHTML=`<span class="qnum">${i+1}.</span>`+letters.slice(0,opts).map(l=>`<span class="sheet-bubble"><i></i>${l}</span>`).join('');box.appendChild(row)}paper.querySelectorAll('[id]').forEach(x=>x.removeAttribute('id'));return paper}
function updateConfigPreview(){
  const v=configValues();state.settings.print={...state.settings.print,...v};
  const outs={cfgTextOut:v.text+'%',cfgTitleOut:v.title+'%',cfgInstructionsOut:v.instructions+'%',cfgHeadersOut:v.headers+'%',cfgNumbersOut:v.numbers+'%',cfgBlackOut:v.black+'%',cfgContrastOut:v.contrast+'%',cfgSharpOut:v.sharp+'%',cfgStrokeOut:v.stroke+'%',cfgBubbleOut:v.bubble+'%',cfgMarkerOut:v.marker+'%'};Object.entries(outs).forEach(([id,val])=>$('#'+id).textContent=val);
  applyConfigToMain(v);
  const base=state.exams.find(x=>x.id===$('#sheetExamSelect').value)||state.exams[0],exam=getConfiguredRenderExam(base,{questions:v.questions,version:v.version});
  const grid=$('#configPreviewGrid');grid.className=`config-preview-grid canonical-preview copies-${v.copies}`;grid.innerHTML='';
  grid.innerHTML=buildA4PageSvg(exam,v.copies,'canonical-preview-svg');grid.classList.toggle('show-safe-margins',v.safeMargins);
  $('#cfgPreviewMode').textContent=v.copies===3?'3 hojas por página (horizontal)':v.copies===2?'2 hojas por página (horizontal)':'1 hoja grande por página';
  let score=100-Math.abs(v.black-125)*.11-Math.abs(v.contrast-130)*.08-Math.abs(v.sharp-125)*.05-Math.max(0,135-v.stroke)*.12-Math.max(0,118-v.bubble)*.10-Math.max(0,140-v.headers)*.08-Math.max(0,140-v.numbers)*.08-(v.copies===3?1:0);score=Math.max(60,Math.min(99,Math.round(score)));$('#cfgQualityScore').textContent=score+'%';$('#cfgQualityBar').style.width=score+'%';$('#cfgQualityLabel').textContent=score>=94?'Excelente':score>=86?'Muy buena':'Mejorable';$('#cfgQualityText').textContent=v.copies===3?'Diseño horizontal de 3 hojas por página, optimizado para círculos más grandes y mejor lectura.':score>=94?'La vista previa, el SVG y la impresión usan exactamente la misma geometría A4.':'Aumente contraste, negros o grosor de círculos.';
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
