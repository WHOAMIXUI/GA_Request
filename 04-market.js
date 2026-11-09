/* Modul Aset: market  (dimuat berurutan setelah file sebelumnya; berbagi scope global dengan modul aset lainnya) */
/* --- jual beli aset antar toko --- */
const myBranches=()=>((user()||{}).branches||[]).filter(b=>b!=='ALL');
const canAll=()=>{const u=user();return isGA()||!!(u&&(u.branches||[]).includes('ALL'))};
const reserved=(aid,ex)=>AM.market.filter(m=>m.assetId===aid&&m.status==='Open'&&m.id!==ex).reduce((n,m)=>n+m.left,0);
const freeQty=(a,ex)=>q(a)-onLoan(a)-reserved(a.id,ex);
const perUnit=a=>Math.round(dep(a).book/q(a));
const mOwn=m=>canAll()||myBranches().includes(m.branch);
/* --- toko pembeli (penawaran langsung) ---
   m.to = nama toko pembeli. Kosong / tidak ada (listing lama) = terbuka untuk semua toko. */
const allStores=()=>appState.branches||[];
const buyerStores=from=>allStores().filter(b=>b!==from);
const forStore=m=>(m.to&&allStores().includes(m.to))?m.to:'';           // toko tujuan yang masih valid; '' = terbuka
const toLabel=m=>forStore(m)||'Semua toko';
const seeListing=m=>canAll()||(!myBranches().includes(m.branch)&&(!forStore(m)||myBranches().includes(forStore(m))));
const stamp=()=>new Date().toLocaleString('id-ID');
const WN={background:'#22120a',color:'#fcf6f0',confirmButtonColor:'#f4a23a'};
const mbadge=s=>{const[c,l]={Open:['emerald','Dijual'],Sold:['blue','Terjual'],Cancelled:['slate','Dibatalkan']}[s]||['slate',s];return `<span class="px-2.5 py-1 text-[10px] uppercase font-bold rounded border bg-${c}-500/10 text-${c}-400 border-${c}-500/20">${l}</span>`};
function mktCards(){const el=$('amMktGrid');if(!el)return;const all=canAll(),mb=myBranches(),qq=(AM.mq||'').toLowerCase();
 const L=AM.market.filter(m=>m.status==='Open'&&seeListing(m)&&(!qq||(m.name+' '+m.branch+' '+(m.category||'')+' '+toLabel(m)).toLowerCase().includes(qq))).sort((a,b)=>(b.ts||0)-(a.ts||0));
 el.innerHTML=L.length?L.map(m=>{const a=find(m.assetId),bk=a?perUnit(a):null,age=a?Math.max(0,Math.floor((Date.now()-new Date(a.date))/2629800000)):null;
  return `<div class="glass-panel p-5 flex flex-col"><div class="flex justify-between items-start gap-2"><h3 class="font-bold text-white text-sm">${esc(m.name)}</h3><span class="px-2 py-1 text-[10px] font-bold rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 whitespace-nowrap">${m.left} unit</span></div>
  <p class="text-xs text-dobah-200/70 mt-1">${esc(m.category)||'—'}</p>
  <p class="text-xs text-dobah-200/80 mt-2"><i class="fa-solid fa-store mr-1"></i>${esc(m.branch)}</p>
  ${forStore(m)?`<p class="mt-2"><span class="px-2 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/20 font-bold text-[10px] uppercase"><i class="fa-solid fa-bullseye mr-1"></i>Khusus ${esc(forStore(m))}</span></p>`:''}
  <p class="font-mono font-black text-xl text-white mt-3">${rp(m.price)}<span class="text-[11px] font-semibold text-dobah-200/60"> / unit</span></p>
  ${bk!=null?`<p class="text-[11px] text-dobah-200/60 mt-1">Nilai buku ± ${rp(bk)} / unit · umur ${age} bln</p>`:''}
  ${m.note?`<p class="text-xs text-dobah-200/70 mt-2 italic">“${esc(m.note)}”</p>`:''}
  <p class="text-[10px] text-dobah-200/50 mt-2">Oleh ${esc(m.createdBy)} · ${esc(m.createdAt)}</p>
  <div class="mt-auto pt-4"><button onclick="AM.buy('${m.id}')" class="modern-button bg-dobah-400 text-cocoa-950 text-xs font-bold px-4 py-2"><i class="fa-solid fa-cart-shopping mr-1"></i>Beli</button></div></div>`}).join('')
 :'<div class="glass-panel p-10 text-center text-dobah-200/50 italic md:col-span-2 xl:col-span-3">Belum ada aset yang dijual toko lain.</div>'}
function mkt(){const all=canAll(),mb=myBranches(),t=AM.mktTab||'browse';
 const browse=AM.market.filter(m=>m.status==='Open'&&seeListing(m)),mineL=AM.market.filter(mOwn).sort((a,b)=>(b.ts||0)-(a.ts||0)),
  T=AM.trades.filter(x=>all||mb.includes(x.from)||mb.includes(x.to)).sort((a,b)=>(b.ts||0)-(a.ts||0)),sum=T.reduce((n,x)=>n+x.total,0);
 const tabs=[['browse','Pasar Aset ('+browse.length+')'],['mine',(all?'Semua Listing':'Listing Cabang Saya')+' ('+mineL.length+')'],['hist','Riwayat Transaksi ('+T.length+')']].map(([k,l])=>`<button onclick="AM.mTab('${k}')" class="modern-button text-xs font-bold px-4 py-2 border ${t===k?'bg-dobah-400 text-cocoa-950 border-dobah-400':'bg-cocoa-800 text-dobah-200 border-white/10'}">${l}</button>`).join('');
 let body='';
 if(t==='browse')body=`<div class="glass-panel p-4"><input placeholder="Cari aset / cabang penjual..." value="${esc(AM.mq)}" oninput="AM.mQ(this.value)" class="w-full glass-input px-3.5 py-2 text-xs sm:text-sm font-semibold"></div><div id="amMktGrid" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"></div>`;
 else if(t==='mine'){const rows=mineL.map(m=>`<tr class="hover:bg-white/[0.02]"><td class="p-4 font-bold text-white">${esc(m.name)}${sub(esc(m.assetId)+' · '+esc(m.createdAt))}</td><td class="p-4">${esc(m.branch)}</td><td class="p-4">${forStore(m)?esc(forStore(m)):'<span class="text-dobah-200/60">Semua toko</span>'}</td><td class="p-4 font-mono font-bold text-white">${m.left}<span class="text-dobah-200/50 text-xs"> / ${m.qty}</span></td><td class="p-4 font-mono">${rp(m.price)}</td><td class="p-4">${mbadge(m.status)}</td><td class="p-4 whitespace-nowrap">${m.status==='Open'?btn(`AM.mktEdit('${m.id}')`,'fa-pen','Ubah harga / jumlah')+btn(`AM.mktCancel('${m.id}')`,'fa-ban','Batalkan listing','text-rose-400'):''}</td></tr>`).join('');
  body=tbl(th('Aset','Cabang Penjual','Dibeli oleh','Sisa / Awal','Harga / Unit','Status','Aksi'),rows,'Belum ada listing. Klik “Jual Aset” untuk memasang aset ke toko lain.')}
 else{const rows=T.map(x=>`<tr class="hover:bg-white/[0.02]"><td class="p-4 whitespace-nowrap">${esc(x.date)}${sub(esc(x.id))}</td><td class="p-4 font-bold text-white">${esc(x.name)}${sub(esc(x.category)||'—')}</td><td class="p-4 text-xs">${esc(x.from)} <i class="fa-solid fa-arrow-right mx-1 text-dobah-400"></i> ${esc(x.to)}${sub('Penjual: '+esc(x.seller)+' · Pembeli: '+esc(x.buyer))}</td><td class="p-4 font-mono font-bold text-white">${x.qty}</td><td class="p-4 font-mono">${rp(x.price)}</td><td class="p-4 font-mono font-bold text-white">${rp(x.total)}</td></tr>`).join('');
  body=tbl(th('Tanggal','Aset','Dari → Ke','Qty','Harga / Unit','Total'),rows,'Belum ada transaksi jual beli antar toko.')}
 $('view-amkt').innerHTML=`<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">${kpi('Dijual Toko Lain',sq(browse.map(m=>({qty:m.left}))),'fa-store')}${kpi('Listing Aktif Saya',mineL.filter(m=>m.status==='Open').length,'fa-tag','emerald')}${kpi('Transaksi',T.length,'fa-handshake','blue')}${kpi('Nilai Transaksi',rp(sum),'fa-wallet')}</div>
 <div class="flex flex-wrap justify-between items-center gap-3"><div class="flex gap-2 flex-wrap">${tabs}</div><button onclick="AM.sell()" class="modern-button bg-dobah-400 text-cocoa-950 text-xs font-bold px-4 py-2"><i class="fa-solid fa-tag mr-1"></i>Jual Aset</button></div>${body}`;
 if(t==='browse')mktCards()}
AM.mTab=function(k){AM.mktTab=k;mkt()};
AM.mQ=function(v){AM.mq=v;mktCards()};
AM.sell=async function(pre){if(!isGA())return deny();const E=mine().filter(a=>a.status==='Good'&&a.branch&&freeQty(a)>=1);
 if(!E.length)return Swal.fire({title:'Tidak ada aset yang bisa dijual',text:'Hanya aset berstatus Baik, sudah punya cabang, dan tidak sedang dipinjam / dilisting penuh yang bisa dijual.',icon:'info',...WN});
 if(allStores().length<2)return Swal.fire({title:'Cabang belum cukup',text:'Jual beli antar toko butuh minimal 2 cabang di Master Data.',icon:'info',...WN});
 // 1) kelompokkan aset yang boleh dijual per toko penjual
 const by={};E.forEach(a=>(by[a.branch]=by[a.branch]||[]).push(a));const stores=Object.keys(by).sort();
 const pa=pre&&E.find(a=>a.id===pre),st0=pa?pa.branch:stores[0],a0=pa||by[st0][0];
 const aOpts=b=>(by[b]||[]).map(a=>[a.id,`${a.name} (tersedia ${freeQty(a)} unit · ±${rp(perUnit(a))}/unit)`]);
 const toOpts=b=>[['','Semua toko (terbuka, siapa saja boleh beli)'],...buyerStores(b).map(x=>[x,x])];
 const fill=(id,opts)=>{const el=$(id);if(el)el.innerHTML=opts.map(o=>`<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('')};
 const r=await ask('Jual Aset ke Toko Lain',[
  {k:'from',l:'Aset yang akan dijual — pilih toko',v:st0,opts:stores.map(b=>[b,`${b} — ${by[b].length} jenis aset, ${by[b].reduce((n,a)=>n+freeQty(a),0)} unit tersedia`])},
  {k:'a',l:'Pilih aset di toko tersebut',v:a0.id,opts:aOpts(st0)},
  {k:'qty',l:'Jumlah unit dijual',t:'number',v:1},
  {k:'price',l:'Harga jual per unit (Rp)',t:'number',v:perUnit(a0)},
  {k:'to',l:'Dibeli oleh toko mana?',v:'',opts:toOpts(st0)},
  {k:'note',l:'Catatan (kondisi, alasan jual, dll)'}],'Pasang Listing',{
  html:'<div id="swSum" class="mt-4 p-3 rounded-lg text-left text-xs leading-relaxed bg-[#150a05] border border-white/10 text-[#edd5b3]"></div>',
  open:()=>{const F=$('sw_from'),A=$('sw_a'),Q=$('sw_qty'),P=$('sw_price'),T=$('sw_to');
   // ringkasan langsung: stok, total, selisih terhadap nilai buku, dan siapa pembelinya
   const upd=()=>{const a=find(A.value),box=$('swSum');if(!a||!box)return;const mx=freeQty(a),n=parseInt(Q.value)||0,p=Number(P.value)||0,bk=perUnit(a),d=p-bk,who=T.value;Q.min=1;Q.max=mx;
    box.innerHTML=`<div>Tersedia <b>${mx}</b> unit di <b>${esc(a.branch)}</b> · nilai buku ±<b>${rp(bk)}</b> / unit</div>`
     +`<div class="mt-1">Total jual: <b>${rp(n*p)}</b> (${n} × ${rp(p)})${p===0?' · <span class="text-amber-400">Rp 0 = serah tanpa pembayaran</span>':d<0?` · <span class="text-amber-400">${rp(-d)} / unit di bawah nilai buku</span>`:d>0?` · <span class="text-emerald-400">${rp(d)} / unit di atas nilai buku</span>`:''}</div>`
     +`<div class="mt-1">Pembeli: <b>${who?esc(who):'Semua toko (terbuka)'}</b>${who?' — hanya toko ini yang bisa membeli':''}</div>`};
   const onAsset=()=>{const a=find(A.value);if(a){Q.value=1;P.value=perUnit(a)}upd()};
   // ganti toko penjual -> daftar aset ikut berganti, toko pembeli tidak boleh sama dengan penjual
   F.onchange=()=>{const keep=T.value;fill('sw_a',aOpts(F.value));fill('sw_to',toOpts(F.value));T.value=(keep&&keep!==F.value&&buyerStores(F.value).includes(keep))?keep:'';onAsset()};
   A.onchange=onAsset;[Q,P,T].forEach(el=>{el.oninput=upd;el.onchange=upd});upd()},
  check:o=>{const a=find(o.a);if(!a)return 'Aset tidak ditemukan';if(a.branch!==o.from)return 'Aset bukan milik toko yang dipilih';
   const n=parseInt(o.qty),mx=freeQty(a);if(!(n>=1&&n<=mx))return `Jumlah harus antara 1 dan ${mx}`;
   if(o.price===''||!(Number(o.price)>=0))return 'Harga jual wajib diisi';
   if(o.to){if(o.to===a.branch)return 'Toko pembeli tidak boleh sama dengan toko penjual';if(!allStores().includes(o.to))return 'Toko pembeli tidak dikenal'}
   return ''}});
 if(!r)return;const a=find(r.a),n=parseInt(r.qty),p=Number(r.price)||0,to=r.to||'';
 AM.market.push({id:'MKT-'+Date.now().toString(36).toUpperCase(),assetId:a.id,name:a.name,category:a.category,branch:a.branch,to,qty:n,left:n,price:p,note:r.note,status:'Open',createdBy:(user()||{}).name||'-',createdAt:stamp(),ts:Date.now()});
 hist(a,`Dilisting dijual ${n} unit @ ${rp(p)} — ${to?'khusus '+to:'terbuka untuk semua toko'} (Pasar Antar Toko)`);AM.mktTab='mine';await save();switchTab('amkt')};
AM.buy=async function(id){if(!isGA())return deny();const m=AM.market.find(x=>x.id===id);if(!m||m.status!=='Open')return Swal.fire({title:'Listing tidak tersedia',text:'Aset ini sudah terjual atau dibatalkan.',icon:'info',...WN});
 const fixed=forStore(m),opts=fixed?[fixed]:(canAll()?allStores():myBranches()).filter(b=>b!==m.branch);
 if(!opts.length)return Swal.fire({title:'Tidak bisa membeli',text:'Akun Anda tidak terhubung ke cabang lain selain cabang penjual.',icon:'warning',...WN});
 const a=find(m.assetId);if(!a||a.status!=='Good'){m.status='Cancelled';await save();return Swal.fire({title:'Aset tidak lagi tersedia',text:'Listing dibatalkan otomatis karena aset berubah status atau dihapus.',icon:'info',...WN})}
 const mx=Math.min(m.left,q(a)-onLoan(a));
 if(mx<1)return Swal.fire({title:'Stok tidak cukup',text:'Unit sedang dipinjam sehingga belum bisa dijual.',icon:'info',...WN});
 const r=await ask(`Beli “${m.name}”`,[{k:'branch',l:fixed?'Masuk ke cabang (sesuai penawaran penjual)':'Masuk ke cabang',opts:opts.map(b=>[b,b])},{k:'qty',l:`Jumlah unit (maks ${mx}) — ${rp(m.price)} / unit`,t:'number',v:1},{k:'note',l:'Catatan pembeli (opsional)'}],'Lanjut',{check:o=>{const n=parseInt(o.qty);return n>=1&&n<=mx?'':`Jumlah harus antara 1 dan ${mx}`}});
 if(!r)return;const n=parseInt(r.qty),total=n*m.price;
 if(!(await confirmBox(`Beli ${n} unit seharga ${rp(total)}?`,`Aset berpindah dari ${m.branch} ke ${r.branch}. Pembayaran antar cabang diselesaikan di luar sistem.`)))return;
 const A=find(m.assetId),me=(user()||{}).name||'-';
 if(!A||A.status!=='Good'||n>Math.min(m.left,q(A)-onLoan(A)))return Swal.fire({title:'Stok berubah',text:'Jumlah tersedia sudah berubah. Coba lagi.',icon:'warning',...WN});
 const tid='TRD-'+Date.now().toString(36).toUpperCase();let tgt;
 if(n===q(A)){A.branch=r.branch;A.division='';tgt=A;hist(A,`Dibeli ${n} unit dari ${m.branch} oleh ${r.branch} @ ${rp(m.price)} (${tid})`)}
 else{let id2,x=2;do{id2=`${A.id}-T${x++}`}while(find(id2));
  tgt={...A,id:id2,qty:n,branch:r.branch,division:'',assigned:null,history:[],src:'trade|'+tid};A.qty=q(A)-n;
  hist(A,`${n} unit dijual ke ${r.branch} @ ${rp(m.price)} (${tid})`);hist(tgt,`Dibeli ${n} unit dari ${m.branch} (aset ${A.id}) @ ${rp(m.price)} (${tid})`);AM.assets.push(tgt)}
 m.left-=n;if(m.left<=0){m.left=0;m.status='Sold'}
 AM.trades.push({id:tid,listingId:m.id,assetId:A.id,newAssetId:tgt.id,name:m.name,category:m.category,from:m.branch,to:r.branch,qty:n,price:m.price,total,date:today(),ts:Date.now(),seller:m.createdBy,buyer:me,note:r.note||''});
 AM.mktTab='hist';await save();switchTab('amkt');Swal.fire({title:'Pembelian berhasil',text:`${n} unit “${m.name}” kini terdaftar di ${r.branch}.`,icon:'success',...WN})};
AM.mktCancel=async function(id){if(!isGA())return deny();const m=AM.market.find(x=>x.id===id);if(!m||!mOwn(m))return deny();if(!(await confirmBox('Batalkan listing?',m.name)))return;m.status='Cancelled';const a=find(m.assetId);if(a)hist(a,'Listing penjualan dibatalkan');save()};
AM.mktEdit=async function(id){if(!isGA())return deny();const m=AM.market.find(x=>x.id===id);if(!m||!mOwn(m))return deny();const a=find(m.assetId);if(!a)return;const mx=freeQty(a,m.id);
 const r=await ask('Ubah Listing',[{k:'price',l:'Harga jual per unit (Rp)',t:'number',v:m.price},{k:'qty',l:`Jumlah unit masih dijual (1–${mx})`,t:'number',v:m.left},{k:'to',l:'Dibeli oleh toko mana?',v:forStore(m),opts:[['','Semua toko (terbuka, siapa saja boleh beli)'],...buyerStores(m.branch).map(b=>[b,b])]},{k:'note',l:'Catatan',v:m.note}],'Simpan',{check:o=>{const n=parseInt(o.qty);if(!(n>=1&&n<=mx))return `Jumlah harus antara 1 dan ${mx}`;if(o.price===''||!(Number(o.price)>=0))return 'Harga wajib diisi';return ''}});
 if(!r)return;const n=parseInt(r.qty),sold=m.qty-m.left;m.price=Number(r.price)||0;m.left=n;m.qty=sold+n;m.note=r.note;m.to=r.to||'';hist(a,`Listing diubah: ${n} unit @ ${rp(m.price)} — ${m.to?'khusus '+m.to:'terbuka untuk semua toko'}`);save()};
