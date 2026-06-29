/* ============================================================
   CONFIGURATION SUPABASE
   ============================================================ */
const SUPABASE_URL      = 'https://lgfrabkcrrjkswnientb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_rZYRn6Wls3IGeahh9oAs8Q_XlA4ZIJG';

/* ============================================================
   CONSTANTES — Semaine algérienne : Samedi → Vendredi
   ============================================================ */
const JOURS       = ['Samedi','Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
const JOURS_COURT = ['Sam','Dim','Lun','Mar','Mer','Jeu','Ven'];

/* ============================================================
   STATE
   ============================================================ */
const state = {
  view:         'accueil',
  weekStart:    null,   // Date objet — samedi de la semaine affichée
  selectedDay:  null,   // ISO string du jour sélectionné
  selectedCat:  null,   // nom de la catégorie sélectionnée
  prestations:  [],
  clientes:     [],
  categories:   [],
  histCliente:  null,
  // RDV modal multi-select
  selPrestIds:  [],     // [{id, nom, prix}]
  selClienteId: null,
  selClienteNom: '',
};

/* ============================================================
   SUPABASE
   ============================================================ */
let db;
function initSupabase() {
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/* ============================================================
   DATES
   ============================================================ */
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${j}`;
}

// Retourne le samedi de la semaine contenant d
function getSaturday(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  const day = dt.getDay(); // 0=Dim, 1=Lun … 6=Sam
  const diff = day === 6 ? 0 : -(day + 1);
  dt.setDate(dt.getDate() + diff);
  return dt;
}

function addDays(d, n) {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt;
}

function fmtShort(d) {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function fmtFull(d) {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtDayFull(d) {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/* ============================================================
   TOAST
   ============================================================ */
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ============================================================
   ROUTER
   ============================================================ */
function navigateTo(viewName, skipTab = false) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(`view-${viewName}`);
  if (el) el.classList.add('active');

  if (!skipTab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const parentTab = { historique: 'clientes' }[viewName] || viewName;
    const tab = document.querySelector(`.tab[data-view="${parentTab}"]`);
    if (tab) tab.classList.add('active');
  }

  state.view = viewName;

  const titles = { accueil: 'TinaBeauty', planning: 'Planning', prestations: 'Prestations', clientes: 'Clientes' };
  const backBtn      = document.getElementById('back-btn');
  const headerAction = document.getElementById('header-action');

  if (viewName === 'historique') {
    const c = state.histCliente;
    document.getElementById('view-title').textContent = c ? `${c.prenom} ${c.nom}` : 'Historique';
    backBtn.classList.remove('hidden');
    headerAction.textContent = '✏️';
    headerAction.classList.remove('hidden');
    headerAction.onclick = () => openModalCliente(state.histCliente);
  } else {
    document.getElementById('view-title').textContent = titles[viewName] || 'TinaBeauty';
    backBtn.classList.add('hidden');
    if (viewName === 'prestations') {
      headerAction.textContent = '+';
      headerAction.classList.remove('hidden');
      headerAction.onclick = () => openModalPrestation();
    } else if (viewName === 'clientes') {
      headerAction.textContent = '+';
      headerAction.classList.remove('hidden');
      headerAction.onclick = () => openModalCliente();
    } else {
      headerAction.classList.add('hidden');
    }
  }

  if (viewName === 'accueil')     renderAccueil();
  else if (viewName === 'planning')    renderPlanning();
  else if (viewName === 'prestations') renderPrestations();
  else if (viewName === 'clientes')    renderClientes();
}

/* ============================================================
   DATA LOADERS
   ============================================================ */
async function loadPrestations() {
  const { data, error } = await db.from('prestations').select('*').order('nom');
  if (error) { console.error(error); return; }
  state.prestations = data || [];
}

async function loadClientes() {
  const { data, error } = await db.from('clientes').select('*').order('nom').order('prenom');
  if (error) { console.error(error); return; }
  state.clientes = data || [];
}

async function loadCategories() {
  const { data, error } = await db.from('categories').select('*').order('nom');
  if (error) { console.error(error); return; }
  state.categories = data || [];
}

async function loadRdvRange(from, to) {
  const { data, error } = await db
    .from('rendezvous')
    .select(`
      id, date, creneau, statut,
      clientes ( id, nom, prenom ),
      rendezvous_prestations (
        prestation_id,
        prestations ( id, nom, prix, categorie )
      )
    `)
    .gte('date', from)
    .lte('date', to)
    .order('date')
    .order('creneau');
  if (error) { console.error(error); return []; }
  return data || [];
}

/* ============================================================
   VUE ACCUEIL
   ============================================================ */
async function renderAccueil() {
  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = addDays(today, 1);
  const todayStr    = toISO(today);
  const tomorrowStr = toISO(tomorrow);

  document.getElementById('rdv-today').innerHTML    = '<div class="loader">Chargement…</div>';
  document.getElementById('rdv-tomorrow').innerHTML = '<div class="loader">Chargement…</div>';

  const rdvs = await loadRdvRange(todayStr, tomorrowStr);

  fillAccueilList('rdv-today',    rdvs.filter(r => r.date === todayStr),    true);
  fillAccueilList('rdv-tomorrow', rdvs.filter(r => r.date === tomorrowStr), false);
}

function fillAccueilList(containerId, rdvs, showStatus) {
  const el = document.getElementById(containerId);
  if (!rdvs.length) {
    el.innerHTML = '<p class="rdv-empty">Aucun rendez-vous</p>';
    return;
  }
  el.innerHTML = rdvs.map(r => {
    const c      = r.clientes;
    const prests = (r.rendezvous_prestations || []).map(rp => rp.prestations?.nom).filter(Boolean);
    const statut = r.statut || 'en_attente';

    let statusHtml = '';
    if (showStatus) {
      statusHtml = `<div class="rdv-status-row">
        <button class="status-btn presente ${statut === 'presente' ? 'active' : ''}" data-id="${r.id}" data-s="presente">✓ Présente</button>
        <button class="status-btn absente  ${statut === 'absente'  ? 'active' : ''}" data-id="${r.id}" data-s="absente">✗ Absente</button>
      </div>`;
    }

    return `<div class="rdv-card">
      <div class="rdv-card-top">
        <div class="rdv-time">${r.creneau}</div>
        <div class="rdv-info">
          <div class="rdv-client">${c ? c.prenom + ' ' + c.nom : '—'}</div>
          <div class="rdv-prests">${prests.join(' · ') || 'Aucune prestation'}</div>
        </div>
      </div>
      ${statusHtml}
    </div>`;
  }).join('');

  // Boutons de statut
  el.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await updateStatut(btn.dataset.id, btn.dataset.s);
      renderAccueil();
    });
  });
}

async function updateStatut(rdvId, statut) {
  const { error } = await db.from('rendezvous').update({ statut }).eq('id', rdvId);
  if (error) { toast('Erreur : ' + error.message); return; }
  toast(statut === 'presente' ? 'Marquée présente ✓' : 'Marquée absente ✗');
}

/* ============================================================
   VUE PLANNING — Niveau 1 : sélection du jour
   ============================================================ */
async function renderPlanning() {
  if (!state.weekStart) state.weekStart = getSaturday(new Date());

  const ws = state.weekStart;
  const we = addDays(ws, 6);
  document.getElementById('week-label').textContent = `${fmtShort(ws)} – ${fmtShort(we)}`;

  // Charger tous les RDV de la semaine pour les comptages
  const rdvs = await loadRdvRange(toISO(ws), toISO(we));

  const countMap = {};
  rdvs.forEach(r => { countMap[r.date] = (countMap[r.date] || 0) + 1; });

  const todayStr = toISO(new Date());
  const sel = document.getElementById('day-selector');

  sel.innerHTML = JOURS_COURT.map((jr, i) => {
    const day    = addDays(ws, i);
    const dayStr = toISO(day);
    const count  = countMap[dayStr] || 0;
    const isToday  = dayStr === todayStr;
    const isActive = dayStr === state.selectedDay;
    const hasRdv   = count > 0;

    return `<div class="day-chip ${isToday ? 'today' : ''} ${isActive ? 'active' : ''} ${hasRdv ? 'has-rdv' : ''}"
              data-date="${dayStr}">
      <span class="day-chip-name">${jr}</span>
      <span class="day-chip-num">${day.getDate()}</span>
      <span class="day-chip-dot"></span>
    </div>`;
  }).join('');

  sel.querySelectorAll('.day-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      state.selectedDay = chip.dataset.date;
      renderPlanning(); // re-render chips + day view
    });
  });

  // Afficher la vue du jour sélectionné
  if (state.selectedDay) {
    const dayRdvs = rdvs
      .filter(r => r.date === state.selectedDay)
      .sort((a, b) => a.creneau.localeCompare(b.creneau));
    renderDayView(state.selectedDay, dayRdvs);
  } else {
    document.getElementById('day-view').innerHTML = '<p class="select-day-hint">Sélectionnez un jour</p>';
  }
}

/* Niveau 2 : rendez-vous du jour */
function renderDayView(dateStr, rdvs) {
  const dateObj = new Date(dateStr + 'T12:00:00');
  const dv = document.getElementById('day-view');

  let html = `<div class="day-view-header">
    <span class="day-view-title">${fmtDayFull(dateObj)}</span>
    <button class="add-rdv-btn" id="add-rdv-day">+ RDV</button>
  </div>`;

  if (!rdvs.length) {
    html += '<div class="day-empty">Aucun rendez-vous ce jour.</div>';
  } else {
    html += rdvs.map(r => {
      const c      = r.clientes;
      const prests = (r.rendezvous_prestations || []).map(rp => rp.prestations?.nom).filter(Boolean);
      return `<div class="day-rdv-card" data-rdv="${r.id}" data-date="${r.date}" data-cr="${r.creneau}">
        <span class="day-rdv-time">${r.creneau}</span>
        <div class="day-rdv-info">
          <div class="day-rdv-client">${c ? c.prenom + ' ' + c.nom : '—'}</div>
          <div class="day-rdv-prests">${prests.join(' · ') || 'Aucune prestation'}</div>
        </div>
        <span class="day-rdv-edit">✏️</span>
      </div>`;
    }).join('');
  }

  dv.innerHTML = html;

  document.getElementById('add-rdv-day')?.addEventListener('click', () => {
    openModalRdv(dateStr, null, null);
  });
  dv.querySelectorAll('.day-rdv-card').forEach(card => {
    card.addEventListener('click', () => {
      openModalRdv(card.dataset.date, card.dataset.cr, card.dataset.rdv);
    });
  });
}

/* ============================================================
   VUE PRESTATIONS
   ============================================================ */
async function renderPrestations() {
  await Promise.all([loadCategories(), loadPrestations()]);

  // Category bar
  const catBar = document.getElementById('cat-bar');
  if (!state.categories.length) {
    catBar.innerHTML = '<span style="font-size:13px;color:var(--text-muted)">Aucune catégorie</span>';
  } else {
    if (!state.selectedCat || !state.categories.find(c => c.nom === state.selectedCat)) {
      state.selectedCat = state.categories[0]?.nom || null;
    }
    catBar.innerHTML = state.categories.map(c => `
      <div class="cat-chip ${c.nom === state.selectedCat ? 'active' : ''}" data-nom="${c.nom}">
        ${c.nom}
      </div>`).join('');
    catBar.querySelectorAll('.cat-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        state.selectedCat = chip.dataset.nom;
        renderPrestations();
      });
    });
  }

  // Liste des prestations
  const container = document.getElementById('prestations-list');
  const items = state.prestations.filter(p => p.categorie === state.selectedCat);

  if (!state.selectedCat) {
    container.innerHTML = `<div class="empty-state"><div class="emo">✨</div><p>Ajoutez d'abord une catégorie<br>en appuyant sur ⚙</p></div>`;
    return;
  }
  if (!items.length) {
    container.innerHTML = `<div class="empty-state"><div class="emo">✨</div><p>Aucune prestation dans <strong>${state.selectedCat}</strong>.<br>Appuyez sur <strong>+</strong> pour en ajouter.</p></div>`;
    return;
  }

  container.innerHTML = items.map(p => `
    <div class="prest-card" data-id="${p.id}">
      <span class="prest-name">${p.nom}</span>
      <span class="prest-price">${Number(p.prix).toLocaleString('fr-DZ')} DA</span>
    </div>`).join('');

  container.querySelectorAll('.prest-card').forEach(card => {
    card.addEventListener('click', () => {
      const p = state.prestations.find(x => x.id === card.dataset.id);
      if (p) openModalPrestation(p);
    });
  });
}

/* ============================================================
   VUE CLIENTES
   ============================================================ */
async function renderClientes(filter = '') {
  await loadClientes();
  const container = document.getElementById('clientes-list');
  let list = state.clientes;

  if (filter) {
    const f = filter.toLowerCase();
    list = list.filter(c =>
      c.nom.toLowerCase().includes(f) ||
      c.prenom.toLowerCase().includes(f) ||
      (c.telephone || '').includes(f)
    );
  }

  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><div class="emo">👩</div><p>${filter ? 'Aucun résultat.' : 'Aucune cliente.<br>Appuyez sur <strong>+</strong> pour en ajouter.'}</p></div>`;
    return;
  }

  container.innerHTML = list.map(c => `
    <div class="cliente-card" data-id="${c.id}">
      <div class="cliente-av">${c.prenom[0].toUpperCase()}${c.nom[0].toUpperCase()}</div>
      <div class="cliente-info">
        <div class="cliente-name">${c.prenom} ${c.nom}</div>
        <div class="cliente-phone">${c.telephone || 'Pas de numéro'}${c.telephone2 ? '<br>' + c.telephone2 : ''}</div>
      </div>
      <span class="cliente-arrow">›</span>
    </div>`).join('');

  container.querySelectorAll('.cliente-card').forEach(card => {
    card.addEventListener('click', () => {
      const c = state.clientes.find(x => x.id === card.dataset.id);
      if (c) openHistorique(c);
    });
  });
}

/* ============================================================
   EXPORT CSV
   ============================================================ */
async function exportCSV() {
  toast('Génération du fichier…');

  const { data, error } = await db
    .from('rendezvous')
    .select(`
      id, date, creneau, statut,
      clientes ( nom, prenom, telephone ),
      rendezvous_prestations (
        prestations ( nom, prix )
      )
    `)
    .order('date', { ascending: false })
    .order('creneau');

  if (error || !data) { toast('Erreur d\'export'); return; }

  const lines = [
    ['Prénom', 'Nom', 'Téléphone', 'Date', 'Heure', 'Prestations', 'Total (DA)', 'Statut'].join(';')
  ];

  data.forEach(r => {
    const c      = r.clientes || {};
    const prests = (r.rendezvous_prestations || []).map(rp => rp.prestations?.nom).filter(Boolean);
    const total  = (r.rendezvous_prestations || []).reduce((s, rp) => s + (rp.prestations?.prix || 0), 0);
    const statut = { en_attente: 'En attente', presente: 'Présente', absente: 'Absente' }[r.statut] || r.statut;
    lines.push([
      c.prenom || '', c.nom || '', c.telephone || '',
      r.date, r.creneau,
      `"${prests.join(', ')}"`,
      total, statut
    ].join(';'));
  });

  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `tinabeauty_historique_${toISO(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Export réussi ✓');
}

/* ============================================================
   HISTORIQUE
   ============================================================ */
function buildInfoCard(c) {
  const initials = c.prenom[0].toUpperCase() + c.nom[0].toUpperCase();
  const tel2 = c.telephone2 ? `<br>📞 ${c.telephone2}` : '';
  return `<div class="info-av">${initials}</div>
    <div class="info-details">
      <p><strong>${c.prenom} ${c.nom}</strong><br>
      📞 ${c.telephone || 'Non renseigné'}${tel2}</p>
    </div>`;
}

async function openHistorique(cliente) {
  state.histCliente = cliente;
  navigateTo('historique', true);
  document.getElementById('historique-info').innerHTML = buildInfoCard(cliente);

  const listEl = document.getElementById('historique-list');
  listEl.innerHTML = '<div class="loader">Chargement…</div>';

  const today = toISO(new Date());
  const { data, error } = await db
    .from('rendezvous')
    .select(`id, date, creneau, statut,
      rendezvous_prestations ( prestations ( id, nom, prix ) )`)
    .eq('cliente_id', cliente.id)
    .lte('date', today)
    .order('date', { ascending: false });

  if (error || !data || !data.length) {
    listEl.innerHTML = '<p class="rdv-empty">Aucun historique pour cette cliente.</p>';
    return;
  }

  listEl.innerHTML = data.map(r => {
    const prests = (r.rendezvous_prestations || []).map(rp => rp.prestations?.nom).filter(Boolean);
    const total  = (r.rendezvous_prestations || []).reduce((s, rp) => s + (rp.prestations?.prix || 0), 0);
    const dateObj = new Date(r.date + 'T12:00:00');
    const statut  = r.statut || 'en_attente';
    return `<div class="histo-card">
      <div class="histo-date">${fmtFull(dateObj)} à ${r.creneau}</div>
      <div class="histo-prests">${prests.join(', ') || 'Aucune prestation'}</div>
      ${total > 0 ? `<div class="histo-total">${Number(total).toLocaleString('fr-DZ')} DA</div>` : ''}
      <div class="histo-status-row">
        <button class="histo-status-btn presente ${statut === 'presente' ? 'active' : ''}" data-id="${r.id}" data-s="presente">✓ Présente</button>
        <button class="histo-status-btn absente  ${statut === 'absente'  ? 'active' : ''}" data-id="${r.id}" data-s="absente">✗ Absente</button>
      </div>
    </div>`;
  }).join('');

  listEl.querySelectorAll('.histo-status-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await updateStatut(btn.dataset.id, btn.dataset.s);
      openHistorique(state.histCliente);
    });
  });
}

/* ============================================================
   MODAL — RENDEZ-VOUS
   Avec recherche cliente + multi-select prestation par tags
   ============================================================ */
async function openModalRdv(date, creneau, rdvId) {
  await Promise.all([loadPrestations(), loadClientes()]);

  // Reset sélections
  state.selPrestIds   = [];
  state.selClienteId  = null;
  state.selClienteNom = '';

  let rdvStatut = 'en_attente';

  if (rdvId) {
    const { data } = await db
      .from('rendezvous')
      .select('*, rendezvous_prestations(prestation_id)')
      .eq('id', rdvId)
      .single();
    if (data) {
      state.selClienteId = data.cliente_id;
      rdvStatut = data.statut || 'en_attente';
      const cli = state.clientes.find(c => c.id === data.cliente_id);
      if (cli) state.selClienteNom = `${cli.prenom} ${cli.nom}`;

      state.selPrestIds = (data.rendezvous_prestations || [])
        .map(rp => {
          const p = state.prestations.find(x => x.id === rp.prestation_id);
          return p ? { id: p.id, nom: p.nom, prix: p.prix } : null;
        }).filter(Boolean);
    }
  }

  document.getElementById('modal-title').textContent = rdvId ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous';

  document.getElementById('modal-body').innerHTML = `
    <div class="form-group">
      <label>Date</label>
      <input type="date" id="f-date" value="${date || toISO(new Date())}">
    </div>
    <div class="form-group">
      <label>Heure</label>
      <input type="time" id="f-heure" value="${creneau || ''}">
    </div>

    <!-- Recherche cliente -->
    <div class="form-group">
      <label>Cliente</label>
      <div class="search-select">
        <div id="sel-cliente-badge" class="selected-badge ${state.selClienteId ? '' : 'hidden'}">
          <span class="selected-badge-name" id="sel-cliente-nom">${state.selClienteNom}</span>
          <button type="button" class="selected-badge-clear" id="clear-cliente">×</button>
        </div>
        <div class="ss-input-wrap ${state.selClienteId ? 'hidden' : ''}" id="cliente-input-wrap">
          <input type="text" id="cliente-search" placeholder="Rechercher…" autocomplete="off">
          <div id="cliente-results" class="search-results hidden"></div>
        </div>
      </div>
    </div>

    <!-- Multi-select prestations -->
    <div class="form-group">
      <label>Prestations</label>
      <div id="prest-tags" class="tag-container"></div>
      <div class="ss-input-wrap">
        <input type="text" id="prest-search" placeholder="Rechercher et ajouter…" autocomplete="off">
        <div id="prest-results" class="search-results hidden"></div>
      </div>
    </div>`;

  // Afficher les tags prestations déjà sélectionnées
  refreshPrestTags();

  // ---- Recherche cliente ----
  const clienteInput   = document.getElementById('cliente-search');
  const clienteResults = document.getElementById('cliente-results');
  const clienteBadge   = document.getElementById('sel-cliente-badge');
  const clienteWrap    = document.getElementById('cliente-input-wrap');

  clienteInput.addEventListener('input', () => {
    const q = clienteInput.value.toLowerCase().trim();
    const matches = state.clientes.filter(c =>
      `${c.prenom} ${c.nom}`.toLowerCase().includes(q) ||
      (c.telephone || '').includes(q)
    ).slice(0, 8);

    if (!q) { clienteResults.classList.add('hidden'); return; }

    clienteResults.classList.remove('hidden');
    clienteResults.innerHTML = matches.length
      ? matches.map(c => `<div class="sr-item" data-id="${c.id}" data-nom="${c.prenom} ${c.nom}">${c.prenom} ${c.nom} <small style="color:#aaa">${c.telephone || ''}</small></div>`).join('')
      : '<div class="sr-empty">Aucune cliente trouvée</div>';

    clienteResults.querySelectorAll('.sr-item').forEach(item => {
      item.addEventListener('click', () => {
        state.selClienteId  = item.dataset.id;
        state.selClienteNom = item.dataset.nom;
        document.getElementById('sel-cliente-nom').textContent = item.dataset.nom;
        clienteBadge.classList.remove('hidden');
        clienteWrap.classList.add('hidden');
        clienteResults.classList.add('hidden');
        clienteInput.value = '';
      });
    });
  });

  document.getElementById('clear-cliente').addEventListener('click', () => {
    state.selClienteId  = null;
    state.selClienteNom = '';
    clienteBadge.classList.add('hidden');
    clienteWrap.classList.remove('hidden');
  });

  // ---- Recherche prestations ----
  const prestInput   = document.getElementById('prest-search');
  const prestResults = document.getElementById('prest-results');

  prestInput.addEventListener('input', () => {
    const q = prestInput.value.toLowerCase().trim();
    const alreadySel = state.selPrestIds.map(p => p.id);
    const matches = state.prestations.filter(p =>
      p.nom.toLowerCase().includes(q) && !alreadySel.includes(p.id)
    ).slice(0, 8);

    if (!q) { prestResults.classList.add('hidden'); return; }

    prestResults.classList.remove('hidden');
    prestResults.innerHTML = matches.length
      ? matches.map(p => `<div class="sr-item" data-id="${p.id}" data-nom="${p.nom}" data-prix="${p.prix}">
          ${p.nom} <small style="color:#aaa">${Number(p.prix).toLocaleString('fr-DZ')} DA</small>
        </div>`).join('')
      : '<div class="sr-empty">Aucune prestation trouvée</div>';

    prestResults.querySelectorAll('.sr-item').forEach(item => {
      item.addEventListener('click', () => {
        state.selPrestIds.push({ id: item.dataset.id, nom: item.dataset.nom, prix: parseFloat(item.dataset.prix) });
        prestInput.value = '';
        prestResults.classList.add('hidden');
        refreshPrestTags();
      });
    });
  });

  // ---- Bouton supprimer ----
  const delBtn = document.getElementById('modal-delete');
  if (rdvId) {
    delBtn.classList.remove('hidden');
    delBtn.onclick = async () => {
      if (!confirm('Supprimer ce rendez-vous ?')) return;
      await db.from('rendezvous').delete().eq('id', rdvId);
      closeModal(); toast('Rendez-vous supprimé');
      state.selectedDay && renderPlanning();
    };
  } else {
    delBtn.classList.add('hidden');
  }

  // ---- Enregistrer ----
  document.getElementById('modal-save').onclick = async () => {
    const dateVal  = document.getElementById('f-date').value;
    const heureVal = document.getElementById('f-heure').value;

    if (!dateVal)             { toast('Veuillez choisir une date'); return; }
    if (!heureVal)            { toast('Veuillez saisir l\'heure'); return; }
    if (!state.selClienteId)  { toast('Veuillez choisir une cliente'); return; }

    if (rdvId) {
      await db.from('rendezvous').update({
        date: dateVal, creneau: heureVal, cliente_id: state.selClienteId
      }).eq('id', rdvId);

      await db.from('rendezvous_prestations').delete().eq('rendezvous_id', rdvId);
      if (state.selPrestIds.length) {
        await db.from('rendezvous_prestations').insert(
          state.selPrestIds.map(p => ({ rendezvous_id: rdvId, prestation_id: p.id }))
        );
      }
      closeModal(); toast('Rendez-vous modifié'); renderPlanning();
    } else {
      // Vérifier doublon
      const { data: conflict } = await db.from('rendezvous')
        .select('id').eq('date', dateVal).eq('creneau', heureVal).maybeSingle();
      if (conflict) { toast('Ce créneau est déjà pris'); return; }

      const { data: newRdv, error } = await db.from('rendezvous')
        .insert({ date: dateVal, creneau: heureVal, cliente_id: state.selClienteId })
        .select().single();
      if (error) { toast('Erreur : ' + error.message); return; }

      if (newRdv && state.selPrestIds.length) {
        await db.from('rendezvous_prestations').insert(
          state.selPrestIds.map(p => ({ rendezvous_id: newRdv.id, prestation_id: p.id }))
        );
      }
      closeModal(); toast('Rendez-vous ajouté');
      // Sélectionner le jour et rafraîchir
      state.selectedDay = dateVal;
      renderPlanning();
    }
  };

  openModal();
}

function refreshPrestTags() {
  const container = document.getElementById('prest-tags');
  if (!container) return;
  if (!state.selPrestIds.length) { container.innerHTML = ''; return; }
  container.innerHTML = state.selPrestIds.map((p, i) => `
    <span class="prest-tag">
      ${p.nom}
      <button type="button" class="tag-remove" data-i="${i}">×</button>
    </span>`).join('');
  container.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selPrestIds.splice(parseInt(btn.dataset.i), 1);
      refreshPrestTags();
    });
  });
}

/* ============================================================
   MODAL — PRESTATION
   ============================================================ */
async function openModalPrestation(prest = null) {
  await loadCategories();
  document.getElementById('modal-title').textContent = prest ? 'Modifier la prestation' : 'Nouvelle prestation';

  const catOptions = state.categories.map(c =>
    `<option value="${c.nom}" ${prest?.categorie === c.nom ? 'selected' : ''}>${c.nom}</option>`
  ).join('');

  document.getElementById('modal-body').innerHTML = `
    <div class="form-group">
      <label>Nom</label>
      <input type="text" id="f-pnom" placeholder="Ex : Pose gel couleur" value="${prest?.nom || ''}">
    </div>
    <div class="form-group">
      <label>Prix (DA)</label>
      <input type="number" id="f-pprix" placeholder="Ex : 2500" inputmode="numeric"
             value="${prest?.prix !== undefined ? prest.prix : ''}">
    </div>
    <div class="form-group">
      <label>Catégorie</label>
      <select id="f-pcat">${catOptions || '<option>Aucune catégorie</option>'}</select>
    </div>`;

  const delBtn = document.getElementById('modal-delete');
  if (prest) {
    delBtn.classList.remove('hidden');
    delBtn.onclick = async () => {
      if (!confirm('Supprimer cette prestation ?')) return;
      await db.from('prestations').delete().eq('id', prest.id);
      closeModal(); toast('Prestation supprimée'); renderPrestations();
    };
  } else {
    delBtn.classList.add('hidden');
  }

  document.getElementById('modal-save').onclick = async () => {
    const nom       = document.getElementById('f-pnom').value.trim();
    const prix      = parseFloat(document.getElementById('f-pprix').value);
    const categorie = document.getElementById('f-pcat').value;

    if (!nom)              { toast('Veuillez saisir un nom'); return; }
    if (isNaN(prix) || prix < 0) { toast('Veuillez saisir un prix valide'); return; }
    if (!categorie)        { toast('Veuillez choisir une catégorie'); return; }

    if (prest) {
      const { error } = await db.from('prestations').update({ nom, prix, categorie }).eq('id', prest.id);
      if (error) { toast('Erreur : ' + error.message); return; }
    } else {
      const { error } = await db.from('prestations').insert({ nom, prix, categorie });
      if (error) { toast('Erreur : ' + error.message); return; }
    }
    closeModal(); toast(prest ? 'Prestation modifiée' : 'Prestation ajoutée'); renderPrestations();
  };

  openModal();
}

/* ============================================================
   MODAL — GESTION DES CATÉGORIES
   ============================================================ */
async function openModalCategories() {
  await loadCategories();
  document.getElementById('modal-title').textContent = 'Gérer les catégories';
  document.getElementById('modal-delete').classList.add('hidden');
  document.getElementById('modal-save').style.display = 'none';

  const renderCatList = () => {
    const body = document.getElementById('modal-body');
    body.innerHTML = `
      <div class="cat-manage-list">
        ${state.categories.map(c => `
          <div class="cat-manage-item" data-id="${c.id}" data-nom="${c.nom}">
            <span class="cat-manage-name">${c.nom}</span>
            <button class="cat-manage-del" data-id="${c.id}" data-nom="${c.nom}">🗑</button>
          </div>`).join('')}
      </div>
      <div class="cat-add-row">
        <input type="text" id="new-cat-input" placeholder="Nouvelle catégorie…">
        <button id="new-cat-btn">Ajouter</button>
      </div>`;

    // Supprimer catégorie
    body.querySelectorAll('.cat-manage-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const nom = btn.dataset.nom;
        const id  = btn.dataset.id;
        // Vérifier si des prestations utilisent cette catégorie
        const used = state.prestations.filter(p => p.categorie === nom);
        if (used.length > 0) {
          toast(`Impossible : ${used.length} prestation(s) utilisent cette catégorie`);
          return;
        }
        if (!confirm(`Supprimer la catégorie "${nom}" ?`)) return;
        await db.from('categories').delete().eq('id', id);
        toast('Catégorie supprimée');
        if (state.selectedCat === nom) state.selectedCat = null;
        await loadCategories();
        renderCatList();
      });
    });

    // Ajouter catégorie
    document.getElementById('new-cat-btn').addEventListener('click', async () => {
      const nom = document.getElementById('new-cat-input').value.trim();
      if (!nom) { toast('Saisissez un nom de catégorie'); return; }
      if (state.categories.find(c => c.nom.toLowerCase() === nom.toLowerCase())) {
        toast('Cette catégorie existe déjà'); return;
      }
      const { error } = await db.from('categories').insert({ nom });
      if (error) { toast('Erreur : ' + error.message); return; }
      toast('Catégorie ajoutée');
      await loadCategories();
      renderCatList();
    });
  };

  renderCatList();
  openModal();

  // Remettre display du bouton save au cas où
  document.getElementById('modal-save').style.display = '';
}

/* ============================================================
   MODAL — CLIENTE
   ============================================================ */
function openModalCliente(cliente = null) {
  document.getElementById('modal-title').textContent = cliente ? 'Modifier la cliente' : 'Nouvelle cliente';
  document.getElementById('modal-body').innerHTML = `
    <div class="form-group">
      <label>Prénom</label>
      <input type="text" id="f-cprenom" placeholder="Ex : Amira" autocomplete="given-name"
             value="${cliente?.prenom || ''}">
    </div>
    <div class="form-group">
      <label>Nom</label>
      <input type="text" id="f-cnom" placeholder="Ex : Bensalem" autocomplete="family-name"
             value="${cliente?.nom || ''}">
    </div>
    <div class="form-group">
      <label>Téléphone 1</label>
      <input type="tel" id="f-ctel" placeholder="Ex : 0550 12 34 56" autocomplete="tel"
             value="${cliente?.telephone || ''}">
    </div>
    <div class="form-group">
      <label>Téléphone 2 <span style="font-weight:400;text-transform:none;letter-spacing:0">(optionnel)</span></label>
      <input type="tel" id="f-ctel2" placeholder="Ex : 0661 78 90 12"
             value="${cliente?.telephone2 || ''}">
    </div>`;

  document.getElementById('modal-delete').classList.add('hidden');

  document.getElementById('modal-save').onclick = async () => {
    const prenom     = document.getElementById('f-cprenom').value.trim();
    const nom        = document.getElementById('f-cnom').value.trim();
    const telephone  = document.getElementById('f-ctel').value.trim();
    const telephone2 = document.getElementById('f-ctel2').value.trim();
    if (!prenom || !nom) { toast('Veuillez saisir le nom complet'); return; }

    if (cliente) {
      const { data: dup } = await db.from('clientes')
        .select('id').ilike('nom', nom).ilike('prenom', prenom)
        .neq('id', cliente.id).maybeSingle();
      if (dup) { toast(`"${prenom} ${nom}" existe déjà dans la liste`); return; }

      const { error } = await db.from('clientes').update({ prenom, nom, telephone, telephone2 }).eq('id', cliente.id);
      if (error) { toast('Erreur : ' + error.message); return; }
      if (state.histCliente?.id === cliente.id) {
        state.histCliente = { ...cliente, prenom, nom, telephone, telephone2 };
        document.getElementById('view-title').textContent = `${prenom} ${nom}`;
        document.getElementById('historique-info').innerHTML = buildInfoCard({ prenom, nom, telephone, telephone2 });
      }
      closeModal(); toast('Cliente modifiée');
    } else {
      const { data: dup } = await db.from('clientes')
        .select('id').ilike('nom', nom).ilike('prenom', prenom).maybeSingle();
      if (dup) { toast(`"${prenom} ${nom}" existe déjà dans la liste`); return; }

      const { error } = await db.from('clientes').insert({ prenom, nom, telephone, telephone2 });
      if (error) { toast('Erreur : ' + error.message); return; }
      closeModal(); toast('Cliente ajoutée'); renderClientes();
    }
  };
  openModal();
}

/* ============================================================
   MODAL HELPERS
   ============================================================ */
function openModal() {
  document.getElementById('modal-overlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('modal-body').scrollTop = 0, 50);
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-save').style.display = '';
}

/* ============================================================
   INIT
   ============================================================ */
function init() {
  initSupabase();

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => navigateTo(tab.dataset.view));
  });

  document.getElementById('back-btn').addEventListener('click', () => navigateTo('clientes'));

  document.getElementById('prev-week').addEventListener('click', () => {
    state.weekStart   = addDays(state.weekStart || getSaturday(new Date()), -7);
    state.selectedDay = null;
    renderPlanning();
  });
  document.getElementById('next-week').addEventListener('click', () => {
    state.weekStart   = addDays(state.weekStart || getSaturday(new Date()), 7);
    state.selectedDay = null;
    renderPlanning();
  });

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  document.getElementById('search-clientes').addEventListener('input', e => renderClientes(e.target.value));

  document.getElementById('manage-cats-btn').addEventListener('click', openModalCategories);

  document.getElementById('export-btn').addEventListener('click', exportCSV);

  navigateTo('accueil');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW:', err));
  }
}

document.addEventListener('DOMContentLoaded', init);
