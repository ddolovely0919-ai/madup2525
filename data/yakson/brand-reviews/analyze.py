#!/usr/bin/env python3
"""브랜드스토어 리뷰 5축 키워드 분석"""
import json, re, os, glob
from collections import Counter, defaultdict

BASE = "/Users/madup/Documents/제안서_자동화/factbook-app/data/yakson/brand-reviews"

# 5축 키워드 매핑
AXES = {
    "효과·USP": {
        "리프팅": ["리프팅", "당김", "탄력", "처짐", "들리", "올라"],
        "V라인·각진얼굴": ["v라인", "브이라인", "각진", "이중턱", "턱선", "작은얼굴", "얼굴 작", "윤곽"],
        "붓기·혈액순환": ["붓기", "부기", "혈액", "순환", "림프", "배수"],
        "주름·탄력": ["주름", "잔주름", "노화", "탄력", "피부 톤"],
    },
    "사용시나리오": {
        "매일·루틴": ["매일", "꾸준", "루틴", "습관", "지속"],
        "시간언급": ["5분", "10분", "15분", "30분", "20분", "한 시간", "오전", "저녁", "자기 전", "아침", "출근"],
        "매장대체": ["매장", "샵", "에스테틱", "관리실", "원장", "원장님", "시술 대신", "병원"],
        "휴대·간편": ["편하", "간편", "쉽", "어렵지 않", "휴대", "들고"],
    },
    "기술·디바이스": {
        "EMS·미세전류": ["ems", "전류", "미세전류", "전기"],
        "진동·웨이브": ["진동", "웨이브", "패널", "두드림"],
        "온열": ["온열", "따뜻", "히팅", "데워"],
        "갈바닉·RF": ["갈바닉", "rf", "고주파", "초음파"],
    },
    "가격·이벤트": {
        "가성비": ["가성비", "가격", "비싸", "저렴", "할인", "혜택"],
        "선물·구매": ["선물", "사드렸", "엄마", "어머니", "친구", "지인"],
        "재구매": ["재구매", "또 사", "두 번", "다시"],
    },
    "소셜신뢰": {
        "추천·후기": ["추천", "후기", "리뷰", "소개"],
        "약손IP신뢰": ["약손", "46년", "47년", "에스테틱", "노하우", "전문"],
        "체험단": ["체험", "협찬", "원고료", "지원", "받았"],
        "내돈내산": ["내돈", "직접 구매", "솔직"],
    }
}

# 긍정·부정 키워드
POS_KW = ["좋아요", "좋네요", "만족", "최고", "추천", "도움", "편해", "쉬워", "괜찮", "효과", "굿", "예뻐", "예쁘", "마음에", "강추"]
NEG_KW = ["별로", "실망", "아쉬", "불편", "후회", "고장", "약함", "안되", "안 되", "엉망", "심해", "나빠", "최악", "환불"]

def parse_review(text):
    """평점\n5가성비아주 좋아요\n본문 형식 파싱"""
    m = re.match(r'평점\s*([1-5])', text)
    rating = int(m.group(1)) if m else 0
    body = re.sub(r'^평점\s*[1-5][^\n]*\n', '', text).strip()
    # 추가 메타 제거 (가성비/편리성 등은 본문 앞에)
    body = re.sub(r'^[가-힣\s]+(아주\s*좋아요|좋아요|괜찮아요|보통|별로예요)\s*\n?', '', body)
    return {"rating": rating, "body": body}

def axis_match(text, keywords):
    """키워드 매칭 카운트"""
    t = text.lower()
    hits = []
    for kw in keywords:
        if kw.lower() in t:
            hits.append(kw)
    return hits

def analyze_review(text):
    """한 리뷰 분석"""
    parsed = parse_review(text)
    body_lower = parsed['body'].lower()

    # 5축 매칭
    axis_results = {}
    for axis_name, subcats in AXES.items():
        axis_results[axis_name] = {}
        for subcat, kws in subcats.items():
            hits = axis_match(body_lower, kws)
            if hits:
                axis_results[axis_name][subcat] = hits

    # 감정
    pos_hits = [kw for kw in POS_KW if kw in body_lower]
    neg_hits = [kw for kw in NEG_KW if kw in body_lower]

    sentiment = "neutral"
    if parsed['rating'] >= 4 and pos_hits and not neg_hits:
        sentiment = "positive"
    elif parsed['rating'] <= 3 or neg_hits:
        sentiment = "negative" if (parsed['rating'] <= 2 or len(neg_hits) >= 2) else "mixed"

    return {
        "rating": parsed['rating'],
        "body_excerpt": parsed['body'][:120],
        "body_full": parsed['body'],
        "axes": axis_results,
        "pos_hits": pos_hits,
        "neg_hits": neg_hits,
        "sentiment": sentiment
    }

def aggregate_brand(brand_name, file_data):
    """브랜드 단위 집계"""
    all_reviews = []
    if "products" in file_data:
        for p in file_data["products"]:
            for r in p.get("best_reviews", []):
                all_reviews.append({"product_title": p.get("title", ""), "review": r})
    else:
        # 단일 상품 (메이크온)
        for r in file_data.get("best_reviews", []):
            all_reviews.append({"product_title": file_data.get("title", ""), "review": r})

    analyzed = []
    axis_counter = defaultdict(Counter)
    sentiment_counter = Counter()
    rating_counter = Counter()

    for item in all_reviews:
        a = analyze_review(item['review'])
        a['product'] = item['product_title']
        analyzed.append(a)
        sentiment_counter[a['sentiment']] += 1
        rating_counter[a['rating']] += 1
        for axis, subs in a['axes'].items():
            for sub in subs:
                axis_counter[axis][sub] += 1

    total = len(analyzed)
    return {
        "brand": brand_name,
        "total_reviews": total,
        "avg_rating": round(sum(a['rating'] for a in analyzed) / total, 2) if total else 0,
        "sentiment": dict(sentiment_counter),
        "rating_dist": dict(rating_counter),
        "axis_breakdown": {axis: dict(c) for axis, c in axis_counter.items()},
        "top_axis_keywords": {axis: c.most_common(3) for axis, c in axis_counter.items()},
        "reviews_analyzed": analyzed
    }

def main():
    brands = {
        "약손명가 (광고주)": "yakson-products.json",
        "메이크온": "competitor-makeon.json",
        "메디큐브": "competitor-medicube.json",
        "LG프라엘": "competitor-lgpral.json"
    }

    results = {}
    for brand, fname in brands.items():
        path = os.path.join(BASE, fname)
        if not os.path.exists(path):
            continue
        with open(path) as f:
            data = json.load(f)
        results[brand] = aggregate_brand(brand, data)
        print(f"\n=== {brand} ({results[brand]['total_reviews']} reviews, 평균 {results[brand]['avg_rating']}점) ===")
        print(f"  Sentiment: {results[brand]['sentiment']}")
        print(f"  Top axis keywords:")
        for axis, top in results[brand]['top_axis_keywords'].items():
            if top:
                print(f"    {axis}: {top}")

    # 비교 매트릭스
    comparison = {}
    for axis_name in AXES.keys():
        comparison[axis_name] = {}
        for subcat in AXES[axis_name].keys():
            comparison[axis_name][subcat] = {
                brand: results[brand]['axis_breakdown'].get(axis_name, {}).get(subcat, 0)
                for brand in results.keys()
            }

    final = {
        "_meta": {
            "collected_at": "2026-05-28",
            "source": "naver brand stores (brand.naver.com)",
            "total_reviews": sum(r['total_reviews'] for r in results.values()),
            "brands": list(results.keys())
        },
        "by_brand": results,
        "axis_comparison_matrix": comparison
    }

    out_path = os.path.join(BASE, "analysis-result.json")
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(final, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Total: {final['_meta']['total_reviews']} reviews analyzed")
    print(f"✅ Saved: {out_path}")

    # 핵심 발견 출력
    print("\n=== 핵심 발견 비교 ===")
    print(f"{'축·서브카테고리':<35} | " + " | ".join(f"{b:>10}" for b in results.keys()))
    print("-" * 100)
    for axis, subs in comparison.items():
        for sub, counts in subs.items():
            if any(c > 0 for c in counts.values()):
                row = f"{axis}·{sub:<25} | " + " | ".join(f"{counts[b]:>10}" for b in results.keys())
                print(row)

if __name__ == "__main__":
    main()
