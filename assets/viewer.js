// ==========================================================================
// MADUP Factbook Viewer + Editor
// JSON 데이터를 읽어 슬라이드 렌더링 + 편집 모드 + localStorage 영속화
// ==========================================================================

let STATE = {
  data: null,        // 전체 factbook JSON
  source: null,      // 데이터 출처 URL (로딩 시점)
  client: null,      // 광고주 slug (yakson, samsung-card 등)
  editMode: false,
  dirty: false,
};

const STATUS_LABELS = {
  auto: "자동 작성",
  progress: "작성 중",
  client: "광고주 확인 필요",
  madup: "매드업 도구 필요",
};

// ==========================================================================
// 데이터 로드
// ==========================================================================
async function loadFactbook(url) {
  STATE.source = url;
  STATE.client = (new URLSearchParams(location.search)).get('c') || 'yakson';

  // localStorage 우선 확인 (편집 작업물 보존)
  const localKey = `factbook:${STATE.client}`;
  const local = localStorage.getItem(localKey);
  if (local) {
    try {
      STATE.data = JSON.parse(local);
      render();
      showSaveStatus("로컬 저장본 로딩됨", "saved");
      return;
    } catch (e) {
      console.warn("Local data corrupt, falling back to file", e);
    }
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    STATE.data = await res.json();
    rewriteImagePaths();
    render();
  } catch (e) {
    document.getElementById('slides-container').innerHTML =
      `<div style="padding:60px;text-align:center;color:#991b1b;">
        <h2>데이터 로딩 실패</h2>
        <p>${e.message}</p>
        <p style="font-size:13px;color:#6b7280;">file:// 프로토콜에서는 브라우저 보안상 fetch 차단됨. <br>
        로컬 서버를 실행하세요: <code>python3 -m http.server 8000</code> → http://localhost:8000/factbook-app/viewer.html?c=yakson</p>
      </div>`;
  }
}

// ==========================================================================
// 이미지 경로 보정 (JSON 안 src 'images/foo.jpg' → 'data/{client}/images/foo.jpg')
// ==========================================================================
function rewriteImagePaths() {
  if (!STATE.data || !STATE.data.slides) return;
  const prefix = `data/${STATE.client}/`;
  const fix = (src) => {
    if (!src) return src;
    if (src.startsWith('http') || src.startsWith('data/') || src.startsWith('/')) return src;
    return prefix + src;
  };
  for (const s of STATE.data.slides) {
    if (s.feature) s.feature.src = fix(s.feature.src);
    if (s.gallery) s.gallery.forEach(g => g.src = fix(g.src));
    if (s.siteGallery) s.siteGallery.forEach(g => g.src = fix(g.src));
    if (s.body) {
      s.body = s.body.replace(/src="(images\/[^"]+)"/g, (m, p) => `src="${prefix}${p}"`);
    }
  }
}

// ==========================================================================
// 렌더링
// ==========================================================================
function render() {
  const data = STATE.data;
  if (!data) return;

  // 헤더
  document.getElementById('hdr-title').textContent = `${data.meta.client} 비딩 ${data.meta.year} 팩트북`;
  document.getElementById('hdr-pt').textContent = `PT ${data.meta.ptDate}`;
  document.getElementById('hdr-variant').textContent = `변형 ${data.meta.variant}`;
  document.getElementById('hdr-updated').textContent = `업데이트 ${data.meta.updatedAt}`;

  // 통계 계산 (실시간)
  const stats = { auto: 0, progress: 0, client: 0, madup: 0 };
  for (const s of data.slides) {
    stats[s.status] = (stats[s.status] || 0) + 1;
  }
  document.getElementById('stat-auto').textContent = stats.auto;
  document.getElementById('stat-progress').textContent = stats.progress;
  document.getElementById('stat-client').textContent = stats.client;
  document.getElementById('stat-madup').textContent = stats.madup;
  data.stats = stats;

  // 사이드바 INDEX
  renderSidebar();

  // 슬라이드
  renderSlides();

  // 챕터 선택 옵션 갱신 (모달용)
  renderAddChapterOptions();

  // 사이드바 active state observer 재바인딩
  bindActiveObserver();
}

function renderSidebar() {
  const data = STATE.data;
  const nav = document.getElementById('index-nav');
  // 챕터별 슬라이드 그룹화
  const byChapter = {};
  for (const s of data.slides) {
    if (!byChapter[s.chapter]) byChapter[s.chapter] = [];
    byChapter[s.chapter].push(s);
  }

  let html = '<ul>';
  for (const ch of data.chapters) {
    const slides = byChapter[ch.id] || [];
    html += `<li class="index-section"><a href="#${ch.id}">${escapeAttr(ch.title)}</a>`;
    if (slides.length) {
      html += '<ul class="index-sub">';
      for (const s of slides) {
        const label = s.title.substring(0, 30).replace(/<[^>]+>/g, '');
        html += `<li><a href="#${s.id}">${escapeAttr(label)}</a></li>`;
      }
      html += '</ul>';
    }
    html += '</li>';
  }
  html += '</ul>';
  nav.innerHTML = html;
}

function renderSlides() {
  const data = STATE.data;
  const container = document.getElementById('slides-container');
  // 챕터별 그룹화
  const byChapter = {};
  for (const s of data.slides) {
    if (!byChapter[s.chapter]) byChapter[s.chapter] = [];
    byChapter[s.chapter].push(s);
  }

  let html = '';
  for (const ch of data.chapters) {
    html += `<section class="chapter" id="${ch.id}">
      <div class="ch-num">${escapeAttr(ch.number || '')}</div>
      <h1>${escapeAttr(ch.title)}</h1>
    </section>`;
    const slides = byChapter[ch.id] || [];
    for (const s of slides) {
      html += renderSlide(s);
    }
  }
  container.innerHTML = html;

  // contenteditable 이벤트 바인딩 (편집 모드용)
  bindEditEvents();
}

function renderSlide(s) {
  const cls = `slide-card${s.intro ? ' intro' : ''}`;
  let html = `<article class="${cls}" id="${s.id}" data-status="${s.status}" data-slide-id="${s.id}">`;

  // 슬라이드 액션 버튼 (편집 모드)
  html += `<div class="slide-actions">
    <button data-action="up" title="위로">↑</button>
    <button data-action="down" title="아래로">↓</button>
    <button data-action="duplicate" title="복제">⎘</button>
    <button data-action="delete" class="del" title="삭제">🗑</button>
  </div>`;

  // 카테고리 라벨
  html += `<span class="slide-meta" data-field="meta" contenteditable="false">${escapeAttr(s.meta || '')}</span>`;

  // 제목
  html += `<h2 class="slide-title"><span class="marker">❏</span><span data-field="title" contenteditable="false">${s.title || ''}</span></h2>`;

  // subnotes
  if (s.subnotes && s.subnotes.length) {
    html += '<ul class="slide-subnotes" data-field="subnotes">';
    for (const note of s.subnotes) {
      html += `<li class="${note.type}" contenteditable="false">${note.html || ''}</li>`;
    }
    html += '</ul>';
  }

  // body (커스텀 컴포넌트들)
  if (s.feature) html += renderFeature(s.feature);
  if (s.gallery && s.gallery.length) html += renderGallery(s.gallery);
  if (s.siteGallery && s.siteGallery.length) html += renderSiteGallery(s.siteGallery);
  if (s.wordcloud && s.wordcloud.length) html += renderWordcloud(s.wordcloud);
  if (s.reviews && s.reviews.length) html += renderReviews(s.reviews);
  if (s.chart) html += renderChart(s.chart);
  if (s.body) html += `<div class="slide-body" data-field="body" contenteditable="false">${s.body}</div>`;

  // footer
  html += '<footer class="slide-footer">';
  if (s.sourceNote || (s.sources && s.sources.length)) {
    html += '<span class="source">';
    if (s.sourceNote) {
      // sourceNote 내 링크가 sources에 별도로 있으면 sources 우선
      html += escapeHtml(s.sourceNote);
    }
    if (s.sources && s.sources.length && !s.sourceNote) {
      html += '* 출처: ' + s.sources.map(src => `<a href="${escapeAttr(src.url)}" target="_blank">${escapeAttr(src.label)}</a>`).join(', ');
    }
    html += '</span>';
  }
  html += `<span class="status-badge ${s.status}" data-action="status">${STATUS_LABELS[s.status] || s.status}</span>`;
  html += '</footer>';

  html += '</article>';
  return html;
}

function renderFeature(f) {
  let html = '<div class="product-feature">';
  html += `<div class="img-wrap"><img src="${escapeAttr(f.src)}" alt="${escapeAttr(f.alt)}" loading="lazy"></div>`;
  html += '<div class="pdetail">';
  if (f.title) html += `<h4>${escapeAttr(f.title)}</h4>`;
  if (f.details && f.details.length) {
    for (const d of f.details) html += `<p>${d}</p>`;
  }
  html += '</div></div>';
  return html;
}

function renderGallery(items) {
  let html = '<div class="product-gallery">';
  for (const item of items) {
    html += `<div class="product-card">
      <div class="img-wrap"><img src="${escapeAttr(item.src)}" alt="${escapeAttr(item.alt)}" loading="lazy"></div>
      <div class="pinfo">
        <p class="pname">${item.name || ''}</p>
        <p class="pprice">${item.price || ''}</p>
        ${item.tag ? `<span class="ptag">${escapeAttr(item.tag)}</span>` : ''}
      </div>
    </div>`;
  }
  html += '</div>';
  return html;
}

function renderSiteGallery(items) {
  let html = '<div class="site-gallery">';
  for (const item of items) {
    html += `<div class="site-card">
      <div class="cap-wrap">
        <img src="${escapeAttr(item.src)}" alt="${escapeAttr(item.alt)}" loading="lazy">
        <span class="badge ${item.badge || 'own'}">${escapeAttr(item.badgeText || '')}</span>
      </div>
      <div class="cap-info">
        <h4>${escapeAttr(item.title)}</h4>
        <p class="url">${escapeAttr(item.url || '')}</p>
        ${item.notes && item.notes.length ? '<ul>' + item.notes.map(n => `<li>${n}</li>`).join('') + '</ul>' : ''}
      </div>
    </div>`;
  }
  html += '</div>';
  return html;
}

function renderWordcloud(words) {
  let html = '<div class="word-cloud">';
  for (const w of words) {
    html += `<span class="wc-${w.size || 'md'} wc-${w.color || 'neutral'}">${escapeAttr(w.text)}</span>`;
  }
  html += '</div>';
  return html;
}

// ==========================================================================
// 차트 컴포넌트 (가로 막대 hbar / 비교 강조 매트릭스 등)
// ==========================================================================
function renderChart(chart) {
  if (!chart || !chart.type) return '';
  if (chart.type === 'hbar') return renderHBar(chart);
  if (chart.type === 'compare') return renderCompare(chart);
  return '';
}

function renderHBar(chart) {
  // chart.items: [{label, value, ratio (0~1), tone, note?}]
  let html = '<div class="fb-chart hbar">';
  if (chart.title) html += `<div class="fb-chart-title">${escapeHtml(chart.title)}</div>`;
  if (chart.subtitle) html += `<div class="fb-chart-subtitle">${escapeHtml(chart.subtitle)}</div>`;
  html += '<ul class="fb-hbar-list">';
  for (const item of chart.items || []) {
    const ratio = Math.max(0.015, Math.min(1, Number(item.ratio) || 0));
    const tone = item.tone || 'primary';
    html += `<li class="fb-hbar-row tone-${tone}">
      <div class="fb-hbar-label">${item.label || ''}</div>
      <div class="fb-hbar-track">
        <div class="fb-hbar-fill" style="width:${(ratio * 100).toFixed(2)}%"></div>
        <span class="fb-hbar-value">${item.value || ''}</span>
      </div>
      ${item.note ? `<div class="fb-hbar-note">${item.note}</div>` : ''}
    </li>`;
  }
  html += '</ul>';
  if (chart.footnote) html += `<div class="fb-chart-footnote">${escapeHtml(chart.footnote)}</div>`;
  html += '</div>';
  return html;
}

function renderCompare(chart) {
  // chart.items: [{label, value, tone, sub?}]  — 4사분면 비교 카드
  let html = '<div class="fb-chart compare">';
  if (chart.title) html += `<div class="fb-chart-title">${escapeHtml(chart.title)}</div>`;
  html += '<div class="fb-compare-grid">';
  for (const item of chart.items || []) {
    const tone = item.tone || 'primary';
    html += `<div class="fb-compare-card tone-${tone}">
      <div class="fb-compare-label">${item.label || ''}</div>
      <div class="fb-compare-value">${item.value || ''}</div>
      ${item.sub ? `<div class="fb-compare-sub">${item.sub}</div>` : ''}
    </div>`;
  }
  html += '</div>';
  if (chart.footnote) html += `<div class="fb-chart-footnote">${escapeHtml(chart.footnote)}</div>`;
  html += '</div>';
  return html;
}

function renderReviews(reviews) {
  let html = '<div class="review-group">';
  for (const r of reviews) {
    html += `<blockquote class="review-quote ${r.type === 'positive' ? '' : r.type || ''}">
      ${r.tag ? `<span class="tag">${escapeAttr(r.tag)}</span>` : ''}
      ${escapeHtml(r.quote || '')}
      <span class="cite">— ${escapeAttr(r.cite || '')}</span>
    </blockquote>`;
  }
  html += '</div>';
  return html;
}

function renderAddChapterOptions() {
  const sel = document.getElementById('add-chapter');
  sel.innerHTML = '';
  for (const ch of STATE.data.chapters) {
    const opt = document.createElement('option');
    opt.value = ch.id;
    opt.textContent = `${ch.number} · ${ch.title}`;
    sel.appendChild(opt);
  }
}

// ==========================================================================
// 사이드바 active state (스크롤)
// ==========================================================================
let activeObserver = null;
function bindActiveObserver() {
  if (activeObserver) activeObserver.disconnect();
  const sections = document.querySelectorAll('.slide-card[id], .chapter[id]');
  const links = document.querySelectorAll('.index-nav a[href^="#"]');
  const linkMap = {};
  links.forEach(a => linkMap[a.getAttribute('href').slice(1)] = a);

  activeObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        if (linkMap[id]) {
          links.forEach(a => a.classList.remove('active'));
          linkMap[id].classList.add('active');
        }
      }
    });
  }, { rootMargin: '-30% 0px -65% 0px' });

  sections.forEach(s => activeObserver.observe(s));
}

// ==========================================================================
// 필터 + 검색
// ==========================================================================
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const filter = chip.dataset.filter;
    document.querySelectorAll('.filter-chip').forEach(c => c.removeAttribute('data-active'));
    chip.setAttribute('data-active', 'true');
    document.querySelectorAll('.slide-card[data-status]').forEach(card => {
      if (filter === 'all' || card.dataset.status === filter) {
        card.classList.remove('is-hidden');
      } else {
        card.classList.add('is-hidden');
      }
    });
  });
});

document.getElementById('search-box').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  document.querySelectorAll('.slide-card').forEach(card => {
    if (!q) {
      card.classList.remove('search-hidden');
      return;
    }
    const text = card.textContent.toLowerCase();
    if (text.includes(q)) {
      card.classList.remove('search-hidden');
    } else {
      card.classList.add('search-hidden');
    }
  });
});

// ==========================================================================
// 편집 모드
// ==========================================================================
document.getElementById('btn-edit').addEventListener('click', () => {
  STATE.editMode = !STATE.editMode;
  document.body.dataset.edit = STATE.editMode ? 'on' : 'off';
  document.getElementById('btn-edit').textContent = STATE.editMode ? '✓ 편집 종료' : '✏️ 편집 모드';
  // contenteditable 토글
  document.querySelectorAll('[data-field]').forEach(el => {
    el.contentEditable = STATE.editMode;
  });
});

function bindEditEvents() {
  // 텍스트 편집 (입력 시 STATE 업데이트)
  document.querySelectorAll('[data-field]').forEach(el => {
    el.addEventListener('blur', () => {
      if (!STATE.editMode) return;
      const slideEl = el.closest('.slide-card');
      const slideId = slideEl?.dataset.slideId;
      if (!slideId) return;
      const slide = STATE.data.slides.find(s => s.id === slideId);
      if (!slide) return;
      const field = el.dataset.field;
      if (field === 'subnotes') {
        slide.subnotes = Array.from(el.querySelectorAll('li')).map(li => ({
          type: ['indent-1','indent-2','arrow'].find(c => li.classList.contains(c)) || 'indent-1',
          html: li.innerHTML.trim()
        }));
      } else if (field === 'body') {
        slide.body = el.innerHTML.trim();
      } else {
        slide[field] = el.innerHTML.trim();
      }
      markDirty();
    });
  });

  // Status 뱃지 클릭 → 변경
  document.querySelectorAll('[data-action="status"]').forEach(badge => {
    badge.addEventListener('click', (e) => {
      if (!STATE.editMode) return;
      const slideEl = badge.closest('.slide-card');
      const slideId = slideEl.dataset.slideId;
      const slide = STATE.data.slides.find(s => s.id === slideId);
      const order = ['auto', 'progress', 'client', 'madup'];
      const next = order[(order.indexOf(slide.status) + 1) % order.length];
      slide.status = next;
      slideEl.dataset.status = next;
      badge.className = `status-badge ${next}`;
      badge.textContent = STATUS_LABELS[next];
      markDirty();
      updateStats();
    });
  });

  // 슬라이드 액션 (위/아래/복제/삭제)
  document.querySelectorAll('.slide-actions button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (!STATE.editMode) return;
      const action = btn.dataset.action;
      const slideEl = btn.closest('.slide-card');
      const slideId = slideEl.dataset.slideId;
      const idx = STATE.data.slides.findIndex(s => s.id === slideId);
      if (idx < 0) return;
      if (action === 'up' && idx > 0) {
        [STATE.data.slides[idx-1], STATE.data.slides[idx]] = [STATE.data.slides[idx], STATE.data.slides[idx-1]];
      } else if (action === 'down' && idx < STATE.data.slides.length - 1) {
        [STATE.data.slides[idx+1], STATE.data.slides[idx]] = [STATE.data.slides[idx], STATE.data.slides[idx+1]];
      } else if (action === 'duplicate') {
        const copy = JSON.parse(JSON.stringify(STATE.data.slides[idx]));
        copy.id = `${copy.id}-copy-${Date.now().toString(36).slice(-4)}`;
        STATE.data.slides.splice(idx + 1, 0, copy);
      } else if (action === 'delete') {
        if (!confirm('이 슬라이드를 삭제하시겠습니까?')) return;
        STATE.data.slides.splice(idx, 1);
      }
      markDirty();
      renderSlides();
      renderSidebar();
      bindActiveObserver();
      updateStats();
    });
  });
}

function updateStats() {
  const stats = { auto: 0, progress: 0, client: 0, madup: 0 };
  for (const s of STATE.data.slides) stats[s.status] = (stats[s.status] || 0) + 1;
  STATE.data.stats = stats;
  document.getElementById('stat-auto').textContent = stats.auto;
  document.getElementById('stat-progress').textContent = stats.progress;
  document.getElementById('stat-client').textContent = stats.client;
  document.getElementById('stat-madup').textContent = stats.madup;
}

// ==========================================================================
// 슬라이드 추가 모달
// ==========================================================================
document.getElementById('btn-add-slide').addEventListener('click', () => {
  document.getElementById('add-meta').value = '';
  document.getElementById('add-title').value = '';
  document.getElementById('modal-add').hidden = false;
});
document.getElementById('btn-add-cancel').addEventListener('click', () => {
  document.getElementById('modal-add').hidden = true;
});
document.getElementById('btn-add-confirm').addEventListener('click', () => {
  const chapter = document.getElementById('add-chapter').value;
  const meta = document.getElementById('add-meta').value.trim();
  const status = document.getElementById('add-status').value;
  const title = document.getElementById('add-title').value.trim();
  if (!title) { alert('헤드라인 인사이트를 입력해주세요.'); return; }
  const newSlide = {
    id: `s-${Date.now().toString(36)}`,
    chapter,
    meta,
    status,
    intro: false,
    title,
    subnotes: [],
    sources: [],
    sourceNote: ''
  };
  STATE.data.slides.push(newSlide);
  markDirty();
  renderSlides();
  renderSidebar();
  bindActiveObserver();
  updateStats();
  document.getElementById('modal-add').hidden = true;
  // 새 슬라이드로 스크롤
  setTimeout(() => {
    const el = document.getElementById(newSlide.id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, 100);
});

// ==========================================================================
// 저장 / 내보내기 / 가져오기
// ==========================================================================
let saveTimer = null;
function markDirty() {
  STATE.dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveLocal();
  }, 1000);
}

function saveLocal() {
  const key = `factbook:${STATE.client}`;
  localStorage.setItem(key, JSON.stringify(STATE.data));
  STATE.dirty = false;
  showSaveStatus("✓ 로컬 저장됨 " + new Date().toLocaleTimeString(), "saved");
}

document.getElementById('btn-save-local').addEventListener('click', saveLocal);

document.getElementById('btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(STATE.data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `factbook-${STATE.client}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('file-import').click();
});
document.getElementById('file-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    STATE.data = JSON.parse(text);
    render();
    saveLocal();
    alert('가져오기 성공');
  } catch (err) {
    alert('JSON 파싱 실패: ' + err.message);
  }
});

function showSaveStatus(text, cls = '') {
  const el = document.getElementById('save-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'save-status ' + cls;
  setTimeout(() => { el.textContent = ''; el.className = 'save-status'; }, 3000);
}

// ==========================================================================
// 헬퍼
// ==========================================================================
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  }[c]));
}
function escapeAttr(s) {
  if (!s) return '';
  return String(s).replace(/"/g, '&quot;');
}

// ==========================================================================
// 페이지 떠나기 전 경고
// ==========================================================================
window.addEventListener('beforeunload', (e) => {
  if (STATE.dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});
