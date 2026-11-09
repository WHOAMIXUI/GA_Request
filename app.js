        let appState = {
            activeTab: 'list',
            users: [], // diisi dari koleksi 'profiles' (khusus GA). TIDAK ADA sandi di sini.
            categories: ['SUPPORT EQUIPMENT', 'BANGUNAN', 'PERALATAN'],
            divisions: ['GA', 'HEAD STORE', 'ASST. HEAD STORE'],
            branches: ['DONAT BAHAGIA CILAKI', 'DONAT BAHAGIA CIBEUNYING', 'DONAT BAHAGIA MASKUMAMBANG'],
            contactTypes: [{ id: 'lokasi', label: 'Tawaran Lokasi / Tempat' }, { id: 'mesin', label: 'Sales Mesin' }, { id: 'peralatan', label: 'Peralatan & Interior' }, { id: 'lain', label: 'Vendor Lainnya' }],
            
            requests: [
                {
                    id: 'TKT-202610-760',
                    division: 'HEAD STORE',
                    branch: 'DONAT BAHAGIA CIBEUNYING',
                    submissionDate: '2026-10-20',
                    urgency: 'High',
                    status: 'Pending',
                    justification: 'Penggantian showcase chiller yang rusak total',
                    gaNotes: '',
                    items: [
                        { name: 'SHOWCASE CHILLER', category: 'SUPPORT EQUIPMENT', qty: 1, unit: 'Unit', cost: 4500000, notes: 'Rusak kompresor', photo: '', itemStatus: 'Menunggu' },
                        { name: 'KABEL ROLL', category: 'SUPPORT EQUIPMENT', qty: 1, unit: 'Pcs', cost: 150000, notes: '', photo: '', itemStatus: 'Menunggu' }
                    ],
                    audit: [
                        { actor: 'Hendra Wijaya', role: 'Staff Store', action: 'Membuat Pengajuan', timestamp: '20/10/2026, 08:30:00' }
                    ]
                }
            ],
            pagination: { currentPage: 1, pageSize: 10, filteredData: [] },
            sortConfig: { key: 'id', direction: 'desc' }
        };

        let chartInstance = null;

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                ['detailModal', 'editApprovalModal', 'userModal', 'imageZoomModal', 'passwordModal'].forEach(modalId => {
                    const modalEl = document.getElementById(modalId);
                    if (modalEl && modalEl.classList.contains('flex')) closeModal(modalId);
                });
                document.getElementById('userMenuDropdown').classList.add('hidden');
                document.getElementById('notifMenu').classList.add('hidden');
            }
        });

        /* --- DATA PERSISTENCE & SAFE LOAD --- */
        async function saveMasterSettings() {
            saveMasterSettingsToLocal();
            if (window.db) {
                try {
                    const { doc, setDoc } = window.fbDeps;
                    await setDoc(doc(window.db, "settings", "master_config"), {
                        categories: appState.categories, divisions: appState.divisions, branches: appState.branches, contactTypes: appState.contactTypes
                    }, { merge: true });
                } catch(err) { console.error('[Firestore] gagal simpan master_config:', err.code, err.message); }
            }
        }

        function saveMasterSettingsToLocal() {
            localStorage.setItem('assetReqCategoriesData', JSON.stringify(appState.categories));
            localStorage.setItem('assetReqDivisionsData', JSON.stringify(appState.divisions));
            localStorage.setItem('assetReqBranchesData', JSON.stringify(appState.branches));
            localStorage.setItem('assetReqContactTypes', JSON.stringify(appState.contactTypes));
        }

        function loadMasterSettings() {
            localStorage.removeItem('assetReqUsersData'); // bersihkan sisa data lama (berisi sandi)
            const c = localStorage.getItem('assetReqCategoriesData'); if (c) { try { appState.categories = JSON.parse(c); } catch(e){} }
            const d = localStorage.getItem('assetReqDivisionsData'); if (d) { try { appState.divisions = JSON.parse(d); } catch(e){} }
            const b = localStorage.getItem('assetReqBranchesData'); if (b) { try { appState.branches = JSON.parse(b); } catch(e){} }
            const ct = localStorage.getItem('assetReqContactTypes'); if (ct) { try { const v = JSON.parse(ct); if (Array.isArray(v)) appState.contactTypes = v; } catch(e){} }
        }

        // Penyimpanan lokal ditunda (debounce) supaya tidak mengubah seluruh data jadi teks di setiap snapshot.
        // Saat cloud aktif, foto TIDAK disalin ke localStorage (kuota ~5 MB; Firestore sudah punya cache sendiri).
        let __saveLocalTimer = null;
        function writeLocalState() {
            __saveLocalTimer = null;
            try {
                const data = window.db
                    ? appState.requests.map(r => (r.items && r.items.some(i => i && i.photo))
                        ? { ...r, items: r.items.map(i => (i && i.photo) ? { ...i, photo: '' } : i) } : r)
                    : appState.requests;
                localStorage.setItem('assetReqLocalData', JSON.stringify(data));
            } catch (e) {
                // Kuota localStorage penuh: jangan sampai memutus alur sinkronisasi Firestore
                console.warn('[Local] Penyimpanan lokal penuh, dilewati:', e && e.name);
                try { localStorage.removeItem('assetReqLocalData'); } catch (_) {}
            }
        }
        function saveLocalState() { clearTimeout(__saveLocalTimer); __saveLocalTimer = setTimeout(writeLocalState, 500); }
        function flushLocalState() { if (__saveLocalTimer) { clearTimeout(__saveLocalTimer); writeLocalState(); } }
        window.addEventListener('pagehide', flushLocalState);
        document.addEventListener('visibilitychange', () => { if (document.hidden) flushLocalState(); });

        // Beberapa snapshot yang datang berdekatan digabung jadi satu kali gambar ulang (maks. 1x per frame).
        let __renderFrame = 0;
        function scheduleRender() {
            if (__renderFrame) return;
            __renderFrame = requestAnimationFrame(() => { __renderFrame = 0; if (window.NR) NR.sync(); applyTableFilters(); updateMetrics(); updateNotifications(); });
        }
        
        function loadLocalState() { 
            const local = localStorage.getItem('assetReqLocalData'); 
            if (local) { 
                try { 
                    const parsed = JSON.parse(local);
                    if (parsed && parsed.length > 0) {
                        appState.requests = parsed; 
                    }
                } catch(e) {} 
            } 
        }

        window.addEventListener('profile-ready', () => initRealtimeSync());
        window.addEventListener('firebase-failed', () => {
            const e = window.__fbInitError;
            updateCloudBadge('Offline (SDK gagal dimuat)');
            console.error('[Firestore] SDK gagal dimuat. Cek internet / blokir gstatic.com:', e);
        });
        // Jika SDK tidak pernah selesai dimuat (mis. diblokir), jangan biarkan "Syncing..." selamanya
        setTimeout(() => { if (!window.db) updateCloudBadge('Offline (SDK tidak termuat)'); }, 10000);

        function firestoreErrMsg(err) {
            const code = (err && err.code) || '';
            if (code === 'permission-denied') return 'Offline (Akses ditolak - cek Firestore Rules)';
            if (code === 'unavailable') return 'Offline (Server tidak terjangkau)';
            if (code === 'failed-precondition') return 'Offline (Error: ' + code + ')';
            return 'Offline (' + (code || 'Lokal') + ')';
        }

        function initRealtimeSync() {
            loadLocalState();
            if (!window.db) { updateCloudBadge('Offline (Lokal)'); applyTableFilters(); updateMetrics(); updateNotifications(); return; }
            try {
                const { collection, onSnapshot, doc } = window.fbDeps;
                const me = getCurrentUser();
                const { query, where } = window.fbDeps;
                const brs = (me && me.branches) || [];
                let reqSource = collection(window.db, "requests");
                if (me && !(me.role === 'General Affair Manager' || brs.includes('ALL'))) {
                    if (!brs.length) { appState.requests = []; applyTableFilters(); updateMetrics(); return; }
                    reqSource = query(reqSource, where('branch', 'in', brs.slice(0, 30)));
                }
                if (me && me.role === 'General Affair Manager') listenProfiles();
                onSnapshot(reqSource, { includeMetadataChanges: true }, (snapshot) => {
                    // Data dari cache lokal (belum terhubung ke server) -> jangan tampilkan "Live"
                    const fromCache = snapshot.metadata.fromCache;
                    if (!fromCache) {
                        const cloudData = [];
                        snapshot.forEach(docSnap => cloudData.push({ docId: docSnap.id, ...docSnap.data() }));
                        if (cloudData.length > 0) {
                            appState.requests = cloudData;
                            saveLocalState();
                        }
                    }
                    if (!fromCache) window.__cloudSynced = true;
                    updateCloudBadge(fromCache ? 'Offline (Menghubungkan...)' : 'Cloud Live');
                    scheduleRender();
                }, (err) => {
                    console.error('[Firestore] requests listener error:', err.code, err.message);
                    updateCloudBadge(firestoreErrMsg(err));
                });

                // Jika dalam 10 detik belum ada respons dari server, tampilkan status jelas (bukan "Syncing..." terus)
                setTimeout(() => {
                    if (!window.__cloudSynced) {
                        console.warn('[Firestore] Tidak ada respons server dalam 10 detik. Cek internet, Firestore Rules, atau blokir firestore.googleapis.com');
                        updateCloudBadge('Offline (Tidak bisa terhubung ke Firestore)');
                    }
                }, 10000);

                onSnapshot(doc(window.db, "settings", "master_config"), (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        if (data.categories) appState.categories = data.categories;
                        if (data.divisions) appState.divisions = data.divisions;
                        if (data.branches) appState.branches = data.branches;
                        if (Array.isArray(data.contactTypes)) appState.contactTypes = data.contactTypes;
                        saveMasterSettingsToLocal();
                        if (appState.activeTab === 'master') renderMasterDataView();
                        populateDropdowns();
                    }
                }, (err) => console.error('[Firestore] master_config listener error:', err.code, err.message));
            } catch (e) {
                console.error('[Firestore] initRealtimeSync error:', e);
                updateCloudBadge('Offline (Lokal)');
            }
        }

        let __profilesUnsub = null;
        function listenProfiles() {
            if (__profilesUnsub) return;
            const { collection, onSnapshot } = window.fbDeps;
            __profilesUnsub = onSnapshot(collection(window.db, "profiles"), (snap) => {
                appState.users = [];
                snap.forEach(d => appState.users.push({ id: d.id, ...d.data() }));
                appState.users.sort((a, b) => String(a.name).localeCompare(String(b.name)));
                if (appState.activeTab === 'master') renderMasterDataView();
            }, (err) => console.error('[Firestore] profiles listener error:', err.code, err.message));
        }

        function updateCloudBadge(statusText) {
            const badge = document.getElementById('cloudStatusBadge');
            if (!badge) return;
            const live = statusText.includes('Live');
            badge.className = 'hidden sm:inline-flex items-center gap-2 bg-cocoa-950 border border-white/10 text-xs font-bold px-3.5 py-1.5 rounded-full ' + (live ? 'text-dobah-100' : 'text-amber-300');
            badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-400' : 'bg-amber-400'}"></span>` + (live ? 'Cloud Firestore Active' : esc(statusText));
        }

        window.addEventListener('DOMContentLoaded', () => {
            loadMasterSettings(); 
            loadLocalState(); 
            checkUserSession();
            document.getElementById('formSubmissionDate').value = new Date().toISOString().split('T')[0];
            addFormItemRow();
            if(appState.activeTab === 'list') switchTab('list');
        });

        /* --- AUTENTIKASI --- */
        // Profil (nama, role, cabang) dimuat dari Firestore SETELAH login Firebase Auth. Sandi tidak pernah ada di sini.
        window.__profile = null;
        function getCurrentUser() { return window.__profile; }
        const AUTH_DOMAIN_SUFFIX = '@dobah-ga.app';
        function usernameToEmail(u) { return String(u).trim().toLowerCase() + AUTH_DOMAIN_SUFFIX; }

        function watchAuth() {
            const { onAuthStateChanged, signOut } = window.authDeps;
            onAuthStateChanged(window.auth, async (fbUser) => {
                if (!fbUser) { window.__profile = null; checkUserSession(); return; }
                try {
                    const { doc, getDoc } = window.fbDeps;
                    const snap = await getDoc(doc(window.db, 'profiles', fbUser.uid));
                    if (!snap.exists()) {
                        await signOut(window.auth);
                        const eb = document.getElementById('loginErrorMsg');
                        if (eb) { eb.textContent = 'Akun belum diaktifkan. Hubungi GA Manager.'; eb.classList.remove('hidden'); }
                        return;
                    }
                    const d = snap.data();
                    window.__profile = { id: fbUser.uid, username: d.username, name: d.name, role: d.role, branches: d.branches || [] };
                    checkUserSession();
                    window.dispatchEvent(new Event('profile-ready'));
                } catch (e) {
                    console.error('[Auth] gagal memuat profil:', e);
                    await signOut(window.auth);
                }
            });
        }
        function startAuth() { if (window.auth) watchAuth(); }
        if (window.auth) startAuth(); else window.addEventListener('firebase-ready', startAuth);

        /* --- CETAK PENGAJUAN --- */
        let currentDetailIdx = null;
        function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

        async function printRequest(idx) {
            const i0 = (typeof idx === 'number') ? idx : currentDetailIdx;
            const req = appState.requests[i0];
            if (!req) return Swal.fire('Info', 'Tiket tidak ditemukan.', 'info');
            const u = getCurrentUser() || {};
            const logoEl = document.querySelector('#loginModal img[alt="Dobah"]') || document.querySelector('img[data-logo="full"]');
            const logo = logoEl ? logoEl.src : '';
            const items = req.items || [];
            const TICKET_ST = { Pending: 'Menunggu', Approved: 'Diproses', Completed: 'Selesai', Rejected: 'Ditolak' };
            const PRIO = { Low: 'Rendah', Medium: 'Sedang', High: 'Tinggi', Critical: 'Darurat' };
            const prio = PRIO[req.urgency] || req.urgency || '-';
            const tStatus = TICKET_ST[req.status] || req.status || '-';
            const requester = ticketApplicant(req) || '-';

            const rows = items.map((it, i) => `
                <tr>
                    <td class="c">${i + 1}</td>
                    <td><b>${esc(it.name)}</b>${it.notes ? `<br><small>${esc(it.notes)}</small>` : ''}</td>
                    <td>${esc(it.category || '-')}</td>
                    <td class="c">${esc(prio)}</td>
                    <td class="c">${esc(it.itemStatus || 'Menunggu')}</td>
                </tr>`).join('');
            const photos = items.filter(it => it.photo).map(it => `<figure><img src="${esc(it.photo)}" alt=""><figcaption>${esc(it.name)}</figcaption></figure>`).join('');
            const audit = (req.audit || []).map(a => `<li>${esc(a.timestamp)} &ndash; ${esc(a.actor)}: ${esc(a.action)}</li>`).join('');

            document.getElementById('print-sheet').innerHTML = `
                <div class="ps">
                    <div class="ps-head">
                        ${logo ? `<img src="${logo}" alt="Dobah">` : '<b>DOBAH</b>'}
                        <div class="ps-title"><h1>FORM PENGAJUAN PERBAIKAN ASET</h1><p>#${esc(req.id)}</p></div>
                    </div>
                    <div class="ps-grid">
                        <div><span>Tanggal</span><b>${esc(req.submissionDate)}</b></div>
                        <div><span>Pemohon</span><b>${esc(requester)}</b></div>
                        <div><span>Cabang</span><b>${esc(req.branch)}</b></div>
                        <div><span>Status tiket</span><b>${esc(tStatus)}</b></div>
                        <div><span>Jumlah item</span><b>${items.length}</b></div>
                    </div>
                    ${req.justification ? `<h2>Keterangan</h2><div class="ps-box">${esc(req.justification)}</div>` : ''}
                    <h2>Rincian kerusakan</h2>
                    <table>
                        <thead><tr><th class="c" style="width:28px">No</th><th>Item &amp; Deskripsi</th><th>Kategori</th><th class="c" style="width:70px">Prioritas</th><th class="c" style="width:70px">Status</th></tr></thead>
                        <tbody>${rows || '<tr><td colspan="5" class="c">Tidak ada item.</td></tr>'}</tbody>
                    </table>
                    ${photos ? `<h2>Foto kerusakan</h2><div class="ps-photos">${photos}</div>` : ''}
                    ${audit ? `<h2>Riwayat aktivitas</h2><ul class="ps-hist">${audit}</ul>` : ''}
                    <div class="ps-sign">
                        <div><b>${esc(requester)}</b><span>Pemohon</span></div>
                        <div><b>&nbsp;</b><span>Kepala Cabang</span></div>
                        <div><b>&nbsp;</b><span>Manager GA</span></div>
                    </div>
                    <div class="ps-foot"><span>GA MAINTENANCE &middot; Dobah</span><span>Dicetak oleh ${esc(u.name || '-')} &middot; ${esc(new Date().toLocaleString('id-ID'))}</span></div>
                </div>`;

            const imgs = Array.from(document.querySelectorAll('#print-sheet img'));
            await Promise.all(imgs.map(im => im.complete ? Promise.resolve() : new Promise(r => { im.onload = im.onerror = r; })));
            const oldTitle = document.title;
            document.title = `Tiket-${req.id}`;
            window.addEventListener('afterprint', () => { document.title = oldTitle; }, { once: true });
            window.print();
        }

        /* --- TEMA DONAT BAHAGIA --- */
        function updateWelcome(user) {
            const h = new Date().getHours();
            const g = h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam';
            const el = document.getElementById('welcomeTitle');
            if (el && user) el.textContent = `${g}, ${user.name}!`;
            const icon = document.querySelector('link[rel="icon"]');
            const full = document.querySelector('#loginModal img[alt="Dobah"]');
            document.querySelectorAll('img[data-logo]').forEach(img => {
                const src = img.dataset.logo === 'icon' ? (icon && icon.href) : (full && full.src);
                if (src && img.getAttribute('src') !== src) img.src = src;
            });
        }

        function launchSprinkles() {
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            const colors = ['#f4a23a', '#f2708f', '#7bcbb0', '#ffd65a', '#fff3e0', '#a75d22'];
            for (let i = 0; i < 60; i++) {
                const s = document.createElement('i');
                s.className = 'sprinkle';
                s.style.cssText = `left:${Math.random() * 100}vw;background:${colors[i % colors.length]};--r:${Math.random() * 720 - 360}deg;--d:${1.6 + Math.random() * 1.4}s;animation-delay:${Math.random() * .4}s`;
                document.body.appendChild(s);
                setTimeout(() => s.remove(), 3800);
            }
        }

        function checkUserSession() {
            const user = getCurrentUser();
            const loginModal = document.getElementById('loginModal');
            const userInfo = document.getElementById('userSessionInfo');
            if (!user) {
                loginModal.classList.remove('hidden'); loginModal.classList.add('flex');
                if (userInfo) userInfo.classList.add('hidden');
            } else {
                loginModal.classList.remove('flex'); loginModal.classList.add('hidden');
                if (userInfo) userInfo.classList.replace('hidden', 'flex');
                document.getElementById('displayUserName').innerText = user.name;
                document.getElementById('displayUserRole').innerText = user.role;
                updateWelcome(user);
                
                const av = document.getElementById('userAvatar'); if (av) av.textContent = (user.name || 'U').trim().charAt(0).toUpperCase();
                const tabMaster = document.getElementById('tab-master');
                const masterSec = document.getElementById('nav-master-section');
                if (user.role === 'Staff Store') { if (tabMaster) tabMaster.style.display = 'none'; if (masterSec) masterSec.style.display = 'none'; } 
                else { if (tabMaster) tabMaster.style.display = 'flex'; if (masterSec) masterSec.style.display = 'block'; }

                populateDropdowns(); applyTableFilters(); updateMetrics(); updateNotifications();
            }
        }

        async function handleLogin(e) {
            e.preventDefault();
            const uInput = document.getElementById('loginUsername').value.trim();
            const pInput = document.getElementById('loginPassword').value;
            const errBox = document.getElementById('loginErrorMsg');
            const btn = e.submitter || document.querySelector('#loginModal button[type="submit"]');
            errBox.classList.add('hidden');
            if (!window.auth) { errBox.textContent = 'Koneksi Firebase belum siap. Muat ulang halaman.'; errBox.classList.remove('hidden'); return; }
            if (btn) btn.disabled = true;
            try {
                await window.authDeps.signInWithEmailAndPassword(window.auth, usernameToEmail(uInput), pInput);
                document.getElementById('loginUsername').value = ''; document.getElementById('loginPassword').value = '';
            } catch (err) {
                const tooMany = err && err.code === 'auth/too-many-requests';
                errBox.textContent = tooMany ? 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.' : 'Username atau password salah.';
                errBox.classList.remove('hidden');
            } finally { if (btn) btn.disabled = false; }
        }

        async function handleLogout() {
            try { await window.authDeps.signOut(window.auth); } catch (e) {}
            // bersihkan salinan data di perangkat ini (penting untuk komputer bersama)
            Object.keys(localStorage).filter(k => k.startsWith('assetReq') || k === 'assetRegistryV1' || k.startsWith('ga_ph_')).forEach(k => localStorage.removeItem(k));
            location.reload();
        }

        function toggleUserMenu() {
            document.getElementById('userMenuDropdown').classList.toggle('hidden');
            document.getElementById('notifMenu').classList.add('hidden');
        }

        function toggleNotifMenu() {
            document.getElementById('notifMenu').classList.toggle('hidden');
            document.getElementById('userMenuDropdown').classList.add('hidden');
        }

        async function handleChangePassword(e) {
            e.preventDefault();
            const oldP = document.getElementById('oldPasswordInput').value;
            const newP = document.getElementById('newPasswordInput').value;
            if (newP.length < 6) return Swal.fire('Gagal', 'Password baru minimal 6 karakter.', 'error');
            try {
                const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = window.authDeps;
                const u = window.auth.currentUser;
                await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, oldP));
                await updatePassword(u, newP);
                closeModal('passwordModal');
                Swal.fire('Berhasil', 'Password telah diubah!', 'success');
                document.getElementById('oldPasswordInput').value = '';
                document.getElementById('newPasswordInput').value = '';
            } catch (err) {
                Swal.fire('Gagal', 'Password lama salah atau sesi kedaluwarsa. Silakan coba lagi.', 'error');
            }
        }

        function updateNotifications() {
            const user = getCurrentUser();
            if(!user) return;
            const requests = getAccessibleRequests();
            const notifList = document.getElementById('notifList');
            const badge = document.getElementById('notifBadge');
            
            let notifications = [];
            if(user.role === 'General Affair Manager') {
                const pending = requests.filter(r => r.status === 'Pending');
                if(pending.length > 0) notifications.push(`Ada ${pending.length} pengajuan berstatus Pending menunggu proses Anda.`);
            } else {
                const approved = requests.filter(r => r.status === 'Approved' || r.status === 'Completed');
                if(approved.length > 0) notifications.push(`Anda memiliki ${approved.length} pengajuan yang disetujui/selesai.`);
            }

            if(notifications.length > 0) {
                badge.innerText = notifications.length;
                badge.classList.remove('hidden');
                notifList.innerHTML = notifications.map(n => `<div class="p-2.5 bg-dobah-400/10 rounded-xl border border-dobah-400/20 font-semibold text-dobah-100">${n}</div>`).join('');
            } else {
                badge.classList.add('hidden');
                notifList.innerHTML = `<p class="text-dobah-300/50 text-center italic py-2">Tidak ada notifikasi baru.</p>`;
            }
        }

        /* --- NAVIGATION --- */
        const NAV_ACTIVE_CLS = "nav-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all bg-dobah-400/15 text-dobah-300 border border-dobah-400/20";
        const NAV_IDLE_CLS = "nav-item w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all text-dobah-200/60 hover:bg-cocoa-900 hover:text-white";
        const TAB_TITLES = { form: 'Buat Permintaan Aset', list: 'Dashboard & Status Pengajuan Tiket', master: 'Master Data & Akun' };

        function toggleSidebar(force) {
            const sb = document.getElementById('sidebar');
            const ov = document.getElementById('sidebar-overlay');
            if (force === false || !sb.classList.contains('-translate-x-full')) {
                sb.classList.add('-translate-x-full'); ov.classList.add('hidden');
            } else {
                sb.classList.remove('-translate-x-full'); ov.classList.remove('hidden');
            }
        }

        function switchTab(tabId) {
            const s = getCurrentUser();
            if (s && s.role === 'Staff Store' && tabId === 'master') { Swal.fire('Akses Dibatasi', 'Menu Master Data hanya untuk GA Manager.', 'warning'); return; }
            appState.activeTab = tabId;
            ['form', 'list', 'master'].forEach(t => {
                document.getElementById(`view-${t}`).classList.add('hidden');
                document.getElementById(`tab-${t}`).className = NAV_IDLE_CLS;
            });
            document.getElementById(`view-${tabId}`).classList.remove('hidden');
            document.getElementById(`tab-${tabId}`).className = NAV_ACTIVE_CLS;
            const pt = document.getElementById('page-title'); if (pt) pt.textContent = TAB_TITLES[tabId] || '';
            const wb = document.getElementById('welcomeBanner'); if (wb) wb.style.display = (tabId === 'list') ? 'none' : '';
            if (window.innerWidth < 768) toggleSidebar(false);
            if (tabId === 'list') { applyTableFilters(); updateMetrics(); } else if (tabId === 'master') { renderMasterDataView(); }
        }

        function populateDropdowns() {
            const u = getCurrentUser();
            const ub = (u && u.branches && !u.branches.includes('ALL')) ? u.branches : appState.branches;
            const divEl = document.getElementById('formDivision');
            const branchEl = document.getElementById('formBranch');
            const filtBranchEl = document.getElementById('filterBranch');
            if (divEl) divEl.innerHTML = appState.divisions.map(d => `<option value="${d}" class="bg-cocoa-900">${d}</option>`).join('');
            if (branchEl) branchEl.innerHTML = ub.map(b => `<option value="${b}" class="bg-cocoa-900">${b}</option>`).join('');
            if (filtBranchEl) filtBranchEl.innerHTML = `<option value="" class="bg-cocoa-900">Semua Cabang (Akses)</option>` + ub.map(b => `<option value="${b}" class="bg-cocoa-900">${b}</option>`).join('');
        }

        /* --- FORM HANDLING --- */
        function addFormItemRow(itemData = null) {
            const c = document.getElementById('formItemsContainer');
            const rowId = 'item_' + Date.now();
            const catOpts = appState.categories.map(cat => `<option value="${cat}" class="bg-cocoa-900">${cat}</option>`).join('');
            const html = `
                <div id="${rowId}" class="item-row bg-cocoa-900/60 p-4 rounded-2xl border border-white/10 space-y-3">
                    <div class="flex justify-between items-center border-b border-white/5 pb-2">
                        <span class="font-mono font-bold text-xs uppercase text-dobah-200"><i class="fa-solid fa-cube text-dobah-400 mr-2"></i>Baris Aset</span>
                        <button type="button" onclick="removeFormItemRow('${rowId}')" class="modern-button bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold text-[11px] px-2.5 py-1 border border-rose-500/20">Hapus Baris</button>
                    </div>
                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-3">
                        <div class="lg:col-span-4"><input type="text" required placeholder="Nama / Tipe Aset..." class="item-name w-full glass-input px-3.5 py-2 text-xs font-semibold"></div>
                        <div class="lg:col-span-3"><select class="item-category w-full glass-input px-3.5 py-2 text-xs font-semibold">${catOpts}</select></div>
                        <div class="lg:col-span-1"><input type="number" min="1" required class="item-qty w-full glass-input px-2 py-2 text-xs font-semibold text-center" value="1" oninput="calculateLiveTotal()"></div>
                        <div class="lg:col-span-1"><input type="text" required class="item-unit w-full glass-input px-2 py-2 text-xs font-semibold text-center" value="Unit"></div>
                        <div class="lg:col-span-3"><input type="number" min="0" required class="item-cost w-full glass-input px-3.5 py-2 text-xs font-semibold font-mono" value="0" oninput="calculateLiveTotal()"></div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <input type="text" placeholder="Catatan spesifikasi..." class="item-notes w-full glass-input px-3 py-2 text-xs">
                        <div class="flex items-center flex-wrap gap-2">
                            <label class="modern-button bg-dobah-400 text-slate-950 text-[11px] font-bold px-3.5 py-2 cursor-pointer flex items-center shrink-0">
                                <i class="fa-solid fa-camera mr-1.5"></i>Ambil Foto
                                <input type="file" accept="image/*" capture="environment" class="hidden" onchange="handlePhotoUpload(this, '${rowId}')">
                            </label>
                            <label class="modern-button bg-cocoa-800 hover:bg-cocoa-900 text-dobah-200 text-[11px] font-semibold px-3 py-2 cursor-pointer flex items-center shrink-0 border border-white/10">
                                <i class="fa-solid fa-image mr-1.5 text-dobah-400"></i>Galeri
                                <input type="file" accept="image/*" class="hidden" onchange="handlePhotoUpload(this, '${rowId}')">
                            </label>
                            <input type="hidden" class="item-photo-data">
                            <div class="photo-preview-box text-[11px] font-mono text-dobah-200/50 flex items-center gap-2 min-w-0 basis-full sm:basis-0 sm:flex-1">Belum ada foto</div>
                        </div>
                    </div>
                </div>`;
            c.insertAdjacentHTML('beforeend', html); calculateLiveTotal();
        }
        function removeFormItemRow(id) { if (document.querySelectorAll('.item-row').length > 1) document.getElementById(id).remove(); calculateLiveTotal(); }
        
        function compressImage(file, maxSide = 1280, quality = 0.75) {
            return new Promise((resolve, reject) => {
                const url = URL.createObjectURL(file);
                const img = new Image();
                img.onload = () => {
                    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
                    const w = Math.round(img.width * k), h = Math.round(img.height * k);
                    const c = document.createElement('canvas');
                    c.width = w; c.height = h;
                    const ctx = c.getContext('2d');
                    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);
                    URL.revokeObjectURL(url);
                    resolve(c.toDataURL('image/jpeg', quality));
                };
                img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gagal membaca foto')); };
                img.src = url;
            });
        }

        async function handlePhotoUpload(input, id) {
            const f = input.files && input.files[0];
            if (!f) return;
            if (f.size > 15 * 1024 * 1024) { input.value = ''; return Swal.fire('Error', 'Ukuran foto terlalu besar (maksimal 15MB).', 'error'); }
            const row = document.getElementById(id);
            if (!row) return;
            const box = row.querySelector('.photo-preview-box');
            box.textContent = 'Memproses foto...';
            try {
                const data = await compressImage(f);
                row.querySelector('.item-photo-data').value = data;
                const kb = Math.round(data.length * 0.75 / 1024);
                box.innerHTML = `<img src="${data}" alt="Pratinjau foto" class="w-10 h-10 rounded-lg object-cover border border-white/10 shrink-0"><span class="text-dobah-400 font-bold truncate">✓ Foto siap (${kb} KB)</span><button type="button" onclick="clearRowPhoto('${id}')" class="text-rose-400 hover:text-rose-300 text-xs shrink-0 px-1" aria-label="Hapus foto"><i class="fa-solid fa-xmark"></i></button>`;
            } catch (err) {
                box.textContent = 'Belum ada foto';
                Swal.fire('Error', 'Foto tidak bisa diproses. Coba lagi.', 'error');
            }
            input.value = '';
        }

        function clearRowPhoto(id) {
            const row = document.getElementById(id);
            if (!row) return;
            row.querySelector('.item-photo-data').value = '';
            row.querySelector('.photo-preview-box').textContent = 'Belum ada foto';
        }
        
        function calculateLiveTotal() {
            let t = 0;
            document.querySelectorAll('.item-row').forEach(r => t += (parseFloat(r.querySelector('.item-qty').value)||0) * (parseFloat(r.querySelector('.item-cost').value)||0));
            document.getElementById('formLiveTotalBudget').innerText = formatRupiah(t);
        }

        async function handleFormSubmit(e) {
            e.preventDefault();
            let items = [];
            document.querySelectorAll('.item-row').forEach(row => {
                items.push({
                    name: row.querySelector('.item-name').value, category: row.querySelector('.item-category').value,
                    qty: parseInt(row.querySelector('.item-qty').value)||1, unit: row.querySelector('.item-unit').value||'Unit',
                    cost: parseFloat(row.querySelector('.item-cost').value)||0, notes: row.querySelector('.item-notes').value||'',
                    photo: row.querySelector('.item-photo-data').value||'', itemStatus: 'Menunggu'
                });
            });

            const usr = getCurrentUser();
            const timeNow = new Date().toLocaleString('id-ID');
            const auditTrail = [{ actor: usr.name, role: usr.role, action: 'Membuat Pengajuan', timestamp: timeNow }];

            const p = { 
                id: `ARQ-${new Date().getFullYear()}-${String(appState.requests.length+1).padStart(3,'0')}`, 
                division: document.getElementById('formDivision').value, branch: document.getElementById('formBranch').value, 
                submissionDate: document.getElementById('formSubmissionDate').value, urgency: document.getElementById('formUrgency').value, 
                status: 'Pending', justification: document.getElementById('formJustification').value, gaNotes: '', items, audit: auditTrail
            };

            if (window.db) { try { await window.fbDeps.addDoc(window.fbDeps.collection(window.db, "requests"), p); } catch(err){ console.error("[Firestore] gagal tambah request:", err.code, err.message); } } 
            else { appState.requests.unshift(p); saveLocalState(); }

            launchSprinkles();
            Swal.fire('Berhasil!', `Dokumen tersimpan aman.`, 'success');
            document.getElementById('newRequestForm').reset(); document.getElementById('formItemsContainer').innerHTML = ''; addFormItemRow();
            switchTab('list');
        }

        function getAccessibleRequests() {
            const u = getCurrentUser(); if (!u) return [];
            return (u.role === 'General Affair Manager' || u.branches.includes('ALL')) ? appState.requests : appState.requests.filter(r => u.branches.includes(r.branch));
        }

        function handleSort(key) {
            document.querySelectorAll('th.sortable i').forEach(icon => { icon.className = 'fa-solid fa-sort ml-1 text-dobah-300/40'; });
            if (appState.sortConfig.key === key) {
                appState.sortConfig.direction = appState.sortConfig.direction === 'asc' ? 'desc' : 'asc';
            } else {
                appState.sortConfig.key = key; appState.sortConfig.direction = 'asc';
            }
            const activeIcon = document.getElementById(`sortIcon-${key}`);
            if (activeIcon) {
                activeIcon.className = appState.sortConfig.direction === 'asc' ? 'fa-solid fa-sort-up ml-1 text-dobah-400' : 'fa-solid fa-sort-down ml-1 text-dobah-400';
            }
            applyTableFilters();
        }

        function sortDataList(dataList) {
            const { key, direction } = appState.sortConfig;
            return dataList.sort((a, b) => {
                let valA, valB;
                if (key === 'id') { valA = a.id; valB = b.id; }
                else if (key === 'division') { valA = a.division; valB = b.division; }
                else if (key === 'status') { valA = a.status; valB = b.status; }
                if (valA < valB) return direction === 'asc' ? -1 : 1;
                if (valA > valB) return direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        let ticketStatusFilter = '';
        let ticketUrgentOnly = false;
        function ticketApplicant(req) { return (req.audit && req.audit.length > 0 && req.audit[0].actor) ? req.audit[0].actor : req.division; }

        function setStatusTab(val, urgent) {
            ticketStatusFilter = val || '';
            ticketUrgentOnly = !!urgent;
            const chip = document.getElementById('urgentChip'); if (chip) chip.classList.toggle('is-on', ticketUrgentOnly);
            document.querySelectorAll('.tk-seg button').forEach(btn => {
                const on = !ticketUrgentOnly && (btn.dataset.status || '') === ticketStatusFilter;
                btn.classList.toggle('is-active', on);
                btn.setAttribute('aria-selected', on ? 'true' : 'false');
            });
            applyTableFilters();
        }

        function applyTableFilters() {
            const q = ((document.getElementById('filterSearch') || {}).value || '').toLowerCase().trim();
            const b = (document.getElementById('filterBranch') || {}).value || '';
            const s = ticketStatusFilter;

            let filtered = getAccessibleRequests().filter(r => {
                const hay = [r.id, ticketApplicant(r), r.division, r.branch, r.justification]
                    .concat((r.items || []).map(i => i.name)).join(' ').toLowerCase();
                return (!q || hay.includes(q)) && (!b || r.branch === b) && (!s || r.status === s) && (!ticketUrgentOnly || r.urgency === 'Critical' || r.urgency === 'High');
            });

            appState.pagination.filteredData = sortDataList(filtered);
            appState.pagination.currentPage = 1;
            renderRequestsTable();
        }

        function renderRequestsTable() {
            const list = appState.pagination.filteredData;
            const tbody = document.getElementById('requestsTableBody');
            if (!tbody) return; tbody.innerHTML = '';
            if (list.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="p-14 text-center text-dobah-200/70 font-semibold text-xs"><div class="empty-donut"></div>Belum ada tiket yang cocok.</td></tr>`;
                updatePaginationControls(0, 0, 0, 0); return;
            }

            const ps = appState.pagination.pageSize;
            const tp = Math.ceil(list.length / ps);
            if (appState.pagination.currentPage > tp) appState.pagination.currentPage = tp;
            if (appState.pagination.currentPage < 1) appState.pagination.currentPage = 1;

            const startIdx = (appState.pagination.currentPage - 1) * ps;
            const pageData = list.slice(startIdx, startIdx + ps);
            const role = getCurrentUser().role;
            const isGA = role === 'General Affair Manager';

            const STAT = {
                Pending:   { label: 'Menunggu', cls: 'bg-amber-400/15 text-[#ffd65a] border-amber-400/30',     icon: 'fa-regular fa-clock' },
                Approved:  { label: 'Diproses', cls: 'bg-sky-500/15 text-[#7cc1ff] border-sky-400/30',         icon: 'fa-solid fa-arrows-rotate' },
                Completed: { label: 'Selesai',  cls: 'bg-emerald-500/15 text-[#6ee7a0] border-emerald-400/30', icon: 'fa-regular fa-circle-check' },
                Rejected:  { label: 'Ditolak',  cls: 'bg-rose-500/15 text-rose-300 border-rose-400/30',        icon: 'fa-solid fa-xmark' }
            };

            pageData.forEach(req => {
                const actIdx = appState.requests.indexOf(req);
                const totalItemsCount = req.items ? req.items.length : 0;
                let completedCount = req.items ? req.items.filter(i => i.itemStatus === 'Selesai').length : 0;
                if (req.status === 'Completed' && completedCount === 0) completedCount = totalItemsCount;
                const progressPercent = totalItemsCount > 0 ? Math.round((completedCount / totalItemsCount) * 100) : 0;
                const st = STAT[req.status] || STAT.Approved;

                let btns = isGA
                    ? `<button type="button" onclick="printRequest(${actIdx})" class="tk-print" title="Cetak form pengajuan" aria-label="Cetak form pengajuan"><i class="fa-solid fa-print text-[13px]"></i></button>
                       <button type="button" onclick="openEditModal(${actIdx})" class="tk-act">Detail / Ubah</button>
                       <button type="button" onclick="deleteRequest(${actIdx}, '${req.docId}')" class="tk-del" title="Hapus tiket" aria-label="Hapus tiket"><i class="fa-regular fa-trash-can text-[13px]"></i></button>`
                    : `<button type="button" onclick="printRequest(${actIdx})" class="tk-print" title="Cetak form pengajuan" aria-label="Cetak form pengajuan"><i class="fa-solid fa-print text-[13px]"></i></button>
                       <button type="button" onclick="openDetailModal(${actIdx})" class="tk-act">Detail</button>`;

                tbody.innerHTML += `
                    <tr class="transition-colors${(window.NR && NR.isNew(req)) ? ' tk-is-new' : ''}">
                        <td class="p-4 pl-6 whitespace-nowrap">
                            <a href="javascript:void(0)" onclick="openDetailModal(${actIdx})" class="tk-id" title="Lihat detail tiket">${esc(req.id)}</a>${(window.NR && NR.isNew(req)) ? '<span class="tk-new" title="Pengajuan baru, belum dibuka">BARU</span>' : ''}<br>
                            <span class="text-[11px] text-dobah-200/60 font-normal"><i class="fa-regular fa-calendar mr-1"></i>${esc(req.submissionDate)}</span>
                        </td>
                        <td class="p-4">
                            <span class="font-extrabold text-white uppercase text-xs">${esc(ticketApplicant(req))}</span><br>
                            <span class="text-[11px] text-dobah-300 font-semibold uppercase"><i class="fa-solid fa-location-dot mr-1 text-[10px]"></i>${esc(req.branch)}</span>
                        </td>
                        <td class="p-4 text-center"><span class="bg-cocoa-950 text-dobah-100 border border-white/10 px-3 py-1 rounded-full text-[11px] font-bold">${totalItemsCount} Item</span></td>
                        <td class="p-4 w-56">
                            <div class="flex justify-between text-[10px] font-bold text-dobah-100 mb-1.5">
                                <span>${completedCount}/${totalItemsCount} Selesai</span>
                                <span class="text-dobah-400">${progressPercent}%</span>
                            </div>
                            <div class="tk-bar" role="progressbar" aria-valuenow="${progressPercent}" aria-valuemin="0" aria-valuemax="100"><div style="width:${progressPercent}%"></div></div>
                        </td>
                        <td class="p-4 text-center"><span class="tk-pill ${st.cls}"><i class="${st.icon} text-[10px]"></i>${st.label}</span></td>
                        <td class="p-4 pr-6 text-right whitespace-nowrap">${btns}</td>
                    </tr>`;
            });
            updatePaginationControls(startIdx + 1, Math.min(startIdx + ps, list.length), list.length, tp);
        }

        function updatePaginationControls(s, e, t, tp) {
            document.getElementById('paginationInfo').innerText = t === 0 ? 'Menampilkan 0-0 dari 0 data' : `Menampilkan ${s}-${e} dari ${t} data`;
            document.getElementById('btnPrevPage').disabled = (appState.pagination.currentPage <= 1 || t === 0);
            document.getElementById('btnNextPage').disabled = (appState.pagination.currentPage >= tp || t === 0);
            document.getElementById('pageNumbersContainer').innerText = t === 0 ? '' : `Hal ${appState.pagination.currentPage} / ${tp}`;
            const pc = document.getElementById('pagerControls');
            if (pc) { pc.classList.toggle('hidden', tp <= 1); pc.classList.toggle('flex', tp > 1); }
        }
        function nextPage() { if(appState.pagination.currentPage < Math.ceil(appState.pagination.filteredData.length / appState.pagination.pageSize)) { appState.pagination.currentPage++; renderRequestsTable(); } }
        function prevPage() { if(appState.pagination.currentPage > 1) { appState.pagination.currentPage--; renderRequestsTable(); } }
        function changePageSize(sz) { appState.pagination.pageSize = parseInt(sz); appState.pagination.currentPage = 1; renderRequestsTable(); }
        function clearFilters() {
            const se = document.getElementById('filterSearch'); if (se) se.value = '';
            const br = document.getElementById('filterBranch'); if (br) br.value = '';
            setStatusTab('');
        }

        function openTicketList(status, urgent) {
            const se = document.getElementById('filterSearch'); if (se) se.value = '';
            const br = document.getElementById('filterBranch'); if (br) br.value = '';
            setStatusTab(status, urgent);
            const t = document.getElementById('ticketTablePanel');
            if (t) t.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        }

        function exportTicketsCSV() {
            const rows = appState.pagination.filteredData || [];
            if (!rows.length) { Swal.fire('Belum ada data', 'Tidak ada tiket yang bisa diekspor dengan filter saat ini.', 'info'); return; }
            const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
            const label = { Pending: 'Menunggu', Approved: 'Diproses', Completed: 'Selesai', Rejected: 'Ditolak' };
            const head = ['Kode Tiket', 'Tanggal', 'Pemohon', 'Divisi', 'Cabang', 'Jumlah Item', 'Item Selesai', 'Progress (%)', 'Status', 'Urgensi', 'Daftar Item'];
            const lines = [head.map(q).join(',')];
            rows.forEach(r => {
                const items = r.items || [];
                let done = items.filter(i => i.itemStatus === 'Selesai').length;
                if (r.status === 'Completed' && done === 0) done = items.length;
                const pct = items.length ? Math.round(done / items.length * 100) : 0;
                lines.push([r.id, r.submissionDate, ticketApplicant(r), r.division, r.branch, items.length, done, pct,
                    label[r.status] || r.status, r.urgency, items.map(i => i.name).join('; ')].map(q).join(','));
            });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
            a.download = 'tiket_' + new Date().toISOString().slice(0, 10) + '.csv';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        }

        function updateMetrics() {
            const list = getAccessibleRequests();
            document.getElementById('metric-total').innerText = list.length;
            document.getElementById('metric-pending').innerText = list.filter(r => r.status === 'Pending').length;
            document.getElementById('metric-progress').innerText = list.filter(r => r.status === 'Approved').length;
            document.getElementById('metric-completed').innerText = list.filter(r => r.status === 'Completed').length;
            document.getElementById('metric-emergency').innerText = list.filter(r => r.urgency === 'Critical' || r.urgency === 'High').length;
            
            let tot = 0; list.forEach(r => r.items && r.items.forEach(i => tot += (i.qty * i.cost)));
            if (document.getElementById('metric-budget')) document.getElementById('metric-budget').innerText = formatRupiah(tot);
            if (document.getElementById('nav-count-badge')) document.getElementById('nav-count-badge').innerText = list.length;
            renderBudgetChart(list);
        }

        function renderBudgetChart(dataList) {
            const ctx = document.getElementById('budgetChart');
            if(!ctx) return;
            let branchBudgets = {};
            dataList.forEach(req => {
                const b = req.branch;
                const cost = req.items ? req.items.reduce((s, i) => s + (i.qty * i.cost), 0) : 0;
                if(!branchBudgets[b]) branchBudgets[b] = 0;
                branchBudgets[b] += cost;
            });
            const labels = Object.keys(branchBudgets);
            const dataValues = Object.values(branchBudgets);

            if(chartInstance) chartInstance.destroy();

            chartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Total Estimasi Anggaran (Rp)',
                        data: dataValues,
                        backgroundColor: (c) => ['#f4a23a','#f2708f','#7bcbb0','#ffd65a','#d97d26'][c.dataIndex % 5],
                        borderWidth: 0,
                        borderRadius: 12,
                        borderSkipped: false,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { 
                            beginAtZero: true, 
                            grid: { color: themeVar('--chart-grid', 'rgba(255, 255, 255, 0.05)') },
                            ticks: { color: themeVar('--chart-text', '#edd5b3'), callback: function(value) { return 'Rp ' + (value/1000000) + 'Jt'; }, font: { family: "'JetBrains Mono', monospace", size: 10 } }
                        },
                        x: { 
                            grid: { display: false },
                            ticks: { color: themeVar('--chart-text', '#edd5b3'), font: { family: "'Plus Jakarta Sans', sans-serif", size: 10, weight: 'bold' } } 
                        }
                    }
                }
            });
        }

        function openDetailModal(idx) {
            const req = appState.requests[idx]; if (!req) return;
            currentDetailIdx = idx;
            if (window.NR) NR.mark(req);
            document.getElementById('detailReqId').innerText = `#${req.id}`;
            document.getElementById('detailDivision').innerText = req.division;
            document.getElementById('detailBranch').innerText = req.branch;
            document.getElementById('detailSubmissionDate').innerText = req.submissionDate;
            document.getElementById('detailStatusBadge').innerText = `${req.status} (${req.urgency})`;
            document.getElementById('detailJustification').innerText = req.justification || '-';

            const tb = document.getElementById('detailItemsTableBody'); tb.innerHTML = ''; let tot = 0;
            if(req.items) {
                req.items.forEach((item, i) => {
                    const sub = item.qty * item.cost; tot += sub;
                    tb.innerHTML += `<tr><td class="p-2 border border-white/10 text-center">${i+1}</td><td class="p-2 border border-white/10 font-bold text-white">${item.name}<br><span class="text-[9px] text-dobah-200/50">${item.category} ${item.notes?'• '+item.notes:''}</span></td><td class="p-2 border border-white/10 text-center text-dobah-200">${item.qty} ${item.unit}</td><td class="p-2 border border-white/10 text-right text-dobah-200">${formatRupiah(item.cost)}</td><td class="p-2 border border-white/10 text-right font-bold text-white">${formatRupiah(sub)}</td></tr>`;
                });
            }
            document.getElementById('detailTotalBudget').innerText = formatRupiah(tot);
            
            const pc = document.getElementById('detailPhotosContainer'); pc.innerHTML = '';
            if(req.items) {
                req.items.filter(i => i.photo).forEach(item => {
                    pc.innerHTML += `<div class="cursor-pointer border border-white/10 p-1 rounded bg-cocoa-900 shadow-sm" onclick="openZoomImage('${item.photo}')"><img src="${item.photo}" class="w-12 h-12 object-cover rounded"><span class="text-[8px] font-mono font-bold block text-center mt-0.5 truncate w-12 text-dobah-200/60">${item.name}</span></div>`;
                });
            }

            const auditUl = document.getElementById('detailAuditTrail');
            if (req.audit && req.audit.length > 0) {
                auditUl.innerHTML = req.audit.map(a => `<li><span class="font-bold text-dobah-100">${a.timestamp}</span> - ${a.actor} (${a.role}) : <span class="italic">${a.action}</span></li>`).join('');
            } else {
                auditUl.innerHTML = `<li class="italic text-dobah-300/50">Tidak ada riwayat.</li>`;
            }

            openModal('detailModal');
        }

        /* --- EDIT MODAL DENGAN CARD ITEM & STATUS PER ITEM --- */
        function openEditModal(idx) {
            const u = getCurrentUser(); if (u.role !== 'General Affair Manager') return Swal.fire('Akses Dibatasi', 'Hanya GA Manager.', 'warning');
            const r = appState.requests[idx]; if (!r) return;
            if (window.NR) NR.mark(r);
            document.getElementById('editReqDocId').value = idx;
            document.getElementById('editStatus').value = r.status; 
            document.getElementById('editUrgency').value = r.urgency; 
            document.getElementById('editGANotes').value = r.gaNotes||'';
            
            const c = document.getElementById('editModalItemsContainer'); c.innerHTML = '';
            if(r.items) { 
                r.items.forEach((item, itemIdx) => addEditModalItemCard(item, itemIdx + 1)); 
            } else { 
                addEditModalItemCard(null, 1); 
            }
            openModal('editApprovalModal');
        }

        function addEditModalItemCard(data = null, num = 1) {
            const c = document.getElementById('editModalItemsContainer'); 
            const currentCount = c.querySelectorAll('.edit-item-row').length + 1;
            const rid = 'edit_item_' + Date.now() + Math.random();
            const catOpts = appState.categories.map(cat => `<option value="${cat}" class="bg-cocoa-900" ${data && data.category === cat ? 'selected' : ''}>${cat}</option>`).join('');
            const statusItemOpts = ['Menunggu', 'Diproses', 'Selesai', 'Ditolak'].map(st => `<option value="${st}" class="bg-cocoa-900" ${data && data.itemStatus === st ? 'selected' : ''}>${st}</option>`).join('');
            
            const itemStat = data && data.itemStatus ? data.itemStatus : 'Menunggu';
            const urgBadgeColor = (itemStat === 'Selesai') ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : (itemStat === 'Diproses' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30');

            const h = `
                <div id="${rid}" class="edit-item-row bg-cocoa-900/90 p-4 rounded-xl border border-white/10 space-y-3">
                    <div class="flex justify-between items-center border-b border-white/5 pb-2">
                        <div class="flex items-center space-x-2">
                            <span class="font-mono font-black text-xs text-white">#${num || currentCount}.</span>
                            <input type="text" required class="edit-item-name glass-input px-2.5 py-1 text-xs font-bold text-white w-48" value="${data ? data.name : ''}" placeholder="Nama Item...">
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded border ${urgBadgeColor}">${itemStat}</span>
                        </div>
                        <div class="flex items-center space-x-2">
                            <select class="edit-item-category glass-input px-2 py-1 text-[11px] font-semibold">${catOpts}</select>
                            <button type="button" onclick="removeEditModalItemCard('${rid}')" class="text-rose-400 hover:text-rose-300 font-bold px-2"><i class="fa-solid fa-trash text-xs"></i></button>
                        </div>
                    </div>
                    
                    <div>
                        <input type="text" placeholder="Catatan spesifikasi / keterangan item..." class="edit-item-notes w-full glass-input px-3 py-1.5 text-xs" value="${data ? data.notes || '' : ''}">
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                        <div>
                            <label class="block text-[10px] uppercase font-bold text-dobah-200/60 mb-1">Qty & Satuan</label>
                            <div class="flex space-x-1">
                                <input type="number" min="1" required class="edit-item-qty w-16 glass-input px-2 py-1 text-xs text-center font-bold" value="${data ? data.qty : 1}">
                                <input type="text" required class="edit-item-unit w-20 glass-input px-2 py-1 text-xs text-center font-bold" value="${data ? data.unit || 'Unit' : 'Unit'}">
                            </div>
                        </div>
                        <div>
                            <label class="block text-[10px] uppercase font-bold text-dobah-200/60 mb-1">Harga Satuan (Rp)</label>
                            <input type="number" min="0" required class="edit-item-cost w-full glass-input px-2.5 py-1 text-xs font-bold font-mono" value="${data ? data.cost : 0}">
                        </div>
                        <div>
                            <label class="block text-[10px] uppercase font-bold text-dobah-400 mb-1">Status Item:</label>
                            <select class="edit-item-status w-full glass-input px-2.5 py-1 text-xs font-bold text-dobah-300">${statusItemOpts}</select>
                        </div>
                    </div>

                    <div class="flex items-center flex-wrap gap-2 pt-3 border-t border-white/5">
                        <span class="text-[10px] uppercase font-bold text-dobah-200/60 mr-1"><i class="fa-solid fa-camera mr-1"></i>Foto:</span>
                        <label class="modern-button bg-dobah-400 text-slate-950 text-[11px] font-bold px-3.5 py-2 cursor-pointer flex items-center shrink-0">
                            <i class="fa-solid fa-camera mr-1.5"></i>Ambil Foto
                            <input type="file" accept="image/*" capture="environment" class="hidden" onchange="handleEditPhoto(this, '${rid}')">
                        </label>
                        <label class="modern-button bg-cocoa-800 hover:bg-cocoa-900 text-dobah-200 text-[11px] font-semibold px-3 py-2 cursor-pointer flex items-center shrink-0 border border-white/10">
                            <i class="fa-solid fa-image mr-1.5 text-dobah-400"></i>Upload / Galeri
                            <input type="file" accept="image/*" class="hidden" onchange="handleEditPhoto(this, '${rid}')">
                        </label>
                        <input type="hidden" class="edit-item-photo">
                        <div class="edit-photo-preview text-[11px] font-mono text-dobah-200/50 flex items-center gap-2 min-w-0 basis-full sm:basis-0 sm:flex-1"></div>
                    </div>
                </div>`;
            c.insertAdjacentHTML('beforeend', h);
            const newRow = document.getElementById(rid);
            newRow.querySelector('.edit-item-photo').value = (data && data.photo) ? data.photo : '';
            renderEditPhoto(rid);
        }

        function renderEditPhoto(rid) {
            const row = document.getElementById(rid); if (!row) return;
            const photo = row.querySelector('.edit-item-photo').value;
            const box = row.querySelector('.edit-photo-preview');
            if (!photo) { box.textContent = 'Belum ada foto'; return; }
            const kb = Math.round(photo.length * 0.75 / 1024);
            box.innerHTML = `<img src="${photo}" alt="Foto item" class="w-12 h-12 rounded-lg object-cover border border-white/10 shrink-0 cursor-pointer" onclick="openZoomImage(document.getElementById('${rid}').querySelector('.edit-item-photo').value)"><span class="text-dobah-400 font-bold truncate">✓ Foto tersimpan (${kb} KB)</span><button type="button" onclick="clearEditPhoto('${rid}')" class="text-rose-400 hover:text-rose-300 text-xs shrink-0 px-1" aria-label="Hapus foto"><i class="fa-solid fa-xmark"></i></button>`;
        }

        async function handleEditPhoto(input, rid) {
            const f = input.files && input.files[0];
            if (!f) return;
            if (f.size > 15 * 1024 * 1024) { input.value = ''; return Swal.fire('Error', 'Ukuran foto terlalu besar (maksimal 15MB).', 'error'); }
            const row = document.getElementById(rid); if (!row) return;
            row.querySelector('.edit-photo-preview').textContent = 'Memproses foto...';
            try {
                row.querySelector('.edit-item-photo').value = await compressImage(f);
            } catch (err) {
                Swal.fire('Error', 'Foto tidak bisa diproses. Coba lagi.', 'error');
            }
            renderEditPhoto(rid);
            input.value = '';
        }

        function clearEditPhoto(rid) {
            const row = document.getElementById(rid); if (!row) return;
            row.querySelector('.edit-item-photo').value = '';
            renderEditPhoto(rid);
        }

        function removeEditModalItemCard(id) { 
            if (document.querySelectorAll('.edit-item-row').length > 1) {
                document.getElementById(id).remove(); 
            } else {
                Swal.fire('Info', 'Minimal harus ada 1 baris item dalam dokumen!', 'warning');
            }
        }

        async function saveEditApproval(e) {
            e.preventDefault();
            const idx = parseInt(document.getElementById('editReqDocId').value); 
            const req = appState.requests[idx]; if (!req) return;
            const usr = getCurrentUser();
            
            const oldStatus = req.status;
            const newStatus = document.getElementById('editStatus').value;
            
            req.status = newStatus; 
            req.urgency = document.getElementById('editUrgency').value; 
            req.gaNotes = document.getElementById('editGANotes').value;

            let upd = []; 
            document.querySelectorAll('.edit-item-row').forEach(r => { 
                upd.push({ 
                    name: r.querySelector('.edit-item-name').value, 
                    category: r.querySelector('.edit-item-category').value, 
                    qty: parseInt(r.querySelector('.edit-item-qty').value) || 1, 
                    unit: r.querySelector('.edit-item-unit').value || 'Unit', 
                    cost: parseFloat(r.querySelector('.edit-item-cost').value) || 0, 
                    notes: r.querySelector('.edit-item-notes').value || '', 
                    photo: r.querySelector('.edit-item-photo').value || '', 
                    itemStatus: r.querySelector('.edit-item-status').value 
                }); 
            });
            req.items = upd;

            if(!req.audit) req.audit = [];
            let actionText = `Memperbarui Data & Status Item.`;
            if (oldStatus !== newStatus) actionText = `Ubah status tiket: ${oldStatus} ➔ ${newStatus}. Catatan: ${req.gaNotes || '-'}`;
            
            req.audit.push({
                actor: usr.name, role: usr.role,
                action: actionText, timestamp: new Date().toLocaleString('id-ID')
            });

            if (window.db && req.docId) { 
                try { await window.fbDeps.setDoc(window.fbDeps.doc(window.db, "requests", req.docId), req, { merge: true }); } catch(err){} 
            } else { 
                saveLocalState(); 
            }
            closeModal('editApprovalModal'); applyTableFilters(); updateMetrics(); 
            Swal.fire('Berhasil', 'Pembaruan approval disimpan.', 'success');
        }

        async function deleteRequest(idx, did) {
            Swal.fire({ title: 'Hapus pengajuan?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d96c38', cancelButtonColor: '#dc2626' }).then(async (res) => {
                if(res.isConfirmed) {
                    if (window.db && did) { try { await window.fbDeps.deleteDoc(window.fbDeps.doc(window.db, "requests", did)); } catch(e){} } 
                    else { appState.requests.splice(idx, 1); saveLocalState(); }
                    applyTableFilters(); updateMetrics(); Swal.fire('Terhapus', 'Data dihapus.', 'success');
                }
            });
        }
        function openZoomImage(src) { document.getElementById('zoomedImage').src = src; openModal('imageZoomModal'); }
        function openModal(id) { document.getElementById(id).classList.replace('hidden', 'flex'); }
        function closeModal(id) { document.getElementById(id).classList.replace('flex', 'hidden'); }

        /* --- MASTER DATA LOGIC --- */
        function renderMasterDataView() {
            const tb = document.getElementById('masterUserTableBody'); if (!tb) return;
            tb.innerHTML = appState.users.map((u, i) => `<tr class="hover:bg-white/[0.02]"><td class="p-3 border border-white/5 font-bold text-white">${u.name}</td><td class="p-3 border border-white/5 text-dobah-400 font-mono">${u.role}</td><td class="p-3 border border-white/5 text-dobah-100 font-medium">${u.branches.includes('ALL')?'All Branches':u.branches.join(', ')}</td><td class="p-3 border border-white/5 text-center"><button onclick="promptEditUser(${i})" class="modern-button bg-cocoa-800 hover:bg-cocoa-900 text-dobah-300 p-1.5 px-2.5 mr-1 border border-white/5 text-xs"><i class="fa-solid fa-pen"></i></button>${u.username!=='admin'?`<button onclick="deleteUserAccount(${i})" class="modern-button bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 p-1.5 px-2.5 border border-rose-500/20 text-xs"><i class="fa-solid fa-trash"></i></button>`:''}</td></tr>`).join('');
            ['categories','divisions','branches'].forEach(k => {
                const el = document.getElementById('masterList' + k.charAt(0).toUpperCase() + k.slice(1));
                if(el) el.innerHTML = appState[k].map((item, idx) => `<div class="flex items-center justify-between bg-cocoa-900/60 p-3 rounded-xl border border-white/10 text-xs font-semibold text-dobah-100"><span>${item}</span><button onclick="deleteMasterItem('${k}', ${idx})" class="text-rose-400 hover:text-rose-300 px-1 font-black">&times;</button></div>`).join('');
            });
            const ce = document.getElementById('masterListContactTypes');
            if (ce) ce.innerHTML = (appState.contactTypes || []).map(t => `<div class="flex items-center justify-between bg-cocoa-900/60 p-3 rounded-xl border border-white/10 text-xs font-semibold text-dobah-100"><span>${esc(t.label)}</span><span class="flex items-center gap-1"><button onclick="promptEditContactType('${t.id}')" title="Ubah nama" class="text-dobah-300 hover:text-white px-1"><i class="fa-solid fa-pen text-[11px]"></i></button><button onclick="deleteContactType('${t.id}')" title="Hapus" class="text-rose-400 hover:text-rose-300 px-1 font-black">&times;</button></span></div>`).join('') || '<p class="text-xs italic text-dobah-200/50">Belum ada jenis. Klik Tambah.</p>';
        }
        function contactTypeValidator(v, selfId) {
            const t = (v || '').trim();
            if (!t) return 'Nama jenis wajib diisi';
            if ((appState.contactTypes || []).some(x => x.id !== selfId && x.label.toLowerCase() === t.toLowerCase())) return 'Jenis dengan nama itu sudah ada';
            return null;
        }
        function afterContactTypeChange() { saveMasterSettings(); renderMasterDataView(); }
        function promptAddContactType() {
            Swal.fire({ title: 'Tambah Jenis Kontak', input: 'text', inputPlaceholder: 'mis. Sales Packaging', showCancelButton: true, confirmButtonColor: '#f4a23a', inputValidator: v => contactTypeValidator(v) }).then(r => {
                if (!r.isConfirmed) return;
                (appState.contactTypes = appState.contactTypes || []).push({ id: 'ct_' + Date.now().toString(36), label: r.value.trim() });
                afterContactTypeChange();
            });
        }
        function promptEditContactType(id) {
            const t = (appState.contactTypes || []).find(x => x.id === id); if (!t) return;
            Swal.fire({ title: 'Ubah Nama Jenis', input: 'text', inputValue: t.label, showCancelButton: true, confirmButtonColor: '#f4a23a', inputValidator: v => contactTypeValidator(v, id) }).then(r => {
                if (!r.isConfirmed) return;
                t.label = r.value.trim();
                afterContactTypeChange();
            });
        }
        function deleteContactType(id) {
            const t = (appState.contactTypes || []).find(x => x.id === id); if (!t) return;
            const used = ((window.AM && AM.contacts) || []).filter(c => c.type === id).length;
            if (used > 0) return Swal.fire({ title: 'Jenis masih dipakai', text: `${used} kontak sales memakai jenis "${t.label}". Ubah jenis kontak tersebut dulu, atau cukup ganti nama jenisnya.`, icon: 'info', confirmButtonColor: '#f4a23a' });
            Swal.fire({ title: 'Hapus jenis?', text: t.label, icon: 'warning', showCancelButton: true, confirmButtonText: 'Ya, hapus', cancelButtonText: 'Batal', confirmButtonColor: '#e11d48' }).then(r => {
                if (!r.isConfirmed) return;
                appState.contactTypes = appState.contactTypes.filter(x => x.id !== id);
                afterContactTypeChange();
            });
        }
        function promptAddMasterItem(k) {
            Swal.fire({ title: `Tambah Data`, input: 'text', showCancelButton: true, confirmButtonColor: '#f4a23a' }).then(r => {
                if(r.isConfirmed && r.value.trim()!=='') { appState[k].push(r.value.trim()); saveMasterSettings(); renderMasterDataView(); populateDropdowns(); }
            });
        }
        function deleteMasterItem(k, i) { appState[k].splice(i, 1); saveMasterSettings(); renderMasterDataView(); populateDropdowns(); }

        function renderBranchCheckboxes(sel=[]) {
            const c = document.getElementById('branchCheckboxesContainer'); if (!c) return;
            c.innerHTML = appState.branches.map(b => `<label class="flex items-center space-x-2.5 cursor-pointer text-dobah-200 hover:text-white"><input type="checkbox" value="${b}" ${sel.includes('ALL')||sel.includes(b)?'checked':''} class="branch-checkbox w-4 h-4 text-dobah-400 rounded border-white/20 bg-cocoa-900"><span>${b}</span></label>`).join('');
        }
        function toggleBranchCheckboxesByRole() {
            const r = document.getElementById('userFormRole').value;
            document.querySelectorAll('.branch-checkbox').forEach(cb => { if(r==='General Affair Manager'){ cb.checked=true; cb.disabled=true; } else { cb.disabled=false; } });
        }
        function setUserPwField(show) { const pw = document.getElementById('userFormPassword'); pw.parentElement.style.display = show ? '' : 'none'; pw.required = show; if (!show) pw.value = ''; }
        function promptAddUser() { document.getElementById('userFormUsername').disabled = false; setUserPwField(true); document.getElementById('userForm').reset(); document.getElementById('userFormId').value=''; document.getElementById('userModalTitle').innerText='Buat Akun Baru'; renderBranchCheckboxes([]); toggleBranchCheckboxesByRole(); openModal('userModal'); }
        function promptEditUser(i) {
            const u = appState.users[i]; document.getElementById('userFormId').value = i; document.getElementById('userModalTitle').innerText = 'Edit: '+u.name;
            document.getElementById('userFormUsername').value = u.username; document.getElementById('userFormName').value = u.name; document.getElementById('userFormUsername').disabled = true; setUserPwField(false); document.getElementById('userFormRole').value = u.role;
            renderBranchCheckboxes(u.branches||[]); toggleBranchCheckboxesByRole(); openModal('userModal');
        }
        async function saveUserAccount(e) {
            e.preventDefault(); const idStr = document.getElementById('userFormId').value;
            const uname = document.getElementById('userFormUsername').value.trim().toLowerCase();
            const nm = document.getElementById('userFormName').value.trim();
            const pwd = document.getElementById('userFormPassword').value;
            const rl = document.getElementById('userFormRole').value;
            let br = []; if (rl === 'General Affair Manager') { br = ['ALL']; } else { document.querySelectorAll('.branch-checkbox:checked').forEach(cb => br.push(cb.value)); }
            if (br.length === 0) return Swal.fire('Peringatan', 'Pilih minimal 1 cabang!', 'warning');
            const { doc, setDoc } = window.fbDeps;
            try {
                if (idStr === '') {
                    if (!/^[a-z0-9._-]{3,30}$/.test(uname)) return Swal.fire('Username tidak valid', 'Gunakan 3-30 karakter: huruf kecil, angka, titik, strip, atau garis bawah.', 'warning');
                    if (pwd.length < 6) return Swal.fire('Password terlalu pendek', 'Minimal 6 karakter.', 'warning');
                    if (appState.users.some(u => u.username === uname)) return Swal.fire('Error', 'Username terpakai!', 'error');
                    const uid = await window.createAuthUser(usernameToEmail(uname), pwd);
                    await setDoc(doc(window.db, 'profiles', uid), { username: uname, name: nm, role: rl, branches: br });
                } else {
                    const u = appState.users[parseInt(idStr)];
                    if (u.id === getCurrentUser().id && rl !== 'General Affair Manager') return Swal.fire('Tidak diizinkan', 'Anda tidak bisa menurunkan role akun Anda sendiri.', 'warning');
                    await setDoc(doc(window.db, 'profiles', u.id), { username: u.username, name: nm, role: rl, branches: br });
                }
                closeModal('userModal'); renderMasterDataView(); Swal.fire('Tersimpan', '', 'success');
            } catch (err) {
                console.error(err);
                const msg = err.code === 'auth/email-already-in-use' ? 'Username ini pernah dibuat. Hapus dulu akun lamanya di Firebase Console → Authentication, lalu coba lagi.'
                    : err.code === 'permission-denied' ? 'Ditolak oleh aturan keamanan. Hanya GA Manager yang boleh.' : (err.message || 'Gagal menyimpan.');
                Swal.fire('Gagal', msg, 'error');
            }
        }
        function deleteUserAccount(i) {
            const u = appState.users[i]; if (!u) return;
            if (u.id === getCurrentUser().id) return Swal.fire('Tidak diizinkan', 'Anda tidak bisa menghapus akun sendiri.', 'warning');
            Swal.fire({ title: 'Hapus akun?', text: u.name + ' tidak akan bisa mengakses aplikasi lagi.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#f4a23a', cancelButtonColor: '#dc2626' }).then(async r => {
                if (!r.isConfirmed) return;
                try { await window.fbDeps.deleteDoc(window.fbDeps.doc(window.db, 'profiles', u.id)); renderMasterDataView(); Swal.fire('Terhapus', '', 'success'); }
                catch (err) { Swal.fire('Gagal', 'Tidak punya izin menghapus.', 'error'); }
            });
        }
        function formatRupiah(amount) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount); }
    
