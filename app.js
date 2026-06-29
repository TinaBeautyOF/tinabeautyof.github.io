/* ============================================================
   CONFIGURATION SUPABASE
   Remplacez les deux valeurs ci-dessous par vos identifiants
   ============================================================ */
const SUPABASE_URL     = 'https://lgfrabkcrrjkswnientb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_rZYRn6Wls3IGeahh9oAs8Q_XlA4ZIJG';

/* ============================================================
   CONSTANTES
   ============================================================ */
const CRENEAUX = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00'];
const JOURS    = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

/* ============================================================
   STATE
   ============================================================ */
const state = {
  view:          'accueil',
  weekStart:     null,
  prestations:   [],
  clientes:      [],
  histCliente:   null,
};

/* ============================================================
   CLIENT SUPABASE
   ============================================================ */
let db;
function initSupabase() {
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/* ============================================================
   UTILITAIRES DATE
   ============================================================ */
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${j}`;
}

function getMonday(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
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

function fmtDayDate(d) {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
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
  const backBtn     = document.getElementById('back-btn');
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
    if (viewName === 'prestations' || viewName === 'clientes') {
      headerAction.textContent = '+';
      headerAction.classList.remove('hidden');
      headerAction.onclick = viewName === 'prestations' ? () => openModalPrestation() : () => openModalCliente();
    } else {
      headerAction.classList.add('hidden');
    }
  }

  if (viewName === 'accueil')      renderAccueil();
  else if (viewName === 'planning')     renderPlanning();
  else if (viewName === 'prestations')  renderPrestations();
  else if (viewName === 'clientes')     renderClientes();
}

/* ============================================================
   DATA — LOADERS
   ============================================================ */
async function loadPrestations() {
  const { data, error } = await db.from('prestations').select('*').order('categorie').order('nom');
  if (error) { console.error('prestations:', error); return; }
  state.prestations = data || [];
}

async function loadClientes() {
  const { data, error } = await db.from('clientes').select('*').order('nom').order('prenom');
  if (error) { console.error('clientes:', error); return; }
  state.clientes = data || [];
}

async function loadRdvRange(from, to) {
  const { data, error } = await db
    .from('rendezvous')
    .select(`
      id, date, creneau,
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
  if (error) { console.error('rendezvous:', error); return []; }
  return data || [];
}

/* ============================================================
   VUE ACCUEIL
   ============================================================ */
async function renderAccueil() {
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = addDays(today, 1);
  const todayStr    = toISO(today);
  const tomorrowStr = toISO(tomorrow);

  document.getElementById('rdv-today').innerHTML    = '<div class="loader">Chargement…</div>';
  document.getElementById('rdv-tomorrow').innerHTML = '<div class="loader">Chargement…</div>';

  const rdvs = await loadRdvRange(todayStr, tomorrowStr);

  fillRdvList('rdv-today',    rdvs.filter(r => r.date === todayStr));
  fillRdvList('rdv-tomorrow', rdvs.filter(r => r.date === tomorrowStr));
}

function fillRdvList(containerId, rdvs) {
  const el = document.getElementById(containerId);
  if (!rdvs.length) {
    el.innerHTML = '<p class="rdv-empty">Aucun rendez-vous</p>';
    return;
  }
  el.innerHTML = rdvs.map(r => {
    const c     = r.clientes;
    const prests = (r.rendezvous_prestations || []).map(rp => rp.prestations?.nom).filter(Boolean);
    return `
      <div class="rdv-card">
        <div class="rdv-time">${r.creneau}</div>
        <div class="rdv-info">
          <div class="rdv-client">${c ? c.prenom + ' ' + c.nom : '—'}</div>
          <div class="rdv-prests">${prests.join(' · ') || 'Aucune prestation'}</div>
        </div>
      </div>`;
  }).join('');
}

/* ============================================================
   VUE PLANNING
   ============================================================ */
async function renderPlanning() {
  if (!state.weekStart) state.weekStart = getMonday(new Date());

  const ws  = state.weekStart;
  const we  = addDays(ws, 6);
  document.getElementById('week-label').textContent = `${fmtShort(ws)} – ${fmtShort(we)}`;

  document.getElementById('week-grid').innerHTML = '<div class="loader">Chargement…</div>';

  const rdvs = await loadRdvRange(toISO(ws), toISO(we));

  // Index rdvs by date_creneau
  const rdvMap = {};
  rdvs.forEach(r => { rdvMap[`${r.date}_${r.creneau}`] = r; });

  const todayStr = toISO(new Date());
  let html = '';

  for (let i = 0; i < 7; i++) {
    const day    = addDays(ws, i);
    const dayStr = toISO(day);
    const isToday = dayStr === todayStr;

    html += `<div class="day-block ${isToday ? 'day-today' : ''}">
      <div class="day-header">
        <span class="day-name">${JOURS[i]}</span>
        <span class="day-date">${fmtDayDate(day)}</span>
      </div>
      <div class="slot-list">`;

    CRENEAUX.forEach(cr => {
      const rdv = rdvMap[`${dayStr}_${cr}`];
      if (rdv) {
        const c     = rdv.clientes;
        const prests = (rdv.rendezvous_prestations || []).map(rp => rp.prestations?.nom).filter(Boolean);
        const tags   = prests.map(p => `<span class="ptag">${p}</span>`).join('');
        html += `
          <div class="slot-item slot-booked"
               data-rdv="${rdv.id}" data-date="${dayStr}" data-cr="${cr}">
            <span class="slot-time">${cr}</span>
            <div class="slot-content">
              <div class="slot-client-name">${c ? c.prenom + ' ' + c.nom : '—'}</div>
              <div class="slot-tags">${tags}</div>
            </div>
            <span class="slot-icon">✏️</span>
          </div>`;
      } else {
        html += `
          <div class="slot-item slot-free"
               data-date="${dayStr}" data-cr="${cr}">
            <span class="slot-time">${cr}</span>
            <div class="slot-content"><span class="slot-empty">Disponible</span></div>
            <span class="slot-icon">+</span>
          </div>`;
      }
    });

    html += `</div></div>`;
  }

  const grid = document.getElementById('week-grid');
  grid.innerHTML = html;

  grid.querySelectorAll('.slot-item').forEach(el => {
    el.addEventListener('click', () => {
      openModalRdv(el.dataset.date, el.dataset.cr, el.dataset.rdv || null);
    });
  });
}

/* ============================================================
   VUE PRESTATIONS
   ============================================================ */
async function renderPrestations() {
  await loadPrestations();
  const container = document.getElementById('prestations-list');

  if (!state.prestations.length) {
    container.innerHTML = `<div class="empty-state"><div class="emo">✨</div><p>Aucune prestation enregistrée.<br>Appuyez sur <strong>+</strong> pour en ajouter.</p></div>`;
    return;
  }

  const cats = ['Onglerie', 'Esthétique'];
  let html = '';
  cats.forEach(cat => {
    const items = state.prestations.filter(p => p.categorie === cat);
    if (!items.length) return;
    html += `<div class="cat-group"><div class="cat-title">${cat}</div>`;
    items.forEach(p => {
      html += `<div class="prest-card" data-id="${p.id}">
        <span class="prest-name">${p.nom}</span>
        <span class="prest-price">${Number(p.prix).toLocaleString('fr-DZ')} DA</span>
      </div>`;
    });
    html += `</div>`;
  });

  container.innerHTML = html;
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
    container.innerHTML = `<div class="empty-state"><div class="emo">👩</div><p>${filter ? 'Aucun résultat.' : 'Aucune cliente enregistrée.<br>Appuyez sur <strong>+</strong> pour en ajouter.'}</p></div>`;
    return;
  }

  container.innerHTML = list.map(c => `
    <div class="cliente-card" data-id="${c.id}">
      <div class="cliente-av">${c.prenom[0].toUpperCase()}${c.nom[0].toUpperCase()}</div>
      <div class="cliente-info">
        <div class="cliente-name">${c.prenom} ${c.nom}</div>
        <div class="cliente-phone">${c.telephone || 'Pas de numéro'}</div>
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
   VUE HISTORIQUE
   ============================================================ */
async function openHistorique(cliente) {
  state.histCliente = cliente;
  navigateTo('historique', true);

  // Info card
  const initials = cliente.prenom[0].toUpperCase() + cliente.nom[0].toUpperCase();
  document.getElementById('historique-info').innerHTML = `
    <div class="info-av">${initials}</div>
    <div class="info-details">
      <p>
        <strong>${cliente.prenom} ${cliente.nom}</strong><br>
        📞 ${cliente.telephone || 'Non renseigné'}
      </p>
    </div>`;

  const listEl = document.getElementById('historique-list');
  listEl.innerHTML = '<div class="loader">Chargement…</div>';

  const today = toISO(new Date());
  const { data, error } = await db
    .from('rendezvous')
    .select(`
      id, date, creneau,
      rendezvous_prestations (
        prestations ( id, nom, prix )
      )
    `)
    .eq('cliente_id', cliente.id)
    .lte('date', today)
    .order('date', { ascending: false })
    .order('creneau', { ascending: false });

  if (error) { listEl.innerHTML = '<p class="rdv-empty">Erreur de chargement.</p>'; return; }
  if (!data || !data.length) {
    listEl.innerHTML = '<p class="rdv-empty">Aucun historique pour cette cliente.</p>';
    return;
  }

  listEl.innerHTML = data.map(r => {
    const prests = (r.rendezvous_prestations || []).map(rp => rp.prestations?.nom).filter(Boolean);
    const total  = (r.rendezvous_prestations || []).reduce((s, rp) => s + (rp.prestations?.prix || 0), 0);
    const dateObj = new Date(r.date + 'T12:00:00');
    return `<div class="histo-card">
      <div class="histo-date">${fmtFull(dateObj)} à ${r.creneau}</div>
      <div class="histo-prests">${prests.join(', ') || 'Aucune prestation'}</div>
      ${total > 0 ? `<div class="histo-total">${Number(total).toLocaleString('fr-DZ')} DA</div>` : ''}
    </div>`;
  }).join('');
}

/* ============================================================
   MODAL — RENDEZ-VOUS
   ============================================================ */
async function openModalRdv(date, creneau, rdvId) {
  await Promise.all([loadPrestations(), loadClientes()]);

  let existing = null;
  let selPrests = [];

  if (rdvId) {
    const { data } = await db
      .from('rendezvous')
      .select('*, rendezvous_prestations(prestation_id)')
      .eq('id', rdvId)
      .single();
    existing = data;
    selPrests = (data?.rendezvous_prestations || []).map(rp => rp.prestation_id);
  }

  document.getElementById('modal-title').textContent = rdvId ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous';

  // Build client options
  const clientOpts = state.clientes.map(c =>
    `<option value="${c.id}" ${existing?.cliente_id === c.id ? 'selected' : ''}>${c.prenom} ${c.nom}</option>`
  ).join('');

  // Build creneau options
  const crOpts = CRENEAUX.map(cr =>
    `<option value="${cr}" ${cr === creneau ? 'selected' : ''}>${cr}</option>`
  ).join('');

  // Build prestations checkboxes
  const cats = ['Onglerie', 'Esthétique'];
  let checksHtml = '';
  cats.forEach(cat => {
    const items = state.prestations.filter(p => p.categorie === cat);
    if (!items.length) return;
    checksHtml += `<div class="check-category">${cat}</div>`;
    items.forEach(p => {
      const chk = selPrests.includes(p.id) ? 'checked' : '';
      checksHtml += `
        <label class="check-item">
          <input type="checkbox" class="pchk" value="${p.id}" ${chk}>
          <span class="check-lbl">${p.nom}</span>
          <span class="check-price">${Number(p.prix).toLocaleString('fr-DZ')} DA</span>
        </label>`;
    });
  });

  document.getElementById('modal-body').innerHTML = `
    <div class="form-group">
      <label>Date</label>
      <input type="date" id="f-date" value="${date}">
    </div>
    <div class="form-group">
      <label>Créneau</label>
      <select id="f-cr">${crOpts}</select>
    </div>
    <div class="form-group">
      <label>Cliente</label>
      <select id="f-cliente">
        <option value="">— Choisir une cliente —</option>
        ${clientOpts}
      </select>
    </div>
    <div class="form-group">
      <label>Prestations</label>
      ${checksHtml || '<p style="color:var(--text-muted);font-size:14px">Aucune prestation enregistrée.</p>'}
    </div>`;

  const delBtn = document.getElementById('modal-delete');
  if (rdvId) {
    delBtn.classList.remove('hidden');
    delBtn.onclick = async () => {
      if (!confirm('Supprimer ce rendez-vous ?')) return;
      await db.from('rendezvous').delete().eq('id', rdvId);
      closeModal(); toast('Rendez-vous supprimé'); renderPlanning();
    };
  } else {
    delBtn.classList.add('hidden');
  }

  document.getElementById('modal-save').onclick = async () => {
    const dateVal    = document.getElementById('f-date').value;
    const crVal      = document.getElementById('f-cr').value;
    const clienteId  = document.getElementById('f-cliente').value;
    const prestIds   = [...document.querySelectorAll('.pchk:checked')].map(cb => cb.value);

    if (!dateVal)    { toast('Veuillez choisir une date'); return; }
    if (!clienteId)  { toast('Veuillez choisir une cliente'); return; }

    if (rdvId) {
      const { error } = await db.from('rendezvous')
        .update({ date: dateVal, creneau: crVal, cliente_id: clienteId })
        .eq('id', rdvId);
      if (error) { toast('Erreur : ' + error.message); return; }

      await db.from('rendezvous_prestations').delete().eq('rendezvous_id', rdvId);
      if (prestIds.length) {
        await db.from('rendezvous_prestations').insert(
          prestIds.map(pid => ({ rendezvous_id: rdvId, prestation_id: pid }))
        );
      }
      closeModal(); toast('Rendez-vous modifié'); renderPlanning();
    } else {
      // Vérifier si le créneau est déjà pris
      const { data: conflict } = await db
        .from('rendezvous')
        .select('id')
        .eq('date', dateVal)
        .eq('creneau', crVal)
        .maybeSingle();

      if (conflict) { toast('Ce créneau est déjà pris'); return; }

      const { data: newRdv, error } = await db
        .from('rendezvous')
        .insert({ date: dateVal, creneau: crVal, cliente_id: clienteId })
        .select()
        .single();

      if (error) { toast('Erreur : ' + error.message); return; }

      if (newRdv && prestIds.length) {
        await db.from('rendezvous_prestations').insert(
          prestIds.map(pid => ({ rendezvous_id: newRdv.id, prestation_id: pid }))
        );
      }
      closeModal(); toast('Rendez-vous ajouté'); renderPlanning();
    }
  };

  openModal();
}

/* ============================================================
   MODAL — PRESTATION
   ============================================================ */
function openModalPrestation(prest = null) {
  document.getElementById('modal-title').textContent = prest ? 'Modifier la prestation' : 'Nouvelle prestation';

  document.getElementById('modal-body').innerHTML = `
    <div class="form-group">
      <label>Nom de la prestation</label>
      <input type="text" id="f-pnom" placeholder="Ex : Pose gel couleur" value="${prest?.nom || ''}">
    </div>
    <div class="form-group">
      <label>Prix (DA)</label>
      <input type="number" id="f-pprix" placeholder="Ex : 2500" inputmode="numeric"
             value="${prest?.prix !== undefined ? prest.prix : ''}">
    </div>
    <div class="form-group">
      <label>Catégorie</label>
      <select id="f-pcat">
        <option value="Onglerie"   ${prest?.categorie === 'Onglerie'   ? 'selected' : ''}>Onglerie</option>
        <option value="Esthétique" ${prest?.categorie === 'Esthétique' ? 'selected' : ''}>Esthétique</option>
      </select>
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
    const nom      = document.getElementById('f-pnom').value.trim();
    const prix     = parseFloat(document.getElementById('f-pprix').value);
    const categorie = document.getElementById('f-pcat').value;

    if (!nom)           { toast('Veuillez saisir un nom'); return; }
    if (isNaN(prix) || prix < 0) { toast('Veuillez saisir un prix valide'); return; }

    if (prest) {
      const { error } = await db.from('prestations').update({ nom, prix, categorie }).eq('id', prest.id);
      if (error) { toast('Erreur : ' + error.message); return; }
      closeModal(); toast('Prestation modifiée'); renderPrestations();
    } else {
      const { error } = await db.from('prestations').insert({ nom, prix, categorie });
      if (error) { toast('Erreur : ' + error.message); return; }
      closeModal(); toast('Prestation ajoutée'); renderPrestations();
    }
  };

  openModal();
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
      <label>Téléphone</label>
      <input type="tel" id="f-ctel" placeholder="Ex : 0550 12 34 56" autocomplete="tel"
             value="${cliente?.telephone || ''}">
    </div>`;

  document.getElementById('modal-delete').classList.add('hidden');

  document.getElementById('modal-save').onclick = async () => {
    const prenom    = document.getElementById('f-cprenom').value.trim();
    const nom       = document.getElementById('f-cnom').value.trim();
    const telephone = document.getElementById('f-ctel').value.trim();

    if (!prenom || !nom) { toast('Veuillez saisir le nom complet'); return; }

    if (cliente) {
      const { error } = await db.from('clientes').update({ prenom, nom, telephone }).eq('id', cliente.id);
      if (error) { toast('Erreur : ' + error.message); return; }

      // Refresh state if in historique
      if (state.histCliente?.id === cliente.id) {
        state.histCliente = { ...cliente, prenom, nom, telephone };
        document.getElementById('view-title').textContent = `${prenom} ${nom}`;
        document.getElementById('historique-info').innerHTML = `
          <div class="info-av">${prenom[0].toUpperCase()}${nom[0].toUpperCase()}</div>
          <div class="info-details">
            <p>
              <strong>${prenom} ${nom}</strong><br>
              📞 ${telephone || 'Non renseigné'}
            </p>
          </div>`;
      }
      closeModal(); toast('Cliente modifiée');
    } else {
      const { error } = await db.from('clientes').insert({ prenom, nom, telephone });
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
  document.getElementById('modal-body').scrollTop = 0;
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

/* ============================================================
   INIT
   ============================================================ */
function init() {
  initSupabase();

  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => navigateTo(tab.dataset.view));
  });

  // Back button
  document.getElementById('back-btn').addEventListener('click', () => {
    navigateTo('clientes');
  });

  // Week navigation
  document.getElementById('prev-week').addEventListener('click', () => {
    state.weekStart = addDays(state.weekStart || getMonday(new Date()), -7);
    renderPlanning();
  });
  document.getElementById('next-week').addEventListener('click', () => {
    state.weekStart = addDays(state.weekStart || getMonday(new Date()), 7);
    renderPlanning();
  });

  // Modal close
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  // Search clientes
  document.getElementById('search-clientes').addEventListener('input', e => {
    renderClientes(e.target.value);
  });

  // Initial view
  navigateTo('accueil');

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW:', err));
  }
}

document.addEventListener('DOMContentLoaded', init);
