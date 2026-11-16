# AI Product Video Studio

Nền tảng tạo video sản phẩm bằng AI triển khai theo mô hình serverless trên Cloudflare Workers, D1 và ImageKit; không yêu cầu tự vận hành máy chủ GPU.

## Trạng thái

Giai đoạn nền tảng tài khoản: đã bổ sung mã nguồn API Worker, migration D1, giao diện đăng nhập/đăng ký, quản lý tài khoản và hướng dẫn khởi tạo Super Admin. Chưa tạo D1 production, cấu hình secrets hoặc triển khai Worker.

## Nguyên tắc

- Chỉ sử dụng nhánh `main`.
- Cloudflare Pages + Workers + D1 là kiến trúc triển khai dự kiến.
- ImageKit là lựa chọn lưu trữ hình ảnh và video; không sử dụng Cloudflare R2.
- Gemini TTS được gọi từ Cloudflare Worker bằng GEMINI_API_KEY; không cần máy chủ Kokoro riêng.
- Tạo video AI dùng API suy luận lưu trữ sẵn MiniMax H3 Max trên fal.ai; không cần tự cài ComfyUI/GPU. FAL_KEY phải được lưu dưới dạng Cloudflare Worker Secret.
- Các API key riêng tư chỉ được sử dụng trong Worker, không gửi về trình duyệt.
- Tài khoản Super Admin được bảo vệ ở phía máy chủ.
- Mọi tài khoản đăng ký mới phải được Super Admin phê duyệt trước khi tạo video.
- Giao diện responsive cho desktop, tablet và mobile.

## Lộ trình

1. Nền tảng giao diện và xác thực/phân quyền.
2. Quản lý sản phẩm và tạo kịch bản.
3. Giọng đọc tiếng Việt.
4. Dựng và xuất video.
5. Thư viện mẫu và công cụ quản trị.

Các thông tin cấu hình và bí mật phải được lưu trong Cloudflare Worker Secrets hoặc môi trường triển khai, không đưa vào mã nguồn. Để bật tạo video AI, cấu hình secret FAL_KEY; Gemini TTS dùng GEMINI_API_KEY hiện có.
