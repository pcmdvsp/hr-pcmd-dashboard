# Thiết lập Edge Function: Admin đặt mật khẩu tạm

Chức năng **Reset password** trong HR Dashboard cho phép Admin đặt mật khẩu tạm cho normal user. Sau khi thành công, user đó bắt buộc phải đặt mật khẩu mới ở lần đăng nhập tiếp theo.

## 1. Cơ chế bảo mật

Function `admin-set-password` thực hiện theo thứ tự sau:

1. Supabase Gateway yêu cầu JWT hợp lệ (`verify_jwt = true`).
2. Function kiểm tra user gọi Function có `profiles.role = 'admin'` và đang active.
3. Function chỉ cho phép đặt mật khẩu cho profile active có role `normal`.
4. Function đặt mật khẩu trong Supabase Auth và đặt `profiles.must_change_password = true`.

`service_role`/secret key chỉ tồn tại trong Edge Function. Không thêm key này vào `.env.local`, React code, GitHub Pages hoặc GitHub Actions secrets.

## 2. Chuẩn bị

Bạn cần có quyền truy cập Supabase project, tối thiểu đủ để deploy Edge Function. Cần Node.js để chạy Supabase CLI qua `npx`.

Code Function đã có sẵn tại:

`supabase/functions/admin-set-password/index.ts`

Cấu hình bắt buộc JWT đã có tại:

`supabase/config.toml`

```toml
[functions.admin-set-password]
verify_jwt = true
```

Không dùng cờ `--no-verify-jwt` khi deploy Function này.

## 3. Đăng nhập Supabase CLI

Mở **Command Prompt (CMD)** và chạy:

```cmd
cd /d "D:\Data\Python\Company Website"
npx supabase@latest --version
npx supabase@latest login
```

CLI sẽ yêu cầu Personal Access Token (thường sẽ tạo tự động, nhập token trên web vào cmd) nếu không thì Tạo token tại Supabase Dashboard → **Account → Access Tokens**, sau đó dán token vào terminal.

## 4. Liên kết với Supabase project

Lấy **Project Reference ID** tại Supabase Project -> Intergations -> Data API --> API URL

Hoặc chạy tại cmd lệnh

supabase projects list

Chạy lệnh, thay `YOUR_PROJECT_REF` bằng Project Reference ID thực tế:

```cmd
npx supabase@latest link --project-ref YOUR_PROJECT_REF
```

CLI có thể hỏi Database Password. Đây là mật khẩu database trong **Settings → Database**, không phải password của tài khoản Supabase.

## 5. Deploy Function

Tại thư mục dự án, chạy:

```cmd
npx supabase@latest functions deploy admin-set-password
```

Sau khi thành công, vào Supabase Dashboard → **Edge Functions** để kiểm tra có Function `admin-set-password`.

## 6. Kiểm tra verify_jwt và secrets

1. Mở `supabase/config.toml`; xác nhận `verify_jwt = true`.
2. Khi deploy, không dùng `--no-verify-jwt`.
3. Trong Supabase Dashboard → **Edge Functions → Secrets**, xác nhận các default secrets của hosted Supabase vẫn tồn tại, đặc biệt `SUPABASE_URL` và secret/service-role key. Không cần tạo hoặc sao chép các giá trị này vào frontend.

## 7. Kiểm thử trên HR Dashboard

1. Đăng nhập bằng tài khoản có `profiles.role = 'admin'`.
2. Trên Dashboard, chọn **Reset password**.
3. Nhập email của normal user, mật khẩu tạm từ 8 ký tự trở lên và xác nhận mật khẩu.
4. Chọn **Set temporary password**.
5. Normal user đăng nhập bằng mật khẩu tạm.
6. Ứng dụng phải chuyển ngay tới **Change password** vì `must_change_password` đã được đặt thành `true`.
7. Sau khi user đổi mật khẩu thành công, ứng dụng tự đặt lại `must_change_password = false`.

## 8. Xử lý lỗi thường gặp

- **Function not found / 404:** deploy lại Function đúng project reference.
- **401 Invalid JWT:** Admin cần đăng nhập lại HR Dashboard; xác nhận không deploy với `--no-verify-jwt` và `verify_jwt` vẫn là `true`.
- **403 Only active administrators:** profile đang đăng nhập chưa có `role = 'admin'` hoặc `active = true`.
- **Function secrets are not configured:** vào Edge Functions → Secrets kiểm tra default secrets; không đưa service key vào frontend.
- **Không thấy chi tiết lỗi:** mở Supabase Dashboard → Edge Functions → `admin-set-password` → Logs.
