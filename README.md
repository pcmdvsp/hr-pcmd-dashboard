# Working Status Dashboard

Ứng dụng dashboard nội bộ quản lý trạng thái làm việc và lịch họp nhân sự, xây dựng bằng React, Vite và Supabase. Ứng dụng không có backend Node.js riêng: xác thực, cơ sở dữ liệu, Row Level Security (RLS) và dữ liệu realtime-ready đều sử dụng Supabase.

## Chức năng chính

- Dashboard theo ngày, lọc theo phòng ban, tên/mã nhân viên và trạng thái.
- Trạng thái: Working, Business trip, Annual leave, Sick leave và Meeting.
- Work Calendar cho admin: ngày làm việc, cuối tuần, ngày lễ và ngày nghỉ đặc biệt.
- Monthly Statistics tính trực tiếp từ `daily_status` và `work_calendar`; không lưu bảng tổng tháng.
- My Status gồm lịch 14 ngày, trạng thái cuối tuần/ngày lễ, Business trip kéo dài và overtime cuối tuần.
- Meeting Info: tạo, sửa, hủy cuộc họp; người tham gia, nội dung, địa điểm, Online Link, kiểm tra trùng KNT meeting room và thêm nhanh thành viên theo phòng ban.
- Meeting notification: chuông thông báo cá nhân cho meeting mới, meeting được cập nhật và meeting bị hủy.
- Xuất file `.ics` để người tham gia thêm meeting vào Outlook Calendar với reminder 10 phút.
- Phân quyền admin/normal user bằng Supabase RLS.

## Yêu cầu

- Node.js `>=20 <27`. CI đang dùng Node 22 LTS; đây là lựa chọn khuyến nghị trên Windows.
- Một Supabase project.
- npm đi kèm Node.js.

> Node 26 được khai báo hỗ trợ, nhưng nếu Vite báo `failed to load config` hoặc `spawn EPERM` trên Windows, nguyên nhân thường là binary native của `esbuild` trong `node_modules`. Xem phần Khắc phục sự cố bên dưới.

## Cài đặt và chạy local

1. Clone hoặc mở thư mục dự án.

2. Tạo file `.env.local` từ `.env.example`:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. Điền thông tin Supabase vào `.env.local`:

   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
   ```

   Lấy các giá trị tại Supabase Dashboard → **Settings → API**. Không bao giờ dùng `service_role` key ở frontend.

4. Cài dependencies và chạy:

   ```powershell
   npm ci
   npm run dev
   ```

5. Mở địa chỉ Vite hiển thị trong terminal, thường là `http://localhost:5173`.

## Thiết lập Supabase

Trong Supabase **SQL Editor**, chạy các file theo thứ tự sau:

1. [`supabase_schema.sql`](./supabase_schema.sql) — cấu trúc nền tảng: `profiles`, `departments`, `daily_status`, RLS và hàm đổi mật khẩu.
2. [`supabase_monthly_statistics.sql`](./supabase_monthly_statistics.sql) — `work_calendar`, RLS calendar và function thống kê tháng.
3. [`supabase_meeting_info.sql`](./supabase_meeting_info.sql) — bảng meetings/attendees/views/cancellation notifications, Online Link, overtime và các policy liên quan.

Các file hỗ trợ chỉ chạy khi cần:

- [`supabase_fix_departments_rls.sql`](./supabase_fix_departments_rls.sql): sửa quyền RLS của departments.
- [`supabase_fix_password_change.sql`](./supabase_fix_password_change.sql): sửa hàm bắt đổi mật khẩu.

Sau khi cập nhật code có thêm tính năng meeting, notification hoặc overtime, hãy chạy lại `supabase_meeting_info.sql`; các câu lệnh migration trong file sử dụng `if not exists` khi phù hợp.

### Tạo user và profile

1. Vào **Authentication → Users** và tạo Email/Password user.
2. Sao chép UUID của Auth user.
3. Thêm profile tương ứng vào bảng `profiles` với UUID đó. Mẫu SQL có trong `supabase_schema.sql`.
4. Tài khoản admin đầu tiên cần `role = 'admin'`.

Đặt `must_change_password = true` nếu muốn user phải đổi mật khẩu ở lần đăng nhập tiếp theo.

## Quy tắc dữ liệu

- `daily_status` là nguồn dữ liệu gốc cho trạng thái và thống kê.
- Không có bản ghi `daily_status` trên working day nghĩa là **Working**.
- Business trip có thể kéo dài qua cuối tuần để Dashboard/My Status phản ánh nhân sự vẫn đang công tác; monthly statistics chỉ đếm `working_day` từ `work_calendar`.
- Working/Meeting vào cuối tuần yêu cầu user xác nhận overtime.
- Meeting được lưu trong `employee_meetings`; mỗi participant được lưu trong `employee_meeting_attendees`.
- Khi meeting bị hủy, attendees bị xóa và bản ghi thông báo hủy được giữ trong `employee_meeting_cancellations` để gửi notification.

## Thông báo meeting

- Chỉ attendees nhận thông báo meeting mới/cập nhật/hủy.
- Bấm notification sẽ đánh dấu notification đã đọc và đưa user đến My Status.
- Badge `New` trong lịch My Status chỉ biến mất khi user mở ngày có meeting.
- Chuông tự làm mới định kỳ 15 giây và cũng làm mới khi người dùng bấm vào chuông.

## Build production

```powershell
npm run build
npm run preview
```

## Deploy GitHub Pages

Workflow [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) build bằng Node 22 và deploy khi push lên nhánh `main`.

1. Trong GitHub repository, vào **Settings → Pages** và chọn source **GitHub Actions**.
2. Tạo Actions secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Nếu tên repository khác `hr-status-dashboard`, chỉnh `base` trong [`vite.config.js`](./vite.config.js).
4. Push lên `main` hoặc chạy workflow thủ công.

## Khắc phục sự cố Vite/esbuild trên Windows

Nếu `npm run dev` báo `failed to load config from vite.config.js`, dù cấu hình không thay đổi, thường là do `esbuild.exe` trong `node_modules` bị khóa/hỏng.

1. Đóng tất cả terminal đang chạy Vite/Node.
2. Ưu tiên dùng Node 22 LTS cho dự án.
3. Cài lại đúng theo lockfile:

   ```powershell
   Remove-Item -Recurse -Force node_modules
   npm ci
   npm run dev
   ```

Không copy thư mục `node_modules` giữa các máy. Giữ `package-lock.json` trong source control để mọi máy cài cùng dependency tree.

## Bảo mật

- Anon key có thể xuất hiện trong bundle theo thiết kế của Supabase; dữ liệu phải được bảo vệ bằng RLS.
- Không đưa `service_role` key vào `.env.local` frontend, GitHub Pages hoặc GitHub secrets dùng cho build client.
- Chức năng quản lý user/reset password ở mức Supabase Auth cần được thực hiện qua Supabase Dashboard hoặc Edge Function bảo mật nếu cần quyền quản trị server-side.
