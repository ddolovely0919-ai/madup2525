#!/usr/bin/env python3
"""각 상품의 상세페이지 핵심 이미지 다운로드 + 섹션 라벨링"""
import json, os, urllib.request, ssl

BASE = "/Users/madup/Documents/제안서_자동화/factbook-app/data/yakson/product-pages"
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def download(url, out_path):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
            data = r.read()
        with open(out_path, 'wb') as f:
            f.write(data)
        return len(data)
    except Exception as e:
        return f"ERR: {e}"

def main():
    for slug in os.listdir(BASE):
        json_path = os.path.join(BASE, slug, "images.json")
        if not os.path.exists(json_path):
            continue
        with open(json_path) as f:
            data = json.load(f)

        print(f"\n=== {data['product']} ===")
        images = data['images']

        # 상위 12개 (height > 500) 다운로드
        big = [i for i in images if i.get('h', 0) >= 500][:15]
        os.makedirs(os.path.join(BASE, slug, "sections"), exist_ok=True)

        for idx, img in enumerate(big):
            url = img['src']
            ext = '.gif' if '.gif' in url.lower() else ('.png' if '.png' in url.lower() else '.jpg')
            fname = f"{idx+1:02d}_y{img['top']:06d}_{img['w']}x{img['h']}{ext}"
            out_path = os.path.join(BASE, slug, "sections", fname)
            if os.path.exists(out_path) and os.path.getsize(out_path) > 1000:
                print(f"  {fname} (skip)")
                continue
            r = download(url, out_path)
            print(f"  {fname} → {r if isinstance(r, str) else f'{r//1024}KB'}")

if __name__ == "__main__":
    main()
