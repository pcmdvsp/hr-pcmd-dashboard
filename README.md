# Dashboard Nhân sự Ban

React + Vite frontend dùng Supabase Auth và PostgreSQL; không có backend Node.js. Trạng thái `Đi làm` là mặc định và không được ghi xuống `daily_status`.

## Chạy local

> Cần Node.js 20 hoặc 22 LTS. Không dùng Node 26 hiện tại: một số môi trường Windows có thể làm native binary `esbuild` tự dừng khi Vite khởi động.

1. Tạo Supabase project, vào **SQL Editor** và chạy toàn bộ [supabase_schema.sql](./supabase_schema.sql). Sau đó chạy [supabase_monthly_statistics.sql](./supabase_monthly_statistics.sql) để tạo `work_calendar`, RLS và các function thống kê tháng.
2. Trong **Authentication → Providers**, bật Email/Password. Tạo từng tài khoản trong **Authentication → Users**, sau đó thêm hồ sơ tương ứng vào `profiles` bằng SQL (mẫu có trong schema). Tài khoản quản trị đầu tiên đặt `role = 'admin'`.
3. Sao chép `.env.example` thành `.env.local`, điền Project URL và anon/publishable key (Settings → API). Không dùng service-role key ở frontend.
4. Cài và chạy: `npm install`, sau đó `npm run dev`.

Mỗi user mới đặt `must_change_password = true`; màn hình đầu tiên sau khi đăng nhập sẽ bắt đổi mật khẩu. Reset mật khẩu/tạo Auth user không thể an toàn từ trình duyệt với anon key: nên dùng Supabase Dashboard hoặc triển khai Edge Function chỉ dành cho admin. Đây là TODO bảo mật có chủ ý: không được nhúng `service_role` key vào GitHub Pages.

## Deploy GitHub Pages

1. Đổi `hr-status-dashboard` trong `vite.config.js` thành đúng tên repository nếu khác.
2. Đẩy code lên nhánh `main`. Trong GitHub repo, vào **Settings → Pages**, chọn **GitHub Actions**.
3. Tạo hai Actions secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Workflow `.github/workflows/deploy.yml` sẽ build và deploy.

Lưu ý: anon key có thể xuất hiện trong bundle frontend theo thiết kế Supabase; dữ liệu được bảo vệ bởi RLS. Không bao giờ đưa `service_role` key lên GitHub Pages.
