
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const state = {
    user: null,
    resources: [],
    tasks: [],
    members: [],
    uploads: [],
    activeView: 'dashboard',
    activeResourceId: null,
    activeGuideId: 'physical-basics',
    selectedImages: new Set(),
    selectedVideoId: null,
    pendingMediaUrl: '',
    pendingMediaPreview: null
  };

  const guides = window.HUB_DATA?.guides || [];
  const sources = window.HUB_DATA?.sources || [];

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function safeHttpUrl(value) {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function initials(name) {
    const bits = String(name || 'U').trim().split(/\s+/).slice(0, 2);
    return bits.map(bit => bit[0] || '').join('').toUpperCase() || 'U';
  }

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  function formatDate(value) {
    if (!value) return 'មិនកំណត់';
    const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('km-KH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  function toast(message, type = 'success') {
    const region = $('#toast-region');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    region.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  async function api(path, options = {}) {
    const opts = {
      ...options,
      headers: { ...(options.headers || {}) }
    };

    if (
      opts.body &&
      !(opts.body instanceof FormData) &&
      typeof opts.body !== 'string'
    ) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }

    const response = await fetch(path, opts);
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'សំណើមិនបានជោគជ័យ។');
      }
      return data;
    }

    if (!response.ok) {
      throw new Error('មានបញ្ហាក្នុងការទាក់ទង server។');
    }

    return response;
  }

  function showApp() {
    $('#workspace-name').textContent = state.user.team_name || 'Dropshipping Team';
    $('#current-user-name').textContent = 'Workspace រួម';
    $('#current-user-role').textContent = 'ការចូលប្រើរួម';
    $('#user-avatar').textContent = 'T';
    $('#top-avatar').textContent = 'T';
    $('#welcome-name').textContent = 'ក្រុមការងារ';
    $('#team-role-badge').textContent = 'SHARED WORKSPACE';

    const today = new Date();

    $('#today-label').textContent = today.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).toUpperCase();

    renderAll();
  }

  async function bootstrap() {
    try {
      const data = await api('/api/bootstrap');

      state.user = data.user;
      state.resources = data.resources || [];
      state.tasks = data.tasks || [];
      state.members = data.members || [];
      state.uploads = data.uploads || [];
      state.selectedImages.clear();

      showApp();
      hydrateSeedVideoTitles();

    } catch (error) {
      console.error('Workspace bootstrap failed:', error);
      toast(`មិនអាចផ្ទុក Workspace បានទេ៖ ${error.message}`, 'error');
    }
  }

  async function refreshData() {
    const data = await api('/api/bootstrap');

    state.user = data.user;
    state.resources = data.resources || [];
    state.tasks = data.tasks || [];
    state.members = data.members || [];
    state.uploads = data.uploads || [];

    renderAll();
  }

  function renderAll() {
    renderDashboard();
    renderResources();
    renderGuides();
    renderTasks();
    renderMedia();
    renderTeam();
  }

  function setView(view) {
    const labels = {
      dashboard: 'ទិដ្ឋភាពសរុប',
      courses: 'បណ្ណាល័យមេរៀន',
      guides: 'មគ្គុទេសក៍ជាខ្មែរ',
      tasks: 'កិច្ចការក្រុម',
      media: 'ឯកសារ និង Media',
      team: 'Workspace រួម'
    };

    if (!labels[view]) return;

    state.activeView = view;

    $$('.view-section').forEach(section =>
      section.classList.toggle('active', section.id === `view-${view}`)
    );

    $$('.nav-item[data-view]').forEach(button =>
      button.classList.toggle('active', button.dataset.view === view)
    );

    $('#breadcrumb-current').textContent = labels[view];
    $('#sidebar').classList.remove('open');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ==========================================
  // YOUTUBE VIDEO DETECTION AND THUMBNAILS
  // ==========================================

  function youtubeId(rawUrl) {
    const safe = safeHttpUrl(rawUrl);
    if (!safe) return '';

    try {
      const url = new URL(safe);
      const host = url.hostname.replace(/^www\./, '').toLowerCase();

      if (host === 'youtu.be') {
        return url.pathname.split('/').filter(Boolean)[0] || '';
      }

      if ([
        'youtube.com',
        'm.youtube.com',
        'youtube-nocookie.com'
      ].includes(host)) {
        if (url.searchParams.get('v')) {
          return url.searchParams.get('v');
        }

        const parts = url.pathname.split('/').filter(Boolean);

        if (['embed', 'shorts', 'live'].includes(parts[0])) {
          return parts[1] || '';
        }
      }

    } catch {
      return '';
    }

    return '';
  }

  function youtubeThumbnail(rawUrl) {
    const id = youtubeId(rawUrl);
    return id
      ? `https://i.ytimg.com/vi/${encodeURIComponent(id)}/maxresdefault.jpg`
      : '';
  }

  async function fetchYoutubeMetadata(rawUrl) {
    const safe = safeHttpUrl(rawUrl);

    if (!safe || !youtubeId(safe)) return null;

    return api(`/api/media/preview?url=${encodeURIComponent(safe)}`);
  }

  async function hydrateSeedVideoTitles() {
    const genericTitle =
      /^(?:(?:វីដេអូខ្មែរ|English course|មេរៀនថ្មី) #\d+(?:\s|$)|YouTube video\b)/i;

    const pending = state.resources.filter(item =>
      youtubeId(item.url) && genericTitle.test(item.title || '')
    );

    for (let index = 0; index < pending.length; index += 4) {
      const batch = pending.slice(index, index + 4);

      await Promise.all(batch.map(async resource => {
        try {
          const meta = await fetchYoutubeMetadata(resource.url);

          if (!meta?.title || meta.metadata_fallback || meta.title === resource.title) {
            return;
          }

          await api(`/api/resources/${resource.id}`, {
            method: 'PATCH',
            body: { title: meta.title }
          });

          resource.title = meta.title;

        } catch (error) {
          console.debug('Video metadata not available:', error.message);
        }
      }));

      renderDashboard();
      renderResources();
    }
  }

  // ==========================================
  // DASHBOARD
  // ==========================================

  function renderDashboard() {
    const total = state.resources.length;

    const completed = state.resources.filter(
      r => r.my_status === 'completed'
    ).length;

    const inProgress = state.resources.filter(
      r => r.my_status === 'in_progress'
    ).length;

    const openTasks = state.tasks.filter(
      t => t.status !== 'done'
    ).length;

    const percent = total
      ? Math.round(completed / total * 100)
      : 0;

    $('#stat-lessons').textContent = total;
    $('#stat-completed').textContent = completed;
    $('#stat-open-tasks').textContent = openTasks;
    $('#stat-team-tasks').textContent = state.tasks.length;

    $('#progress-percent').textContent = `${percent}%`;

    $('#progress-ring').style.background =
      `conic-gradient(#42c6a5 ${percent * 3.6}deg,#edf1f5 0deg)`;

    $('#progress-count').textContent = `${completed} / ${total}`;

    $('#progress-copy-title').textContent = completed
      ? `ក្រុមបានបញ្ចប់ ${completed} មេរៀនហើយ`
      : 'ចាប់ផ្តើមដំណើររបស់ក្រុម';

    $('#progress-copy-desc').textContent = total
      ? `${inProgress} កំពុងរៀន · ${Math.max(total - completed - inProgress, 0)} មិនទាន់ចាប់ផ្តើម`
      : 'បន្ថែមមេរៀនដំបូងរបស់អ្នក។';

    const recent = [...state.resources]
      .sort((a, b) => {
        const rank = s =>
          s === 'in_progress' ? 0 :
          s === 'not_started' ? 1 : 2;

        return rank(a.my_status) - rank(b.my_status) ||
          Number(b.id) - Number(a.id);
      })
      .slice(0, 4);

    $('#recent-lessons').innerHTML = recent.length
      ? recent.map(r => `
        <div class="recent-lesson">
          <div class="lesson-thumb">
            ${youtubeId(r.url)
              ? `<img src="${youtubeThumbnail(r.url)}" alt="" loading="lazy">`
              : '↗'}
          </div>

          <div class="recent-lesson-info">
            <b>${escapeHTML(r.title)}</b>
            <small>
              ${escapeHTML(r.category)} ·
              ${r.language === 'en' ? 'English' : 'ខ្មែរ'}
            </small>
          </div>

          <button data-action="view-resource" data-id="${r.id}">
            បន្ត
          </button>
        </div>
      `).join('')
      : '<div class="resource-empty">មិនទាន់មានមេរៀនទេ។</div>';

    const open = state.tasks.filter(
      t => t.status !== 'done'
    ).slice(0, 4);

    $('#dashboard-tasks').innerHTML = open.length
      ? open.map(t => `
        <div class="dashboard-task">
          <span class="task-mini-icon">✓</span>

          <div>
            <b>${escapeHTML(t.title)}</b>
            <small>
              ${escapeHTML(t.assignee_name || 'មិនទាន់កំណត់')} ·
              ${t.due_date ? formatDate(t.due_date) : 'គ្មានកាលកំណត់'}
            </small>
          </div>

          <span class="task-state">
            ${t.status === 'doing' ? 'IN PROGRESS' : 'TO DO'}
          </span>
        </div>
      `).join('')
      : '<div class="task-empty">មិនមានកិច្ចការបើកចំហទេ។</div>';
  }

  // ==========================================
  // RESOURCE LIBRARY
  // ==========================================

  function filteredResources() {
    const query = ($('#resource-search')?.value || '').trim().toLowerCase();
    const lang = $('#resource-language')?.value || 'all';
    const status = $('#resource-status')?.value || 'all';

    return state.resources.filter(r => {
      const matchesText = !query ||
        [r.title, r.category, r.description, r.url].some(value =>
          String(value || '').toLowerCase().includes(query)
        );

      return matchesText &&
        (lang === 'all' || r.language === lang) &&
        (status === 'all' || r.my_status === status);
    });
  }

  function renderResources() {
    const list = filteredResources();

    $('#library-count').textContent = list.length;

    $('#resource-grid').innerHTML = list.length
      ? list.map((r, index) => {
        const number = String(index + 1).padStart(2, '0');
        const isYoutube = !!youtubeId(r.url);
        const tag = escapeHTML(r.category || 'ទូទៅ');

        const cover = isYoutube
          ? `
            <img
              class="resource-cover-image"
              src="${youtubeThumbnail(r.url)}"
              alt="${escapeHTML(r.title)} thumbnail"
              loading="lazy"
              referrerpolicy="no-referrer"
            >
            <span class="cover-type">YOUTUBE VIDEO</span>
          `
          : '<span class="cover-type">RESOURCE LINK</span>';

        return `
          <article class="resource-card">

            <div
              class="resource-cover ${isYoutube ? 'has-video-thumb' : ''}"
              role="img"
              aria-label="${escapeHTML(r.title)}"
            >
              ${cover}
              <span class="cover-number">${number}</span>
              <span class="cover-play">${isYoutube ? '▶' : '↗'}</span>
            </div>

            <div class="resource-card-body">
              <div class="resource-meta">
                <span class="resource-tag">${tag}</span>
                <span class="resource-language">
                  ${r.language === 'en' ? 'ENGLISH' : 'ខ្មែរ'}
                </span>
              </div>

              <h3>${escapeHTML(r.title)}</h3>

              <p>
                ${escapeHTML(
                  r.description ||
                  (isYoutube
                    ? 'ចុចមើលមេរៀនតាម YouTube player។'
                    : 'Resource link សម្រាប់សិក្សា និងការងារក្រុម។')
                )}
              </p>
            </div>

            <div class="resource-card-footer">

              <select
                class="resource-status-select"
                data-action="resource-status"
                data-id="${r.id}"
                aria-label="ស្ថានភាពមេរៀន"
              >
                <option value="not_started" ${r.my_status === 'not_started' ? 'selected' : ''}>
                  ○ មិនទាន់ចាប់ផ្តើម
                </option>

                <option value="in_progress" ${r.my_status === 'in_progress' ? 'selected' : ''}>
                  ◉ កំពុងរៀន
                </option>

                <option value="completed" ${r.my_status === 'completed' ? 'selected' : ''}>
                  ✓ បានបញ្ចប់
                </option>
              </select>

              <div class="resource-actions">
                <button class="resource-action" data-action="edit-resource" data-id="${r.id}">
                  កែ
                </button>

                <button class="resource-action" data-action="delete-resource" data-id="${r.id}">
                  លុប
                </button>

                <button class="resource-action primary" data-action="view-resource" data-id="${r.id}">
                  ${isYoutube ? 'មើល' : 'បើក'} ↗
                </button>
              </div>

            </div>

          </article>
        `;
      }).join('')
      : '<div class="resource-empty">រកមិនឃើញមេរៀនតាមលក្ខខណ្ឌនេះទេ។</div>';

    $$('.resource-cover-image', $('#resource-grid')).forEach(img => {
      img.addEventListener('error', () => {
        if (img.dataset.fallbackUsed === 'true') return;

        img.dataset.fallbackUsed = 'true';

        const match = img.src.match(/\/vi\/([^/]+)\//);

        if (match) {
          img.src = `https://i.ytimg.com/vi/${match[1]}/hqdefault.jpg`;
        }
      }, { once: true });
    });
  }

  function openResource(id) {
    const resource = state.resources.find(
      r => Number(r.id) === Number(id)
    );

    if (!resource) return;

    state.activeResourceId = Number(id);

    $('#lesson-modal-title').textContent = resource.title;
    $('#lesson-modal-note').textContent =
      resource.description || 'មើលមេរៀន ហើយកំណត់វឌ្ឍនភាពរបស់ក្រុម។';

    $('#modal-progress-status').value =
      resource.my_status || 'not_started';

    const videoId = youtubeId(resource.url);

    if (videoId) {
      $('#lesson-player').innerHTML = `
        <iframe
          src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1"
          title="${escapeHTML(resource.title)}"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerpolicy="strict-origin-when-cross-origin"
          allowfullscreen
        ></iframe>
      `;
    } else {
      const safe = safeHttpUrl(resource.url);

      $('#lesson-player').innerHTML = `
        <div class="resource-empty" style="height:100%;display:grid;align-content:center;gap:10px">
          <b>${escapeHTML(resource.title)}</b>
          <span>Link ប្រភេទនេះត្រូវបើកតាមគេហទំព័រដើម។</span>

          <a
            class="btn btn-primary"
            style="justify-self:center;text-decoration:none"
            href="${escapeHTML(safe)}"
            target="_blank"
            rel="noopener noreferrer"
          >
            បើក Resource ↗
          </a>
        </div>
      `;
    }

    $('#lesson-modal').classList.remove('hidden');
  }

  async function saveProgress(resourceId, status) {
    await api('/api/progress', {
      method: 'POST',
      body: {
        resource_id: Number(resourceId),
        status
      }
    });

    const resource = state.resources.find(
      r => Number(r.id) === Number(resourceId)
    );

    if (resource) resource.my_status = status;

    renderDashboard();
    renderResources();
  }

  async function addResource(data) {
    await api('/api/resources', {
      method: 'POST',
      body: data
    });

    await refreshData();
    toast('បានបន្ថែមមេរៀនថ្មី។');
  }

  // ==========================================
  // KHMER DROPSHIPPING GUIDE
  // ==========================================

  function guideVisualMarkup(id) {
    const art = kind => {
      const drawings = {
        shop: `
          <svg viewBox="0 0 64 54" aria-hidden="true">
            <path d="M9 23h46v25H9z" fill="#dff5ec" stroke="#4aa88e" stroke-width="2"/>
            <path d="M7 22 13 8h38l6 14" fill="#b9e7d6" stroke="#4aa88e" stroke-width="2"/>
            <path d="M7 22c0 5 8 5 8 0 0 5 8 5 8 0 0 5 8 5 8 0 0 5 8 5 8 0 0 5 8 5 8 0 0 5 8 5 8 0" fill="none" stroke="#4aa88e" stroke-width="2"/>
            <path d="M17 31h12v17H17zM36 31h12v9H36z" fill="#fff" stroke="#4aa88e" stroke-width="1.5"/>
          </svg>
        `,

        box: `
          <svg viewBox="0 0 64 54" aria-hidden="true">
            <path d="m8 17 24-11 24 11-24 12z" fill="#f5d9ae" stroke="#c68b4c" stroke-width="2"/>
            <path d="M8 17v25l24 9V29z" fill="#edc38b" stroke="#c68b4c" stroke-width="2"/>
            <path d="M56 17v25l-24 9V29z" fill="#dba96c" stroke="#c68b4c" stroke-width="2"/>
            <path d="M32 6v23m-12-6 12 6 12-6" fill="none" stroke="#c68b4c" stroke-width="2"/>
          </svg>
        `,

        truck: `
          <svg viewBox="0 0 64 54" aria-hidden="true">
            <path d="M5 15h33v25H5z" fill="#d9e9f7" stroke="#6089b3" stroke-width="2"/>
            <path d="M38 23h12l9 10v7H38z" fill="#b9d9eb" stroke="#6089b3" stroke-width="2"/>
            <circle cx="17" cy="42" r="5" fill="#fff" stroke="#527a9c" stroke-width="2"/>
            <circle cx="48" cy="42" r="5" fill="#fff" stroke="#527a9c" stroke-width="2"/>
            <path d="M43 26v7h13" fill="none" stroke="#6089b3" stroke-width="2"/>
          </svg>
        `,

        creator: `
          <svg viewBox="0 0 64 54" aria-hidden="true">
            <rect x="10" y="5" width="44" height="44" rx="7" fill="#e6e1ff" stroke="#8b78d9" stroke-width="2"/>
            <path d="M19 17h26M19 24h22M19 31h18" stroke="#8b78d9" stroke-width="2.5" stroke-linecap="round"/>
            <path d="m22 40 6-5 5 3 8-8" fill="none" stroke="#41a88d" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        `,

        download: `
          <svg viewBox="0 0 64 54" aria-hidden="true">
            <rect x="9" y="5" width="46" height="44" rx="7" fill="#dff5ed" stroke="#4ba88e" stroke-width="2"/>
            <path d="M32 13v21m-8-8 8 8 8-8" fill="none" stroke="#269777" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M19 41h26" stroke="#4ba88e" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        `,

        customer: `
          <svg viewBox="0 0 64 54" aria-hidden="true">
            <circle cx="32" cy="17" r="9" fill="#f4dfc7" stroke="#c98e5c" stroke-width="2"/>
            <path d="M14 48c1-12 8-18 18-18s17 6 18 18" fill="#d8edf5" stroke="#628fa6" stroke-width="2"/>
            <path d="M25 17h14" stroke="#c98e5c" stroke-width="1.5"/>
          </svg>
        `,

        store: `
          <svg viewBox="0 0 64 54" aria-hidden="true">
            <rect x="12" y="8" width="40" height="40" rx="5" fill="#e3efff" stroke="#6f91cf" stroke-width="2"/>
            <rect x="19" y="16" width="26" height="17" rx="2" fill="#fff" stroke="#6f91cf" stroke-width="1.5"/>
            <path d="M23 40h18M26 22h12M26 27h8" stroke="#6f91cf" stroke-width="2" stroke-linecap="round"/>
          </svg>
        `
      };

      return drawings[kind] || drawings.box;
    };

    let nodes = [];

    if (id === 'physical-basics') {
      nodes = [
        ['អតិថិជន', 'ដាក់ order នៅហាង', 'customer'],
        ['ហាង Online', 'ទទួល payment និង order', 'store'],
        ['អ្នកផ្គត់ផ្គង់', 'រៀបចំ និងវេចខ្ចប់', 'box'],
        ['ដឹកជញ្ជូន', 'ផ្ញើទៅអតិថិជន', 'truck']
      ];
    } else if (id === 'digital-basics') {
      nodes = [
        ['ម្ចាស់ស្នាដៃ', 'បង្កើត និងផ្តល់ license', 'creator'],
        ['ហាងរបស់អ្នក', 'បង្ហាញ offer និងតម្លៃ', 'store'],
        ['ប្រព័ន្ធស្វ័យប្រវត្តិ', 'ផ្ញើ file / access link', 'download'],
        ['អ្នកទិញ', 'ទាញយក និងប្រើប្រាស់', 'customer']
      ];
    } else if (id === 'compare') {
      nodes = [
        ['Physical product', 'មានការរៀបចំ និងដឹកទំនិញ', 'box'],
        ['Digital product', 'ផ្ញើ file ឬ access link', 'download']
      ];
    } else {
      return '';
    }

    return `
      <div class="guide-illustration">
        <div class="illustration-head">
          <b>
            រូបភាពឧទាហរណ៍៖
            ${id === 'physical-basics'
              ? 'ដំណើរការ Dropshipping'
              : id === 'digital-basics'
                ? 'ដំណើរការ Digital Product'
                : 'ផលិតផល 2 ប្រភេទ'}
          </b>
          <span>VISUAL EXAMPLE</span>
        </div>

        <div class="illustration-flow">
          ${nodes.map((node, i) => `
            ${i ? '<span class="illustration-arrow">→</span>' : ''}

            <div class="illustration-node">
              <div class="illustration-art">${art(node[2])}</div>
              <b>${node[0]}</b>
              <small>${node[1]}</small>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderGuides() {
    $('#guide-nav').innerHTML = guides.map((guide, i) => `
      <button
        class="${guide.id === state.activeGuideId ? 'active' : ''}"
        data-guide="${escapeHTML(guide.id)}"
      >
        <span>${String(i + 1).padStart(2, '0')}</span>
        ${escapeHTML(guide.title)}
      </button>
    `).join('');

    const guide =
      guides.find(g => g.id === state.activeGuideId) || guides[0];

    if (!guide) return;

    const icons = ['🛍️', '🏪', '📦', '🚚', '✓'];

    $('#guide-article').innerHTML = `
      <div class="guide-article-head">
        <span class="guide-tag">${escapeHTML(guide.tag)}</span>
        <h2>${escapeHTML(guide.title)}</h2>
        <p class="lead">${escapeHTML(guide.lead)}</p>
      </div>

      ${guideVisualMarkup(guide.id)}

      ${guide.examples ? `
        <h4>ឧទាហរណ៍ជាក់ស្តែង</h4>

        <div class="guide-examples">
          ${guide.examples.map(example => `
            <div class="guide-example-card">
              <span>${escapeHTML(example.icon)}</span>

              <div>
                <b>${escapeHTML(example.title)}</b>
                <p>${escapeHTML(example.desc)}</p>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <h4>ចំណុចសំខាន់ៗដែលត្រូវយល់</h4>

      <ul class="guide-bullet-list">
        ${guide.bullets.map(item => `
          <li>${escapeHTML(item)}</li>
        `).join('')}
      </ul>

      <h4>ដំណើរការជាជំហានៗ</h4>

      <div class="flow-diagram">
        ${guide.steps.map((step, i) => `
          ${i ? '<span class="flow-arrow">→</span>' : ''}

          <div class="flow-step">
            <span>${icons[i % icons.length]}</span>
            <b>${escapeHTML(step)}</b>
          </div>
        `).join('')}
      </div>

      <div class="guide-note">${escapeHTML(guide.note)}</div>
    `;

    $('#guide-sources').innerHTML = sources.map(s => `
      <a
        href="${escapeHTML(s.url)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        ${escapeHTML(s.label)} ↗
      </a>
    `).join('');
  }

  // ==========================================
  // PROFIT CALCULATOR
  // ==========================================

  function calculateProfit() {
    const n = id => Math.max(0, Number($(id)?.value || 0));

    const price = n('#calc-price');

    const totalCost =
      n('#calc-cost') +
      n('#calc-fee') +
      n('#calc-ads') +
      n('#calc-reserve');

    const profit = price - totalCost;

    const margin = price > 0
      ? profit / price * 100
      : 0;

    const money = value => `$${value.toFixed(2)}`;

    $('#calc-profit').textContent = money(profit);
    $('#calc-profit').style.color =
      profit >= 0 ? '#5de0b9' : '#ffb0a2';

    $('#calc-margin').textContent = `${margin.toFixed(1)}%`;
    $('#calc-total-cost').textContent = money(totalCost);
  }

  // ==========================================
  // TEAM TASK MANAGEMENT
  // ==========================================

  function renderTasks() {
    const templates = [
      {
        title: 'ស្រាវជ្រាវផលិតផល 10 មុខ',
        desc: 'រកបញ្ហាអតិថិជន តម្រូវការ គូប្រកួត តម្លៃដើម និងគំនិត offer សម្រាប់ផលិតផល 10 មុខ។',
        icon: '⌕'
      },
      {
        title: 'ផ្ទៀងផ្ទាត់ Supplier និង Sample',
        desc: 'សួរអំពី stock, processing time, tracking, return policy ហើយសាកល្បង sample មុនលក់។',
        icon: '▣'
      },
      {
        title: 'រៀបចំ Product Page និង Policies',
        desc: 'សរសេរចំណងជើង ពិពណ៌នា រូបភាពមានសិទ្ធិប្រើ តម្លៃ ដឹកជញ្ជូន និង Refund policy។',
        icon: '▤'
      },
      {
        title: 'បង្កើត Content 3 ជម្រើស',
        desc: 'ផលិត creative 3 របៀប ដោយបង្ហាញបញ្ហា អត្ថប្រយោជន៍ និងព័ត៌មានពិតរបស់ផលិតផល។',
        icon: '✧'
      },
      {
        title: 'រៀបចំ Customer Support SOP',
        desc: 'រៀបចំចម្លើយសំណួរញឹកញាប់ order tracking, delivery delay, return និង refund។',
        icon: '◌'
      }
    ];

    $('#task-templates').innerHTML = templates.map((item, index) => `
      <article class="task-template">
        <div class="template-icon">${item.icon}</div>
        <span class="template-number">0${index + 1}</span>
        <b>${escapeHTML(item.title)}</b>
        <p>${escapeHTML(item.desc)}</p>

        <button data-action="create-template-task" data-index="${index}">
          បន្ថែមកិច្ចការ +
        </button>
      </article>
    `).join('');

    const todo = state.tasks.filter(t => t.status === 'todo');
    const doing = state.tasks.filter(t => t.status === 'doing');
    const done = state.tasks.filter(t => t.status === 'done');

    $('#task-summary-strip').innerHTML = [
      ['ត្រូវធ្វើ', todo.length, 'todo-dot'],
      ['កំពុងធ្វើ', doing.length, 'doing-dot'],
      ['បានបញ្ចប់', done.length, 'done-dot']
    ].map(([label, count, dot]) => `
      <div class="task-summary">
        <span>
          <i class="column-dot ${dot}" style="display:inline-block;margin-right:7px"></i>
          ${label}
        </span>
        <b>${count}</b>
      </div>
    `).join('');

    const columns = [
      ['todo', 'ត្រូវធ្វើ', todo, 'todo-dot'],
      ['doing', 'កំពុងធ្វើ', doing, 'doing-dot'],
      ['done', 'បានបញ្ចប់', done, 'done-dot']
    ];

    $('#task-board').innerHTML = columns.map(([status, label, items, dot]) => `
      <section class="task-column">

        <div class="task-column-head">
          <div class="task-column-title">
            <i class="column-dot ${dot}"></i>
            ${label}
          </div>
          <span>${items.length}</span>
        </div>

        <div class="task-column-list">
          ${items.length
            ? items.map(task => `
              <article class="task-card">

                <div class="task-card-top">
                  <h4>${escapeHTML(task.title)}</h4>
                  <button
                    class="task-delete"
                    data-action="delete-task"
                    data-id="${task.id}"
                    title="លុប"
                  >×</button>
                </div>

                ${task.description
                  ? `<p>${escapeHTML(task.description)}</p>`
                  : ''}

                <div class="task-card-foot">
                  <span class="task-assignee">
                    <i>${escapeHTML(initials(task.assignee_name || '—'))}</i>
                    ${escapeHTML(task.assignee_name || 'មិនទាន់កំណត់')}
                  </span>

                  <span class="task-due">
                    ${task.due_date ? formatDate(task.due_date) : '—'}
                  </span>
                </div>

                <select
                  data-action="task-status"
                  data-id="${task.id}"
                  aria-label="ស្ថានភាពកិច្ចការ"
                >
                  <option value="todo" ${status === 'todo' ? 'selected' : ''}>ត្រូវធ្វើ</option>
                  <option value="doing" ${status === 'doing' ? 'selected' : ''}>កំពុងធ្វើ</option>
                  <option value="done" ${status === 'done' ? 'selected' : ''}>បានបញ្ចប់</option>
                </select>

              </article>
            `).join('')
            : '<div class="task-empty">មិនមានកិច្ចការនៅទីនេះទេ។</div>'
          }
        </div>
      </section>
    `).join('');
  }

  // ==========================================
  // MEDIA LIBRARY
  // ==========================================

  function mediaPreview(file) {
    const src = `/media/${file.id}`;

    if (file.media_type === 'image') {
      return `<img src="${src}" alt="${escapeHTML(file.original_name)}" loading="lazy">`;
    }

    if (file.media_type === 'video') {
      return `<video src="${src}" controls preload="metadata"></video>`;
    }

    if (file.media_type === 'audio') {
      return `
        <div style="padding:15px;width:100%">
          <span style="color:#8fe1c4;font-size:23px">♫</span>
          <audio controls preload="metadata" src="${src}"></audio>
        </div>
      `;
    }

    return '<span style="color:#a9b6c2">FILE</span>';
  }

  function renderMedia() {
    $('#media-count').textContent = state.uploads.length;

    const images = state.uploads.filter(
      f => f.media_type === 'image'
    );

    const videos = state.uploads.filter(
      f => f.media_type === 'video'
    );

    const assets = state.uploads;

    $('#download-images-zip').disabled =
      state.selectedImages.size === 0;

    $('#media-library').innerHTML = assets.length
      ? assets.map(file => `
        <article class="media-item">

          <div class="media-preview">

            ${file.media_type === 'image' ? `
              <input
                class="media-select"
                type="checkbox"
                data-action="select-image"
                data-id="${file.id}"
                ${state.selectedImages.has(Number(file.id)) ? 'checked' : ''}
                aria-label="ជ្រើសរូបភាព"
              >
            ` : ''}

            ${mediaPreview(file)}
          </div>

          <div class="media-item-info">
            <b title="${escapeHTML(file.original_name)}">
              ${escapeHTML(file.original_name)}
            </b>

            <small>
              ${file.media_type.toUpperCase()} ·
              ${formatBytes(file.size)} ·
              ${escapeHTML(file.uploader_name || 'Team')}
            </small>
          </div>

          <div class="media-item-actions">
            <a href="/download/${file.id}">Download ↓</a>

            ${file.media_type === 'video' ? `
              <button data-action="select-video" data-id="${file.id}">
                បម្លែង
              </button>
            ` : ''}

            <button
              data-action="delete-upload"
              data-id="${file.id}"
              title="លុប"
            >លុប</button>
          </div>

        </article>
      `).join('')
      : `
        <div class="empty-library">
          <span>▧</span>
          <b>មិនទាន់មានឯកសារ</b>
          <p>ផ្ទុករូបភាព ឬវីដេអូរបស់ក្រុម ដើម្បីចាប់ផ្តើម។</p>
        </div>
      `;

    if (
      state.selectedVideoId &&
      !videos.some(v => Number(v.id) === Number(state.selectedVideoId))
    ) {
      state.selectedVideoId = null;
    }

    const selectedVideo =
      videos.find(v => Number(v.id) === Number(state.selectedVideoId)) ||
      videos[0];

    if (!state.selectedVideoId && selectedVideo) {
      state.selectedVideoId = Number(selectedVideo.id);
    }

    $('#video-process-area').innerHTML = selectedVideo ? `
      <div class="video-tools-layout">

        <div class="video-tools-preview">
          <video
            src="/media/${selectedVideo.id}"
            controls
            preload="metadata"
          ></video>
        </div>

        <div class="video-tools-controls">

          <div class="video-tools-file">
            <b>${escapeHTML(selectedVideo.original_name)}</b>
            <small>${formatBytes(selectedVideo.size)} · original uploaded file</small>
          </div>

          <div class="video-process-row">

            <label for="video-process-quality">
              គុណភាព / ទម្រង់
            </label>

            <select id="video-process-quality">
              <option value="480p">480p</option>
              <option value="720p">720p HD</option>
              <option value="1080p">1080p Full HD</option>
              <option value="2160p">4K (2160p)</option>
              <option value="mp3">MP3 Audio + cover art</option>
            </select>

            <button
              class="btn btn-primary btn-small"
              id="run-video-process"
            >
              បង្កើត និងទាញយក
            </button>

            <a
              class="btn btn-outline btn-small"
              href="/download/${selectedVideo.id}"
            >
              ទាញយកវីដេអូដើម ↓
            </a>

            <small>
              ជម្រើស resolution ត្រូវតែស្មើ ឬទាបជាងវីដេអូដើម។
              MP3 នឹងដាក់ឈ្មោះឯកសារ និងយករូប cover ពីវីដេអូ
              ប្រសិនបើអាចធ្វើបាន។
            </small>

          </div>

          <div id="video-process-feedback" class="video-process-result"></div>

        </div>
      </div>
    ` : `
      <div class="video-tools-empty">
        <b>មិនទាន់មានវីដេអូសម្រាប់ទាញយក ឬបម្លែងទេ។</b>

        <p>
          សូមផ្ទុក MP4, MOV ឬ WEBM ដែលក្រុមមានសិទ្ធិប្រើ។
          បន្ទាប់មកអ្នកនឹងឃើញ player, ទាញយក original,
          480p / HD / Full HD / 4K និង MP3 នៅទីនេះ។
        </p>

        <button
          class="btn btn-primary btn-small"
          type="button"
          id="open-video-upload"
        >
          ＋ ផ្ទុកវីដេអូឥឡូវនេះ
        </button>
      </div>
    `;
  }

  // ==========================================
  // LINK DETECTION
  // ==========================================

  function classifyMediaUrl(raw) {
    const safe = safeHttpUrl(raw);

    if (!safe) {
      return {
        kind: 'invalid',
        title: 'Link មិនត្រឹមត្រូវ',
        detail: 'សូមបញ្ចូល URL ដែលចាប់ផ្តើមដោយ http:// ឬ https://។'
      };
    }

    const url = new URL(safe);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const ext = url.pathname.split('.').pop()?.toLowerCase() || '';

    const imgExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
    const videoExt = ['mp4', 'webm', 'mov', 'm4v', 'mkv'].includes(ext);
    const audioExt = ['mp3', 'wav', 'm4a'].includes(ext);

    if (youtubeId(safe)) {
      return {
        kind: 'youtube',
        title: 'កំពុងទាញយកចំណងជើងវីដេអូ...',
        detail: 'ប្រព័ន្ធកំពុងរកព័ត៌មាន title, channel និង thumbnail សាធារណៈរបស់វីដេអូ។',
        url: safe,
        platform: 'YouTube',
        thumbnail_url: youtubeThumbnail(safe)
      };
    }

    if (imgExt) {
      return {
        kind: 'image',
        title: 'Direct image link',
        detail: 'ប្រព័ន្ធស្គាល់ថា link នេះបញ្ចប់ដោយប្រភេទរូបភាព។ បើ server អនុញ្ញាត អ្នកអាច preview បាន។',
        url: safe,
        platform: 'Image file'
      };
    }

    if (videoExt) {
      return {
        kind: 'video',
        title: 'Direct video link',
        detail: 'ប្រព័ន្ធស្គាល់ថា link នេះបញ្ចប់ដោយប្រភេទវីដេអូ។ ការចាក់ preview អាស្រ័យលើ server ដើម។',
        url: safe,
        platform: 'Video file'
      };
    }

    if (audioExt) {
      return {
        kind: 'audio',
        title: 'Direct audio link',
        detail: 'ប្រព័ន្ធស្គាល់ថា link នេះជាប្រភេទ audio file។',
        url: safe,
        platform: 'Audio file'
      };
    }

    const networks = [
      ['tiktok.com', 'TikTok'],
      ['instagram.com', 'Instagram'],
      ['facebook.com', 'Facebook'],
      ['fb.watch', 'Facebook'],
      ['pinterest.com', 'Pinterest'],
      ['pin.it', 'Pinterest'],
      ['x.com', 'X'],
      ['twitter.com', 'X'],
      ['vimeo.com', 'Vimeo'],
      ['snapchat.com', 'Snapchat'],
      ['threads.net', 'Threads'],
      ['linkedin.com', 'LinkedIn'],
      ['reddit.com', 'Reddit'],
      ['twitch.tv', 'Twitch'],
      ['dailymotion.com', 'Dailymotion'],
      ['streamable.com', 'Streamable'],
      ['vk.com', 'VK'],
      ['weibo.com', 'Weibo'],
      ['bilibili.com', 'Bilibili'],
      ['t.me', 'Telegram'],
      ['telegram.me', 'Telegram']
    ];

    const match = networks.find(([domain]) =>
      host === domain || host.endsWith(`.${domain}`)
    );

    if (match) {
      return {
        kind: 'social',
        title: `${match[1]} post`,
        detail: 'អាចពិនិត្យប្រភេទ platform និងរក្សាទុក link ជា resource បាន។ មិនអាចទាញយកពីគ្រប់ account ឬរំលង privacy/DRM/watermark របស់ platform បានទេ។',
        url: safe,
        platform: match[1]
      };
    }

    return {
      kind: 'link',
      title: 'Website / resource link',
      detail: 'អាចរក្សាទុកជា resource និងបើកតាមគេហទំព័រដើម។',
      url: safe,
      platform: host
    };
  }

  function renderLinkCheck(result) {
    const box = $('#link-check-result');

    if (result.kind === 'invalid') {
      box.className = 'link-check-result';

      box.innerHTML = `
        <span class="empty-icon">!</span>

        <div>
          <b class="link-result-title">${escapeHTML(result.title)}</b>
          <div class="link-result-sub">${escapeHTML(result.detail)}</div>
        </div>
      `;

      state.pendingMediaPreview = null;
      return;
    }

    state.pendingMediaUrl = result.url;
    state.pendingMediaPreview = result;

    let banner = '';

    if (result.thumbnail_url) {
      banner = `
        <div class="media-link-banner">
          <img
            src="${escapeHTML(result.thumbnail_url)}"
            alt="Video thumbnail"
            referrerpolicy="no-referrer"
          >
          <span class="media-link-play">▶</span>
          <small>YOUTUBE VIDEO PREVIEW</small>
        </div>
      `;
    } else if (result.kind === 'image' && result.download_supported) {
      banner = `
        <div class="media-link-banner direct-image-banner">
          <img src="${escapeHTML(result.url)}" alt="Direct image preview" loading="lazy">
          <small>DIRECT IMAGE PREVIEW</small>
        </div>
      `;
    } else if (result.kind === 'video' && result.download_supported) {
      banner = `
        <div class="media-link-banner direct-video-banner">
          <video src="${escapeHTML(result.url)}" controls preload="metadata"></video>
          <small>DIRECT VIDEO PREVIEW</small>
        </div>
      `;
    } else if (result.kind === 'audio' && result.download_supported) {
      banner = `
        <div class="media-link-banner direct-audio-banner">
          <audio src="${escapeHTML(result.url)}" controls preload="metadata"></audio>
          <small>DIRECT AUDIO PREVIEW</small>
        </div>
      `;
    }

    const rightsChecked = $('#media-rights-confirm')?.checked;

    const downloadButton = result.download_supported
      ? `<button data-action="import-checked-media" class="btn btn-primary btn-small">Import to Team Library ↓</button>`
      : '';

    const saveLessonButton =
      (result.kind === 'youtube' || result.kind === 'social' || result.kind === 'link')
        ? `<button data-action="save-checked-link">រក្សាទុកជា Resource</button>`
        : '';

    const openLink = `
      <a href="${escapeHTML(result.url)}" target="_blank" rel="noopener noreferrer">
        បើក Link ដើម ↗
      </a>
    `;

    const typeLabel =
      result.kind === 'youtube'
        ? 'YOUTUBE'
        : result.kind === 'social'
          ? escapeHTML(result.platform || 'SOCIAL POST')
          : escapeHTML((result.kind || 'MEDIA').toUpperCase());

    box.className =
      `link-check-result ${banner ? 'has-link-banner' : ''} ${result.download_supported ? 'direct-media-result' : ''}`;

    box.innerHTML = `
      ${banner}

      <div class="link-check-copy">
        <span class="result-type-pill">${typeLabel}</span>

        <b class="link-result-title">
          ${escapeHTML(result.title || result.file_name || 'Media detected')}
        </b>

        ${result.author_name
          ? `<div class="link-result-sub">Channel: ${escapeHTML(result.author_name)}</div>`
          : ''}

        <div class="link-result-sub">
          ${escapeHTML(result.detail || '')}
        </div>

        ${result.file_name
          ? `<div class="link-result-sub">File: ${escapeHTML(result.file_name)}${result.size ? ` · ${formatBytes(result.size)}` : ''}</div>`
          : ''}
      </div>

      <div class="link-result-actions">
        ${downloadButton}
        ${saveLessonButton}
        ${openLink}
      </div>

      ${result.download_supported && !rightsChecked
        ? '<small class="rights-hint">សូមធីកប្រអប់បញ្ជាក់សិទ្ធិខាងលើ មុន import file។</small>'
        : ''}
    `;

    const img = box.querySelector('.media-link-banner img');

    if (img) {
      img.addEventListener('error', () => {
        img.closest('.media-link-banner')?.classList.add('thumbnail-unavailable');
      }, { once: true });
    }
  }

  async function inspectMediaLink() {
    const result = classifyMediaUrl($('#media-link-input').value.trim());

    if (result.kind === 'youtube') {
      renderLinkCheck({
        ...result,
        title: 'កំពុងពិនិត្យវីដេអូ...',
        detail: 'កំពុងទាញ metadata និង thumbnail សាធារណៈពី YouTube។'
      });

      try {
        const metadata = await fetchYoutubeMetadata(result.url);

        renderLinkCheck({
          ...result,
          ...metadata,
          detail: metadata.metadata_fallback
            ? 'មិនអាចទាញ metadata ពិតបានទេ។ អ្នកអាចបើកវីដេអូតាម YouTube player និងរក្សាទុកជា resource ប៉ុណ្ណោះ។'
            : `វីដេអូសាធារណៈ · ${metadata.author_name || 'YouTube'} · ការទាញយកត្រូវប្រើមុខងារផ្លូវការរបស់ YouTube។`
        });

      } catch {
        renderLinkCheck({
          ...result,
          detail: 'មិនអាចទាញ metadata បានទេ ប៉ុន្តែអាចបើក link ដើម។'
        });
      }

      return;
    }

    if (['image', 'video', 'audio', 'link'].includes(result.kind)) {
      renderLinkCheck({
        ...result,
        title: 'កំពុងពិនិត្យ file type...',
        detail: 'កំពុងពិនិត្យ Content-Type និងទំហំឯកសារពី public media URL។'
      });

      try {
        const checked = await api(
          `/api/media/inspect?url=${encodeURIComponent(result.url)}`
        );

        renderLinkCheck({
          ...result,
          ...checked,
          title: checked.file_name,
          detail: `${checked.kind.toUpperCase()} file detected · ${checked.mime_type}. អាច import ទៅក្នុង Team Library ហើយទាញយក ឬបម្លែងបន្ទាប់បាន។`
        });

      } catch (error) {
        renderLinkCheck({
          ...result,
          download_supported: false,
          detail: `${error.message} URL អាចជាទំព័រ web មិនមែន direct file link។`
        });
      }

      return;
    }

    renderLinkCheck(result);
  }

  // ==========================================
  // BULK IMAGE ZIP DOWNLOAD
  // ==========================================

  async function downloadImageZip() {
    if (!state.selectedImages.size) return;

    try {
      const response = await fetch('/api/media/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...state.selectedImages] })
      });

      if (!response.ok) {
        const error = await response.json().catch(
          () => ({ error: 'ZIP មិនអាចបង្កើតបានទេ។' })
        );
        throw new Error(error.error);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'team-images.zip';

      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);

      toast('បានបង្កើត ZIP សម្រាប់រូបភាពដែលបានជ្រើស។');

    } catch (error) {
      toast(error.message, 'error');
    }
  }

  // ==========================================
  // TEAM WORKSPACE
  // ==========================================

  function renderTeam() {
    const shared =
      state.members.find(member => member.id === state.user?.id) ||
      state.members[0];

    const done = shared?.completed_lessons || 0;

    const open = state.tasks.filter(
      task => task.status !== 'done'
    ).length;

    $('#team-grid').innerHTML = `
      <article class="member-card">

        <div class="member-head">
          <div class="member-avatar">T</div>

          <div class="member-info">
            <b>Workspace រួមរបស់ក្រុម</b>
            <small>សមាជិកគ្រប់គ្នាប្រើការចូលប្រើដូចគ្នា</small>
          </div>

          <span class="role-tag">SHARED</span>
        </div>

        <div class="member-stats">
          <div>
            <span>មេរៀនបានបញ្ចប់ក្នុង Workspace</span>
            <b>${done}</b>
          </div>

          <div>
            <span>កិច្ចការនៅសល់</span>
            <b>${open}</b>
          </div>
        </div>

      </article>
    `;
  }

  // ==========================================
  // NAVIGATION
  // ==========================================

  $$('.nav-item[data-view]').forEach(button => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });

  $$('[data-jump]').forEach(button => {
    button.addEventListener('click', () => setView(button.dataset.jump));
  });

  $('#mobile-menu').addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
  });

  document.addEventListener('click', event => {
    if (
      window.innerWidth <= 760 &&
      $('#sidebar').classList.contains('open') &&
      !event.target.closest('#sidebar') &&
      !event.target.closest('#mobile-menu')
    ) {
      $('#sidebar').classList.remove('open');
    }
  });

  // ==========================================
  // ADD AND IMPORT RESOURCES
  // ==========================================

  $('#toggle-add-resource').addEventListener('click', () => {
    $('#add-resource-panel').classList.toggle('hidden');
  });

  $('#close-add-resource').addEventListener('click', () => {
    $('#add-resource-panel').classList.add('hidden');
  });

  const resourceTitleInput = $('#resource-form [name=title]');
  const resourceUrlInput = $('#resource-form [name=url]');

  async function autoFillResourceTitle() {
    const url = resourceUrlInput.value.trim();
    if (!youtubeId(url)) return;

    try {
      const metadata = await fetchYoutubeMetadata(url);

      if (
        metadata?.title &&
        !metadata.metadata_fallback &&
        (
          !resourceTitleInput.value.trim() ||
          resourceTitleInput.dataset.autoTitle === 'true'
        )
      ) {
        resourceTitleInput.value = metadata.title;
        resourceTitleInput.dataset.autoTitle = 'true';
      }

    } catch (error) {
      console.debug('Cannot auto-fill video title:', error.message);
    }
  }

  resourceUrlInput.addEventListener('change', autoFillResourceTitle);
  resourceUrlInput.addEventListener('blur', autoFillResourceTitle);

  resourceTitleInput.addEventListener('input', () => {
    resourceTitleInput.dataset.autoTitle = 'false';
  });

  $('#resource-form').addEventListener('submit', async event => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    try {
      let title = String(form.get('title') || '').trim();
      const url = String(form.get('url') || '').trim();

      if (!title && youtubeId(url)) {
        const metadata = await fetchYoutubeMetadata(url);
        title = !metadata?.metadata_fallback ? (metadata?.title || '') : '';
      }

      if (!title) {
        throw new Error('សូមបញ្ចូលចំណងជើង ឬបិទភ្ជាប់ YouTube link ដើម្បីទាញចំណងជើងស្វ័យប្រវត្តិ។');
      }

      await addResource({
        title,
        url,
        category: form.get('category'),
        language: form.get('language'),
        description: form.get('description')
      });

      event.currentTarget.reset();
      $('#add-resource-panel').classList.add('hidden');

    } catch (error) {
      toast(error.message, 'error');
    }
  });

  $('#bulk-links').addEventListener('input', event => {
    const count = event.currentTarget.value
      .split(/\r?\n/)
      .map(x => x.trim())
      .filter(Boolean)
      .length;

    $('#bulk-count').textContent = `${count} lines · up to 200`;
  });

  $('#bulk-import-btn').addEventListener('click', async () => {
    const lines = $('#bulk-links').value
      .split(/\r?\n/)
      .map(x => x.trim())
      .filter(Boolean);

    if (!lines.length) {
      return toast('សូមដាក់ link មុននាំចូល។', 'error');
    }

    if (lines.length > 200) {
      return toast('អាចនាំចូលបានអតិបរមា 200 link ក្នុងមួយដង។', 'error');
    }

    const items = lines.map(line => {
      const splitAt = line.indexOf('|');

      const title = splitAt >= 0
        ? line.slice(0, splitAt).trim()
        : '';

      const url = splitAt >= 0
        ? line.slice(splitAt + 1).trim()
        : line;

      return {
        title: title || undefined,
        url,
        category: $('#bulk-category').value || 'មេរៀនថ្មី',
        language: $('#bulk-language').value || 'km'
      };
    });

    try {
      const data = await api('/api/resources/bulk', {
        method: 'POST',
        body: { items }
      });

      $('#bulk-links').value = '';
      $('#bulk-count').textContent = '0 links detected';

      await refreshData();
      toast(`បាននាំចូល ${data.imported} link។`);

      hydrateSeedVideoTitles();

    } catch (error) {
      toast(error.message, 'error');
    }
  });

  $('#resource-search').addEventListener('input', renderResources);
  $('#resource-language').addEventListener('change', renderResources);
  $('#resource-status').addEventListener('change', renderResources);

  $('#export-resources').addEventListener('click', () => {
    const data = state.resources.map(({
      id,
      title,
      url,
      category,
      language,
      description,
      my_status
    }) => ({
      id,
      title,
      url,
      category,
      language,
      description,
      my_status
    }));

    const blob = new Blob(
      [JSON.stringify(data, null, 2)],
      { type: 'application/json' }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = 'team-learning-links.json';

    a.click();
    URL.revokeObjectURL(url);
  });

  // ==========================================
  // RESOURCE CARD ACTIONS
  // ==========================================

  $('#resource-grid').addEventListener('click', async event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;

    const id = Number(button.dataset.id);
    const action = button.dataset.action;

    const resource = state.resources.find(
      r => Number(r.id) === id
    );

    if (!resource) return;

    if (action === 'view-resource') {
      return openResource(id);
    }

    if (action === 'edit-resource') {
      const title = prompt('កែចំណងជើងមេរៀន៖', resource.title);
      if (title === null || title.trim().length < 2) return;

      const url = prompt('កែ URL៖', resource.url);
      if (url === null) return;

      const description = prompt(
        'កែសង្ខេប / កំណត់ចំណាំ៖',
        resource.description || ''
      );

      if (description === null) return;

      try {
        await api(`/api/resources/${id}`, {
          method: 'PATCH',
          body: { title, url, description }
        });

        await refreshData();
        toast('បានកែប្រែមេរៀន។');

      } catch (error) {
        toast(error.message, 'error');
      }
    }

    if (action === 'delete-resource') {
      if (!confirm('តើអ្នកប្រាកដថាចង់លុបមេរៀននេះចេញពីបណ្ណាល័យទេ?')) return;

      try {
        await api(`/api/resources/${id}`, { method: 'DELETE' });
        await refreshData();
        toast('បានលុបមេរៀន។');

      } catch (error) {
        toast(error.message, 'error');
      }
    }
  });

  $('#resource-grid').addEventListener('change', async event => {
    const select = event.target.closest('[data-action="resource-status"]');
    if (!select) return;

    try {
      await saveProgress(select.dataset.id, select.value);
      toast('បានរក្សាទុកវឌ្ឍនភាព។');

    } catch (error) {
      toast(error.message, 'error');
    }
  });

  // ==========================================
  // LESSON MODAL
  // ==========================================

  $('#close-lesson-modal').addEventListener('click', () => {
    $('#lesson-modal').classList.add('hidden');
    $('#lesson-player').innerHTML = '';
  });

  $('#lesson-modal').addEventListener('click', event => {
    if (event.target === $('#lesson-modal')) {
      $('#lesson-modal').classList.add('hidden');
      $('#lesson-player').innerHTML = '';
    }
  });

  $('#modal-progress-status').addEventListener('change', async event => {
    if (!state.activeResourceId) return;

    try {
      await saveProgress(state.activeResourceId, event.target.value);
      toast('បានធ្វើបច្ចុប្បន្នភាពវឌ្ឍនភាព។');

    } catch (error) {
      toast(error.message, 'error');
    }
  });

  // ==========================================
  // GUIDE / CALCULATOR
  // ==========================================

  $('#guide-nav').addEventListener('click', event => {
    const button = event.target.closest('[data-guide]');
    if (!button) return;

    state.activeGuideId = button.dataset.guide;
    renderGuides();
  });

  [
    '#calc-price',
    '#calc-cost',
    '#calc-fee',
    '#calc-ads',
    '#calc-reserve'
  ].forEach(id => {
    $(id).addEventListener('input', calculateProfit);
  });

  // ==========================================
  // TASK FORM
  // ==========================================

  $('#toggle-task-form').addEventListener('click', () => {
    $('#task-create-panel').classList.toggle('hidden');
  });

  $('#close-task-form').addEventListener('click', () => {
    $('#task-create-panel').classList.add('hidden');
  });

  $('#task-form').addEventListener('submit', async event => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    try {
      await api('/api/tasks', {
        method: 'POST',
        body: {
          title: form.get('title'),
          description: form.get('description'),
          assignee_name: form.get('assignee_name'),
          due_date: form.get('due_date')
        }
      });

      event.currentTarget.reset();
      $('#task-create-panel').classList.add('hidden');

      await refreshData();
      toast('បានបង្កើតកិច្ចការថ្មី។');

    } catch (error) {
      toast(error.message, 'error');
    }
  });

  $('#task-board').addEventListener('change', async event => {
    const select = event.target.closest('[data-action="task-status"]');
    if (!select) return;

    try {
      await api(`/api/tasks/${select.dataset.id}`, {
        method: 'PATCH',
        body: { status: select.value }
      });

      await refreshData();
      toast('បានកែស្ថានភាពកិច្ចការ។');

    } catch (error) {
      toast(error.message, 'error');
    }
  });

  $('#task-board').addEventListener('click', async event => {
    const button = event.target.closest('[data-action="delete-task"]');
    if (!button) return;

    if (!confirm('តើអ្នកប្រាកដថាចង់លុបកិច្ចការនេះទេ?')) return;

    try {
      await api(`/api/tasks/${button.dataset.id}`, { method: 'DELETE' });
      await refreshData();
      toast('បានលុបកិច្ចការ។');

    } catch (error) {
      toast(error.message, 'error');
    }
  });

  $('#task-templates').addEventListener('click', async event => {
    const button = event.target.closest('[data-action="create-template-task"]');
    if (!button) return;

    const templates = [
      ['ស្រាវជ្រាវផលិតផល 10 មុខ', 'រកបញ្ហាអតិថិជន តម្រូវការ គូប្រកួត តម្លៃដើម និងគំនិត offer សម្រាប់ផលិតផល 10 មុខ។'],
      ['ផ្ទៀងផ្ទាត់ Supplier និង Sample', 'សួរអំពី stock, processing time, tracking, return policy ហើយសាកល្បង sample មុនលក់។'],
      ['រៀបចំ Product Page និង Policies', 'សរសេរចំណងជើង ពិពណ៌នា រូបភាពមានសិទ្ធិប្រើ តម្លៃ ដឹកជញ្ជូន និង Refund policy។'],
      ['បង្កើត Content 3 ជម្រើស', 'ផលិត creative 3 របៀប ដោយបង្ហាញបញ្ហា អត្ថប្រយោជន៍ និងព័ត៌មានពិតរបស់ផលិតផល។'],
      ['រៀបចំ Customer Support SOP', 'រៀបចំចម្លើយសំណួរញឹកញាប់ order tracking, delivery delay, return និង refund។']
    ];

    const item = templates[Number(button.dataset.index)];
    if (!item) return;

    button.disabled = true;

    try {
      await api('/api/tasks', {
        method: 'POST',
        body: {
          title: item[0],
          description: item[1],
          assignee_id: state.user.id,
          assignee_name: 'ក្រុមការងារ',
          due_date: ''
        }
      });

      await refreshData();
      toast('បានបន្ថែមកិច្ចការណែនាំ។');

    } catch (error) {
      toast(error.message, 'error');
      button.disabled = false;
    }
  });

  // ==========================================
  // MEDIA LINK CHECKER AND IMPORTER
  // ==========================================

  $('#check-media-link').addEventListener('click', inspectMediaLink);

  $('#media-link-input').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      $('#check-media-link').click();
    }
  });

  $('#link-check-result').addEventListener('click', async event => {
    const button = event.target.closest('[data-action]');

    if (!button || !state.pendingMediaUrl) return;

    const result =
      state.pendingMediaPreview ||
      classifyMediaUrl(state.pendingMediaUrl);

    if (button.dataset.action === 'import-checked-media') {
      if (!$('#media-rights-confirm').checked) {
        return toast('សូមបញ្ជាក់សិទ្ធិប្រើប្រាស់ file ជាមុនសិន។', 'error');
      }

      button.disabled = true;
      button.textContent = 'កំពុង Import...';

      try {
        const data = await api('/api/media/import', {
          method: 'POST',
          body: {
            url: result.final_url || result.url,
            confirm_rights: true
          }
        });

        await refreshData();

        if (data.file.media_type === 'video') {
          state.selectedVideoId = Number(data.file.id);
        }

        renderMedia();

        toast(`បានរក្សាទុក ${data.file.original_name} ក្នុង Team Library។`);

        $('#video-process-area').scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });

      } catch (error) {
        toast(error.message, 'error');
        button.disabled = false;
        button.textContent = 'Import to Team Library ↓';
      }

      return;
    }

    if (button.dataset.action === 'save-checked-link') {
      const defaultTitle =
        result.title ||
        (result.platform
          ? `${result.platform} resource`
          : 'Resource link — team');

      const title = prompt(
        'ចំណងជើង (បានទាញពីវីដេអូដោយស្វ័យប្រវត្តិ)៖',
        defaultTitle
      );

      if (title === null || title.trim().length < 2) return;

      try {
        await addResource({
          title,
          url: result.url,
          category: result.platform || 'Resource',
          language: 'km',
          description: result.author_name
            ? `Video by ${result.author_name}`
            : result.detail
        });

        setView('courses');

      } catch (error) {
        toast(error.message, 'error');
      }
    }
  });

  // ==========================================
  // BULK IMAGE URL IMPORT AND ZIP
  // ==========================================

  $('#download-bulk-images').addEventListener('click', async () => {
    if (!$('#media-rights-confirm').checked) {
      return toast('សូមបញ្ជាក់ថាអ្នកជាម្ចាស់រូបភាព ឬមានសិទ្ធិប្រើប្រាស់វា។', 'error');
    }

    const urls = $('#bulk-image-urls').value
      .split(/\r?\n/)
      .map(x => x.trim())
      .filter(Boolean);

    if (urls.length < 2) {
      return toast('សូមដាក់ direct image links យ៉ាងតិច 2។', 'error');
    }

    if (urls.length > 100) {
      return toast('អាចដាក់បានអតិបរមា 100 links ក្នុងមួយដង។', 'error');
    }

    const button = $('#download-bulk-images');

    button.disabled = true;
    button.textContent = 'កំពុងទាញយករូបភាព...';

    const imported = [];

    try {
      for (let i = 0; i < urls.length; i += 3) {
        const batch = urls.slice(i, i + 3);

        const checked = await Promise.all(
          batch.map(url =>
            api(`/api/media/inspect?url=${encodeURIComponent(url)}`)
          )
        );

        if (checked.some(item => item.kind !== 'image')) {
          throw new Error(
            'ZIP រូបភាពទទួលយកតែ direct image links ប៉ុណ្ណោះ។ សូមដក video/audio links ចេញ។'
          );
        }

        const results = await Promise.all(
          batch.map(url =>
            api('/api/media/import', {
              method: 'POST',
              body: {
                url,
                confirm_rights: true
              }
            })
          )
        );

        results.forEach(item => {
          if (item.file?.media_type === 'image') {
            imported.push(Number(item.file.id));
          }
        });
      }

      if (imported.length < 2) {
        throw new Error('ត្រូវមានរូបភាពយ៉ាងតិច 2 ដើម្បីបង្កើត ZIP។');
      }

      await refreshData();

      const response = await fetch('/api/media/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: imported })
      });

      if (!response.ok) {
        const e = await response.json().catch(() => ({}));
        throw new Error(e.error || 'មិនអាចបង្កើត ZIP បានទេ។');
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = 'team-images-from-links.zip';

      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(blobUrl);

      state.selectedImages = new Set(imported);

      renderMedia();

      $('#bulk-image-urls').value = '';

      toast(`បាន Import និង ZIP រូបភាព ${imported.length}។`);

    } catch (error) {
      toast(error.message, 'error');

    } finally {
      button.disabled = false;
      button.textContent = 'ពិនិត្យ និងបង្កើត ZIP ពី Links';
    }
  });

  // ==========================================
  // FILE UPLOAD
  // ==========================================

  async function uploadSelectedFiles(files) {
    const formData = new FormData();

    [...files].forEach(file => {
      formData.append('files', file);
    });

    $('#upload-progress').classList.remove('hidden');

    try {
      const data = await api('/api/uploads', {
        method: 'POST',
        body: formData
      });

      toast(`បានផ្ទុកឯកសារ ${data.files.length}។`);

      await refreshData();

    } catch (error) {
      toast(error.message, 'error');

    } finally {
      $('#upload-progress').classList.add('hidden');
      $('#media-files').value = '';
    }
  }

  $('#media-files').addEventListener('change', event => {
    if (event.target.files?.length) {
      uploadSelectedFiles(event.target.files);
    }
  });

  const dropzone = $('.upload-dropzone');

  ['dragenter', 'dragover'].forEach(type => {
    dropzone.addEventListener(type, event => {
      event.preventDefault();
      dropzone.style.borderColor = '#40b99a';
    });
  });

  ['dragleave', 'drop'].forEach(type => {
    dropzone.addEventListener(type, event => {
      event.preventDefault();
      dropzone.style.borderColor = '';
    });
  });

  dropzone.addEventListener('drop', event => {
    if (event.dataTransfer.files?.length) {
      uploadSelectedFiles(event.dataTransfer.files);
    }
  });

  // ==========================================
  // BULK IMAGE SELECTION
  // ==========================================

  $('#media-library').addEventListener('change', event => {
    const checkbox = event.target.closest(
      '[data-action="select-image"]'
    );

    if (!checkbox) return;

    const id = Number(checkbox.dataset.id);

    if (checkbox.checked) {
      state.selectedImages.add(id);
    } else {
      state.selectedImages.delete(id);
    }

    $('#download-images-zip').disabled =
      state.selectedImages.size === 0;
  });

  $('#media-library').addEventListener('click', async event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;

    const id = Number(button.dataset.id);

    if (button.dataset.action === 'select-video') {
      state.selectedVideoId = id;
      renderMedia();

      $('#video-process-area').scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

    } else if (button.dataset.action === 'delete-upload') {
      if (!confirm('តើអ្នកប្រាកដថាចង់លុបឯកសារនេះទេ?')) return;

      try {
        await api(`/api/uploads/${id}`, { method: 'DELETE' });

        state.selectedImages.delete(id);

        await refreshData();
        toast('បានលុបឯកសារ។');

      } catch (error) {
        toast(error.message, 'error');
      }
    }
  });

  $('#select-all-images').addEventListener('click', () => {
    const images = state.uploads.filter(
      file => file.media_type === 'image'
    );

    if (
      images.every(file =>
        state.selectedImages.has(Number(file.id))
      )
    ) {
      state.selectedImages.clear();
    } else {
      images.forEach(file => {
        state.selectedImages.add(Number(file.id));
      });
    }

    renderMedia();
  });

  $('#download-images-zip').addEventListener(
    'click',
    downloadImageZip
  );

  // ==========================================
  // VIDEO CONVERSION / MP3 / DOWNLOAD
  // ==========================================

  $('#video-process-area').addEventListener('click', async event => {
    if (event.target.closest('#open-video-upload')) {
      $('#media-files').click();
      return;
    }

    const button = event.target.closest('#run-video-process');
    if (!button) return;

    const feedback = $('#video-process-feedback');

    button.disabled = true;
    button.textContent = 'កំពុងបម្លែង...';

    try {
      const data = await api('/api/media/process', {
        method: 'POST',
        body: {
          id: state.selectedVideoId,
          action: $('#video-process-quality').value
        }
      });

      await refreshData();

      const latestFeedback = $('#video-process-feedback');

      if (latestFeedback) {
        latestFeedback.innerHTML = `
          <b>
            បានបង្កើតរួចរាល់៖
            ${escapeHTML(data.file.original_name)}
          </b>

          <a
            class="btn btn-primary btn-small"
            href="/download/${data.file.id}"
          >
            ទាញយកឯកសារថ្មី ↓
          </a>
        `;
      }

      toast('ការបម្លែងបានជោគជ័យ។');

    } catch (error) {
      if (feedback) {
        feedback.textContent = error.message;
      }

      toast(error.message, 'error');

    } finally {
      const current = $('#run-video-process');

      if (current) {
        current.disabled = false;
        current.textContent = 'ចាប់ផ្តើមបម្លែង';
      }
    }
  });

  // ==========================================
  // INITIAL UI AND BOOTSTRAP
  // ==========================================

  calculateProfit();
  bootstrap();

})();
