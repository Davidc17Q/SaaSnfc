// Vista "Clientes": contactos con autorización, cupones con canje en caja y
// ranking por vendedor, mesa o caja. Usa los helpers de app.js ($, api, qs,
// toast, escapeHtml, fmt, nice, fmtDay, confirmDialog, state).
(function () {
  let coupons = [];
  let editingCoupon = null;

  /** Empresa elegida por el superadmin (para crear cupones). */
  const companyQuery = () => (state.role === 'superadmin' && state.companyId ? `?companyId=${encodeURIComponent(state.companyId)}` : '');

  async function send(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `No se pudo completar (${res.status}).`);
    return data;
  }

  const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  function renderLeads(leads) {
    $('#custLeads').textContent = fmt(leads.total);
    $('#leadsCsv').href = `/api/leads.csv${qs()}`;
    const box = $('#leadsBody');
    if (!leads.items.length) {
      box.innerHTML = `<p class="cust-empty">${
        leads.pointsEnabled
          ? 'Ningún cliente dejó su contacto en este periodo. Prueba ampliar el rango de fechas.'
          : 'Aún no hay puntos que pidan el contacto. En Puntos NFC, edita un punto y activa "Pedir el WhatsApp del cliente".'
      }</p>`;
      return;
    }
    box.innerHTML = `<div class="overflow-x-auto"><table class="w-full text-sm">
      <thead class="text-slate-500 text-left"><tr><th class="th">Fecha</th><th class="th">Nombre</th><th class="th">Celular</th><th class="th">Sede y punto</th><th class="th"></th></tr></thead>
      <tbody>${leads.items
        .map(
          (l) => `<tr>
          <td class="td text-muted" style="font-variant-numeric:tabular-nums;white-space:nowrap">${escapeHtml(fmtDay(l.created.slice(0, 10)))} ${escapeHtml(l.created.slice(11))}</td>
          <td class="td font-medium">${escapeHtml(l.name || 'Sin nombre')}</td>
          <td class="td"><a href="https://wa.me/${encodeURIComponent(l.phone.replace(/\D/g, ''))}" target="_blank" rel="noopener" style="color:var(--accent)">${escapeHtml(l.phone)}</a></td>
          <td class="td">${escapeHtml(l.location)}<span class="text-muted"> · ${escapeHtml(l.point)}</span></td>
          <td class="td text-right"><button class="btn-ghost text-xs btn-ghost-danger lead-del" data-id="${l.id}" aria-label="Eliminar el contacto de ${escapeHtml(l.name || l.phone)}">Eliminar</button></td>
        </tr>`
        )
        .join('')}</tbody></table></div>
      ${leads.total > leads.items.length ? `<p class="cust-empty">Se muestran los ${fmt(leads.items.length)} más recientes de ${fmt(leads.total)}. Descarga el Excel para verlos todos.</p>` : ''}`;
    box.querySelectorAll('.lead-del').forEach((b) =>
      b.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Eliminar contacto',
          message: 'Se borrará este contacto. Úsalo cuando el cliente pida que elimines sus datos. No se puede deshacer.',
          confirmText: 'Eliminar',
        });
        if (!ok) return;
        try {
          await send('DELETE', `/api/leads/${b.dataset.id}`);
          toast('Contacto eliminado');
          loadCustomers();
        } catch (e) {
          toast(e.message, false);
        }
      })
    );
  }

  function renderCoupons() {
    const issued = coupons.reduce((a, c) => a + c.issued, 0);
    const redeemed = coupons.reduce((a, c) => a + c.redeemed, 0);
    $('#custRedeemed').textContent = fmt(redeemed);
    $('#custRedeemedSub').textContent = issued ? `${pctOf(redeemed, issued)} % de ${fmt(issued)} entregados` : 'Aún no se ha entregado ninguno';
    const box = $('#couponsBody');
    if (!coupons.length) {
      box.innerHTML = '<p class="cust-empty" style="padding:0">Aún no hay cupones. Crea uno y asígnalo a un punto desde Puntos NFC para saber cuántos toques terminan en una compra.</p>';
      return;
    }
    box.innerHTML = `<div class="coupon-list">${coupons
      .map((c) => {
        const state = c.expired ? ['Vencido', 'state-alert'] : c.active ? ['Activo', 'state-active'] : ['En pausa', 'state-neutral'];
        const where = c.locations.length
          ? `<p class="text-xs text-muted">Por sede: ${c.locations.map((l) => `${escapeHtml(l.location)} ${fmt(l.redeemed)} de ${fmt(l.issued)}`).join(' · ')}</p>`
          : '';
        return `<div class="coupon-item">
          <div class="coupon-head">
            <span class="coupon-name">${escapeHtml(c.name)} <span class="state-badge ${state[1]}">${state[0]}</span></span>
            <span class="coupon-actions">
              <button class="btn-ghost text-xs coupon-edit" data-id="${c.id}" style="border:1px solid var(--card-border)">Editar</button>
              <button class="btn-ghost text-xs coupon-toggle" data-id="${c.id}" style="border:1px solid var(--card-border)">${c.active ? 'Pausar' : 'Reanudar'}</button>
              <button class="btn-ghost text-xs btn-ghost-danger coupon-del" data-id="${c.id}">Eliminar</button>
            </span>
          </div>
          <div class="coupon-stats">
            <span><b>${fmt(c.issued)}</b> entregados</span>
            <span><b>${fmt(c.redeemed)}</b> canjeados${c.issued ? ` (${pctOf(c.redeemed, c.issued)} %)` : ''}</span>
            <span>${c.points ? `En <b>${fmt(c.points)}</b> punto${c.points === 1 ? '' : 's'}` : 'Sin puntos asignados'}</span>
            <span>Clave de caja: <b>${escapeHtml(c.pin)}</b></span>
            ${c.validUntil ? `<span>Hasta el ${escapeHtml(fmtDay(c.validUntil))}</span>` : ''}
          </div>
          ${c.terms ? `<p class="text-xs text-muted">${escapeHtml(c.terms)}</p>` : ''}
          ${c.points ? where : '<p class="text-xs text-muted">Para usarlo: Puntos NFC → edita un punto → Entregar un cupón.</p>'}
        </div>`;
      })
      .join('')}</div>`;
    const find = (id) => coupons.find((c) => c.id === id);
    box.querySelectorAll('.coupon-edit').forEach((b) => b.addEventListener('click', () => openCoupon(find(b.dataset.id))));
    box.querySelectorAll('.coupon-toggle').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          await send('PATCH', `/api/coupons/${b.dataset.id}`, { active: !find(b.dataset.id).active });
          loadCustomers();
        } catch (e) {
          toast(e.message, false);
        }
      })
    );
    box.querySelectorAll('.coupon-del').forEach((b) =>
      b.addEventListener('click', async () => {
        const c = find(b.dataset.id);
        const ok = await confirmDialog({
          title: 'Eliminar cupón',
          message: `Se eliminará «${c.name}» con su historial de canjes. Los puntos que lo entregaban vuelven a abrir su destino normal.`,
          confirmText: 'Eliminar',
        });
        if (!ok) return;
        try {
          await send('DELETE', `/api/coupons/${c.id}`);
          toast('Cupón eliminado');
          loadCustomers();
        } catch (e) {
          toast(e.message, false);
        }
      })
    );
  }

  function renderStaff(staff) {
    const top = staff.items[0];
    $('#custTopStaff').textContent = top ? top.staff : '—';
    $('#custTopStaffSub').textContent = top ? `${fmt(top.scans)} interacciones · ${top.location}` : 'Sin puntos con responsable';
    const box = $('#staffBody');
    if (!staff.items.length) {
      box.innerHTML = `<p class="cust-empty">${
        staff.assigned
          ? 'Los puntos con responsable no tuvieron interacciones en este periodo.'
          : 'Ningún punto tiene asignado quién lo atiende. En Puntos NFC, edita un punto y escribe el vendedor, la mesa o la caja.'
      }</p>`;
      return;
    }
    const max = staff.items[0].scans || 1;
    box.innerHTML = `<div class="overflow-x-auto"><table class="w-full text-sm">
      <thead class="text-slate-500 text-left"><tr><th class="th">#</th><th class="th">Quién atiende</th><th class="th">Sede</th><th class="th text-right">Interacciones</th><th class="th text-right">WhatsApp</th><th class="th text-right">Reseñas</th><th class="th" style="width:22%"></th></tr></thead>
      <tbody>${staff.items
        .map(
          (r, i) => `<tr>
          <td class="td text-muted">${i + 1}</td>
          <td class="td font-medium">${escapeHtml(r.staff)}</td>
          <td class="td">${escapeHtml(r.location)}</td>
          <td class="td text-right" style="font-variant-numeric:tabular-nums">${fmt(r.scans)}</td>
          <td class="td text-right" style="font-variant-numeric:tabular-nums">${fmt(r.whatsapp)}</td>
          <td class="td text-right" style="font-variant-numeric:tabular-nums">${fmt(r.reviews)}</td>
          <td class="td"><div class="staff-bar" style="width:${Math.max(2, Math.round((r.scans / max) * 100))}%"></div></td>
        </tr>`
        )
        .join('')}</tbody></table></div>`;
  }

  function renderInsight(leads, staff) {
    const redeemed = coupons.reduce((a, c) => a + c.redeemed, 0);
    const issued = coupons.reduce((a, c) => a + c.issued, 0);
    let text;
    let level = 'neutral';
    if (!leads.total && !issued && !staff.items.length) {
      text = 'Aquí verás quién te dejó su contacto, cuántos cupones se canjearon en caja y qué vendedor o mesa genera más interacciones. Se activa punto por punto desde Puntos NFC.';
    } else {
      const parts = [];
      if (leads.total) parts.push(`${fmt(leads.total)} cliente${leads.total === 1 ? ' dejó' : 's dejaron'} su contacto en el periodo`);
      if (issued) parts.push(`${fmt(redeemed)} de ${fmt(issued)} cupones se canjearon en caja (${pctOf(redeemed, issued)} %)`);
      if (staff.items[0]) parts.push(`${staff.items[0].staff} es quien más interacciones genera (${fmt(staff.items[0].scans)})`);
      text = `${parts.join('; ')}.`;
      text = text.charAt(0).toUpperCase() + text.slice(1);
      if (leads.total || redeemed) level = 'good';
    }
    $('#custInsight').innerHTML = `<div class="insight-row lvl-${level}"><span class="insight-dot" aria-hidden="true"></span><p class="insight-row-text">${escapeHtml(text)}</p></div>`;
  }

  async function loadCustomers() {
    try {
      const cq = companyQuery();
      const [leads, list, staff] = await Promise.all([
        api(`/api/leads${qs()}`),
        api(`/api/coupons${cq}`),
        api(`/api/staff-ranking${qs()}`),
      ]);
      coupons = list;
      renderLeads(leads);
      renderCoupons();
      renderStaff(staff);
      renderInsight(leads, staff);
    } catch {
      $('#custInsight').innerHTML = '<div class="insight-row lvl-neutral"><span class="insight-dot" aria-hidden="true"></span><p class="insight-row-text">No se pudo cargar esta sección. Recarga la página.</p></div>';
    }
  }
  window.loadCustomers = loadCustomers;

  // ---- Modal de cupón -----------------------------------------------------
  function openCoupon(c) {
    if (!c && state.role === 'superadmin' && !state.companyId) {
      toast('Elige una empresa en el filtro de arriba antes de crear el cupón.', false);
      return;
    }
    editingCoupon = c || null;
    $('#couponModalTitle').textContent = c ? 'Editar cupón' : 'Nuevo cupón';
    $('#couponName').value = c ? c.name : '';
    $('#couponTerms').value = c ? c.terms || '' : '';
    $('#couponPin').value = c ? c.pin : '';
    $('#couponUntil').value = c ? c.validUntil || '' : '';
    $('#couponMsg').textContent = '';
    const m = $('#couponModal');
    m.classList.remove('hidden');
    m.classList.add('flex');
  }
  function closeCoupon() {
    const m = $('#couponModal');
    m.classList.add('hidden');
    m.classList.remove('flex');
  }
  async function saveCoupon() {
    const body = {
      name: $('#couponName').value.trim(),
      terms: $('#couponTerms').value.trim(),
      pin: $('#couponPin').value.trim(),
      validUntil: $('#couponUntil').value,
    };
    try {
      if (editingCoupon) await send('PATCH', `/api/coupons/${editingCoupon.id}`, body);
      else await send('POST', `/api/coupons${companyQuery()}`, body);
      closeCoupon();
      toast(editingCoupon ? 'Cupón actualizado' : 'Cupón creado');
      loadCustomers();
    } catch (e) {
      const msg = $('#couponMsg');
      msg.textContent = e.message;
      msg.style.color = 'var(--danger)';
    }
  }

  // ---- Campos extra al editar un punto (los usa app.js) --------------------
  window.fillPointExtras = async function (d) {
    $('#editStaff').value = d.staff || '';
    $('#editCaptureLead').checked = d.capture_lead === true;
    const sel = $('#editCoupon');
    sel.innerHTML = '<option value="">No</option>';
    try {
      const cq = d.company_id ? `?companyId=${encodeURIComponent(d.company_id)}` : '';
      const list = await api(`/api/coupons${cq}`);
      sel.innerHTML =
        '<option value="">No</option>' +
        list.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}${c.expired ? ' (vencido)' : c.active ? '' : ' (en pausa)'}</option>`).join('');
      sel.value = d.coupon_id || '';
    } catch {
      /* sin cupones: queda "No" */
    }
  };
  window.pointExtras = function () {
    return {
      staff: $('#editStaff').value.trim(),
      capture_lead: $('#editCaptureLead').checked,
      coupon_id: $('#editCoupon').value || null,
    };
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (!$('#view-customers')) return;
    $('#newCouponBtn').addEventListener('click', () => openCoupon(null));
    $('#closeCouponModal').addEventListener('click', closeCoupon);
    $('#cancelCoupon').addEventListener('click', closeCoupon);
    $('#saveCoupon').addEventListener('click', saveCoupon);
  });
})();
