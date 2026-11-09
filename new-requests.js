/* Penanda "BARU" untuk pengajuan yang belum dilihat GA Manager.
   - Tanda "BARU" + sorotan pada baris tiket, lencana angka di menu sidebar, tombol "Tandai semua dilihat".
   - Tiket dianggap "dilihat" setelah dibuka (Detail / Ubah) atau lewat tombol tandai semua.
   - Status dilihat disimpan per akun di browser (localStorage 'ga_seen_<uid>'), hanya berisi ID dokumen tiket.
   - Pertama kali dipakai, semua tiket yang sudah ada dianggap sudah dilihat (tidak banjir tanda). */
(function () {
  var NR = window.NR = { seen: null, uid: null, count: 0, prev: null };
  var MAX = 1000;

  function me() { return typeof getCurrentUser === 'function' ? getCurrentUser() : null; }
  function enabled() { var u = me(); return !!u && u.role === 'General Affair Manager'; }
  function key(r) { return r.docId || r.id; }
  function mine(r) { var u = me(), a = r.audit && r.audit[0]; return !!(u && a && a.actor === u.name); }
  function list() { return (typeof getAccessibleRequests === 'function' ? getAccessibleRequests() : appState.requests) || []; }

  function store() {
    var u = me(); if (!u) return null;
    if (NR.uid !== u.id) {
      NR.uid = u.id; NR.seen = null; NR.prev = null;
      try {
        var v = JSON.parse(localStorage.getItem('ga_seen_' + u.id) || 'null');
        if (v && Array.isArray(v.ids)) NR.seen = new Set(v.ids);
      } catch (e) {}
    }
    return NR.seen;
  }
  function save() {
    if (!NR.seen || !NR.uid) return;
    try { localStorage.setItem('ga_seen_' + NR.uid, JSON.stringify({ ids: Array.from(NR.seen).slice(-MAX) })); } catch (e) {}
  }

  NR.isNew = function (r) { return enabled() && !!NR.seen && !NR.seen.has(key(r)) && !mine(r); };

  function paint(n) {
    var btn = document.getElementById('tab-list');
    if (btn) {
      var b = document.getElementById('nrNavBadge');
      if (n > 0) {
        if (!b) { b = document.createElement('span'); b.id = 'nrNavBadge'; b.className = 'nr-badge'; btn.appendChild(b); }
        b.textContent = n > 99 ? '99+' : String(n);
        b.title = n + ' pengajuan baru belum dilihat';
        if (NR.prev !== null && n > NR.prev) { b.classList.remove('nr-pop'); void b.offsetWidth; b.classList.add('nr-pop'); }
      } else if (b) { b.remove(); }
    }
    var m = document.getElementById('nrMarkAll');
    if (m) { m.style.display = n > 0 ? 'inline-flex' : 'none'; var t = m.querySelector('span'); if (t) t.textContent = 'Tandai ' + n + ' baru dilihat'; }
  }

  // Dipanggil setiap data tiket berubah (sebelum tabel digambar ulang).
  NR.sync = function () {
    if (!enabled()) { paint(0); return; }
    if (window.db && !window.__cloudSynced) return;   // tunggu data server, jangan menjadikan cache lama sebagai patokan
    var all = list(), s = store(), changed = false;
    if (!s) { s = NR.seen = new Set(); all.forEach(function (r) { s.add(key(r)); }); changed = true; }
    else all.forEach(function (r) { if (!s.has(key(r)) && mine(r)) { s.add(key(r)); changed = true; } });
    if (changed) save();
    var n = all.filter(NR.isNew).length;
    paint(n); NR.count = n; NR.prev = n;
  };

  function redraw() {
    NR.sync();
    if (typeof renderRequestsTable === 'function' && typeof appState !== 'undefined' && appState.activeTab === 'list') renderRequestsTable();
  }
  NR.mark = function (r) {
    if (!r || !enabled()) return; var s = store(); if (!s) return;
    var k = key(r); if (s.has(k)) return;
    s.add(k); save(); redraw();
  };
  NR.markAll = function () {
    if (!enabled()) return; var s = store(); if (!s) return;
    list().forEach(function (r) { s.add(key(r)); }); save(); redraw();
  };
})();
