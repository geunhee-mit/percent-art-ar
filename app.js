(function () {
  const STORAGE_KEY = 'teheran_percent_art_audits_v1';
  const audits = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

  const artworks = window.TEHERAN_ARTWORKS || [];
  let activeIdx = 0;
  let currentMode = 'map';
  let draftStatus = 'good';
  let arStream = null;

  // DOM
  const mapView = document.getElementById('mapView');
  const arView = document.getElementById('arView');
  const btnModeMap = document.getElementById('btnModeMap');
  const btnModeAR = document.getElementById('btnModeAR');
  const artListContainer = document.getElementById('artListContainer');
  const dexBadge = document.getElementById('dexBadge');
  const headerBudgetSummary = document.getElementById('headerBudgetSummary');

  // Compute total budget
  const totalBudget = artworks.reduce((acc, a) => acc + (a.budgetKRW || 0), 0).toFixed(1);
  headerBudgetSummary.textContent = `총 추정 설치비 ${totalBudget}억 원 · ${artworks.length}개 작품`;

  // ================= LEAFLET MAP (100% API-Key-Free OpenStreetMap + Dark Filter) =================
  const map = L.map('artMap', { zoomControl: false }).setView([37.5042, 127.0465], 14);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
    className: 'dark-gallery-tiles'
  }).addTo(map);

  const markers = {};

  function getStatusMeta(art) {
    const st = (audits[art.id] && audits[art.id].status) || art.defaultStatus;
    if (st === 'good') return { label: '잘 관리됨', emoji: '✨', color: '#34d399', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };
    if (st === 'neglected') return { label: '훼손·방치', emoji: '🕸️', color: '#fbbf24', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
    if (st === 'ghost') return { label: '유령(사라짐)', emoji: '👻', color: '#fb7185', badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
    return { label: '미검증', emoji: '❓', color: '#94a3b8', badge: 'bg-zinc-800 text-zinc-300 border-zinc-700' };
  }

  function renderMarkers() {
    artworks.forEach((art, idx) => {
      const meta = getStatusMeta(art);
      if (markers[art.id]) {
        map.removeLayer(markers[art.id]);
      }
      const m = L.circleMarker([art.lat, art.lng], {
        radius: idx === activeIdx ? 11 : 8,
        fillColor: meta.color,
        color: '#ffffff',
        weight: idx === activeIdx ? 3 : 1.5,
        fillOpacity: 0.9
      }).addTo(map);

      m.bindTooltip(`${meta.emoji} ${art.building}: ${art.title} (${art.budgetKRW}억)`, { direction: 'top' });
      m.on('click', () => {
        activeIdx = idx;
        renderMarkers();
        renderArtList();
        openAuditModal(art);
      });
      markers[art.id] = m;
    });
  }

  function renderArtList() {
    artListContainer.innerHTML = '';
    artworks.forEach((art, idx) => {
      const meta = getStatusMeta(art);
      const isAudited = Boolean(audits[art.id]);
      const card = document.createElement('div');
      card.className = `p-3.5 rounded-2xl border transition cursor-pointer space-y-2 ${
        idx === activeIdx
          ? 'bg-zinc-900 border-amber-400/70 shadow-lg'
          : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
      }`;

      card.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="text-[11px] font-extrabold text-amber-300 truncate">${art.building}</span>
            <span class="text-[10px] text-zinc-500">${art.year}</span>
          </div>
          <span class="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.badge}">
            ${meta.emoji} ${meta.label}
          </span>
        </div>
        <div>
          <h3 class="text-xs sm:text-sm font-bold text-zinc-100 leading-snug">${art.title}</h3>
          <p class="text-[11px] text-zinc-400 mt-0.5">${art.artist} · <b class="text-amber-300">${art.budgetKRW}억 원</b> (${art.budgetSource})</p>
        </div>
        <div class="flex items-center gap-1.5 pt-1">
          <button type="button" class="btn-card-ar flex-1 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-bold transition">
            📷 AR 캡션 보기
          </button>
          <button type="button" class="btn-card-audit flex-1 py-1.5 rounded-xl ${isAudited ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-400 text-zinc-950'} text-[11px] font-extrabold transition">
            ${isAudited ? '✓ 감사 수정' : '🔍 3초 감사'}
          </button>
        </div>
      `;

      card.onclick = (e) => {
        if (e.target.closest('button')) return;
        activeIdx = idx;
        map.flyTo([art.lat, art.lng], 16, { duration: 0.6 });
        renderMarkers();
        renderArtList();
      };

      card.querySelector('.btn-card-ar').onclick = () => {
        activeIdx = idx;
        switchMode('ar');
      };

      card.querySelector('.btn-card-audit').onclick = () => {
        activeIdx = idx;
        openAuditModal(art);
      };

      artListContainer.appendChild(card);
    });
  }

  // ================= MODE SWITCHING =================
  function switchMode(mode) {
    currentMode = mode;
    if (mode === 'ar') {
      mapView.classList.add('hidden');
      arView.classList.remove('hidden');
      btnModeAR.className = 'px-2.5 py-1.5 rounded-xl bg-amber-400 text-zinc-950 text-xs font-extrabold flex items-center gap-1 transition';
      btnModeMap.className = 'px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-bold flex items-center gap-1 transition';
      renderARCard();
    } else {
      arView.classList.add('hidden');
      mapView.classList.remove('hidden');
      btnModeMap.className = 'px-2.5 py-1.5 rounded-xl bg-amber-400 text-zinc-950 text-xs font-extrabold flex items-center gap-1 transition';
      btnModeAR.className = 'px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-bold flex items-center gap-1 transition';
      setTimeout(() => map.invalidateSize(), 100);
    }
  }

  btnModeMap.onclick = () => switchMode('map');
  btnModeAR.onclick = () => switchMode('ar');

  // ================= AR CAPTION & GHOST HOLOGRAM =================
  function renderARCard() {
    const art = artworks[activeIdx];
    if (!art) return;
    const st = (audits[art.id] && audits[art.id].status) || art.defaultStatus;

    document.getElementById('arBuildingBadge').textContent = art.building;
    document.getElementById('arDistanceBadge').textContent = `${activeIdx + 1} / ${artworks.length} · ${art.address}`;
    document.getElementById('arTitle').textContent = art.title;
    document.getElementById('arArtistYear').textContent = `${art.artist} · ${art.year}년 · ${art.material}`;
    document.getElementById('arBudgetText').textContent = art.budgetLabel;
    document.getElementById('arBudgetType').textContent = art.budgetSource;
    document.getElementById('arDesc').textContent = art.description;

    const ghostEl = document.getElementById('ghostHologram');
    if (st === 'ghost') {
      ghostEl.classList.remove('hidden');
    } else {
      ghostEl.classList.add('hidden');
    }
  }

  document.getElementById('btnArPrev').onclick = () => {
    activeIdx = (activeIdx - 1 + artworks.length) % artworks.length;
    renderARCard();
  };
  document.getElementById('btnArNext').onclick = () => {
    activeIdx = (activeIdx + 1) % artworks.length;
    renderARCard();
  };
  document.getElementById('btnArOpenAudit').onclick = () => openAuditModal(artworks[activeIdx]);

  document.getElementById('btnStartLiveCamera').onclick = async () => {
    const video = document.getElementById('arCameraVideo');
    const backdrop = document.getElementById('arSimBackdrop');
    const btn = document.getElementById('btnStartLiveCamera');
    if (arStream) {
      arStream.getTracks().forEach(t => t.stop());
      arStream = null;
      video.classList.add('hidden');
      backdrop.classList.remove('hidden');
      btn.textContent = '📷 실물 카메라 켜기';
      document.getElementById('arStatusLabel').textContent = 'AR 시뮬레이션 (좌우 전환)';
      return;
    }
    try {
      arStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      video.srcObject = arStream;
      video.classList.remove('hidden');
      backdrop.classList.add('hidden');
      btn.textContent = '⏹ 카메라 끄기';
      document.getElementById('arStatusLabel').textContent = '라이브 AR 캡션 활성 중';
    } catch (e) {
      alert('카메라 권한이 없거나 HTTPS/모바일 환경이 아닙니다. 시뮬레이션 AR 모드로 캡션을 체험해 보세요!');
    }
  };

  // ================= 3-SECOND AUDIT MODAL =================
  const artAuditModal = document.getElementById('artAuditModal');
  const auditMemoInput = document.getElementById('auditMemoInput');

  function openAuditModal(art) {
    const existing = audits[art.id];
    draftStatus = existing ? existing.status : (art.defaultStatus === 'unverified' ? 'good' : art.defaultStatus);
    document.getElementById('auditModalBuilding').textContent = `${art.building} (${art.address})`;
    document.getElementById('auditModalTitle').textContent = art.title;
    document.getElementById('auditModalBudget').textContent = `설치 예산: ${art.budgetLabel}`;
    auditMemoInput.value = existing ? (existing.memo || '') : '';
    syncStatusBtns();
    artAuditModal.classList.remove('hidden');
  }

  function syncStatusBtns() {
    document.querySelectorAll('.art-status-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.status === draftStatus);
    });
  }

  document.querySelectorAll('.art-status-btn').forEach(btn => {
    btn.onclick = () => { draftStatus = btn.dataset.status; syncStatusBtns(); };
  });

  document.getElementById('btnSaveArtAudit').onclick = () => {
    const art = artworks[activeIdx];
    audits[art.id] = {
      id: art.id,
      building: art.building,
      title: art.title,
      artist: art.artist,
      budgetKRW: art.budgetKRW,
      lat: art.lat,
      lng: art.lng,
      status: draftStatus,
      memo: auditMemoInput.value.trim(),
      timestamp: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(audits));
    updateStats();
    renderMarkers();
    renderArtList();
    if (currentMode === 'ar') renderARCard();
    artAuditModal.classList.add('hidden');
  };

  document.getElementById('btnCloseArtAudit').onclick = () => artAuditModal.classList.add('hidden');

  // ================= REPORT & CSV EXPORT =================
  const reportModal = document.getElementById('reportModal');
  function updateStats() {
    const vals = Object.values(audits);
    dexBadge.textContent = `${vals.length}/${artworks.length}`;
    document.getElementById('repCount').textContent = `${vals.length}/${artworks.length}`;
    document.getElementById('repNeglected').textContent = vals.filter(v => v.status === 'neglected').length;
    document.getElementById('repGhost').textContent = vals.filter(v => v.status === 'ghost').length;
  }

  document.getElementById('btnOpenReport').onclick = () => {
    updateStats();
    reportModal.classList.remove('hidden');
  };
  document.getElementById('btnCloseReport').onclick = () => reportModal.classList.add('hidden');

  document.getElementById('btnExportArtCsv').onclick = () => {
    const rows = Object.values(audits);
    if (rows.length === 0) {
      alert('아직 감사한 조형물이 없습니다. 작품을 선택해 3초 감사를 남겨보세요!');
      return;
    }
    const header = 'id,building,title,artist,budget_krw_100m,lat,lng,status,memo,timestamp\n';
    const body = rows.map(r => `${r.id},"${r.building}","${r.title}","${r.artist}",${r.budgetKRW},${r.lat},${r.lng},${r.status},"${(r.memo || '').replace(/"/g, '""')}",${r.timestamp}`).join('\n');
    const blob = new Blob(['\uFEFF' + header + body], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `teheran_percent_art_audit_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  document.getElementById('btnResetArtAudits').onclick = () => {
    if (!confirm('모든 조형물 감사 기록을 초기화할까요?')) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  };

  // Init
  updateStats();
  renderMarkers();
  renderArtList();
  if (window.lucide) lucide.createIcons();
})();
