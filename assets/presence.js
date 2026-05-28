// ============================================================
// 실시간 접속자 위젯 (Firebase Realtime Presence)
// 적용 페이지: 메인 / 팩트북 viewer / 제안서
// ============================================================

// 🔥 Firebase Config — Firebase Console에서 받은 값으로 4개 교체
const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  databaseURL: "https://REPLACE_ME-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "REPLACE_ME",
};

if (firebaseConfig.apiKey === "REPLACE_ME") {
  console.info("[Presence] Firebase config 미설정 — 위젯 비활성. Console에서 키 받으면 활성화됩니다.");
} else {
  initPresence().catch(e => console.warn("[Presence] init failed:", e));
}

// ============================================================
// 페이지 자동 감지
// ============================================================
function detectPage() {
  const path = location.pathname;
  if (path.includes('/proposals/yakson-healthcare')) {
    return { id: 'proposal-yakson', label: '제안서', badge: 'proposal', defaultSection: '표지' };
  }
  if (path.includes('viewer.html') || path.endsWith('/viewer.html')) {
    const c = new URLSearchParams(location.search).get('c') || 'unknown';
    return { id: 'factbook-' + c, label: '팩트북', badge: 'factbook', defaultSection: '팩트북 시작' };
  }
  return { id: 'landing', label: '메인', badge: 'landing', defaultSection: '랜딩' };
}

const PAGE = detectPage();

// ============================================================
// 섹션 라벨 매핑 (제안서 전용)
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
}

// ============================================================
// Firebase 초기화
// ============================================================
async function initPresence() {
  insertWidget();

  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js");
  const { getDatabase, ref, set, onValue, onDisconnect, remove, serverTimestamp } =
    await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");

  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);

  // 세션·닉네임
  const sid = sessionStorage.getItem('y-sid') || (() => {
    const id = 'u' + Math.random().toString(36).slice(2, 6).toUpperCase();
    sessionStorage.setItem('y-sid', id);
    return id;
  })();
  let nickname = localStorage.getItem('y-nick') || ('익명-' + sid.slice(1, 4));

  let currentSection = PAGE.defaultSection;

  // Firebase refs (모든 페이지가 같은 visitors 풀 공유)
  const myRef = ref(db, `presence/visitors/${sid}`);
  const allRef = ref(db, `presence/visitors`);

  // 브라우저 닫으면 자동 제거
  onDisconnect(myRef).remove();

  function heartbeat() {
    set(myRef, {
      nickname,
      page: PAGE.id,
      pageLabel: PAGE.label,
      section: currentSection,
      lastSeen: serverTimestamp(),
    }).catch(e => console.warn('[Presence] write fail:', e.message));
  }
  heartbeat();
  setInterval(heartbeat, 5000);

  // 5분 무활동 → 자동 퇴장
  let idleTimer;
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => remove(myRef), 5 * 60 * 1000);
  };
  ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'].forEach(ev =>
    window.addEventListener(ev, resetIdle, { passive: true })
  );
  resetIdle();

  // 다른 접속자 listen → 위젯 갱신
  onValue(allRef, snap => {
    const data = snap.val() || {};
    const now = Date.now();
    const active = Object.entries(data)
      .filter(([k, v]) => v && v.lastSeen && (now - v.lastSeen < 30000))
      .sort((a, b) => (a[0] === sid ? -1 : b[0] === sid ? 1 : 0));
    render(active, sid);
  });

  document.getElementById('presence-widget').hidden = false;

  // ============================================================
  // 섹션 추적 — 페이지별
  // ============================================================
  if (PAGE.id === 'proposal-yakson') {
    const sections = document.querySelectorAll('.main > section[id], .main > article[id]');
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) currentSection = labelProposal(e.target.id);
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    sections.forEach(s => obs.observe(s));
  } else if (PAGE.id.startsWith('factbook-')) {
    // 팩트북 viewer — 동적 렌더링이라 MutationObserver로 슬라이드 추가 감지
    const sectionObs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const title = e.target.querySelector('[data-field="title"]')?.textContent
                     || e.target.querySelector('.slide-title')?.textContent
                     || e.target.querySelector('.slide-meta')?.textContent
                     || e.target.id;
          currentSection = (title || '-').trim().slice(0, 36);
        }
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    const observeSlides = () => {
      document.querySelectorAll('article.slide-card, article.slide, article[data-slide-id]').forEach(s => sectionObs.observe(s));
    };
    observeSlides();
    new MutationObserver(observeSlides).observe(document.body, { childList: true, subtree: true });
  }
  // landing: 섹션 추적 없음, "랜딩" 유지

  // 닉네임 입력
  const nickInput = document.getElementById('pw-nick');
  nickInput.value = nickname;
  nickInput.addEventListener('change', e => {
    const v = (e.target.value || '').trim() || ('익명-' + sid.slice(1, 4));
    nickname = v.slice(0, 10);
    localStorage.setItem('y-nick', nickname);
    nickInput.value = nickname;
    heartbeat();
  });

  // 패널 토글
  document.getElementById('pw-toggle').addEventListener('click', () => {
    const p = document.getElementById('pw-panel');
    p.hidden = !p.hidden;
  });
  document.getElementById('pw-close').addEventListener('click', () => {
    document.getElementById('pw-panel').hidden = true;
  });
}

// ============================================================
// 렌더
// ============================================================
function pageBadgeClass(pageId) {
  if (!pageId) return 'landing';
  if (pageId.startsWith('proposal')) return 'proposal';
  if (pageId.startsWith('factbook')) return 'factbook';
  return 'landing';
}
function pageBadgeLabel(pageId, pageLabel) {
  if (pageLabel) return pageLabel;
  if (!pageId) return '메인';
  if (pageId.startsWith('proposal')) return '제안서';
  if (pageId.startsWith('factbook')) return '팩트북';
  return '메인';
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}
function render(active, mySid) {
  const count = document.getElementById('pw-count');
  const list = document.getElementById('pw-list');
  if (!count || !list) return;
  count.textContent = active.length;
  if (!active.length) {
    list.innerHTML = '<li class="pw-empty">접속자가 없습니다</li>';
    return;
  }
  list.innerHTML = active.map(([k, v]) => `
    <li class="${k === mySid ? 'me' : ''}">
      <span class="pw-name">${esc(v.nickname || '익명')}</span>
      <span class="pw-where">
        <span class="pw-page-badge ${pageBadgeClass(v.page)}">${esc(pageBadgeLabel(v.page, v.pageLabel))}</span>
        ${esc(v.section || '-')}
      </span>
    </li>`).join('');
}