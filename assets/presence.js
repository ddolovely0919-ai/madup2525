// ============================================================
// 실시간 접속자 위젯 — Supabase Realtime Presence
// 적용: 메인(index) / 팩트북(viewer) / 제안서
// ============================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = "https://zoadkrunwzjlprovavaw.supabase.co";
const SUPABASE_KEY = "sb_publishable_i1iRNXkm3eJ2P01K4b3dmg_5M9vS2P7";

// ============================================================
// 페이지 자동 감지
// ============================================================
function detectPage() {
  const path = location.pathname;
  if (path.includes('/proposals/yakson-healthcare')) return { id: 'proposal-yakson', label: '제안서', badge: 'proposal', defaultSection: '표지' };
  if (path.includes('viewer.html') || path.endsWith('/viewer.html')) {
    const c = new URLSearchParams(location.search).get('c') || 'unknown';
    return { id: 'factbook-' + c, label: '팩트북', badge: 'factbook', defaultSection: '팩트북 시작' };
  }
  return { id: 'landing', label: '메인', badge: 'landing', defaultSection: '랜딩' };
}
const PAGE = detectPage();

// ============================================================
// 섹션 라벨 매핑 (제안서)
// ============================================================
const PROPOSAL_LABELS = {
  cover: '표지', thesis: '핵심 명제', toc: '목차', closing: '마침',
  ch1: 'Ch1 시장 진단', ch2: 'Ch2 자사 진단', ch3: 'Ch3 전략 결정',
  ch4: 'Ch4 매체 운영', ch5: 'Ch5 크리에이티브', ch6: 'Ch6 CRM·재구매', ch7: 'Ch7 매드업',
  's1-1': '시장 폭증', 's1-2': '1강 + 추격군', 's1-3': '검색 패러다임', 's1-4': '슬로우에이징', 's1-sum': 'Ch1 결론',
  's2-1': 'OLLI LIRA 라인업', 's2-2': '광고주 PDF 결정', 's2-3': 'EMS 미스매치', 's2-4': '경쟁 포지셔닝', 's2-sum': 'Ch2 결론',
  's3-1': '1.5 페르소나', 's3-2': 'Pro 결합형', 's3-3': '메시지 3축', 's3-4': '시즌 캘린더', 's3-sum': 'Ch3 결론',
  's4-1': '매체 믹스', 's4-2': '검색', 's4-3': '메타·구글', 's4-4': '네이버 BS', 's4-5': '카카오 시즌', 's4-sum': 'Ch4 결론',
  's5-1': '카피 11종', 's5-2': '메시지 디테일', 's5-3': 'SPRAY AI', 's5-4': '톤앤매너', 's5-sum': 'Ch5 결론',
  's6-1': 'CRM 5단', 's6-2': 'MILOT', 's6-3': 'Pro 락인', 's6-sum': 'Ch6 결론',
  's7-1': '시그니처 솔루션', 's7-2': '전담 조직', 's7-3': 'Special Offer', 's7-4': '일정 로드맵'
};
function labelProposal(id) {
  if (PROPOSAL_LABELS[id]) return PROPOSAL_LABELS[id];
  const m = id && id.match(/^s(\d+)-/);
  if (m) return 'Ch' + m[1] + ' 본문';
  return id || '-';
}

// ============================================================
// 세션·닉네임
// ============================================================
const sid = sessionStorage.getItem('y-sid') || (() => {
  const id = 'u' + Math.random().toString(36).slice(2, 6).toUpperCase();
  sessionStorage.setItem('y-sid', id);
  return id;
})();
let nickname = localStorage.getItem('y-nick') || ('익명-' + sid.slice(1, 4));
let currentSection = PAGE.defaultSection;

// ============================================================
// 위젯 HTML 삽입
// ============================================================
function insertWidget() {
  if (document.getElementById('presence-widget')) return;
  const div = document.createElement('div');
  div.id = 'presence-widget';
  div.hidden = true;
  div.innerHTML = `
    <button id="pw-toggle" class="pw-toggle" title="실시간 접속자 보기">
      <span class="pw-eye">👀</span>
      <span><span class="pw-count" id="pw-count">0</span>명 접속 중</span>
    </button>
    <div id="pw-panel" class="pw-panel" hidden>
      <div class="pw-head">
        <span>실시간 접속자 · 매드업</span>
        <button id="pw-close" class="pw-close" title="닫기">×</button>
      </div>
      <ul id="pw-list" class="pw-list"></ul>
      <div class="pw-foot">
        <label>닉네임 (선택)
          <input id="pw-nick" type="text" maxlength="10" placeholder="익명-XXX">
        </label>
      </div>
    </div>`;
  document.body.appendChild(div);

  // 이벤트 연결
  document.getElementById('pw-toggle').addEventListener('click', () => {
    const p = document.getElementById('pw-panel');
    p.hidden = !p.hidden;
  });
  document.getElementById('pw-close').addEventListener('click', () => {
    document.getElementById('pw-panel').hidden = true;
  });
  const nickInput = document.getElementById('pw-nick');
  nickInput.value = nickname;
  nickInput.addEventListener('change', e => {
    const v = (e.target.value || '').trim() || ('익명-' + sid.slice(1, 4));
    nickname = v.slice(0, 10);
    localStorage.setItem('y-nick', nickname);
    nickInput.value = nickname;
    updatePresence();
  });
}

// ============================================================
// Supabase Realtime Presence
// ============================================================
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const channel = supabase.channel('madup-presence', {
  config: { presence: { key: sid } }
});

function presenceData() {
  return {
    nickname,
    page: PAGE.id,
    pageLabel: PAGE.label,
    badge: PAGE.badge,
    section: currentSection,
    online_at: new Date().toISOString()
  };
}

// 디바운스 (스크롤 중 너무 잦은 업데이트 방지)
let updateTimer = null;
function updatePresence() {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(() => {
    if (channel.state === 'joined') {
      channel.track(presenceData()).catch(e => console.warn('[Presence] track fail:', e.message));
    }
  }, 400);
}

channel.on('presence', { event: 'sync' }, () => {
  render(channel.presenceState());
});

channel.subscribe(async (status) => {
  if (status === 'SUBSCRIBED') {
    insertWidget();
    await channel.track(presenceData());
    document.getElementById('presence-widget').hidden = false;
  }
});

// 페이지 unload 시 정리
window.addEventListener('beforeunload', () => {
  channel.untrack();
  supabase.removeChannel(channel);
});

// ============================================================
// 섹션 추적 — 페이지별
// ============================================================
if (PAGE.id === 'proposal-yakson') {
  const setup = () => {
    const sections = document.querySelectorAll('.main > section[id], .main > article[id]');
    if (!sections.length) return setTimeout(setup, 500);
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const newLabel = labelProposal(e.target.id);
          if (newLabel !== currentSection) {
            currentSection = newLabel;
            updatePresence();
          }
        }
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    sections.forEach(s => obs.observe(s));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
} else if (PAGE.id.startsWith('factbook-')) {
  // 팩트북 viewer 동적 렌더 → MutationObserver로 슬라이드 추가 감지
  const setupFactbook = () => {
    const sectionObs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const title = e.target.querySelector('[data-field="title"]')?.textContent
                     || e.target.querySelector('.slide-title')?.textContent
                     || e.target.querySelector('.slide-meta')?.textContent
                     || e.target.id;
          const newLabel = (title || '-').trim().slice(0, 36);
          if (newLabel !== currentSection) {
            currentSection = newLabel;
            updatePresence();
          }
        }
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    const observeSlides = () => {
      document.querySelectorAll('article.slide-card, article.slide, article[data-slide-id]')
        .forEach(s => sectionObs.observe(s));
    };
    observeSlides();
    new MutationObserver(observeSlides).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupFactbook);
  else setupFactbook();
}

// ============================================================
// 렌더
// ============================================================
function pageBadgeClass(badge) {
  return badge || 'landing';
}
function pageBadgeLabel(pageLabel) {
  return pageLabel || '메인';
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}
function render(state) {
  // state = { sid: [presenceObj], ... }
  const visitors = [];
  for (const [k, arr] of Object.entries(state)) {
    if (arr && arr.length) visitors.push([k, arr[0]]);
  }
  visitors.sort((a, b) => (a[0] === sid ? -1 : b[0] === sid ? 1 : 0));

  const count = document.getElementById('pw-count');
  const list = document.getElementById('pw-list');
  if (!count || !list) return;
  count.textContent = visitors.length;
  if (!visitors.length) {
    list.innerHTML = '<li class="pw-empty">접속자가 없습니다</li>';
    return;
  }
  list.innerHTML = visitors.map(([k, v]) => `
    <li class="${k === sid ? 'me' : ''}">
      <span class="pw-name">${esc(v.nickname || '익명')}</span>
      <span class="pw-where">
        <span class="pw-page-badge ${pageBadgeClass(v.badge)}">${esc(pageBadgeLabel(v.pageLabel))}</span>
        ${esc(v.section || '-')}
      </span>
    </li>`).join('');
}