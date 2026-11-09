/* Modul Aset: notifications  (dimuat berurutan setelah file sebelumnya; berbagi scope global dengan modul aset lainnya) */
/* ===== PUSAT NOTIFIKASI REALTIME ===== */
const ld=()=>{const t=new Date(),p=n=>String(n).padStart(2,'0');return `${t.getFullYear()}-${p(t.getMonth()+1)}-${p(t.getDate())}`};
const NC=window.NC={store:null,uid:null,built:false,live:false,fresh:[]};
const SL={Pending:'Menunggu',Approved:'Diproses',Completed:'Selesai',Rejected:'Ditolak'};
const LV={info:['dobah','text-dobah-400','bg-dobah-500/15'],success:['emerald','text-emerald-400','bg-emerald-500/15'],warn:['amber','text-amber-400','bg-amber-500/15'],danger:['rose','text-rose-400','bg-rose-500/15']};
const IC={'req-new':'fa-file-circle-plus','req-ok':'fa-circle-check','req-no':'fa-circle-xmark','req-done':'fa-flag-checkered','req-upd':'fa-pen-to-square','ast-bad':'fa-triangle-exclamation','ast-mtc':'fa-screwdriver-wrench','ast-ok':'fa-circle-check','ast-new':'fa-box-open',mkt:'fa-store',loan:'fa-right-left',vendor:'fa-handshake',pend:'fa-hourglass-half',imp:'fa-link',inc:'fa-pen-to-square',mtc:'fa-calendar-check',more:'fa-bell'};
const skey=()=>'ga_nc_v1_'+((user()||{}).id);
function nload(){const u=user();if(!u){NC.store=null;return null}
 if(NC.uid!==u.id||!NC.store){NC.uid=u.id;try{NC.store=JSON.parse(localStorage.getItem(skey())||'null')}catch(e){NC.store=null}if(!NC.store)NC.store={items:[],req:null,ast:null,fired:{}}}
 return NC.store}
function nsave(){const st=NC.store;if(!st)return;try{localStorage.setItem(skey(),JSON.stringify(st))}catch(e){st.items=st.items.slice(0,25);try{localStorage.setItem(skey(),JSON.stringify(st))}catch(_){}}}
function add(n){const st=NC.store;if(st.fired[n.key])return;st.fired[n.key]=ld();
 const it={id:'N'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),ts:Date.now(),read:false,...n};st.items.unshift(it);NC.fresh.push(it)}
const ago=t=>{const m=Math.floor((Date.now()-t)/6e4);return m<1?'Baru saja':m<60?m+' menit lalu':m<1440?Math.floor(m/60)+' jam lalu':Math.floor(m/1440)+' hari lalu'};

function reqDiff(st){const me=user(),all=appState.requests||[];if(st.req&&st.reqv!==2)st.req=null;if(!all.length&&st.req)return;
 const L=getAccessibleRequests(),first=!st.req,nb={},news=[];if(!L.length&&!first)return;
 L.forEach(r=>{const au=r.audit||[],last=au[au.length-1]||{},byMe=last.actor===me.name,sig=(r.items||[]).map(i=>i.itemStatus||'').join(','),rq=(au[0]||{}).actor||'-',k=r.docId||r.id;nb[k]=[r.status,au.length,sig];
  if(first)return;const pv=st.req[k];
  if(!pv){const recent=!r.submissionDate||(new Date(ld())-new Date(r.submissionDate))/864e5<=7;if(isGA()&&!byMe&&recent)news.push({r,rq});return}
  if(byMe)return;
  if(pv[0]!==r.status){const lbl=SL[r.status]||r.status,base={key:`rs|${k}|${r.status}|${au.length}`,tab:'list'};
   if(r.status==='Approved')add({...base,type:'req-ok',level:'success',title:`Pengajuan ${r.id} disetujui`,msg:`${r.branch} · status: ${lbl}${last.actor?' · oleh '+last.actor:''}`});
   else if(r.status==='Rejected')add({...base,type:'req-no',level:'danger',title:`Pengajuan ${r.id} ditolak`,msg:r.gaNotes||last.action||r.branch});
   else if(r.status==='Completed')add({...base,type:'req-done',level:'success',title:`Pengajuan ${r.id} selesai`,msg:`${r.branch} · seluruh item telah selesai dikerjakan`});
   else add({...base,type:'req-upd',level:'info',title:`Status ${r.id} berubah`,msg:`Sekarang: ${lbl}${last.actor?' · oleh '+last.actor:''}`})}
  else if(au.length>pv[1])add({key:`ra|${k}|${au.length}`,type:'req-upd',level:'info',tab:'list',title:`Pembaruan ${r.id}`,msg:`${last.actor||'-'}: ${last.action||'memperbarui pengajuan'}`});
  else if(sig!==pv[2])add({key:`ri|${k}|${sig}`,type:'req-upd',level:'info',tab:'list',title:`Item ${r.id} diperbarui`,msg:`${r.branch} · status item berubah`})});
 if(news.length>3)add({key:`rnsum|${ld()}|${news.length}`,type:'req-new',level:'info',tab:'list',title:`${news.length} pengajuan baru masuk`,msg:'Buka Daftar & Status Permintaan untuk memprosesnya.'});
 else news.forEach(({r,rq})=>add({key:'rn|'+(r.docId||r.id),type:'req-new',level:'info',tab:'list',title:`Pengajuan baru ${r.id}`,msg:`${rq} · ${r.branch} · ${(r.items||[]).length} item`}));
 st.req=nb;st.reqv=2}

function astDiff(st){const me=user();if(!AM.assets.length&&st.ast)return;const first=!st.ast,nb={};
 mine().forEach(a=>{nb[a.id]=a.status;if(first)return;const pv=st.ast[a.id];if(!pv){if(!isGA()&&!(a.history||[]).some(h=>h.by===me.name))add({key:`an|${a.id}|${a.branch||''}`,type:'ast-new',level:'info',tab:'areg',title:'Aset baru dialokasikan ke cabang Anda',msg:`${a.name}${q(a)>1?' · '+q(a)+' unit':''} · ${a.branch||'-'}${a.division?' · '+a.division:''}`});return}if(pv===a.status)return;const h=a.history||[],by=(h[h.length-1]||{}).by;if(by===me.name)return;
  if(a.status==='Broken'){if(isGA())add({key:`ab|${a.id}|${h.length}`,type:'ast-bad',level:'danger',tab:'amtc',title:'Aset dilaporkan rusak',msg:`${a.name} · ${a.branch||'-'}${by?' · oleh '+by:''}`})}
  else if(a.status==='Maintenance'){if(!isGA())add({key:`am|${a.id}|${h.length}`,type:'ast-mtc',level:'warn',tab:'amtc',title:'Aset sedang diservis',msg:`${a.name} · ${a.branch||'-'}`})}
  else if(a.status==='Good'&&(pv==='Maintenance'||pv==='Broken')){if(!isGA())add({key:`ag|${a.id}|${h.length}`,type:'ast-ok',level:'success',tab:'areg',title:'Aset kembali berfungsi',msg:`${a.name} · ${a.branch||'-'}`})}});
 st.ast=nb}

function mktDiff(st){if(!AM.market.length&&!st.mkt)return;const first=!st.mkt,nb={},me=user(),all=canAll();
 AM.market.forEach(m=>{nb[m.id]=[m.status,m.left];if(first)return;const pv=st.mkt[m.id],own=!all&&myBranches().includes(m.branch);
  if(!pv){if(m.status==='Open'&&!own&&!isGA()&&m.createdBy!==me.name)add({key:'mn|'+m.id,type:'mkt',level:'info',tab:'amkt',title:'Aset dijual di Pasar Antar Toko',msg:`${m.name} · ${m.left} unit · ${rp(m.price)}/unit · ${m.branch}`});return}
  if(pv[1]>m.left&&own){const t=AM.trades.filter(x=>x.listingId===m.id).slice(-1)[0]||{};add({key:`ms|${m.id}|${m.left}`,type:'mkt',level:'success',tab:'amkt',title:'Aset Anda terjual',msg:`${m.name} · ${pv[1]-m.left} unit ke ${t.to||'-'}`})}});
 st.mkt=nb}
function incDiff(st){if(!AM.incidents.length&&!st.inc)return;const first=!st.inc,nb={},me=user();
 AM.incidents.forEach(i=>{nb[i.id]=1;if(first||st.inc[i.id]||i.by===me.name)return;
  add({key:'in2|'+i.id,type:'ast-bad',level:i.kind==='lost'?'danger':'warn',tab:'ainc',title:i.kind==='lost'?'Aset dilaporkan hilang':'Aset dilaporkan rusak',msg:`${i.name} · ${i.qty} unit · ${i.branch||'-'} · ${KIND[i.kind][1]}`})});st.inc=nb}
function periodic(){const d=ld(),R=getAccessibleRequests().filter(r=>r.status==='Pending');
 if(R.length){const age=r=>r.submissionDate?Math.max(0,Math.floor((new Date(d)-new Date(r.submissionDate))/864e5)):0,old=R.slice().sort((a,b)=>age(b)-age(a))[0],ag=age(old);
  add({key:'pend|'+d,type:'pend',level:ag>=2?'warn':'info',tab:'list',title:`${R.length} pengajuan menunggu proses`,msg:ag>=1?`Terlama ${ag} hari (${old.id} · ${old.branch})`:'Segera tinjau pengajuan yang masuk.'})}
 const act=AM.loans.filter(l=>!l.returnedAt&&l.due),nm=a=>a.slice(0,3).map(l=>l.name).join(', ')+(a.length>3?` +${a.length-3}`:''),
  late=act.filter(l=>days(l.due)<0),t0=act.filter(l=>days(l.due)===0),t1=act.filter(l=>days(l.due)===1);
 if(late.length)add({key:'ll|'+d,type:'loan',level:'danger',tab:'aasg',title:`${late.length} peminjaman lewat batas kembali`,msg:nm(late)});
 if(t0.length)add({key:'l0|'+d,type:'loan',level:'warn',tab:'aasg',title:`${t0.length} peminjaman jatuh tempo hari ini`,msg:nm(t0)});
 if(t1.length)add({key:'l1|'+d,type:'loan',level:'info',tab:'aasg',title:`${t1.length} peminjaman jatuh tempo besok`,msg:nm(t1)});
 AM.vendors.forEach(v=>{if(!v.expiry)return;const dd=days(v.expiry),b=dd<0?'exp':dd<=7?'7':dd<=14?'14':dd<=30?'30':null;
  if(b)add({key:`vd|${v.id}|${b}`,type:'vendor',level:dd<=7?'danger':'warn',tab:'aven',title:dd<0?'Kontrak vendor sudah berakhir':'Kontrak vendor segera berakhir',msg:`${v.name} · ${dd<0?'berakhir '+(-dd)+' hari lalu':dd+' hari lagi'} (${v.expiry})`})});
 const ms=mine().filter(a=>a.mtcDate===d&&(a.status==='Maintenance'||a.status==='Broken'));
 if(ms.length)add({key:'mt|'+d,type:'mtc',level:'info',tab:'amtc',title:`${ms.length} jadwal servis hari ini`,msg:ms.slice(0,3).map(a=>a.name).join(', ')});
 const br=mine().filter(a=>a.status==='Broken');if(br.length)add({key:'br|'+d,type:'ast-bad',level:'danger',tab:'amtc',title:`${sq(br)} unit aset rusak belum ditangani`,msg:'Jadwalkan servis ke vendor.'});
 const pi=pendingImport().length;if(pi)add({key:'im|'+d,type:'imp',level:'info',tab:'areg',title:`${pi} item selesai belum masuk registry`,msg:'Sinkronkan agar tercatat sebagai aset.'});
 const inN=mine().filter(a=>inc(a)&&!dead(a)).length;if(inN)add({key:'in|'+d,type:'inc',level:'info',tab:'areg',title:`${inN} aset datanya belum lengkap`,msg:'Lengkapi kategori, cabang, dan harga lewat Isi Kolom.'})}

NC.scan=function(){if(!AM.loaded)return;const st=nload();if(!st)return;NC.fresh=[];
 try{reqDiff(st);astDiff(st);if(isGA()){mktDiff(st);incDiff(st);periodic()}}catch(e){console.error('Notifikasi:',e)}
 const cut=new Date(Date.now()-30*864e5).toISOString().slice(0,10);Object.keys(st.fired).forEach(k=>{if(st.fired[k]<cut)delete st.fired[k]});
 st.items=st.items.slice(0,80);nsave();ui();announce(NC.fresh)};

/* --- tampilan --- */
function ui(){const st=nload(),menu=$('notifMenu');if(!st||!menu)return;
 if(!NC.built){NC.built=true;NC.title=document.title;menu.classList.replace('w-72','w-80');menu.classList.add('sm:w-96');$('notifList').classList.replace('max-h-60','max-h-96');
  menu.firstElementChild.innerHTML=`<span>Pemberitahuan</span><span class="flex items-center gap-2 font-semibold text-[10px]"><button onclick="NC.sound()" id="ncSnd" title="Suara notifikasi" class="text-dobah-300"></button><button onclick="NC.readAll()" class="text-dobah-300 hover:text-white">Tandai dibaca</button><button onclick="NC.clear()" class="text-rose-300 hover:text-rose-200">Hapus</button></span>`;
  $('notifList').insertAdjacentHTML('afterend','<div id="ncFoot" class="px-4 py-2 border-t border-white/5 bg-cocoa-900/60"></div>');
  if(!$('ncToasts'))document.body.insertAdjacentHTML('beforeend','<div id="ncToasts" class="fixed top-20 right-4 z-[100] space-y-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-none"></div>');
  const bd=$('notifBadge');if(bd){bd.classList.remove('w-4');bd.classList.add('min-w-[1rem]','px-1')}}
 const un=st.items.filter(i=>!i.read).length,bd=$('notifBadge');if(bd){bd.textContent=un>9?'9+':un;bd.classList.toggle('hidden',!un)}
 document.title=(un?`(${un}) `:'')+(NC.title||document.title);
 $('ncSnd').innerHTML=`<i class="fa-solid ${localStorage.getItem('ga_nc_snd')==='0'?'fa-volume-xmark text-dobah-200/40':'fa-volume-high'}"></i>`;
 $('notifList').innerHTML=st.items.length?st.items.map(n=>{const[,tc,bc]=LV[n.level]||LV.info;
  return `<button onclick="NC.open('${n.id}')" class="w-full text-left p-2.5 rounded-xl border flex gap-2.5 items-start transition hover:border-dobah-400/40 ${n.read?'bg-cocoa-900/40 border-white/5 opacity-70':'bg-dobah-400/10 border-dobah-400/20'}"><span class="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center ${bc} ${tc}"><i class="fa-solid ${IC[n.type]||'fa-bell'}"></i></span><span class="flex-1 min-w-0"><span class="block font-bold text-dobah-100 text-[12px]">${esc(n.title)}</span><span class="block text-dobah-200/80 mt-0.5 break-words">${esc(n.msg)}</span><span class="block text-[10px] text-dobah-200/50 mt-1">${ago(n.ts)}</span></span>${n.read?'':'<span class="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0"></span>'}</button>`}).join('')
  :'<p class="text-dobah-300/50 text-center italic py-4">Belum ada notifikasi.</p>';
 const sup='Notification' in window,pm=sup?Notification.permission:'none';
 $('ncFoot').innerHTML=!sup?'':pm==='granted'?'<span class="text-[10px] text-emerald-400"><i class="fa-solid fa-circle-check mr-1"></i>Notifikasi browser aktif (selama tab aplikasi terbuka)</span>':pm==='denied'?'<span class="text-[10px] text-dobah-200/50">Notifikasi browser diblokir di pengaturan browser.</span>':'<button onclick="NC.perm()" class="text-[11px] font-bold text-dobah-300 underline">Aktifkan notifikasi browser</button>'}
function toast(n){const box=$('ncToasts');if(!box)return;const[,tc,bc]=LV[n.level]||LV.info,e=document.createElement('div');
 e.className='pointer-events-auto cursor-pointer glass-panel p-3 flex gap-2.5 items-start shadow-2xl border border-dobah-400/30 transition-all duration-300 translate-x-4 opacity-0';
 e.innerHTML=`<span class="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${bc} ${tc}"><i class="fa-solid ${IC[n.type]||'fa-bell'}"></i></span><span class="flex-1 min-w-0 text-xs"><span class="block font-bold text-white">${esc(n.title)}</span><span class="block text-dobah-200/80 mt-0.5 break-words">${esc(n.msg)}</span></span>`;
 e.onclick=()=>{e.remove();n.type==='more'?toggleNotifMenu():NC.open(n.id)};box.appendChild(e);
 requestAnimationFrame(()=>e.classList.remove('translate-x-4','opacity-0'));setTimeout(()=>{e.classList.add('opacity-0');setTimeout(()=>e.remove(),300)},7000)}
function beep(){if(localStorage.getItem('ga_nc_snd')==='0')return;try{const C=window.AudioContext||window.webkitAudioContext,c=NC.ac||(NC.ac=new C()),o=c.createOscillator(),g=c.createGain(),t=c.currentTime;o.connect(g);g.connect(c.destination);o.type='sine';o.frequency.setValueAtTime(880,t);o.frequency.setValueAtTime(1175,t+.12);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.15,t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+.4);o.start(t);o.stop(t+.42)}catch(e){}}
function announce(f){if(!f.length)return;f.slice(0,3).forEach(toast);if(f.length>3)toast({type:'more',level:'info',title:`${f.length-3} notifikasi lainnya`,msg:'Klik untuk membuka daftar notifikasi.'});
 if(NC.live)beep();
 if('Notification' in window&&Notification.permission==='granted'&&document.hidden)f.slice(0,3).forEach(n=>{try{new Notification(n.title,{body:n.msg,tag:n.key})}catch(e){}})}
NC.open=function(id){const st=nload(),n=st&&st.items.find(x=>x.id===id);if(!n)return;n.read=true;nsave();ui();const m=$('notifMenu');if(m)m.classList.add('hidden');if(n.tab)switchTab(n.tab)};
NC.readAll=function(){const st=nload();if(!st)return;st.items.forEach(i=>i.read=true);nsave();ui()};
NC.clear=function(){const st=nload();if(!st)return;st.items=[];nsave();ui()};
NC.sound=function(){localStorage.setItem('ga_nc_snd',localStorage.getItem('ga_nc_snd')==='0'?'1':'0');ui()};
NC.perm=function(){if('Notification' in window)Notification.requestPermission().then(()=>ui())};
NC.start=function(){if(!user())return;ui();if(NC.t){NC.scan();return}NC.t=1;setTimeout(()=>{NC.live=true},4000);setInterval(()=>NC.scan(),300000);setInterval(ui,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)NC.scan()});NC.scan()};
window.updateNotifications=function(){NC.scan()};

window.addEventListener('DOMContentLoaded',()=>{load()});
window.addEventListener('profile-ready',()=>{load();subscribe();NC.start()});
