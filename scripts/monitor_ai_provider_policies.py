#!/usr/bin/env python3
"""Monitor official AI/storage/platform pricing pages for material changes.

Uses only Python's standard library. A failed source fetch fails the run and
does not replace the last known-good baseline.
"""
from __future__ import annotations

import hashlib
import html
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

SOURCES = [
    {
        "id": "gemini-api-pricing",
        "name": "Google Gemini API pricing",
        "url": "https://ai.google.dev/gemini-api/docs/pricing/",
        "why": "Model pricing, Free Tier availability, quotas and billing conditions.",
    },
    {
        "id": "gemini-api-terms",
        "name": "Google Gemini API additional terms",
        "url": "https://ai.google.dev/gemini-api/terms?authuser=00",
        "why": "Data use, service conditions and terms that affect Free Tier use.",
    },
    {
        "id": "cloudflare-workers-pricing",
        "name": "Cloudflare Workers pricing",
        "url": "https://developers.cloudflare.com/workers/platform/pricing/",
        "why": "Free plan request limits and paid-plan/overage conditions.",
    },
    {
        "id": "cloudflare-workers-limits",
        "name": "Cloudflare Workers limits",
        "url": "https://developers.cloudflare.com/workers/platform/limits/",
        "why": "CPU, request and platform limits.",
    },
    {
        "id": "cloudflare-d1-pricing",
        "name": "Cloudflare D1 pricing",
        "url": "https://developers.cloudflare.com/d1/platform/pricing/",
        "why": "Database storage, reads, writes and billing thresholds.",
    },
    {
        "id": "cloudflare-d1-limits",
        "name": "Cloudflare D1 limits",
        "url": "https://developers.cloudflare.com/d1/platform/limits/",
        "why": "Database size, query and operational limits.",
    },
    {
        "id": "imagekit-plans",
        "name": "ImageKit plans",
        "url": "https://imagekit.io/plans/",
        "why": "Free storage, bandwidth, video units and overage/upgrade rules.",
    },
    {
        "id": "fal-ai-pricing",
        "name": "fal.ai pricing",
        "url": "https://fal.ai/pricing",
        "why": "Paid video-generation API pricing; monitored even though paid calls are disabled.",
    },
]

class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"style", "noscript", "svg"}:
            self.hidden_depth += 1

    def handle_endtag(self, tag):
        if tag in {"style", "noscript", "svg"} and self.hidden_depth:
            self.hidden_depth -= 1

    def handle_data(self, data):
        if not self.hidden_depth:
            value = re.sub(r"\s+", " ", html.unescape(data)).strip()
            if value:
                self.parts.append(value)

def fetch_source(source):
    request = urllib.request.Request(
        source["url"],
        headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    with urllib.request.urlopen(request, timeout=35) as response:
        status = getattr(response, "status", 200)
        if status < 200 or status >= 300:
            raise RuntimeError(f"HTTP {status}")
        raw = response.read(4_000_000)
        charset = response.headers.get_content_charset() or "utf-8"
    parser = VisibleText()
    parser.feed(raw.decode(charset, errors="replace"))
    text = re.sub(r"\s+", " ", " ".join(parser.parts)).strip()
    if len(text) < 500:
        raise RuntimeError(f"Page content unexpectedly short ({len(text)} characters): {text[:240]}")
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return {
        **source,
        "sha256": digest,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "text_excerpt": text[:12000],
    }

def main():
    cache_dir = Path(".monitor-cache")
    cache_dir.mkdir(parents=True, exist_ok=True)
    baseline_path = cache_dir / "latest.json"
    old = {}
    if baseline_path.exists():
        try:
            old = json.loads(baseline_path.read_text(encoding="utf-8")).get("sources", {})
        except Exception as exc:
            raise RuntimeError(f"Cannot read previous baseline safely: {exc}") from exc

    current = {}
    failures = []
    for source in SOURCES:
        try:
            current[source["id"]] = fetch_source(source)
            print(f"OK {source['id']}")
        except (urllib.error.URLError, TimeoutError, OSError, RuntimeError, ValueError) as exc:
            failures.append(f"- {source['name']} ({source['url']}): {exc}")
            print(f"FAILED {source['id']}: {exc}", file=sys.stderr)

    # Never update the baseline if any official source could not be verified.
    if failures:
        print("One or more sources could not be verified; baseline was not changed.", file=sys.stderr)
        print("\n".join(failures), file=sys.stderr)
        return 2

    first_run = not bool(old)
    changed = []
    if not first_run:
        for source_id, item in current.items():
            previous = old.get(source_id)
            if previous and previous.get("sha256") != item["sha256"]:
                changed.append((previous, item))
            elif not previous:
                changed.append(({}, item))

    snapshot = {
        "schema_version": 1,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "sources": current,
    }
    baseline_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    report_lines = [
        "# Báo cáo giám sát giá và hạn mức dịch vụ AI",
        "",
        f"Thời điểm kiểm tra: {snapshot['checked_at']}",
        "",
    ]
    if first_run:
        report_lines += [
            "Đây là lần chạy đầu tiên. Đã tạo baseline từ các trang chính thức; chưa thể kết luận có thay đổi.",
            "",
        ]
    elif not changed:
        report_lines += ["Không phát hiện thay đổi nội dung trên các trang nguồn đã kiểm tra.", ""]
    else:
        report_lines += [f"Phát hiện **{len(changed)} nguồn có nội dung thay đổi**. Cần rà soát nội dung thực tế trước khi kết luận giá/hạn mức đã đổi.", ""]
        for previous, item in changed:
            report_lines += [
                f"## {item['name']}",
                f"- Trang chính thức: {item['url']}",
                f"- Mục đích theo dõi: {item['why']}",
                f"- SHA-256 trước: {previous.get('sha256', 'Chưa có baseline')}",
                f"- SHA-256 hiện tại: {item['sha256']}",
                "",
                "### Nội dung trang hiện tại (trích đoạn)",
                item["text_excerpt"][:5000],
                "",
            ]
    report_lines += [
        "## Phạm vi và giới hạn",
        "- Đây là cảnh báo thay đổi nội dung trang nguồn, không tự khẳng định giá/quota đã thay đổi.",
        "- Cần đối chiếu điều khoản, bảng giá và phạm vi áp dụng trên trang chính thức trước khi sửa website.",
        "- Quy trình chỉ đọc trang công khai; không gọi API trả phí, không thay đổi cấu hình, dữ liệu D1 hoặc gói dịch vụ.",
        "",
    ]
    Path("provider-monitor-report.md").write_text("\n".join(report_lines), encoding="utf-8")
    with open(os.environ.get("GITHUB_OUTPUT", "/dev/null"), "a", encoding="utf-8") as output:
        output.write(f"first_run={'true' if first_run else 'false'}\n")
        output.write(f"changed={'true' if bool(changed) else 'false'}\n")
        output.write(f"changed_count={len(changed)}\n")
    print(f"Completed. first_run={first_run}; changed={len(changed)}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
