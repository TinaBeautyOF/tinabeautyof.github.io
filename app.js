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
  financesTab:  'achats',
  rdvSearch:    '',
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
   HELPERS — Calculs & formatage
   ============================================================ */
function fmtMoney(n) {
  return Number(n || 0).toLocaleString('fr-DZ') + ' DA';
}

function calcRdvTotal(rdv) {
  return (rdv.rendezvous_prestations || []).reduce((s, rp) => s + (rp.prestations?.prix || 0), 0);
}

function calcClientBalance(clienteId, rdvs) {
  // Somme des crédits - somme des soldes sur tous les RDV de la cliente
  return (rdvs || []).reduce((s, r) => {
    if (r.cliente_id !== clienteId && r.clientes?.id !== clienteId) return s;
    return s + (r.credit || 0) - (r.solde || 0);
  }, 0);
}

function renderStatusButtons(rdv, prefix = 'rdv') {
  const statut = rdv.statut || 'en_attente';
  const cls = prefix === 'histo' ? 'histo-status-btn' : 'status-btn';
  const rowCls = prefix === 'histo' ? 'histo-status-row' : 'rdv-status-row';
  if (statut === 'annule') {
    return `<div class="status-badge annule">Rendez-vous annulé</div>`;
  }
  return `<div class="${rowCls}">
    <button class="${cls} presente ${statut === 'presente' ? 'active' : ''}" data-id="${rdv.id}" data-s="presente">Présente</button>
    <button class="${cls} absente  ${statut === 'absente'  ? 'active' : ''}" data-id="${rdv.id}" data-s="absente">Absente</button>
  </div>`;
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
   NOTIFICATIONS
   ============================================================ */
function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

async function checkNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const now    = new Date();
  const hour   = now.getHours();
  const today  = toISO(now);

  const lastMorning = localStorage.getItem('tb_last_morning_notif');
  const lastEvening = localStorage.getItem('tb_last_evening_notif');

  // Rappel du matin (8h) : RDV de la journée
  if (hour >= 8 && lastMorning !== today) {
    const rdvs = await loadRdvRange(today, today);
    if (rdvs.length) {
      const list = rdvs.map(r => `${r.creneau} — ${r.clientes?.prenom || ''} ${r.clientes?.nom || ''}`).join('\n');
      sendNotification('TinaBeauty — RDV aujourd\'hui', `Tu as ${rdvs.length} rendez-vous aujourd\'hui.\n${list}`);
    }
    localStorage.setItem('tb_last_morning_notif', today);
  }

  // Rappel du soir (20h) : RDV du lendemain
  if (hour >= 20 && lastEvening !== today) {
    const tomorrow = toISO(addDays(now, 1));
    const rdvs = await loadRdvRange(tomorrow, tomorrow);
    if (rdvs.length) {
      const list = rdvs.map(r => `${r.creneau} — ${r.clientes?.prenom || ''} ${r.clientes?.nom || ''}`).join('\n');
      sendNotification('TinaBeauty — RDV demain', `Tu as ${rdvs.length} rendez-vous demain.\n${list}`);
    }
    localStorage.setItem('tb_last_evening_notif', today);
  }
}

function sendNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
}

/* ============================================================
   MODE HORS LIGNE — File d'attente
   ============================================================ */
const QUEUE_KEY = 'tb_offline_queue';

function isOnline() { return navigator.onLine; }

function getQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
  catch { return []; }
}
function saveQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
function addToQueue(action) {
  const q = getQueue();
  q.push(action);
  saveQueue(q);
}
function clearQueue() { localStorage.removeItem(QUEUE_KEY); }

function showOfflineBanner() {
  document.getElementById('offline-banner')?.classList.remove('hidden');
}
function hideOfflineBanner() {
  document.getElementById('offline-banner')?.classList.add('hidden');
}
function updateOnlineStatus() {
  if (isOnline()) {
    hideOfflineBanner();
    processQueue();
  } else {
    showOfflineBanner();
  }
}

async function processQueue() {
  const q = getQueue();
  if (!q.length) return;
  if (!isOnline()) return;

  toast('Synchronisation en cours…');
  let errors = 0;
  for (const action of q) {
    try {
      if (action.type === 'createRdv') await createRdvFromQueue(action.payload);
      else if (action.type === 'updateStatut') await updateStatut(action.payload.rdvId, action.payload.statut);
      else if (action.type === 'deleteRdv') await db.from('rendezvous').delete().eq('id', action.payload.rdvId);
    } catch (e) {
      console.error('Sync error', e);
      errors++;
    }
  }

  if (errors === 0) {
    clearQueue();
    toast('Synchronisation terminée');
  } else {
    // Conserver les actions non traitées
    const remaining = q.slice(-errors);
    saveQueue(remaining);
    toast('Certaines actions n\'ont pas pu être synchronisées');
  }

  renderPlanning();
  if (state.view === 'accueil') renderAccueil();
}

async function createRdvFromQueue(payload) {
  // Vérifier doublon
  const { data: conflict } = await db.from('rendezvous')
    .select('id').eq('date', payload.date).eq('creneau', payload.creneau).maybeSingle();
  if (conflict) { toast(`Créneau ${payload.creneau} déjà pris`); return; }

  const { data: newRdv, error } = await db.from('rendezvous')
    .insert({
      date: payload.date, creneau: payload.creneau,
      cliente_id: payload.cliente_id,
      credit: payload.credit, solde: payload.solde,
      notes: payload.notes
    })
    .select().single();
  if (error) throw error;

  if (newRdv && payload.prestationIds?.length) {
    await db.from('rendezvous_prestations').insert(
      payload.prestationIds.map(id => ({ rendezvous_id: newRdv.id, prestation_id: id }))
    );
  }
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

  const titles = { accueil: 'TinaBeauty', planning: 'Planning', prestations: 'Prestations', clientes: 'Clientes', finances: 'Finances' };
  const backBtn      = document.getElementById('back-btn');
  const headerAction = document.getElementById('header-action');

  if (viewName === 'historique') {
    const c = state.histCliente;
    document.getElementById('view-title').textContent = c ? `${c.prenom} ${c.nom}` : 'Historique';
    backBtn.classList.remove('hidden');
    headerAction.textContent = 'Modifier';
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
    } else if (viewName === 'finances') {
      headerAction.classList.add('hidden');
    } else {
      headerAction.classList.add('hidden');
    }
  }

  if (viewName === 'accueil')     renderAccueil();
  else if (viewName === 'planning')    renderPlanning();
  else if (viewName === 'prestations') renderPrestations();
  else if (viewName === 'clientes')    renderClientes();
  else if (viewName === 'finances')    renderFinances();
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
      id, date, creneau, statut, credit, solde, cliente_id, notes,
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

async function loadAllClientRdvs(clienteId) {
  const { data, error } = await db
    .from('rendezvous')
    .select(`
      id, date, creneau, statut, credit, solde, cliente_id, notes,
      rendezvous_prestations ( prestations ( id, nom, prix ) )
    `)
    .eq('cliente_id', clienteId)
    .order('date', { ascending: false });
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
    const total  = calcRdvTotal(r);
    let infoNote = (r.credit || r.solde)
      ? `${fmtMoney(total)} — ${r.credit ? 'crédit ' + fmtMoney(r.credit) : 'solde ' + fmtMoney(r.solde)}`
      : (prests.join(' · ') || 'Aucune prestation');
    if (r.notes) infoNote += ' · note';

    return `<div class="rdv-card" data-rdv="${r.id}" data-date="${r.date}" data-cr="${r.creneau}">
      <div class="rdv-card-top">
        <div class="rdv-time">${r.creneau}</div>
        <div class="rdv-info">
          <div class="rdv-client">${c ? c.prenom + ' ' + c.nom : '—'}</div>
          <span class="rdv-prests">${infoNote}</span>
        </div>
      </div>
      ${showStatus ? renderStatusButtons(r, 'rdv') : ''}
    </div>`;
  }).join('');

  // Ouvrir la modale au clic sur la carte
  el.querySelectorAll('.rdv-card').forEach(card => {
    card.addEventListener('click', () => {
      openModalRdv(card.dataset.date, card.dataset.cr, card.dataset.rdv);
    });
  });

  // Boutons de statut — stopper la propagation pour ne pas ouvrir la modale
  el.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await updateStatut(btn.dataset.id, btn.dataset.s);
      if (isOnline()) renderAccueil();
    });
  });
}

async function updateStatut(rdvId, statut) {
  if (!isOnline()) {
    addToQueue({ type: 'updateStatut', payload: { rdvId, statut } });
    toast('Statut enregistré hors ligne. Synchronisation au retour de la connexion.');
    return;
  }
  const { error } = await db.from('rendezvous').update({ statut }).eq('id', rdvId);
  if (error) { toast('Erreur : ' + error.message); return; }
  toast(statut === 'presente' ? 'Marquée présente' : 'Marquée absente');
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

  // Afficher la vue du jour sélectionné ou les résultats de recherche
  const searchInput = document.getElementById('search-rdvs');
  if (searchInput) searchInput.value = state.rdvSearch;

  if (state.rdvSearch.trim()) {
    const q = state.rdvSearch.toLowerCase().trim();
    const filtered = rdvs.filter(r => {
      const c = r.clientes || {};
      const fullName = `${c.prenom || ''} ${c.nom || ''}`.toLowerCase();
      return fullName.includes(q) ||
             (c.telephone || '').includes(q) ||
             (c.instagram || '').toLowerCase().includes(q);
    }).sort((a, b) => a.date.localeCompare(b.date) || a.creneau.localeCompare(b.creneau));
    renderDayView('search', filtered, `Résultats pour "${state.rdvSearch}"`);
  } else if (state.selectedDay) {
    const dayRdvs = rdvs
      .filter(r => r.date === state.selectedDay)
      .sort((a, b) => a.creneau.localeCompare(b.creneau));
    renderDayView(state.selectedDay, dayRdvs);
  } else {
    document.getElementById('day-view').innerHTML = '<p class="select-day-hint">Sélectionnez un jour</p>';
  }
}

/* Niveau 2 : rendez-vous du jour */
function renderDayView(dateStr, rdvs, customTitle = null) {
  const dateObj = dateStr !== 'search' ? new Date(dateStr + 'T12:00:00') : null;
  const dv = document.getElementById('day-view');

  let html = `<div class="day-view-header">
    <span class="day-view-title">${customTitle || (dateObj ? fmtDayFull(dateObj) : '')}</span>
    <button class="add-rdv-btn" id="add-rdv-day">+ RDV</button>
  </div>`;

  if (!rdvs.length) {
    html += '<div class="day-empty">Aucun rendez-vous ce jour.</div>';
  } else {
    html += rdvs.map(r => {
      const c       = r.clientes;
      const prests  = (r.rendezvous_prestations || []).map(rp => rp.prestations?.nom).filter(Boolean);
      const annule  = r.statut === 'annule';
      const total   = calcRdvTotal(r);
      let balanceNote = (!annule && (r.credit || r.solde))
        ? (r.credit ? 'crédit ' + fmtMoney(r.credit) : 'solde ' + fmtMoney(r.solde))
        : (annule ? 'Annulé' : (prests.join(' · ') || 'Aucune prestation'));
      if (r.notes) balanceNote += ' · note';
      return `<div class="day-rdv-card ${annule ? 'annule' : ''}" data-rdv="${r.id}" data-date="${r.date}" data-cr="${r.creneau}">
        <span class="day-rdv-time">${r.creneau}</span>
        <div class="day-rdv-info">
          <div class="day-rdv-client">${c ? c.prenom + ' ' + c.nom : '—'}</div>
          <div class="day-rdv-prests">${balanceNote}</div>
        </div>
        <span class="day-rdv-edit">${annule ? '' : '›'}</span>
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
      <div class="cat-chip ${c.nom === 'Onglerie' ? 'sage' : ''} ${c.nom === state.selectedCat ? 'active' : ''}" data-nom="${c.nom}">
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
    container.innerHTML = `<div class="empty-state"><div class="emo">—</div><p>Ajoutez d'abord une catégorie<br>en appuyant sur l'icône en haut</p></div>`;
    return;
  }
  if (!items.length) {
    container.innerHTML = `<div class="empty-state"><div class="emo">—</div><p>Aucune prestation dans <strong>${state.selectedCat}</strong>.<br>Appuyez sur <strong>+</strong> pour en ajouter.</p></div>`;
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
    container.innerHTML = `<div class="empty-state"><div class="emo">—</div><p>${filter ? 'Aucun résultat.' : 'Aucune cliente.<br>Appuyez sur <strong>+</strong> pour en ajouter.'}</p></div>`;
    return;
  }

  container.innerHTML = list.map(c => `
    <div class="cliente-card" data-id="${c.id}">
      <div class="cliente-av">${(c.prenom?.[0] || '').toUpperCase()}${(c.nom?.[0] || '').toUpperCase()}</div>
      <div class="cliente-info">
        <div class="cliente-name">${c.prenom || ''} ${c.nom || ''}</div>
        <div class="cliente-phone">${c.telephone || 'Pas de numéro'}${c.telephone2 ? '<br>' + c.telephone2 : ''}${c.instagram ? '<br>Instagram : ' + c.instagram : ''}</div>
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
   IMPORT CONTACTS — Android (Contact Picker) + iOS (vCard)
   ============================================================ */

/* Parsing vCard (.vcf) */
function parseVCard(text) {
  const results = [];
  const cards = text.split(/BEGIN:VCARD/i).slice(1);
  for (const card of cards) {
    let fullName = '', phone = '', phone2 = '';
    for (const line of card.split(/\r?\n/)) {
      // Nom complet (FN prioritaire sur N)
      if (/^FN:/i.test(line)) {
        fullName = line.replace(/^FN:/i, '').trim();
      } else if (/^N:/i.test(line) && !fullName) {
        const parts = line.replace(/^N:/i, '').split(';');
        const last = parts[0]?.trim(), first = parts[1]?.trim();
        fullName = first && last ? `${first} ${last}` : (first || last || '');
      }
      // Téléphone
      if (/^TEL/i.test(line)) {
        const tel = line.replace(/^TEL[^:]*:/i, '').trim();
        if (tel) { if (!phone) phone = tel; else if (!phone2) phone2 = tel; }
      }
    }
    if (fullName) results.push({ fullName, phone, phone2 });
  }
  return results;
}

async function processContactList(list) {
  let added = 0, skipped = 0;
  for (const { fullName, phone, phone2 } of list) {
    const parts  = fullName.trim().split(/\s+/);
    const prenom = parts[0];
    const nom    = parts.length > 1 ? parts.slice(1).join(' ') : prenom;
    const { data: dup } = await db.from('clientes')
      .select('id').ilike('nom', nom).ilike('prenom', prenom).maybeSingle();
    if (dup) { skipped++; continue; }
    const { error } = await db.from('clientes')
      .insert({ prenom, nom, telephone: phone, telephone2: phone2 || null });
    if (!error) added++;
  }
  let msg = `${added} cliente(s) importée(s)`;
  if (skipped) msg += `, ${skipped} déjà existante(s)`;
  toast(msg);
  if (added > 0) renderClientes();
}

async function importFromContacts() {
  try {
    const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: true });
    if (!contacts.length) return;
    const list = contacts.map(c => ({
      fullName: (c.name?.[0] || '').trim(),
      phone:    (c.tel?.[0]  || '').trim(),
      phone2:   (c.tel?.[1]  || '').trim(),
    })).filter(c => c.fullName);
    await processContactList(list);
  } catch (err) {
    if (err.name !== 'AbortError') toast('Import annulé ou non autorisé');
  }
}

function importFromVCF(file) {
  const reader = new FileReader();
  reader.onload = async e => {
    const list = parseVCard(e.target.result);
    if (!list.length) { toast('Aucun contact trouvé dans le fichier'); return; }
    await processContactList(list);
  };
  reader.readAsText(file, 'UTF-8');
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
    ['Prénom', 'Nom', 'Téléphone', 'Date', 'Heure', 'Prestations', 'Total (DA)', 'Crédit (DA)', 'Solde (DA)', 'Encaissement (DA)', 'Statut'].join(';')
  ];

  data.forEach(r => {
    const c      = r.clientes || {};
    const prests = (r.rendezvous_prestations || []).map(rp => rp.prestations?.nom).filter(Boolean);
    const total  = (r.rendezvous_prestations || []).reduce((s, rp) => s + (rp.prestations?.prix || 0), 0);
    const credit = r.credit || 0;
    const solde  = r.solde || 0;
    const enc    = total - credit + solde;
    const statut = { en_attente: 'En attente', presente: 'Présente', absente: 'Absente', annule: 'Annulé' }[r.statut] || r.statut;
    lines.push([
      c.prenom || '', c.nom || '', c.telephone || '',
      r.date, r.creneau,
      `"${prests.join(', ')}"`,
      total, credit, solde, enc, statut
    ].join(';'));
  });

  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `tinabeauty_historique_${toISO(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Export réussi');
}

/* ============================================================
   HISTORIQUE
   ============================================================ */
function buildInfoCard(c, balance = 0, presentCount = 0) {
  const initials = (c.prenom?.[0] || '').toUpperCase() + (c.nom?.[0] || '').toUpperCase();
  const tel2 = c.telephone2 ? `<br>${c.telephone2}` : '';
  const insta = c.instagram ? `<br>Instagram : ${c.instagram}` : '';
  let balanceHtml = '';
  if (balance > 0) {
    balanceHtml = `<br><span style="color:var(--red)">Me doit ${fmtMoney(balance)}</span>`;
  } else if (balance < 0) {
    balanceHtml = `<br><span style="color:var(--green)">Je lui dois ${fmtMoney(Math.abs(balance))}</span>`;
  } else {
    balanceHtml = `<br><span>Solde à jour</span>`;
  }

  const rewardHtml = presentCount >= 6
    ? `<br><span style="color:var(--green);font-weight:600">Fidélité : ${presentCount} RDV présents — récompense disponible !</span>`
    : `<br><span>Fidélité : ${presentCount} / 6 RDV présents</span>`;

  return `<div class="info-av">${initials}</div>
    <div class="info-details">
      <p><strong>${c.prenom || ''} ${c.nom || ''}</strong><br>
      ${c.telephone || 'Non renseigné'}${tel2}${insta}${balanceHtml}${rewardHtml}</p>
    </div>`;
}

async function openHistorique(cliente) {
  state.histCliente = cliente;
  navigateTo('historique', true);
  const rdvs = await loadAllClientRdvs(cliente.id);
  const balance = calcClientBalance(cliente.id, rdvs);
  const presentCount = (rdvs || []).filter(r => r.statut === 'presente').length;
  document.getElementById('historique-info').innerHTML = buildInfoCard(cliente, balance, presentCount);

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
    const total  = calcRdvTotal(r);
    const enc    = total - (r.credit || 0) + (r.solde || 0);
    const statut = r.statut || 'en_attente';
    const dateObj = new Date(r.date + 'T12:00:00');

    let totalHtml = '';
    if (total > 0) {
      if (statut === 'presente') {
        totalHtml = `<div class="histo-total">${fmtMoney(total)} · encaissé ${fmtMoney(enc)}</div>`;
      } else if (statut === 'absente') {
        totalHtml = `<div class="histo-total">${fmtMoney(total)} · cliente absente</div>`;
      } else if (statut === 'en_attente') {
        totalHtml = `<div class="histo-total">${fmtMoney(total)} · en attente</div>`;
      }
      // annule : le badge est déjà affiché par renderStatusButtons
    }

    let balanceHtml = '';
    if (r.credit) balanceHtml += `<span style="color:var(--red)">Crédit ${fmtMoney(r.credit)}</span> `;
    if (r.solde)  balanceHtml += `<span style="color:var(--green)">Solde ${fmtMoney(r.solde)}</span>`;

    const notesHtml = r.notes ? `<div class="histo-notes">${r.notes}</div>` : '';

    return `<div class="histo-card">
      <div class="histo-date">${fmtFull(dateObj)} à ${r.creneau}</div>
      <div class="histo-prests">${prests.join(', ') || 'Aucune prestation'}</div>
      ${totalHtml}
      ${balanceHtml ? `<div class="histo-balance">${balanceHtml}</div>` : ''}
      ${notesHtml}
      ${renderStatusButtons(r, 'histo')}
    </div>`;
  }).join('');

  listEl.querySelectorAll('.histo-status-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await updateStatut(btn.dataset.id, btn.dataset.s);
      if (isOnline()) openHistorique(state.histCliente);
    });
  });
}

async function updateSoldeHint() {
  const hint = document.getElementById('solde-cliente-hint');
  if (!hint) return;
  if (!state.selClienteId) {
    hint.style.display = 'none';
    return;
  }
  const rdvs = await loadAllClientRdvs(state.selClienteId);
  const balance = calcClientBalance(state.selClienteId, rdvs);
  hint.style.display = 'block';
  if (balance > 0) {
    hint.innerHTML = `<strong>${state.selClienteNom}</strong> vous doit <strong>${fmtMoney(balance)}</strong> au total.`;
  } else if (balance < 0) {
    hint.innerHTML = `Vous devez <strong>${fmtMoney(Math.abs(balance))}</strong> à <strong>${state.selClienteNom}</strong>.`;
  } else {
    hint.innerHTML = `<strong>${state.selClienteNom}</strong> est à jour.`;
  }
}

/* ============================================================
   FINANCES
   ============================================================ */
async function loadAchats() {
  const { data, error } = await db.from('achats').select('*').order('date', { ascending: false });
  if (error) { console.error(error); return []; }
  return data || [];
}

function financesPeriodBounds() {
  const today = new Date();
  // Semaine : samedi → vendredi
  const ws = getSaturday(today);
  const we = addDays(ws, 6);
  // Mois
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd   = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  // Année
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const yearEnd   = new Date(today.getFullYear(), 11, 31);
  return {
    week:  { start: toISO(ws),  end: toISO(we) },
    month: { start: toISO(monthStart), end: toISO(monthEnd) },
    year:  { start: toISO(yearStart),  end: toISO(yearEnd) }
  };
}

async function calcChiffres(period) {
  const rdvs = await loadRdvRange(period.start, period.end);
  const achats = (await loadAchats()).filter(a => a.date >= period.start && a.date <= period.end);

  const ca = rdvs
    .filter(r => r.statut === 'presente')
    .reduce((s, r) => s + calcRdvTotal(r) - (r.credit || 0) + (r.solde || 0), 0);

  const totalAchats = achats.reduce((s, a) => s + (a.prix || 0), 0);
  return { ca, achats: totalAchats, benefice: ca - totalAchats };
}

async function renderFinances() {
  renderAchats();
  renderChiffres();

  document.querySelectorAll('.finances-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.fin === state.financesTab);
  });
  document.getElementById('finances-achats').classList.toggle('active', state.financesTab === 'achats');
  document.getElementById('finances-chiffres').classList.toggle('active', state.financesTab === 'chiffres');
}

async function renderAchats() {
  const list = await loadAchats();
  const el = document.getElementById('achats-list');
  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><div class="emo">—</div><p>Aucun achat enregistré.<br>Appuyez sur le bouton ci-dessous pour ajouter un achat.</p></div>`;
    return;
  }
  el.innerHTML = list.map(a => `
    <div class="achat-card" data-id="${a.id}">
      <div>
        <div class="achat-name">${a.nom}</div>
        <div class="achat-date">${fmtDayFull(new Date(a.date + 'T12:00:00'))}</div>
      </div>
      <div class="achat-right">
        <span class="achat-price">${fmtMoney(a.prix)}</span>
        <button class="achat-del" aria-label="Supprimer">×</button>
      </div>
    </div>
  `).join('');

  el.querySelectorAll('.achat-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('.achat-card').dataset.id;
      if (!confirm('Supprimer cet achat ?')) return;
      await db.from('achats').delete().eq('id', id);
      toast('Achat supprimé');
      renderAchats();
      renderChiffres();
    });
  });
}

async function renderChiffres() {
  const p = financesPeriodBounds();
  const week  = await calcChiffres(p.week);
  const month = await calcChiffres(p.month);
  const year  = await calcChiffres(p.year);

  function row(label, value, cls = '') {
    return `<div class="chiffre-row"><span class="chiffre-label">${label}</span><span class="chiffre-value ${cls}">${fmtMoney(value)}</span></div>`;
  }
  function benefCls(v) { return v >= 0 ? 'positive' : 'negative'; }

  document.getElementById('chiffres-list').innerHTML = `
    <div class="chiffre-card">
      <div class="chiffre-title">Cette semaine</div>
      ${row('Chiffre d\'affaire', week.ca)}
      ${row('Achats', week.achats)}
      ${row('Bénéfice estimé', week.benefice, benefCls(week.benefice))}
    </div>
    <div class="chiffre-card">
      <div class="chiffre-title">Ce mois</div>
      ${row('Chiffre d\'affaire', month.ca)}
      ${row('Achats', month.achats)}
      ${row('Bénéfice estimé', month.benefice, benefCls(month.benefice))}
    </div>
    <div class="chiffre-card">
      <div class="chiffre-title">Cette année</div>
      ${row('Chiffre d\'affaire', year.ca)}
      ${row('Achats', year.achats)}
      ${row('Bénéfice estimé', year.benefice, benefCls(year.benefice))}
    </div>
  `;
}

async function openModalAchat(achat = null) {
  document.getElementById('modal-title').textContent = achat ? 'Modifier l\'achat' : 'Nouvel achat';
  document.getElementById('modal-body').innerHTML = `
    <div class="form-group">
      <label>Nom du produit</label>
      <input type="text" id="f-anom" placeholder="Ex : Gel UV, Coton, etc." value="${achat?.nom || ''}">
    </div>
    <div class="form-group">
      <label>Prix (DA)</label>
      <input type="number" id="f-aprix" placeholder="Ex : 2500" inputmode="numeric" value="${achat?.prix !== undefined ? achat.prix : ''}">
    </div>
    <div class="form-group">
      <label>Date</label>
      <input type="date" id="f-adate" value="${achat?.date || toISO(new Date())}">
    </div>`;

  const delBtn = document.getElementById('modal-delete');
  if (achat) {
    delBtn.classList.remove('hidden');
    delBtn.onclick = async () => {
      if (!confirm('Supprimer cet achat ?')) return;
      await db.from('achats').delete().eq('id', achat.id);
      closeModal(); toast('Achat supprimé'); renderFinances();
    };
  } else {
    delBtn.classList.add('hidden');
  }

  document.getElementById('modal-save').onclick = async () => {
    const nom  = document.getElementById('f-anom').value.trim();
    const prix = parseFloat(document.getElementById('f-aprix').value);
    const date = document.getElementById('f-adate').value;
    if (!nom) { toast('Veuillez saisir un nom'); return; }
    if (isNaN(prix) || prix < 0) { toast('Veuillez saisir un prix valide'); return; }
    if (!date) { toast('Veuillez choisir une date'); return; }

    const payload = { nom, prix, date };
    if (achat) {
      const { error } = await db.from('achats').update(payload).eq('id', achat.id);
      if (error) { toast('Erreur : ' + error.message); return; }
    } else {
      const { error } = await db.from('achats').insert(payload);
      if (error) { toast('Erreur : ' + error.message); return; }
    }
    closeModal(); toast(achat ? 'Achat modifié' : 'Achat ajouté'); renderFinances();
  };

  openModal();
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
  let rdvData   = null;

  if (rdvId) {
    const { data } = await db
      .from('rendezvous')
      .select('*, rendezvous_prestations(prestation_id)')
      .eq('id', rdvId)
      .single();
    rdvData = data;
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
    </div>
    <div class="form-row" style="display:flex;gap:10px">
      <div class="form-group" style="flex:1">
        <label>Crédit (cliente me doit)</label>
        <input type="number" id="f-credit" inputmode="numeric" value="${rdvData?.credit || 0}">
      </div>
      <div class="form-group" style="flex:1">
        <label>Solde (je garde pour elle)</label>
        <input type="number" id="f-solde" inputmode="numeric" value="${rdvData?.solde || 0}">
      </div>
    </div>
    <div class="form-group">
      <label>Notes</label>
      <textarea id="f-notes" rows="3" placeholder="Allergies, préférences, forme, couleur…">${rdvData?.notes || ''}</textarea>
    </div>
    <div id="solde-cliente-hint" class="solde-hint"></div>
    ${rdvId ? `<button type="button" id="annuler-rdv-btn" class="btn-annuler">Annuler ce rendez-vous</button>` : ''}`;

  updateSoldeHint();

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
      item.addEventListener('click', async () => {
        state.selClienteId  = item.dataset.id;
        state.selClienteNom = item.dataset.nom;
        document.getElementById('sel-cliente-nom').textContent = item.dataset.nom;
        clienteBadge.classList.remove('hidden');
        clienteWrap.classList.add('hidden');
        clienteResults.classList.add('hidden');
        clienteInput.value = '';
        await updateSoldeHint();
      });
    });
  });

  document.getElementById('clear-cliente').addEventListener('click', () => {
    state.selClienteId  = null;
    state.selClienteNom = '';
    clienteBadge.classList.add('hidden');
    clienteWrap.classList.remove('hidden');
    updateSoldeHint();
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

  // ---- Bouton annuler le RDV ----
  document.getElementById('annuler-rdv-btn')?.addEventListener('click', async () => {
    if (!confirm('Marquer ce rendez-vous comme annulé ?')) return;
    await db.from('rendezvous').update({ statut: 'annule' }).eq('id', rdvId);
    closeModal(); toast('Rendez-vous annulé'); renderPlanning();
  });

  // ---- Bouton supprimer définitivement ----
  const delBtn = document.getElementById('modal-delete');
  if (rdvId) {
    delBtn.classList.remove('hidden');
    delBtn.onclick = async () => {
      if (!confirm('Supprimer définitivement ce rendez-vous ?')) return;
      await db.from('rendezvous').delete().eq('id', rdvId);
      closeModal(); toast('Rendez-vous supprimé');
      state.selectedDay && renderPlanning();
    };
  } else {
    delBtn.classList.add('hidden');
  }

  // ---- Enregistrer ----
  document.getElementById('modal-save').onclick = async () => {
    const dateVal   = document.getElementById('f-date').value;
    const heureVal  = document.getElementById('f-heure').value;
    const creditVal = parseFloat(document.getElementById('f-credit').value) || 0;
    const soldeVal  = parseFloat(document.getElementById('f-solde').value)  || 0;
    const notesVal  = document.getElementById('f-notes').value.trim();

    if (!dateVal)             { toast('Veuillez choisir une date'); return; }
    if (!heureVal)            { toast('Veuillez saisir l\'heure'); return; }
    if (!state.selClienteId)  { toast('Veuillez choisir une cliente'); return; }

    if (rdvId) {
      await db.from('rendezvous').update({
        date: dateVal, creneau: heureVal, cliente_id: state.selClienteId,
        credit: creditVal, solde: soldeVal, notes: notesVal
      }).eq('id', rdvId);

      await db.from('rendezvous_prestations').delete().eq('rendezvous_id', rdvId);
      if (state.selPrestIds.length) {
        await db.from('rendezvous_prestations').insert(
          state.selPrestIds.map(p => ({ rendezvous_id: rdvId, prestation_id: p.id }))
        );
      }
      closeModal(); toast('Rendez-vous modifié'); renderPlanning();
    } else {
      if (!isOnline()) {
        addToQueue({
          type: 'createRdv',
          payload: {
            date: dateVal, creneau: heureVal, cliente_id: state.selClienteId,
            credit: creditVal, solde: soldeVal, notes: notesVal,
            prestationIds: state.selPrestIds.map(p => p.id)
          }
        });
        closeModal(); toast('RDV enregistré hors ligne. Synchronisation au retour de la connexion.');
        return;
      }

      // Vérifier doublon
      const { data: conflict } = await db.from('rendezvous')
        .select('id').eq('date', dateVal).eq('creneau', heureVal).maybeSingle();
      if (conflict) { toast('Ce créneau est déjà pris'); return; }

      const { data: newRdv, error } = await db.from('rendezvous')
        .insert({ date: dateVal, creneau: heureVal, cliente_id: state.selClienteId, credit: creditVal, solde: soldeVal, notes: notesVal })
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
            <button class="cat-manage-del" data-id="${c.id}" data-nom="${c.nom}">×</button>
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
    </div>
    <div class="form-group">
      <label>Instagram <span style="font-weight:400;text-transform:none;letter-spacing:0">(optionnel)</span></label>
      <input type="text" id="f-cinsta" placeholder="Ex : @amira_bensalem"
             value="${cliente?.instagram || ''}">
    </div>`;

  const delClienteBtn = document.getElementById('modal-delete');
  if (cliente) {
    delClienteBtn.classList.remove('hidden');
    delClienteBtn.onclick = async () => {
      // Compter ses rendez-vous
      const { count } = await db.from('rendezvous')
        .select('id', { count: 'exact', head: true })
        .eq('cliente_id', cliente.id);
      const msg = count > 0
        ? `Supprimer "${cliente.prenom} ${cliente.nom}" et ses ${count} rendez-vous ?`
        : `Supprimer "${cliente.prenom} ${cliente.nom}" ?`;
      if (!confirm(msg)) return;
      await db.from('rendezvous').delete().eq('cliente_id', cliente.id);
      await db.from('clientes').delete().eq('id', cliente.id);
      closeModal();
      toast('Cliente supprimée');
      if (state.view === 'historique') navigateTo('clientes');
      else renderClientes();
    };
  } else {
    delClienteBtn.classList.add('hidden');
  }

  document.getElementById('modal-save').onclick = async () => {
    const prenom     = document.getElementById('f-cprenom').value.trim();
    const nom        = document.getElementById('f-cnom').value.trim();
    const telephone  = document.getElementById('f-ctel').value.trim();
    const telephone2 = document.getElementById('f-ctel2').value.trim();
    const instagram  = document.getElementById('f-cinsta').value.trim();
    if (!prenom && !nom) { toast('Veuillez saisir au moins un nom ou un prénom'); return; }

    if (cliente) {
      const { data: dup } = await db.from('clientes')
        .select('id').ilike('nom', nom).ilike('prenom', prenom)
        .neq('id', cliente.id).maybeSingle();
      if (dup) { toast(`"${prenom} ${nom}" existe déjà dans la liste`); return; }

      const { error } = await db.from('clientes').update({ prenom, nom, telephone, telephone2, instagram }).eq('id', cliente.id);
      if (error) { toast('Erreur : ' + error.message); return; }
      if (state.histCliente?.id === cliente.id) {
        state.histCliente = { ...cliente, prenom, nom, telephone, telephone2, instagram };
        document.getElementById('view-title').textContent = `${prenom} ${nom}`;
        loadAllClientRdvs(cliente.id).then(rdvs => {
          const balance = calcClientBalance(cliente.id, rdvs);
          const presentCount = (rdvs || []).filter(r => r.statut === 'presente').length;
          document.getElementById('historique-info').innerHTML = buildInfoCard({ prenom, nom, telephone, telephone2, instagram }, balance, presentCount);
        });
      }
      closeModal(); toast('Cliente modifiée');
    } else {
      const { data: dup } = await db.from('clientes')
        .select('id').ilike('nom', nom).ilike('prenom', prenom).maybeSingle();
      if (dup) { toast(`"${prenom} ${nom}" existe déjà dans la liste`); return; }

      const { error } = await db.from('clientes').insert({ prenom, nom, telephone, telephone2, instagram });
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

  document.getElementById('search-rdvs')?.addEventListener('input', e => {
    state.rdvSearch = e.target.value;
    renderPlanning();
  });

  // Android : Contact Picker API
  if ('contacts' in navigator) {
    document.getElementById('import-contacts-btn').classList.remove('hidden');
    document.getElementById('import-contacts-btn').addEventListener('click', importFromContacts);
  } else {
    // iOS et autres : import vCard
    document.getElementById('import-vcf-label').classList.remove('hidden');
    document.getElementById('import-vcf-input').addEventListener('change', e => {
      if (e.target.files[0]) importFromVCF(e.target.files[0]);
      e.target.value = ''; // reset pour permettre de réimporter
    });
  }

  document.getElementById('manage-cats-btn').addEventListener('click', openModalCategories);

  document.getElementById('export-btn').addEventListener('click', exportCSV);

  document.getElementById('add-achat-btn').addEventListener('click', () => openModalAchat());

  document.querySelectorAll('.finances-tab').forEach(t => {
    t.addEventListener('click', () => {
      state.financesTab = t.dataset.fin;
      renderFinances();
    });
  });

  navigateTo('accueil');

  requestNotificationPermission();
  checkNotifications();
  setInterval(checkNotifications, 60000);

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW:', err));
  }
}

document.addEventListener('DOMContentLoaded', init);
