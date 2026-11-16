# Chính sách AI miễn phí và kiểm soát chi phí

**Ngày rà soát:** 16/11/2026  
**Repository:** Xuanthang86/AIProductVideoStudio

## 1. Mục tiêu

Giữ cho website hoạt động trong các gói miễn phí, không tự gọi API tính phí, không tự nâng cấp gói dịch vụ và không tự chuyển sang nhà cung cấp trả phí khi hết quota.

Không cam kết “AI video sinh chuyển động miễn phí không giới hạn”: tại thời điểm rà soát, endpoint fal.ai MiniMax H3 Max đang được website dùng tính phí theo giây video. Vì vậy chức năng gọi endpoint này đã bị chặn ở Worker.

## 2. Ma trận dịch vụ

| Nhu cầu | Phương án | Trạng thái |
|---|---|---|
| Viết kịch bản / phân tích sản phẩm | Gemini 3.8 Flash Free Tier | Được dùng nếu API key thuộc project không bật billing; fallback rule-based |
| Tạo giọng đọc | Gemini 3.8 Flash-Lite TTS Free Tier | Được dùng theo quota; fallback browser speech |
| Dựng MP4 | Bộ dựng Canvas/MP4 chạy trên trình duyệt | Miễn phí, sử dụng tài nguyên thiết bị người dùng |
| Tạo cảnh video AI bằng fal.ai | MiniMax H3 Max image-to-video | Đã khóa; Worker không gửi yêu cầu mới |
| Lưu ảnh/video | ImageKit Forever Free | Có giới hạn 3 GB và 20 GB bandwidth/tháng |
| API và database | Cloudflare Workers Free + D1 Free | Có giới hạn request, CPU, rows read/write và storage |

## 3. Điều kiện để Gemini không phát sinh phí

1. Tạo/duy trì project trong Google AI Studio.
2. Chỉ sử dụng model được đánh dấu Free Tier trên trang giá tại thời điểm triển khai.
3. Không liên kết billing account vào project dùng cho website.
4. Không bật cơ chế tự động chuyển model sang model có giá khi quota hết.
5. Giữ fallback rule-based cho phân tích/kịch bản và browser speech cho giọng đọc.
6. Kiểm tra trang giá và quota định kỳ vì Google có thể đổi tên model, hạn mức hoặc điều khoản.

Google nêu rõ dữ liệu sử dụng Free Tier có thể được dùng để cải thiện sản phẩm; không gửi dữ liệu nhạy cảm hoặc bí mật kinh doanh lên API Free Tier nếu chưa đánh giá điều khoản phù hợp.

## 4. Kiểm soát dịch vụ tạo video tính phí

- Endpoint `/api/ai/video/submit` trả về HTTP 410 trước khi gọi fal.ai.
- `wan_video` không được báo là sẵn sàng trong danh sách capability.
- Việc có `FAL_KEY` trong môi trường không mở khóa endpoint.
- Dựng MP4 trực tiếp trên trình duyệt vẫn hoạt động độc lập với endpoint trên.
- Không xóa các bảng lịch sử AI video hoặc dữ liệu cũ; thay đổi chỉ chặn tạo job mới.

## 5. Giới hạn nền tảng

### Cloudflare Workers Free
- 100.000 request/ngày.
- CPU 10 ms mỗi invocation.
- Vượt giới hạn Free có thể khiến request thất bại; không tự nâng lên Workers Paid.

### Cloudflare D1 Free
- 5 triệu rows read/ngày.
- 100.000 rows written/ngày.
- 5 GB tổng lưu trữ Free; tối đa 500 MB cho một database Free theo trang giới hạn.
- Khi chạm giới hạn rows read/write, truy vấn bị từ chối cho đến khi reset.

### ImageKit Forever Free
- 3 GB DAM storage.
- 20 GB bandwidth/tháng.
- 500 video units/tháng.
- Khi vượt giới hạn, upload/processing/delivery có thể bị dừng. Không bật gói Lite/Pro hoặc overage nếu chưa được chủ website chấp thuận.

## 6. Kiểm tra sau triển khai

1. `npm run typecheck`
2. `npm run build`
3. Gọi `GET /api/health`: xác nhận `paidVideoGenerationEnabled=false`.
4. Gọi `GET /api/ai/capabilities`: xác nhận `wan_video.runtimeReady=false`.
5. Gọi `POST /api/ai/video/submit` bằng tài khoản hợp lệ: phải nhận HTTP 410 và không tạo request fal.ai.
6. Kiểm tra viết kịch bản fallback, TTS fallback và dựng MP4 tại trình duyệt.
7. Kiểm tra login, sản phẩm, dự án, thư viện video và dữ liệu D1 không bị ảnh hưởng.

## 7. Tài liệu giá chính thức

- Gemini API: https://ai.google.dev/gemini-api/docs/pricing
- Cloudflare Workers: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Cloudflare D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- ImageKit: https://imagekit.io/plans/
- fal.ai: https://fal.ai/pricing
