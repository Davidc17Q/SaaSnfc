// Alta masiva de una cadena (solo superadmin): subir la hoja de sedes, revisar
// la vista previa y crear todo de una vez. Usa los helpers de app.js ($, toast,
// escapeHtml, fmt, confirmDialog, loadAdmin).
(function () {
  const imp = { companyId: null, csv: '', fileName: '', setup: null };
  const modal = () => $('#importModal');
  const show = (step) => ['importStep1', 'importStep2', 'importStep3'].forEach((id) => $(`#${id}`).classList.toggle('hidden', id !== step));
  const msg = (text, ok = false) => {
    const m = $('#importMsg');
    m.textContent = text || '';
    m.style.color = ok ? 'var(--ok)' : 'var(--danger)';
  };

  async function post(path, body, method = 'POST') {
    const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `No se pudo completar (${res.status}).`);
    return data;
  }

  /** Plantilla de puntos según lo que hay en el formulario. */
  function template() {
    const t = [];
    if ($('#impUseReviews').checked) {
      t.push({ role: 'resenas', label: $('#impLabelReviews').value.trim() || 'Reseñas', type: 'column_url', column: 'ficha_google', fallback: $('#impFallbackReviews').value.trim() });
    }
    if ($('#impUseCredit').checked) {
      t.push({
        role: 'credito', label: $('#impLabelCredit').value.trim() || 'Crédito', type: 'column_whatsapp', column: 'whatsapp_credito',
        message: $('#impMessageCredit').value.trim(), fallback: $('#impFallbackCredit').value.trim(),
      });
    }
    if ($('#impUseChannel').checked) {
      t.push({ role: 'canal', label: $('#impLabelChannel').value.trim() || 'Canal de WhatsApp', type: 'fixed', url: $('#impUrlChannel').value.trim() });
    }
    return t;
  }

  function fillTemplate(tpl) {
    const by = (role) => tpl.find((p) => p.role === role);
    const set = (use, fields, p) => {
      $(use).checked = !!p;
      for (const [sel, key] of fields) $(sel).value = (p && p[key]) || $(sel).defaultValue || '';
    };
    set('#impUseReviews', [['#impLabelReviews', 'label'], ['#impFallbackReviews', 'fallback']], by('resenas'));
    set('#impUseCredit', [['#impLabelCredit', 'label'], ['#impMessageCredit', 'message'], ['#impFallbackCredit', 'fallback']], by('credito'));
    set('#impUseChannel', [['#impLabelChannel', 'label'], ['#impUrlChannel', 'url']], by('canal'));
  }

  function renderDownloads(box) {
    const s = imp.setup;
    if (!s || !s.locations) {
      box.innerHTML = '';
      return;
    }
    const base = `/api/admin/import/${imp.companyId}`;
    const lotes = s.batches.map((b) => `<option value="${escapeHtml(b.batch)}">Lote ${escapeHtml(b.batch)} · ${fmt(b.locations)} sedes</option>`).join('');
    box.innerHTML = `
      <p class="text-sm font-medium mb-2">Descargas para el montaje</p>
      <div class="import-downloads">
        <select class="input text-sm imp-lote" aria-label="Lote a imprimir"><option value="">Todas las sedes (${fmt(s.locations)})</option>${lotes}</select>
        <a class="btn-primary text-sm imp-print" href="${base}/habladores" target="_blank" rel="noopener">Habladores para imprenta</a>
        <a class="btn-ghost text-sm" style="border:1px solid var(--card-border)" href="${base}/chips.csv">Enlaces de los chips (Excel)</a>
      </div>
      <p class="text-xs text-muted mt-2">Los habladores abren en otra pestaña con el QR real de cada sede; desde ahí se guardan como PDF. El archivo de chips trae, por lote y sede, el enlace que se graba en cada chip.${s.hasLogo ? '' : ' Aún no hay logo: el hablador saldrá con el nombre de la empresa en texto.'}</p>`;
    const sel = box.querySelector('.imp-lote');
    sel.addEventListener('change', () => {
      box.querySelector('.imp-print').href = `${base}/habladores${sel.value ? `?lote=${encodeURIComponent(sel.value)}` : ''}`;
    });
  }

  async function open(companyId) {
    imp.companyId = companyId;
    imp.csv = '';
    imp.fileName = '';
    $('#impFile').value = '';
    $('#impLogo').value = '';
    msg('');
    try {
      const res = await fetch(`/api/admin/import/${companyId}/setup`);
      if (!res.ok) throw new Error('No se pudo abrir la carga de sedes.');
      imp.setup = await res.json();
    } catch (e) {
      toast(e.message, false);
      return;
    }
    $('#importCompany').textContent = imp.setup.locations
      ? `${imp.setup.companyName} · ${fmt(imp.setup.locations)} sedes cargadas`
      : `${imp.setup.companyName} · sin sedes todavía`;
    $('#impLogoState').textContent = imp.setup.hasLogo ? 'Ya hay un logo guardado; sube otro solo si quieres cambiarlo.' : 'PNG o JPG de hasta 450 KB. Opcional.';
    fillTemplate(imp.setup.template);
    renderDownloads($('#importDownloads1'));
    show('importStep1');
    modal().classList.remove('hidden');
    modal().classList.add('flex');
  }

  function close() {
    modal().classList.add('hidden');
    modal().classList.remove('flex');
  }

  function readFile(file, as) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      if (as === 'dataUrl') r.readAsDataURL(file);
      else r.readAsArrayBuffer(file);
    });
  }

  /** Excel en español guarda el CSV en Windows-1252 salvo que se elija UTF-8. */
  function decodeCsv(buf) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      return new TextDecoder('windows-1252').decode(buf);
    }
  }

  async function preview() {
    msg('');
    const file = $('#impFile').files[0];
    if (file) {
      if (/\.xlsx?$/i.test(file.name)) return msg('Ese es un archivo de Excel. Ábrelo y usa Guardar como → CSV (delimitado por comas).');
      imp.csv = decodeCsv(await readFile(file));
      imp.fileName = file.name;
    }
    if (!imp.csv) return msg('Elige la hoja de sedes en formato CSV.');
    const btn = $('#impPreviewBtn');
    btn.disabled = true;
    try {
      const logo = $('#impLogo').files[0];
      if (logo) {
        await post(`/api/admin/import/${imp.companyId}/logo`, { dataUrl: await readFile(logo, 'dataUrl') }, 'PUT');
        imp.setup.hasLogo = true;
        $('#impLogo').value = '';
      }
      renderPlan(await post('/api/admin/import/preview', { companyId: imp.companyId, csv: imp.csv, template: template() }));
    } catch (e) {
      msg(e.message);
    } finally {
      btn.disabled = false;
    }
  }

  const ACTION = { create: ['Nueva', 'state-active'], update: ['Se actualiza', 'state-low'], same: ['Sin cambios', 'state-neutral'] };

  function renderPlan(plan) {
    if (plan.fatal) return msg(plan.fatal);
    const s = plan.summary;
    const parts = [];
    if (s.create) parts.push(`${fmt(s.create)} nueva${s.create === 1 ? '' : 's'}`);
    if (s.update) parts.push(`${fmt(s.update)} se actualiza${s.update === 1 ? '' : 'n'}`);
    if (s.same) parts.push(`${fmt(s.same)} sin cambios`);
    const lead = `${fmt(s.rows)} sede${s.rows === 1 ? '' : 's'} en ${escapeHtml(imp.fileName || 'la hoja')}${parts.length ? `: ${parts.join(', ')}` : ''}.`;
    const box = $('#importSummary');
    box.className = `import-summary ${s.withErrors ? 'has-errors' : ''}`;
    box.innerHTML = `
      <p class="font-semibold">${lead}</p>
      <p class="text-sm">${
        s.withErrors
          ? `${fmt(s.withErrors)} fila${s.withErrors === 1 ? ' tiene' : 's tienen'} errores. Corrígelas en la hoja y vuelve a cargarla: no se guarda nada hasta que esté limpia.`
          : `Se crearán ${fmt(s.pointsCreate)} punto${s.pointsCreate === 1 ? '' : 's'} y cambiará el destino de ${fmt(s.pointsUpdate)}. Los códigos de los puntos existentes no cambian.`
      }</p>
      ${s.withWarnings ? `<p class="text-sm">${fmt(s.withWarnings)} sede${s.withWarnings === 1 ? '' : 's'} con avisos: quedan con el destino provisional y se cambian después desde el panel.</p>` : ''}
      ${plan.missing.length ? `<p class="text-sm">${fmt(plan.missing.length)} sede${plan.missing.length === 1 ? '' : 's'} de la empresa no viene${plan.missing.length === 1 ? '' : 'n'} en la hoja y no se toca${plan.missing.length === 1 ? '' : 'n'}: ${escapeHtml(plan.missing.slice(0, 6).join(', '))}${plan.missing.length > 6 ? '…' : ''}.</p>` : ''}
      ${plan.unknownColumns.length ? `<p class="text-sm text-muted">Columnas que no se usan: ${escapeHtml(plan.unknownColumns.join(', '))}.</p>` : ''}`;

    // Primero lo que hay que corregir, luego los avisos, luego el resto.
    const rank = (r) => (r.errors.length ? 0 : r.warnings.length ? 1 : 2);
    const rows = [...plan.rows].sort((a, b) => rank(a) - rank(b) || a.line - b.line);
    $('#importRows').innerHTML = rows
      .map((r) => {
        const [label, cls] = r.errors.length ? ['Con errores', 'state-alert'] : ACTION[r.action];
        const notes = [
          ...r.errors.map((e) => `<div class="import-note is-error">${escapeHtml(e)}</div>`),
          ...r.warnings.map((w) => `<div class="import-note">${escapeHtml(w)}</div>`),
        ].join('');
        const points = r.points
          .map((p) => `<div class="import-point"><span>${escapeHtml(p.label)}</span><span class="text-muted">${p.url ? escapeHtml(p.url.replace(/^https?:\/\//, '').slice(0, 44)) : '—'}${p.action === 'update' ? ' · cambia' : p.action === 'create' ? ' · nuevo' : ''}</span></div>`)
          .join('');
        return `<tr>
          <td class="td text-muted" style="font-variant-numeric:tabular-nums">${r.line}</td>
          <td class="td"><div class="font-medium">${escapeHtml(nice(r.name || "(sin nombre)"))}</div><div class="text-xs text-muted">${escapeHtml([r.city, r.address, r.batch && `lote ${r.batch}`].filter(Boolean).join(' · '))}</div>${notes}</td>
          <td class="td"><span class="state-badge ${cls}"><span class="dot"></span> ${label}</span></td>
          <td class="td">${points}</td>
        </tr>`;
      })
      .join('');
    const commit = $('#impCommitBtn');
    const changes = s.create + s.update;
    commit.disabled = !plan.ok || !changes;
    commit.textContent = !plan.ok ? 'Corrige la hoja para continuar' : changes ? `Guardar ${fmt(changes)} sede${changes === 1 ? '' : 's'}` : 'No hay cambios que guardar';
    show('importStep2');
  }

  async function commit() {
    const btn = $('#impCommitBtn');
    btn.disabled = true;
    try {
      const r = await post('/api/admin/import/commit', { companyId: imp.companyId, csv: imp.csv, template: template() });
      imp.setup = await (await fetch(`/api/admin/import/${imp.companyId}/setup`)).json();
      $('#importResult').textContent =
        `Listo: ${fmt(r.locationsCreated)} sedes creadas, ${fmt(r.locationsUpdated)} actualizadas, ` +
        `${fmt(r.pointsCreated)} puntos nuevos y ${fmt(r.pointsUpdated)} destinos cambiados.`;
      $('#importCompany').textContent = `${imp.setup.companyName} · ${fmt(imp.setup.locations)} sedes cargadas`;
      renderDownloads($('#importDownloads3'));
      show('importStep3');
      loadAdmin();
    } catch (e) {
      toast(e.message, false);
      btn.disabled = false;
    }
  }

  function sampleCsv() {
    const rows = [
      'sede;ciudad;direccion;lote;ficha_google;whatsapp_credito',
      'Junín Principal;Medellín;Cra. 49 #48-43;1;https://g.page/r/EJEMPLO/review;3001234567',
      'Bello Uno;Bello;Cl. 49 #49-80;3;https://g.page/r/EJEMPLO2/review;3007654321',
    ];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'hoja-de-sedes-ejemplo.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function toggleDemo(id, name, isDemo) {
    const ok = await confirmDialog({
      title: isDemo ? 'Quitar la marca de demostración' : 'Marcar como demostración',
      message: isDemo
        ? `«${name}» dejará de ser una empresa de demostración y perderá el "(demo)" del nombre.`
        : `«${name}» pasará a llamarse «${name} (demo)» y quedará separada de la empresa real del cliente. Sus puntos y tarjetas siguen funcionando igual.`,
      confirmText: isDemo ? 'Quitar marca' : 'Marcar como demo',
    });
    if (!ok) return;
    try {
      await post(`/api/admin/import/${id}/demo`, { demo: !isDemo });
      toast(isDemo ? 'Marca de demostración quitada' : 'Empresa marcada como demostración');
      loadAdmin();
    } catch (e) {
      toast(e.message, false);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!modal()) return;
    $('#companyTableBody').addEventListener('click', (e) => {
      const o = e.target.closest('.import-open');
      if (o) return open(o.dataset.id);
      const d = e.target.closest('.demo-toggle');
      if (d) toggleDemo(d.dataset.id, d.dataset.name, d.dataset.demo === '1');
    });
    $('#closeImportModal').addEventListener('click', close);
    $('#cancelImport').addEventListener('click', close);
    $('#closeImportDone').addEventListener('click', close);
    $('#impPreviewBtn').addEventListener('click', preview);
    $('#impBackBtn').addEventListener('click', () => show('importStep1'));
    $('#impCommitBtn').addEventListener('click', commit);
    $('#impSample').addEventListener('click', sampleCsv);
  });
})();
