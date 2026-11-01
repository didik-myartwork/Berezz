/**
 * Berezz form controls in the shadcn/ui style: Select, MultiSelect (with search) and
 * DatePicker, rendered as HTML strings like the rest of the UI and driven by one
 * delegated controller. Each control keeps its value in hidden <input name> elements,
 * so FormData and the existing "change" listeners keep working unchanged.
 */
import { icon } from './icons.js';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const encode = (v) => esc(JSON.stringify(v));
let uid = 0;
const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const DAY_LONG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
export function formatDate(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m)
        return '';
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return `${DAY_LONG[d.getUTCDay()].slice(0, 3)}, ${+m[3]} ${MONTHS[+m[2] - 1].slice(0, 3)} ${m[1]}`;
}
/** Accessible name: the visible field label plus the current value. */
const named = (o, id) => (o.labelledBy ? `aria-labelledby="${esc(o.labelledBy)} ${esc(id)}-v"` : o.label ? `aria-label="${esc(o.label)}"` : '');
/** Single-choice dropdown. */
export function select(o) {
    const id = o.id || `sel-${++uid}`;
    const cur = o.options.find((x) => x.value === (o.value ?? ''));
    return `<div class="sel ${o.className || ''}" data-ctl="select" data-options="${encode(o.options)}">
    <input type="hidden" name="${esc(o.name)}" value="${esc(o.value ?? '')}" />
    <button type="button" class="sel-trigger" id="${esc(id)}" aria-haspopup="listbox" aria-expanded="false" ${named(o, id)} ${o.disabled ? 'disabled' : ''}>
      <span class="sel-value${cur && cur.value !== '' ? '' : ' is-placeholder'}" id="${esc(id)}-v">${esc(cur ? cur.label : o.placeholder || 'Pilih')}</span>${icon('chevDown', 14)}
    </button>
  </div>`;
}
/** Multi-choice dropdown with search and removable chips on the trigger. */
export function multiSelect(o) {
    const id = o.id || `sel-${++uid}`;
    return `<div class="sel sel-multi ${o.className || ''}" data-ctl="multi" data-name="${esc(o.name)}" data-placeholder="${esc(o.placeholder || 'Pilih')}" data-options="${encode(o.options)}">
    ${o.values.map((v) => `<input type="hidden" name="${esc(o.name)}" value="${esc(v)}" />`).join('')}
    <button type="button" class="sel-trigger" id="${esc(id)}" aria-haspopup="listbox" aria-expanded="false" ${named(o, id)}>
      <span id="${esc(id)}-v">${chipsHTML(o.values, o.options, o.placeholder || 'Pilih')}</span>${icon('chevDown', 14)}
    </button>
  </div>`;
}
function chipsHTML(values, options, placeholder) {
    if (!values.length)
        return `<span class="sel-value is-placeholder">${esc(placeholder)}</span>`;
    const labels = values.map((v) => options.find((x) => x.value === v)?.label || v);
    const shown = labels.slice(0, 2).map((l) => `<span class="sel-chip">${esc(l)}</span>`).join('');
    return `<span class="sel-chips">${shown}${labels.length > 2 ? `<span class="sel-chip sel-more">+${labels.length - 2}</span>` : ''}</span>`;
}
/** Date picker: a trigger showing the formatted date and a calendar popover. */
export function datePicker(o) {
    const id = o.id || `sel-${++uid}`;
    const v = o.value || '';
    return `<div class="sel sel-date ${o.className || ''}" data-ctl="date">
    <input type="hidden" name="${esc(o.name)}" value="${esc(v)}" />
    <button type="button" class="sel-trigger" id="${esc(id)}" aria-haspopup="dialog" aria-expanded="false" ${named(o, id)}>
      ${icon('calendar', 14)}<span class="sel-value${v ? '' : ' is-placeholder'}" id="${esc(id)}-v">${esc(v ? formatDate(v) : o.placeholder || 'Pilih tanggal')}</span>
    </button>
  </div>`;
}
/** Time picker as a Select over a 15-minute grid (shadcn has no native time control). */
export function timeSelect(o) {
    const opts = [];
    for (let m = (o.from ?? 6) * 60; m <= (o.to ?? 21) * 60; m += 15)
        opts.push({ value: `${pad(Math.floor(m / 60))}:${pad(m % 60)}`, label: `${pad(Math.floor(m / 60))}.${pad(m % 60)}` });
    if (o.value && !opts.some((x) => x.value === o.value))
        opts.push({ value: o.value, label: o.value.replace(':', '.') });
    opts.sort((a, b) => a.value.localeCompare(b.value));
    return select({ ...o, placeholder: o.placeholder || 'Pilih jam', options: opts, className: `${o.className || ''} sel-time` });
}
/* -------------------------------------------------------------- behaviour */
let open = null;
const optionsOf = (root) => JSON.parse(root.dataset.options || '[]');
const valuesOf = (root) => Array.from(root.querySelectorAll(':scope > input[type="hidden"]')).map((i) => i.value);
function place(pop, trigger) {
    const r = trigger.getBoundingClientRect();
    pop.style.minWidth = `${Math.max(r.width, pop.classList.contains('sel-cal') ? 0 : 180)}px`;
    const h = pop.offsetHeight;
    const below = window.innerHeight - r.bottom;
    const top = below < h + 12 && r.top > h + 12 ? r.top - h - 6 : r.bottom + 6;
    const left = Math.min(r.left, window.innerWidth - pop.offsetWidth - 8);
    pop.style.top = `${Math.max(8, top)}px`;
    pop.style.left = `${Math.max(8, left)}px`;
}
export function closeControl(returnFocus = true) {
    if (!open)
        return;
    const { pop, trigger } = open;
    pop.remove();
    trigger.setAttribute('aria-expanded', 'false');
    if (returnFocus)
        trigger.focus({ preventScroll: true });
    open = null;
}
function commit(root, values) {
    const kind = root.dataset.ctl;
    const options = optionsOf(root);
    const trigger = root.querySelector('.sel-trigger');
    if (kind === 'multi') {
        const name = root.dataset.name || '';
        root.querySelectorAll(':scope > input[type="hidden"]').forEach((i) => i.remove());
        for (const v of values) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = name;
            input.value = v;
            root.insertBefore(input, trigger);
        }
        trigger.innerHTML = `<span id="${trigger.id}-v">${chipsHTML(values, options, root.dataset.placeholder || 'Pilih')}</span>${icon('chevDown', 14)}`;
    }
    else {
        const input = root.querySelector(':scope > input[type="hidden"]');
        input.value = values[0] ?? '';
        const label = kind === 'date' ? formatDate(input.value) : options.find((x) => x.value === input.value)?.label;
        const span = trigger.querySelector('.sel-value');
        span.textContent = label || (kind === 'date' ? 'Pilih tanggal' : 'Pilih');
        span.classList.toggle('is-placeholder', !input.value);
    }
    root.querySelector(':scope > input[type="hidden"]')?.dispatchEvent(new Event('change', { bubbles: true }));
}
function listHTML(root, query = '') {
    const multi = root.dataset.ctl === 'multi';
    const selected = new Set(valuesOf(root));
    const q = query.trim().toLowerCase();
    const opts = optionsOf(root).filter((o) => !q || `${o.label} ${o.detail || ''}`.toLowerCase().includes(q));
    if (!opts.length)
        return `<div class="sel-empty">Tidak ada yang cocok.</div>`;
    return opts.map((o, i) => `<div class="sel-opt" role="option" id="${root.querySelector('.sel-trigger').id}-o${i}" data-value="${esc(o.value)}" aria-selected="${selected.has(o.value)}">
      ${multi ? `<span class="sel-box" aria-hidden="true">${icon('tick', 11)}</span>` : ''}
      <span class="sel-opt-text"><span>${esc(o.label)}</span>${o.detail ? `<span class="sel-opt-detail">${esc(o.detail)}</span>` : ''}</span>
      ${multi ? '' : `<span class="sel-check" aria-hidden="true">${icon('tick', 14)}</span>`}
    </div>`).join('');
}
function setActive(i) {
    if (!open)
        return;
    const items = Array.from(open.pop.querySelectorAll('.sel-opt'));
    if (!items.length)
        return;
    open.active = (i + items.length) % items.length;
    items.forEach((el, j) => el.classList.toggle('is-active', j === open.active));
    const el = items[open.active];
    el.scrollIntoView({ block: 'nearest' });
    (open.pop.querySelector('[role="listbox"]') || open.pop).setAttribute('aria-activedescendant', el.id);
}
function openList(root, trigger) {
    const multi = root.dataset.ctl === 'multi';
    const pop = document.createElement('div');
    pop.className = 'sel-pop';
    pop.innerHTML = `${multi ? `<div class="sel-search">${icon('search', 13)}<input type="text" placeholder="Cari…" aria-label="Cari pilihan" /></div>` : ''}
    <div class="sel-list" role="listbox" tabindex="-1" ${multi ? 'aria-multiselectable="true"' : ''} aria-labelledby="${trigger.id}">${listHTML(root)}</div>`;
    root.appendChild(pop);
    open = { root, pop, trigger, active: -1 };
    trigger.setAttribute('aria-expanded', 'true');
    place(pop, trigger);
    const items = Array.from(pop.querySelectorAll('.sel-opt'));
    setActive(Math.max(0, items.findIndex((el) => el.getAttribute('aria-selected') === 'true')));
    (pop.querySelector('.sel-search input') || pop.querySelector('.sel-list')).focus({ preventScroll: true });
}
function pick(el) {
    if (!open)
        return;
    const { root } = open;
    const v = el.dataset.value || '';
    if (root.dataset.ctl === 'multi') {
        const cur = valuesOf(root);
        const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
        commit(root, next);
        el.setAttribute('aria-selected', String(next.includes(v)));
    }
    else {
        commit(root, [v]);
        closeControl();
    }
}
/* calendar */
function calHTML(y, m, selected, focusDay) {
    const first = new Date(Date.UTC(y, m, 1));
    const lead = (first.getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const now = new Date();
    const today = iso(now.getFullYear(), now.getMonth(), now.getDate());
    const cells = [];
    for (let i = 0; i < lead; i++)
        cells.push('<span></span>');
    for (let d = 1; d <= days; d++) {
        const v = iso(y, m, d);
        cells.push(`<button type="button" class="cal-day${v === today ? ' is-today' : ''}" data-day="${v}" aria-pressed="${v === selected}" tabindex="${v === focusDay ? 0 : -1}" aria-label="${esc(formatDate(v))}">${d}</button>`);
    }
    return `<div class="cal-head">
      <button type="button" class="cal-nav" data-cal="-1" aria-label="Bulan sebelumnya">${icon('chevDown', 14)}</button>
      <span class="cal-title" aria-live="polite">${MONTHS[m]} ${y}</span>
      <button type="button" class="cal-nav cal-next" data-cal="1" aria-label="Bulan berikutnya">${icon('chevDown', 14)}</button>
    </div>
    <div class="cal-grid" role="grid">${DAYS.map((d) => `<span class="cal-dow">${d}</span>`).join('')}${cells.join('')}</div>
    <div class="cal-foot"><button type="button" class="cal-link" data-cal-today>Hari ini</button><button type="button" class="cal-link" data-cal-clear>Kosongkan</button></div>`;
}
function renderCal(focus = true) {
    if (!open || !open.month)
        return;
    const [y, m] = open.month;
    const selected = valuesOf(open.root)[0] || '';
    open.pop.innerHTML = calHTML(y, m, selected, open.focusDay || '');
    if (focus)
        open.pop.querySelector(`[data-day="${open.focusDay}"]`)?.focus({ preventScroll: true });
}
function openCal(root, trigger) {
    const v = valuesOf(root)[0];
    const base = /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : (() => { const n = new Date(); return iso(n.getFullYear(), n.getMonth(), n.getDate()); })();
    const [y, m] = base.split('-').map(Number);
    const pop = document.createElement('div');
    pop.className = 'sel-pop sel-cal';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Pilih tanggal');
    root.appendChild(pop);
    open = { root, pop, trigger, active: -1, month: [y, m - 1], focusDay: base };
    trigger.setAttribute('aria-expanded', 'true');
    renderCal();
    place(pop, trigger);
}
function moveDay(delta) {
    if (!open || !open.focusDay)
        return;
    const [y, m, d] = open.focusDay.split('-').map(Number);
    const nd = new Date(Date.UTC(y, m - 1, d + delta));
    open.focusDay = iso(nd.getUTCFullYear(), nd.getUTCMonth(), nd.getUTCDate());
    open.month = [nd.getUTCFullYear(), nd.getUTCMonth()];
    renderCal();
}
/** Wire the delegated listeners once. */
export function initControls() {
    document.addEventListener('click', (ev) => {
        const t = ev.target;
        const trigger = t.closest('.sel-trigger');
        if (trigger) {
            const root = trigger.closest('.sel');
            const wasOpen = open?.root === root;
            closeControl(false);
            if (!wasOpen && !trigger.disabled)
                (root.dataset.ctl === 'date' ? openCal : openList)(root, trigger);
            return;
        }
        if (!open)
            return;
        if (!open.pop.contains(t)) {
            closeControl(false);
            return;
        }
        const opt = t.closest('.sel-opt');
        if (opt) {
            pick(opt);
            return;
        }
        const nav = t.closest('[data-cal]');
        if (nav && open.month) {
            const [y, m] = open.month;
            const nd = new Date(Date.UTC(y, m + Number(nav.dataset.cal), 1));
            open.month = [nd.getUTCFullYear(), nd.getUTCMonth()];
            open.focusDay = iso(nd.getUTCFullYear(), nd.getUTCMonth(), 1);
            renderCal(false);
            return;
        }
        const day = t.closest('[data-day]');
        if (day) {
            commit(open.root, [day.dataset.day || '']);
            closeControl();
            return;
        }
        if (t.closest('[data-cal-today]')) {
            const n = new Date();
            commit(open.root, [iso(n.getFullYear(), n.getMonth(), n.getDate())]);
            closeControl();
            return;
        }
        if (t.closest('[data-cal-clear]')) {
            commit(open.root, []);
            closeControl();
        }
    });
    document.addEventListener('input', (ev) => {
        const el = ev.target;
        if (!open || !el.closest('.sel-search'))
            return;
        open.pop.querySelector('.sel-list').innerHTML = listHTML(open.root, el.value);
        setActive(0);
    });
    document.addEventListener('keydown', (ev) => {
        const t = ev.target;
        const trigger = t.closest?.('.sel-trigger');
        if (trigger && !open && ['ArrowDown', 'ArrowUp'].includes(ev.key)) {
            ev.preventDefault();
            trigger.click();
            return;
        }
        if (!open || !open.pop.contains(t))
            return;
        if (ev.key === 'Escape') {
            ev.preventDefault();
            ev.stopPropagation();
            closeControl();
            return;
        }
        if (ev.key === 'Tab') {
            closeControl(false);
            return;
        }
        if (open.month) {
            const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
            if (step[ev.key] && t.closest('[data-day]')) {
                ev.preventDefault();
                moveDay(step[ev.key]);
            }
            if (ev.key === 'PageUp' || ev.key === 'PageDown') {
                ev.preventDefault();
                moveDay(ev.key === 'PageUp' ? -30 : 30);
            }
            return;
        }
        const items = Array.from(open.pop.querySelectorAll('.sel-opt'));
        if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            setActive(open.active + 1);
        }
        else if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            setActive(open.active - 1);
        }
        else if (ev.key === 'Home') {
            ev.preventDefault();
            setActive(0);
        }
        else if (ev.key === 'End') {
            ev.preventDefault();
            setActive(items.length - 1);
        }
        else if (ev.key === 'Enter' || (ev.key === ' ' && !t.closest('.sel-search'))) {
            ev.preventDefault();
            if (items[open.active])
                pick(items[open.active]);
        }
        else if (ev.key.length === 1 && !t.closest('.sel-search')) {
            const k = ev.key.toLowerCase();
            const i = items.findIndex((el) => (el.textContent || '').trim().toLowerCase().startsWith(k));
            if (i >= 0)
                setActive(i);
        }
    }, true);
    window.addEventListener('resize', () => closeControl(false));
    document.addEventListener('scroll', (ev) => {
        if (open && !open.pop.contains(ev.target))
            closeControl(false);
    }, true);
}
