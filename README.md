# AI Product Video Studio

Nền tảng tạo video sản phẩm bằng AI, ưu tiên vận hành trong các hạn mức miễn phí. Kiến trúc hiện tại sử dụng Cloudflare Workers + D1, ImageKit và bộ dựng video MP4 chạy trực tiếp trên trình duyệt.

## Nguyên tắc vận hành miễn phí

- **Không gọi API tạo video tính phí:** endpoint tạo video AI bên ngoài (fal.ai/MiniMax H3 Max) đã bị khóa ở phía Worker. Mọi yêu cầu mới bị từ chối trước khi gửi sang nhà cung cấp.
- **Dựng MP4 tại trình duyệt:** sử dụng ảnh sản phẩm, chuyển động camera, hiệu ứng, nhạc nền và giọng đọc để dựng video mà không cần máy chủ GPU hoặc API video trả phí.
- **AI viết kịch bản/phân tích:** dùng Gemini 3.8 Flash, model có mức sử dụng miễn phí theo hạn mức Google công bố. Khi API không được cấu hình, hết quota hoặc lỗi, hệ thống chuyển về chế độ kịch bản/phân tích cấu trúc miễn phí.
- **AI Text-to-Speech:** dùng Gemini 3.8 Flash-Lite TTS theo hạn mức miễn phí. Nếu không khả dụng, giao diện có thể dùng giọng đọc có sẵn của trình duyệt.
- **Lưu trữ media:** ImageKit gói Forever Free; cần theo dõi giới hạn lưu trữ và băng thông. Khi đạt giới hạn miễn phí, dịch vụ có thể dừng nhận upload/đưa media thay vì tự động nâng cấp.
- **Không đưa API key vào trình duyệt:** các khóa Gemini, ImageKit và các bí mật khác chỉ được lưu ở môi trường máy chủ/Worker.

> Lưu ý: “Miễn phí” luôn đi kèm hạn mức và điều kiện của nhà cung cấp, không đồng nghĩa tạo video AI sinh chuyển động không giới hạn. Gemini API cần được tạo từ Google AI Studio project sử dụng Free Tier và **không liên kết billing** nếu mục tiêu là không phát sinh phí. Google có thể sử dụng dữ liệu gửi lên Free Tier để cải thiện sản phẩm theo điều khoản của họ.

## Các tính năng hiện có

1. Đăng ký, đăng nhập, quản lý phiên và phân quyền tài khoản.
2. Super Admin phê duyệt tài khoản và quản lý hạn mức.
3. Quản lý sản phẩm, ảnh gốc và thư viện media.
4. Phân tích thông tin sản phẩm và tạo kịch bản nhiều phương án.
5. Chỉnh sửa phân cảnh, lời thoại, chữ hiển thị, chuyển động, hiệu ứng và nhạc nền.
6. Xem trước và dựng/xuất MP4 trực tiếp trên trình duyệt.
7. Lưu dự án, video đã xuất và lịch sử sử dụng AI.
8. Giao diện responsive cho desktop, tablet và mobile.

## Giới hạn miễn phí tham khảo

Các giới hạn dưới đây được đối chiếu với trang giá chính thức ngày 16/11/2026; nhà cung cấp có thể thay đổi:

| Dịch vụ | Hạn mức miễn phí công bố | Ứng xử khi hết hạn mức |
|---|---|---|
| Cloudflare Workers | 100.000 request/ngày; CPU 10 ms/invocation trên Free | Request có thể bị từ chối; không tự nâng cấp |
| Cloudflare D1 | 5 triệu rows read/ngày; 100.000 rows written/ngày; 5 GB tổng lưu trữ Free | Truy vấn bị lỗi cho đến khi hạn mức reset |
| ImageKit Forever Free | 3 GB lưu trữ; 20 GB bandwidth/tháng; 500 video units/tháng | Upload/processing/delivery có thể dừng theo giới hạn |
| Gemini API | Miễn phí với một số model và giới hạn theo project | Dùng fallback; không chuyển sang model tính phí |
| Gemini TTS | Miễn phí theo hạn mức model Free Tier | Dùng browser speech hoặc không có audio |
| fal.ai/MiniMax | API tính phí theo giây | Bị khóa trong chế độ vận hành miễn phí |

## Cấu hình môi trường

Các secret chỉ cấu hình ở Cloudflare Worker Secrets hoặc môi trường máy chủ:

- `GEMINI_API_KEY`: khóa Gemini API từ một project không liên kết billing để sử dụng Free Tier.
- `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT`: thông tin ImageKit.
- `BOOTSTRAP_ADMIN_KEY`: chỉ dùng trong bước khởi tạo Super Admin; xóa sau khi khởi tạo.
- `APP_ORIGIN`, `SESSION_DAYS`: cấu hình ứng dụng/phiên.

Không cần cấu hình `FAL_KEY` để sử dụng quy trình dựng MP4 miễn phí. Dù có secret này, API submit tạo video trả phí vẫn bị khóa ở phía Worker.

## Phát triển và triển khai

```bash
npm ci
npm run typecheck
npm run build
npm run dev
```

Triển khai Cloudflare Workers bằng workflow GitHub Actions hiện có. Workflow chạy typecheck/build, áp dụng migration D1 rồi mới deploy Worker. Không thay đổi database production ngoài các migration đã được kiểm tra.

## Nguyên tắc bảo toàn hệ thống

- Chỉ sử dụng nhánh `main`.
- Không thay đổi schema D1 production nếu không cần thiết.
- Không xóa dữ liệu, chức năng tài khoản, sản phẩm, dự án, video hoặc cấu hình quản trị.
- Không commit secret, token hoặc thông tin xác thực.
- Khi thay đổi AI provider, luôn giữ fallback miễn phí và không tự chuyển sang dịch vụ tính phí.
