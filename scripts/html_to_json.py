#!/usr/bin/env python3
"""
약손명가 FACTBOOK.html → factbook.json 추출 스크립트
정규식 기반 파싱 (BeautifulSoup 없이 동작)
"""
import re
import json
import sys
from pathlib import Path

HTML_PATH = "/Users/gimjuhyeon/Desktop/제안서_자동화/약손명가헬스케어_팩트북/FACTBOOK.html"
OUT_PATH = "/Users/gimjuhyeon/Desktop/제안서_자동화/factbook-app/data/yakson/factbook.json"


def load_html(path):
    return Path(path).read_text(encoding='utf-8')


def extract_meta(html):
    """헤더에서 광고주명·PT일정 등 추출"""
    title_m = re.search(r'<title>([^<]+)</title>', html)
    pt_m = re.search(r'PT\s+(\d{4}-\d{2}-\d{2}[^<\s]*)', html)
    variant_m = re.search(r'변형\s+(①|②|③|④)\s*([가-힣 ]*)', html)
    created_m = re.search(r'작성\s+(\d{4}-\d{2}-\d{2})', html)
    return {
        "client": "약손명가헬스케어",
        "year": 2026,
        "variant": (variant_m.group(0) if variant_m else "② 다중 브랜드형"),
        "ptDate": (pt_m.group(1) if pt_m else "2026-06-16(화) or 06-17(수)"),
        "createdAt": (created_m.group(1) if created_m else "2026-04-26"),
        "updatedAt": "2026-05-27",
        "rfp": "연간 30억 예산, 3 브랜드(약손명가PB/OLLI LIRA/GOLKI) 통합 운영. KPI: 공식몰 ROAS 250%/브스 500%/외부몰 300%, 재구매율 10%, 카플친 +200%.",
        "owner": "매드업 비딩 TF",
        "description": "RFP·미팅·외부 16종 출처 + 리스닝마인드 + 사이트 캡처 풀버전"
    }


def extract_chapters(html):
    """챕터 블록 추출: <section class="chapter" id="ch1"> ... <h1>제목</h1></section>"""
    chapters = []
    pat = re.compile(
        r'<section class="chapter"\s+id="([^"]+)">\s*<div class="ch-num">([^<]+)</div>\s*<h1>([^<]+)</h1>',
        re.DOTALL,
    )
    for m in pat.finditer(html):
        chapters.append({"id": m.group(1), "number": m.group(2).strip(), "title": m.group(3).strip()})
    return chapters


def find_chapter_for_position(pos, chapter_positions):
    """주어진 슬라이드 위치(byte offset)가 속한 챕터 ID 반환"""
    current = None
    for cid, cpos in chapter_positions:
        if cpos < pos:
            current = cid
        else:
            break
    return current


def extract_chapter_positions(html):
    """챕터별 시작 위치 매핑"""
    positions = []
    pat = re.compile(r'<section class="chapter"\s+id="([^"]+)">')
    for m in pat.finditer(html):
        positions.append((m.group(1), m.start()))
    return positions


def clean_html(s):
    """HTML 문자열 정리: 줄바꿈·과한 공백 제거"""
    s = re.sub(r'\s+', ' ', s)
    return s.strip()


def parse_subnotes(ul_html):
    """slide-subnotes <ul>...</ul>에서 li 항목 추출"""
    notes = []
    li_pat = re.compile(r'<li(?:\s+class="([^"]*)")?\s*>(.*?)</li>', re.DOTALL)
    for m in li_pat.finditer(ul_html):
        cls = m.group(1) or ""
        text = clean_html(m.group(2))
        # 클래스에서 indent/arrow 종류 판정
        if "indent-2" in cls:
            ntype = "indent-2"
        elif "indent-1" in cls:
            ntype = "indent-1"
        elif "arrow" in cls:
            ntype = "arrow"
        else:
            ntype = "indent-1"
        notes.append({"type": ntype, "html": text})
    return notes


def parse_sources(footer_html):
    """slide-footer의 출처 링크 추출"""
    sources = []
    note_m = re.search(r'<span class="source">(.*?)</span>', footer_html, re.DOTALL)
    source_text = ""
    if note_m:
        source_text = clean_html(note_m.group(1))
        # 링크 추출
        link_pat = re.compile(r'<a href="([^"]+)"[^>]*>([^<]+)</a>')
        for lm in link_pat.finditer(note_m.group(1)):
            sources.append({"label": lm.group(2).strip(), "url": lm.group(1)})
    # status badge
    status_m = re.search(r'class="status-badge\s+(auto|progress|client|madup)"', footer_html)
    return sources, source_text, (status_m.group(1) if status_m else "auto")


def parse_word_cloud(body_html):
    """word-cloud span 추출"""
    wc = []
    wc_block = re.search(r'<div class="word-cloud[^"]*">(.*?)</div>', body_html, re.DOTALL)
    if not wc_block:
        return wc
    span_pat = re.compile(r'<span class="(wc-[a-z]+)\s+(wc-[a-z]+)">([^<]+)</span>')
    for m in span_pat.finditer(wc_block.group(1)):
        size = m.group(1).replace("wc-", "")
        color = m.group(2).replace("wc-", "")
        wc.append({"text": m.group(3).strip(), "size": size, "color": color})
    return wc


def parse_reviews(body_html):
    """review-quote 추출"""
    reviews = []
    pat = re.compile(
        r'<blockquote class="review-quote(?:\s+(negative|neutral))?">\s*(?:<span class="tag">([^<]+)</span>)?\s*(.*?)\s*<span class="cite">([^<]+)</span>\s*</blockquote>',
        re.DOTALL,
    )
    for m in pat.finditer(body_html):
        rtype = m.group(1) or "positive"
        tag = m.group(2).strip() if m.group(2) else ""
        quote = clean_html(re.sub(r'<[^>]+>', '', m.group(3))).strip(' "')
        cite = clean_html(m.group(4)).lstrip('— ').strip()
        reviews.append({"type": rtype, "tag": tag, "quote": quote, "cite": cite})
    return reviews


def parse_gallery(body_html):
    """product-card 그리드 추출"""
    gallery = []
    pat = re.compile(
        r'<div class="product-card">\s*<div class="img-wrap"[^>]*>(.*?)</div>\s*<div class="pinfo">(.*?)</div>',
        re.DOTALL,
    )
    for m in pat.finditer(body_html):
        img_html = m.group(1)
        info_html = m.group(2)
        src_m = re.search(r'src="([^"]+)"', img_html)
        alt_m = re.search(r'alt="([^"]+)"', img_html)
        name_m = re.search(r'<p class="pname">([^<]+(?:<br>[^<]+)?)</p>', info_html)
        price_m = re.search(r'<p class="pprice">(.*?)</p>', info_html, re.DOTALL)
        tag_m = re.search(r'<span class="ptag">([^<]+)</span>', info_html)
        item = {
            "src": (src_m.group(1) if src_m else "").replace("images/", "images/"),
            "alt": (alt_m.group(1) if alt_m else ""),
            "name": clean_html(name_m.group(1)).replace("<br>", " · ") if name_m else "",
            "price": clean_html(re.sub(r'<[^>]+>', ' ', price_m.group(1))) if price_m else "",
            "tag": (tag_m.group(1) if tag_m else ""),
        }
        gallery.append(item)
    return gallery


def parse_feature(body_html):
    """product-feature 히어로 + 디테일 추출"""
    m = re.search(r'<div class="product-feature">\s*<div class="img-wrap"[^>]*>(.*?)</div>\s*<div class="pdetail">(.*?)</div>\s*</div>', body_html, re.DOTALL)
    if not m:
        return None
    img_html = m.group(1)
    detail_html = m.group(2)
    src_m = re.search(r'src="([^"]+)"', img_html)
    alt_m = re.search(r'alt="([^"]+)"', img_html)
    title_m = re.search(r'<h4>([^<]+)</h4>', detail_html)
    details = []
    for pm in re.finditer(r'<p>(.*?)</p>', detail_html, re.DOTALL):
        details.append(clean_html(pm.group(1)))
    return {
        "src": (src_m.group(1) if src_m else ""),
        "alt": (alt_m.group(1) if alt_m else ""),
        "title": (title_m.group(1).strip() if title_m else ""),
        "details": details,
    }


def parse_site_gallery(body_html):
    """site-card 사이트 캡처 갤러리 추출"""
    items = []
    pat = re.compile(
        r'<div class="site-card"[^>]*>\s*<div class="cap-wrap">(.*?)</div>\s*<div class="cap-info">(.*?)</div>',
        re.DOTALL,
    )
    for m in pat.finditer(body_html):
        cap_html = m.group(1)
        info_html = m.group(2)
        src_m = re.search(r'src="([^"]+)"', cap_html)
        alt_m = re.search(r'alt="([^"]+)"', cap_html)
        badge_m = re.search(r'class="badge\s+(own|bs|search)">([^<]+)<', cap_html)
        title_m = re.search(r'<h4[^>]*>([^<]+)</h4>', info_html)
        url_m = re.search(r'<p class="url">([^<]+)</p>', info_html)
        notes = [clean_html(n) for n in re.findall(r'<li>(.*?)</li>', info_html, re.DOTALL)]
        items.append({
            "src": (src_m.group(1) if src_m else ""),
            "alt": (alt_m.group(1) if alt_m else ""),
            "badge": (badge_m.group(1) if badge_m else "own"),
            "badgeText": (badge_m.group(2) if badge_m else "자사몰"),
            "title": (title_m.group(1).strip() if title_m else ""),
            "url": (url_m.group(1).strip() if url_m else ""),
            "notes": notes,
        })
    return items


def extract_slides(html, chapter_positions):
    """모든 <article class="slide-card"> 추출"""
    slides = []
    pat = re.compile(
        r'<article class="slide-card([^"]*)"\s+id="([^"]+)"\s+data-status="([^"]+)">(.*?)</article>',
        re.DOTALL,
    )
    for m in pat.finditer(html):
        article_classes = m.group(1).strip()
        is_intro = "intro" in article_classes
        sid = m.group(2)
        status = m.group(3)
        content = m.group(4)
        position = m.start()

        # meta 라벨
        meta_m = re.search(r'<span class="slide-meta">([^<]+)</span>', content)
        meta = clean_html(meta_m.group(1)) if meta_m else ""

        # 헤드라인 (❏ 마커 제거)
        title_m = re.search(r'<h2 class="slide-title">(.*?)</h2>', content, re.DOTALL)
        title = ""
        if title_m:
            t = title_m.group(1)
            t = re.sub(r'<span class="marker">[^<]+</span>', '', t)
            t = clean_html(t)
            title = t

        # subnotes
        subnotes = []
        sub_m = re.search(r'<ul class="slide-subnotes">(.*?)</ul>(?=\s*(?:<div|<footer|<article))', content, re.DOTALL)
        # 정확하지 않을 수 있으니 단순 매칭으로 fallback
        if not sub_m:
            sub_m = re.search(r'<ul class="slide-subnotes">(.*?)</ul>', content, re.DOTALL)
        if sub_m:
            subnotes = parse_subnotes(sub_m.group(1))

        # body (slide-body 내용)
        body_m = re.search(r'<div class="slide-body">(.*?)</div>\s*(?:<footer|</article)', content, re.DOTALL)
        body = ""
        gallery = []
        feature = None
        site_gallery = []
        wordcloud = []
        reviews = []
        if body_m:
            body_html = body_m.group(1)
            # 컴포넌트별로 파싱
            gallery = parse_gallery(body_html)
            feature = parse_feature(body_html)
            site_gallery = parse_site_gallery(body_html)
            wordcloud = parse_word_cloud(body_html)
            reviews = parse_reviews(body_html)
            # 나머지 본문 (표·리스트 등)
            body = body_html.strip()

        # product-feature가 body 바깥 (subnotes 위)에 있는 경우도 처리
        if not feature:
            outer_feature = parse_feature(content)
            if outer_feature:
                feature = outer_feature
        if not site_gallery:
            outer_sg = parse_site_gallery(content)
            if outer_sg:
                site_gallery = outer_sg
        if not wordcloud:
            outer_wc = parse_word_cloud(content)
            if outer_wc:
                wordcloud = outer_wc
        if not reviews:
            outer_r = parse_reviews(content)
            if outer_r:
                reviews = outer_r

        # footer (sources)
        footer_m = re.search(r'<footer class="slide-footer">(.*?)</footer>', content, re.DOTALL)
        sources, source_note, footer_status = [], "", status
        if footer_m:
            sources, source_note, footer_status = parse_sources(footer_m.group(1))

        chapter_id = find_chapter_for_position(position, chapter_positions)

        slide = {
            "id": sid,
            "chapter": chapter_id,
            "meta": meta,
            "status": status,
            "intro": is_intro,
            "title": title,
            "subnotes": subnotes,
            "sources": sources,
            "sourceNote": source_note,
        }
        if body:
            slide["body"] = body
        if gallery:
            slide["gallery"] = gallery
        if feature:
            slide["feature"] = feature
        if site_gallery:
            slide["siteGallery"] = site_gallery
        if wordcloud:
            slide["wordcloud"] = wordcloud
        if reviews:
            slide["reviews"] = reviews

        slides.append(slide)
    return slides


def main():
    html = load_html(HTML_PATH)
    meta = extract_meta(html)
    chapters = extract_chapters(html)
    chapter_positions = extract_chapter_positions(html)
    slides = extract_slides(html, chapter_positions)

    # 통계
    stats = {"auto": 0, "progress": 0, "client": 0, "madup": 0}
    for s in slides:
        stats[s["status"]] = stats.get(s["status"], 0) + 1

    out = {
        "schema_version": "1.0",
        "meta": meta,
        "stats": stats,
        "chapters": chapters,
        "slides": slides,
    }
    Path(OUT_PATH).write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"✓ 저장: {OUT_PATH}")
    print(f"  - chapters: {len(chapters)}")
    print(f"  - slides: {len(slides)}")
    print(f"  - status 분포: {stats}")
    print(f"  - 컴포넌트 사용:")
    print(f"    · gallery: {sum(1 for s in slides if s.get('gallery'))}")
    print(f"    · feature: {sum(1 for s in slides if s.get('feature'))}")
    print(f"    · siteGallery: {sum(1 for s in slides if s.get('siteGallery'))}")
    print(f"    · wordcloud: {sum(1 for s in slides if s.get('wordcloud'))}")
    print(f"    · reviews: {sum(1 for s in slides if s.get('reviews'))}")


if __name__ == "__main__":
    main()
