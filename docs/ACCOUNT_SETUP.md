# Tài khoản, D1 và triển khai

## Phạm vi đã có trong mã nguồn
- API đăng ký, đăng nhập, đăng xuất, kiểm tra phiên và đổi mật khẩu.
- Tài khoản đăng ký mới có trạng thái `PENDING_APPROVAL`; chưa thể đăng nhập cho tới khi được duyệt.
- Vai trò: `SUPER_ADMIN`, `ADMIN`, `EDITOR`, `USER`.
- API quản trị duyệt/từ chối, khóa/mở, đổi vai trò, đặt lại mật khẩu và xóa tài khoản.
- Cookie phiên HttpOnly + Secure + SameSite=Lax; token phiên chỉ lưu dạng SHA-256 trong D1.
- Mật khẩu băm PBKDF2-HMAC-SHA256 (310.000 vòng, salt ngẫu nhiên).
- Các thao tác quản trị được kiểm tra quyền ở Worker; mọi endpoint quản trị đều yêu cầu phiên hợp lệ.
- Super Admin được chặn ở backend khỏi đổi vai trò, khóa, xóa hoặc thay đổi trạng thái. Cơ sở dữ liệu có unique partial index để chỉ tồn tại một Super Admin.
- Đổi mật khẩu cá nhân luôn yêu cầu mật khẩu hiện tại; reset mật khẩu tài khoản khác do Super Admin thực hiện không cần mật khẩu cũ của người nhận.

## Tạo D1 lần đầu
1. Tạo database trên Cloudflare hoặc chạy: `npx wrangler d1 create ai-product-video-studio-db`.
2. Lấy `database_id` do Cloudflare trả về và thay giá trị mẫu trong `wrangler.toml`.
3. Chạy migration: `npx wrangler d1 migrations apply ai-product-video-studio-db --remote`.
4. Cấu hình Worker secret: `npx wrangler secret put BOOTSTRAP_ADMIN_KEY` (dùng chuỗi ngẫu nhiên dài, không dùng lại mật khẩu đăng nhập).
5. Đặt `APP_ORIGIN` thành origin triển khai chính xác (ví dụ `https://aivideo.xuanthang.io.vn`) bằng secret/vars phù hợp. Không trỏ hoặc thay đổi DNS tên miền gốc.

## Khởi tạo Super Admin đúng một lần
Gửi POST tới `/api/auth/bootstrap`, header `x-bootstrap-key: <BOOTSTRAP_ADMIN_KEY>`, Content-Type application/json, body:
`{"email":"email-quan-tri-cua-ban","fullName":"Super Admin","password":"mat-khau-manh-tu-12-ky-tu"}`

Endpoint chỉ hoạt động khi chưa có Super Admin. Sau khi tạo thành công, xóa secret `BOOTSTRAP_ADMIN_KEY` khỏi Worker environment ngay. Không đưa key hay mật khẩu vào mã nguồn, GitHub, ảnh chụp màn hình hoặc trao đổi công khai.

## API
- `POST /api/auth/register`: { fullName, email, password }
- `POST /api/auth/login`: { email, password }
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/change-password`: { currentPassword, newPassword }
- `GET /api/admin/users`
- `POST /api/admin/users/:id/approve|reject|disable|enable|delete`
- `POST /api/admin/users/:id/role`: { role }
- `POST /api/admin/users/:id/reset-password`: { newPassword }

## Lưu ý trước khi đưa vào vận hành
Mã nguồn backend đã được chuẩn bị nhưng chưa thể hoạt động production cho tới khi D1 thật được tạo, migration được áp dụng, Worker được deploy và secrets/origin được cấu hình. Chưa tạo tài khoản Super Admin nào và không có mật khẩu mặc định. Nên bật Cloudflare rate limiting/WAF cho endpoint đăng nhập và đăng ký. Cấu hình APP_ORIGIN phải khớp chính xác domain production để chống CSRF bằng kiểm tra Origin.
