# AI Product Video Studio

Nền tảng tạo video sản phẩm bằng AI theo định hướng free-first.

## Trạng thái

Giai đoạn 1: khởi tạo nền tảng và thiết kế kiến trúc. Chưa kết nối dịch vụ AI trả phí, chưa cấu hình tên miền hoặc triển khai production.

## Nguyên tắc

- Chỉ sử dụng nhánh `main`.
- Cloudflare Pages + Workers + D1 là kiến trúc triển khai dự kiến.
- ImageKit là lựa chọn lưu trữ hình ảnh; không sử dụng Cloudflare R2.
- Tài khoản Super Admin được bảo vệ ở phía máy chủ.
- Mọi tài khoản đăng ký mới phải được Super Admin phê duyệt trước khi tạo video.
- Giao diện responsive cho desktop, tablet và mobile.

## Lộ trình

1. Nền tảng giao diện và xác thực/phân quyền.
2. Quản lý sản phẩm và tạo kịch bản.
3. Giọng đọc tiếng Việt.
4. Dựng và xuất video.
5. Thư viện mẫu và công cụ quản trị.

Các thông tin cấu hình và bí mật phải được lưu trong môi trường triển khai, không đưa vào mã nguồn.
