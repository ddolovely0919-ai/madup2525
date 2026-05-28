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
  madup: "매드업 도구 활용",
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

// 슬라이드의 데이터 출처 자동 추출 (sourceNote / sources / meta / id 패턴 기반)
const SOURCE_PATTERNS = [
  { key: 'lm', label: '📊 리스닝마인드', match: (s) => /리스닝마인드|listening.?mind/i.test(s._combined) || /^lm-/.test(s.id || '') },
  { key: 'naver', label: '🌐 네이버 API', match: (s) => /Naver Search API|네이버 API|네이버 검색 API|openapi\.naver/i.test(s._combined) || /^nb-/.test(s.id || '') },
  { key: 'lever', label: '🎨 Lever Xpert', match: (s) => /Lever Xpert|LEVER Xpert|크리에이티브 라이브러리/i.test(s._combined) },
  { key: 'madup-tool', label: '⚙️ 매드업 도구', match: (s) => /SPRAY AI|ADVoost|ADBoost|AI 심의봇|모바일인덱스|매드업.*솔루션|매드업.*도구/i.test(s._combined) },
  { key: 'news', label: '📰 뉴스기사', match: (s) => /비즈워치|머니투데이|매일경제|한경|EBN|코스인|코스모닝|메디파나|메디포뉴스|뷰티누리|머니S|한국경제|뉴스1|히트뉴스|아시아경제|이데일리|메디컬타임즈|매거진|Daum|Newswire|Allure|Elle Korea|얼루어|Harper|마리끌레르|W Korea|네이트|블로터/i.test(s._combined) },
  { key: 'consulting', label: '💼 컨설팅', match: (s) => /KPMG|맥킨지|McKinsey|삼일|삼일회계|베인|Bain|PwC|딜로이트|Deloitte|모르도르|Mordor|Expert Market|imarc|GlobalGrowthInsights|DataBridge|Business Research/i.test(s._combined) },
  { key: 'academic', label: '🎓 학술', match: (s) => /KAIST|카이스트|논문|학술|학회|KCI|특허|임상.*검증|이병철 회장|1979/i.test(s._combined) },
  { key: 'client-doc', label: '📄 광고주 자료', match: (s) => /RFP|미팅록|광고주 PDF|광고주 자료|광고주 공유|광고주 결정|광고주 미팅|광고주 확인 필요/i.test(s._combined) },
];

function detectSources(s) {
  // dataSource 필드 명시적 지정 우선
  if (Array.isArray(s.dataSource) && s.dataSource.length) return s.dataSource;
  // 자동 추출: meta + title + sourceNote + sources labels 모두 합쳐서 매칭
  const combined = [
    s.meta || '', s.title || '', s.sourceNote || '',
    ...(s.sources || []).map(src => `${src.label || ''} ${src.url || ''}`)
  ].join(' ');
  const _s = { ...s, _combined: combined };
  return SOURCE_PATTERNS.filter(p => p.match(_s)).map(p => p.key);
}

// 사이드바 INDEX용 라벨 생성 (slide.indexLabel 있으면 사용, 없으면 자동 추출)
function makeIndexLabel(s) {
  // 1) 명시적 indexLabel 우선
  if (s.indexLabel && s.indexLabel.trim()) {
    return s.indexLabel.trim().substring(0, 50);
  }
  // 2) 자동 추출: HTML 태그 제거 → 핵심 부분 추출
  const cleanTitle = (s.title || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  // "—" 이전이 핵심 인사이트인 경우가 많음
  let core = cleanTitle.split(/\s*—\s*/)[0].trim();
  // 너무 짧으면 "—" 이후도 포함
  if (core.length < 15 && cleanTitle.length > core.length) {
    core = cleanTitle;
  }
  // 따옴표·물음표 깔끔하게 정리
  core = core.replace(/^["'❏\s]+|["'\s]+$/g, '').trim();
  // 길이 제한
  if (core.length > 42) core = core.substring(0, 42) + '…';
  // 3) meta에서 카테고리 prefix 추출 (선택적)
  const metaClean = (s.meta || '').replace(/<[^>]+>/g, '').replace(/^[⭐🎯📥📊📺📷🐎📂🔑🚨🟢🟡🔴💡]+\s*/, '').trim();
  // meta가 짧고 의미있으면 prefix로 사용
  let prefix = '';
  if (metaClean && metaClean.length <= 18) {
    // "자사 · 광고주 정의" → 마지막 영역만
    const parts = metaClean.split(/\s*·\s*/);
    const tag = parts[parts.length - 1].trim();
    if (tag.length <= 14 && tag !== core.substring(0, tag.length)) {
      prefix = `<span class="idx-tag">${tag}</span> `;
    }
  }
  return prefix + escapeHtml(core);
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
    const chTitle = (ch.title || '').replace(/<[^>]+>/g, '');
    html += `<li class="index-section"><a href="#${ch.id}">${escapeAttr(chTitle)} <em class="idx-count">${slides.length}</em></a>`;
    if (slides.length) {
      html += '<ul class="index-sub">';
      for (const s of slides) {
        const label = makeIndexLabel(s);
        const statusCls = `idx-${s.status || 'auto'}`;
        html += `<li class="${statusCls}"><a href="#${s.id}" title="${escapeAttr((s.title||'').replace(/<[^>]+>/g, ''))}">${label}</a></li>`;
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
  const sources = detectSources(s);
  const srcAttr = sources.length ? ` data-sources="${sources.join(',')}"` : '';
  let html = `<article class="${cls}" id="${s.id}" data-status="${s.status}" data-slide-id="${s.id}"${srcAttr}>`;

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
    if (s.sources && s.sources.length) {
      // sources 배열이 있으면 우선 사용 (깔끔한 <a> 링크 자동 생성)
      html += '* 출처: ' + s.sources.map(src => `<a href="${escapeAttr(src.url)}" target="_blank" rel="noopener">${escapeAttr(src.label)}</a>`).join(', ');
    } else if (s.sourceNote) {
      // sources가 없으면 sourceNote를 HTML 그대로 출력 (JSON 작성 시 <a> 태그 인라인 허용)
      html += s.sourceNote;
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
// 필터 + 검색 (상태 1개 + 출처 다중 선택 결합)
// ==========================================================================
const FILTER_STATE = { status: 'all', sources: new Set() };

function applyFilters() {
  document.querySelectorAll('.slide-card[data-status]').forEach(card => {
    const status = card.dataset.status;
    const srcAttr = card.dataset.sources || '';
    const cardSources = srcAttr ? srcAttr.split(',') : [];

    const statusOk = FILTER_STATE.status === 'all' || status === FILTER_STATE.status;
    const sourceOk = FILTER_STATE.sources.size === 0 ||
                     [...FILTER_STATE.sources].some(s => cardSources.includes(s));

    if (statusOk && sourceOk) card.classList.remove('is-hidden');
    else card.classList.add('is-hidden');
  });
  // INDEX도 동기화 — 숨겨진 슬라이드 ID와 매칭되는 li 숨김
  const hiddenIds = new Set(
    [...document.querySelectorAll('.slide-card.is-hidden')].map(c => c.id)
  );
  document.querySelectorAll('.index-sub li').forEach(li => {
    const a = li.querySelector('a');
    if (!a) return;
    const sid = (a.getAttribute('href') || '').slice(1);
    if (hiddenIds.has(sid)) li.classList.add('is-hidden');
    else li.classList.remove('is-hidden');
  });
}

// 상태 필터 (단일 선택)
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(c => c.removeAttribute('data-active'));
    chip.setAttribute('data-active', 'true');
    FILTER_STATE.status = chip.dataset.filter;
    applyFilters();
  });
});

// 출처 필터 (다중 선택, 토글)
document.querySelectorAll('.src-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const src = chip.dataset.source;
    if (FILTER_STATE.sources.has(src)) {
      FILTER_STATE.sources.delete(src);
      chip.removeAttribute('data-active');
    } else {
      FILTER_STATE.sources.add(src);
      chip.setAttribute('data-active', 'true');
    }
    applyFilters();
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
// PPTX 다운로드 (PptxGenJS CDN)
// ==========================================================================
document.getElementById('btn-export-pptx').addEventListener('click', exportPPTX);

async function exportPPTX() {
  if (typeof PptxGenJS === 'undefined') {
    alert('PptxGenJS 라이브러리 로드 중... 잠시 후 다시 시도해주세요.');
    return;
  }
  const btn = document.getElementById('btn-export-pptx');
  const original = btn.textContent;
  btn.textContent = '⏳ PPT 생성중...';
  btn.disabled = true;

  try {
    const data = STATE.data;
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';  // 13.333 x 7.5 inches
    pptx.title = `${data.meta.client} 비딩 ${data.meta.year} 팩트북`;
    pptx.author = data.meta.owner || 'MADUP';
    pptx.company = 'MADUP';

    // ====== 표지 슬라이드 ======
    const cover = pptx.addSlide();
    cover.background = { color: '0F766E' };
    cover.addText('MADUP', { x: 0.5, y: 0.5, w: 12, h: 0.5, fontSize: 14, color: 'FFFFFF', bold: true, fontFace: 'Pretendard' });
    cover.addText(`${data.meta.client} 비딩 ${data.meta.year} 팩트북`, {
      x: 0.5, y: 2.5, w: 12, h: 1.2, fontSize: 36, color: 'FFFFFF', bold: true, fontFace: 'Pretendard'
    });
    cover.addText(data.meta.description || '', {
      x: 0.5, y: 3.8, w: 12, h: 0.6, fontSize: 16, color: 'E5E7EB', fontFace: 'Pretendard'
    });
    cover.addText([
      { text: `PT ${data.meta.ptDate || ''}`, options: { fontSize: 13, color: 'A7F3D0' } },
      { text: '   ·   ', options: { fontSize: 13, color: 'A7F3D0' } },
      { text: `변형 ${data.meta.variant || ''}`, options: { fontSize: 13, color: 'A7F3D0' } },
      { text: '   ·   ', options: { fontSize: 13, color: 'A7F3D0' } },
      { text: `업데이트 ${data.meta.updatedAt || ''}`, options: { fontSize: 13, color: 'A7F3D0' } }
    ], { x: 0.5, y: 5.5, w: 12, h: 0.4, fontFace: 'Pretendard' });
    cover.addText(`총 ${data.slides.length} 슬라이드 / ${data.chapters.length} 챕터`, {
      x: 0.5, y: 6.2, w: 12, h: 0.4, fontSize: 12, color: 'A7F3D0', fontFace: 'Pretendard'
    });

    // ====== 슬라이드 변환 ======
    const slidesByCh = {};
    for (const s of data.slides) {
      if (!slidesByCh[s.chapter]) slidesByCh[s.chapter] = [];
      slidesByCh[s.chapter].push(s);
    }

    for (const ch of data.chapters) {
      const chSlides = slidesByCh[ch.id] || [];
      if (chSlides.length === 0) continue;

      // 챕터 separator 슬라이드
      const sep = pptx.addSlide();
      sep.background = { color: 'F3F4F6' };
      sep.addText(stripHTML(ch.number || ''), { x: 0.5, y: 2.5, w: 12, h: 0.5, fontSize: 14, color: '6B7280', fontFace: 'Pretendard' });
      sep.addText(stripHTML(ch.title), { x: 0.5, y: 3.0, w: 12, h: 1.0, fontSize: 32, color: '111827', bold: true, fontFace: 'Pretendard' });
      sep.addText(`${chSlides.length} 슬라이드`, { x: 0.5, y: 4.2, w: 12, h: 0.4, fontSize: 14, color: '6B7280', fontFace: 'Pretendard' });

      for (const s of chSlides) {
        const slide = pptx.addSlide();
        addSlideContent(slide, s, ch);
      }
    }

    const fileName = `${data.meta.client}_비딩${data.meta.year}_팩트북_${todayStr()}.pptx`;
    await pptx.writeFile({ fileName });
    btn.textContent = '✓ PPT 다운로드 완료';
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2000);
  } catch (err) {
    console.error('PPT 생성 실패:', err);
    alert('PPT 생성 실패: ' + err.message);
    btn.textContent = original;
    btn.disabled = false;
  }
}

function addSlideContent(slide, s, chapter) {
  const isIntro = !!s.intro;
  slide.background = { color: isIntro ? 'FEFCE8' : 'FFFFFF' };

  // 챕터·meta 라벨 (상단)
  slide.addText(`${chapter.title} · ${stripHTML(s.meta || '')}`, {
    x: 0.5, y: 0.3, w: 12, h: 0.3, fontSize: 10, color: '6B7280', fontFace: 'Pretendard'
  });

  // 타이틀 (헤드라인 인사이트)
  slide.addText(stripHTML(s.title || ''), {
    x: 0.5, y: 0.65, w: 12, h: 1.0,
    fontSize: 18, color: '111827', bold: true, fontFace: 'Pretendard',
    valign: 'top', wrap: true
  });

  let yPos = 1.85;

  // Subnotes
  if (s.subnotes && s.subnotes.length > 0) {
    const bullets = s.subnotes.slice(0, 12).map(n => ({
      text: stripHTML(n.html || ''),
      options: {
        bullet: n.type === 'arrow' ? { code: '25B6' } : { indent: n.type === 'indent-2' ? 30 : 15 },
        color: n.type === 'arrow' ? '0F766E' : '374151',
        bold: n.type === 'arrow',
        fontSize: 11,
        paraSpaceAfter: 2
      }
    }));
    const subHeight = Math.min(4.5, bullets.length * 0.32);
    slide.addText(bullets, {
      x: 0.6, y: yPos, w: 9.5, h: subHeight,
      fontFace: 'Pretendard', wrap: true, valign: 'top'
    });
    yPos += subHeight + 0.15;
  }

  // 표 (body)
  if (s.body) {
    const tableData = parseTable(s.body);
    if (tableData && tableData.length > 0 && yPos < 6.5) {
      try {
        slide.addTable(tableData, {
          x: 0.5, y: yPos, w: 12, h: Math.min(2.5, 7 - yPos),
          fontSize: 9, fontFace: 'Pretendard',
          border: { type: 'solid', color: 'E5E7EB', pt: 0.5 },
          colW: equalCols(tableData[0].length, 12)
        });
      } catch (e) { /* ignore table errors */ }
    }
  }

  // Gallery 이미지 (오른쪽 사이드, 최대 4장)
  if (s.gallery && s.gallery.length > 0) {
    const gImgs = s.gallery.slice(0, 4);
    const cellW = 1.2, cellH = 1.5;
    gImgs.forEach((g, i) => {
      const gx = 10.3 + (i % 2) * (cellW + 0.1);
      const gy = 1.9 + Math.floor(i / 2) * (cellH + 0.15);
      try {
        slide.addImage({ path: g.src, x: gx, y: gy, w: cellW, h: cellH, sizing: { type: 'cover', w: cellW, h: cellH } });
      } catch (e) { /* skip image errors */ }
    });
  }

  // 출처 (하단)
  if (s.sourceNote || (s.sources && s.sources.length)) {
    const srcText = stripHTML(s.sourceNote || ('* 출처: ' + (s.sources || []).map(x => x.label).join(', ')));
    slide.addText(srcText.substring(0, 200), {
      x: 0.5, y: 7.0, w: 11, h: 0.3, fontSize: 8, color: '9CA3AF', italic: true, fontFace: 'Pretendard'
    });
  }

  // status 뱃지 (우하단)
  const STATUS_LABEL_MAP = { auto: '자동', progress: '작성중', client: '광고주 확인', madup: '매드업 도구' };
  const STATUS_COLOR_MAP = { auto: '22C55E', progress: 'EAB308', client: 'F97316', madup: '3B82F6' };
  slide.addText(STATUS_LABEL_MAP[s.status] || s.status || '', {
    x: 11.5, y: 7.0, w: 1.3, h: 0.3, fontSize: 9, color: 'FFFFFF', bold: true,
    align: 'center', valign: 'middle', fontFace: 'Pretendard',
    fill: { color: STATUS_COLOR_MAP[s.status] || '6B7280' }
  });

  // 슬라이드 ID·페이지 정보 (좌하단)
  slide.addText(s.id || '', { x: 0.5, y: 7.0, w: 2, h: 0.3, fontSize: 8, color: 'D1D5DB', fontFace: 'Pretendard' });
}

// HTML 태그 제거 + entity 디코드
function stripHTML(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = String(html);
  return tmp.textContent || tmp.innerText || '';
}

// HTML body에서 첫 번째 <table>을 2D 배열로 변환
function parseTable(html) {
  if (!html || !html.includes('<table')) return null;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const table = tmp.querySelector('table');
  if (!table) return null;
  const rows = [];
  const trs = table.querySelectorAll('tr');
  trs.forEach(tr => {
    const cells = Array.from(tr.querySelectorAll('th,td')).map(c => ({
      text: (c.textContent || '').trim().substring(0, 80),
      options: c.tagName === 'TH'
        ? { bold: true, fill: { color: 'F3F4F6' }, color: '111827', fontSize: 9 }
        : { fontSize: 9 }
    }));
    if (cells.length) rows.push(cells);
  });
  return rows.length > 0 ? rows : null;
}

function equalCols(n, totalW) {
  const w = totalW / n;
  return Array(n).fill(w);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
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
