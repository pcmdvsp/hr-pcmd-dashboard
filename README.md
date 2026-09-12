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
- Status notification: thông báo toàn hệ thống khi nhân sự cập nhật Business trip, Annual leave hoặc Sick leave.
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
4. [`supabase_status_notifications.sql`](./supabase_status_notifications.sql) — notification trạng thái và read-state riêng cho từng user.

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

### Admin đặt mật khẩu tạm

Nút **Reset password** trên Dashboard gọi Supabase Edge Function `admin-set-password`. Admin nhập mật khẩu tạm; Function kiểm tra quyền Admin, đổi mật khẩu trong Supabase Auth và tự đặt `profiles.must_change_password = true`. Xem hướng dẫn deploy và kiểm thử đầy đủ tại [SUPABASE_EDGE_FUNCTION_SETUP.md](./SUPABASE_EDGE_FUNCTION_SETUP.md).

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

## Hybrid Realtime refresh

### VSP meeting test date

The Admin VSP meeting controls accept an optional calendar date. Leave it blank
to use today in Vietnam (UTC+7). **Get VSP meeting info** synchronizes matching
meetings. **Test VSP meeting** sends `dryRun: true`, returns the filtered JSON,
and performs no meeting or attendee writes. The `test-vsp-meeting-info` Edge
Function accepts `{"date":"2026-08-27","dryRun":true}` or `{}` in the POST body,
rejects invalid dates with HTTP 400, and keeps its active-admin authentication.
All `profiles` in this internal
dashboard form the Ban roster; `departments` holds subteams such as Block 09-2/09,
not a parent Ban row. A left join through `profiles.department_id` adds each
matched person's department name without excluding leadership with a null
department. It matches `listAttendees[].id` against corporate profile emails
(case-insensitive, `@vietsov.com.vn` only). Inactive profiles are included for
historical tests. If external staff are added to `profiles` in the future, introduce
an explicit Ban membership scope before using this filter. Empty/unreadable staff
lists remain errors. The response contains scope/date metadata, counts, and `data`: compact
meetings with room, title, start/end timestamps and only matched dashboard
attendees in `listAttendees`. No upstream permissions or raw response is returned.
The observed eOffice envelope `msgBodyData: [[meetings, 0, {}]]` is read at
`msgBodyData[0][0]`; tuple metadata is not parsed as meetings. A true
`haveBusinessError` or `haveServerError` flag returns an error, not an empty list.
Single meetings, arrays and unambiguous `data`/`items`/`result`
wrappers are also supported; an unknown structure returns an error rather than a
misleading empty result. Existing resource/date filters and upstream page size
remain unchanged; counts refer only to meetings returned by that upstream call.
Redeploy that function after updating; no SQL migration is needed. Run the tests
with `node --test --test-isolation=none supabase/functions/test-vsp-meeting-info/*.test.js`.

The Function now creates a fresh eOffice session for every test invocation. Store
the test account only in Supabase Edge Function secrets as
`VSP_EOFFICE_USERNAME` and `VSP_EOFFICE_PASSWORD`. Keep the captured stable client
header in `VSP_EOFFICE_X_HD_TYPE`. `VSP_EOFFICE_DEVICE_JSON` is optional and may
contain the exact non-secret device JSON observed in the browser login payload;
when omitted, the Function derives a minimal Chrome/Windows device object from
`VSP_EOFFICE_X_HD_TYPE`. The Function bootstraps a cookie, calls `LoginAsync`, and
uses the returned session cookie and user token only in memory for the meeting
request. The old manually refreshed `VSP_EOFFICE_TEST_COOKIE` and
`VSP_EOFFICE_LVTK` secrets are no longer used. Never place the eOffice password in
React, `.env.local`, GitHub Actions variables, logs, or source control.

When a selected-day response contains meetings attended by dashboard profiles,
the same Admin action now synchronizes them into `employee_meetings` and
`employee_meeting_attendees`. Apply the latest `supabase_meeting_info.sql` first:
it adds the nullable `external_source`/`external_id` identity columns, a partial
unique index, and the authenticated Admin-only `sync_external_employee_meeting`
RPC. A booking spanning multiple Vietnam calendar days becomes one meeting row
per day, with the source start/end clock times repeated on every day. The eOffice
`recID` plus occurrence date is the idempotency key. Once an occurrence exists,
later scans report it as `unchanged` and do not update its fields, organizer, or
attendee rows. This preserves participants added manually from the frontend. The
attendee marked by eOffice with `roleType = "2"` is matched to a dashboard
profile and stored as `organizer_id`. If that external organizer has no dashboard
profile, the first matched Ban attendee is used as the required local organizer.
For imported eOffice meetings, every current attendee can edit or cancel through
the frontend; manually created meetings retain their organizer-only rule. Each meeting is atomic; a
meeting attendee with `daily_status.status` equal to `leave`, `sick`, or
`business_trip` is removed before the RPC and reported under
`sync.skippedAttendees`. A meeting is listed under `sync.errors` only when it
cannot be synchronized, including a database error, invalid identity/time, or no
available attendee remaining. Other valid meetings can still synchronize. The
automatic schedule below uses the same insert-only rules.

The dashboard uses Supabase Realtime for active pages and a 30-minute fallback refresh:

### VSP approved-leave diagnostic

The Admin **Get VSP leave info** button invokes the authenticated
`sync-vsp-leave` Edge Function, returns approved-leave JSON and synchronizes the
matching records. **Test VSP leave** sends `dryRun: true` to the same Function
and returns the same diagnostic JSON without writing `daily_status`, changing
meetings, or creating notifications.
The current diagnostic sends the broad list request used during the initial
Admin can select one approval date; blank means today in Vietnam. Because VSP's
documented UI date fields filter leave periods rather than approval time, the
Function pages through all status-`142` records in the scoped unit and then
matches the full selected day against `ngayKy`. It resolves the login email through `AdminDonVi`
and sends `currentDepartmentFilter`, so VSP restricts the query to that unit
before pagination. It deliberately omits `nguoiDuyetFilter` to avoid excluding
other Ban employees. The response is checked again against the exact QLHĐDK
`donVi` name, while records remain otherwise unabridged for diagnostics.

The Admin test action also synchronizes every returned `thongTinPhepCTs` period
to `daily_status` by matching VSP `danhSo` to `profiles.employee_code`. Each day
is stored as `leave`; `noiNghiPhep` is stored in `daily_status.note`, matching the
My Status Annual leave form's Location behavior. A bell notification is inserted
in `status_update_notifications` once per changed period. Identical existing
leave days are left untouched and do not generate duplicate notifications.
Missing/inactive profiles and per-period database failures are reported in the
Admin JSON under `sync.skipped` and `sync.errors`.
Synced rows are marked with `daily_status.source = 'vsp'`. The updated RLS
policies prevent normal users from inserting, editing, or deleting VSP-owned
rows through My Status; admins retain access. Sync notifications use the content
`Synced from VSP`. Apply the latest `supabase_schema.sql` before deploying this
version. Cancellation status `146` is intentionally not processed yet.
As a final defense, the diagnostic response retains only records whose `donVi`
is exactly `Ban Quản lý các Hợp đồng Dầu khí`; an unknown response structure is
rejected instead of returning potentially cross-unit data.

Store the VSP test account in Supabase Edge Function secrets as
`VSP_PHEP_USERNAME` and `VSP_PHEP_PASSWORD`. Never put these values in React,
`.env.local`, logs, or source control. Deploy the Function after setting them:
`VSP_PHEP_USERNAME` must be the complete email address used on the VSP login
screen; the Function always uses `/api/Account/email-login` and does not accept
an employee number or automatically append an email domain.

```powershell
supabase functions deploy sync-vsp-leave
```

Automatic VSP meeting synchronization is implemented by the separate
`sync-vsp-meetings` Edge Function. It scans tomorrow at 18:00 Vietnam time and
today at 11:00 Vietnam time while preserving the Admin test button. Deployment,
Vault, and `pg_cron` setup are documented in `VSP_MEETING_SYNC_SETUP.md`.

Scheduled VSP leave synchronization stores the latest operational history in
`vsp_leave_sync_logs`. The Admin page shows the latest 20 scheduled scans;
manual Get/Test requests are intentionally excluded. Apply the latest
`supabase_status_notifications.sql` and redeploy `sync-vsp-leave` to enable it.

- The notification bell listens for assigned meetings, cancellations, and status notifications.
- The daily dashboard listens for changes to the selected date.
- My Status listens for the signed-in employee's status and meeting-attendee changes.
- Meeting Info refreshes when meetings or attendees change while that page is open.
- Monthly Statistics and the monthly timeline refresh every 30 minutes while open.

For an existing Supabase project, rerun [`supabase_status_notifications.sql`](./supabase_status_notifications.sql) after deploying this version. Its idempotent publication block adds the required tables to `supabase_realtime`.

### Approved business-trip PDF import

Authenticated users can preview an approved VSP business-trip PDF in My Status
and confirm it for every active PCMD profile detected by employee code. Confirmed
documents overwrite `daily_status` for the departure-to-return date range and
create one status notification marked `Synced from approved VSP PDF`. Back-up
employees remain visible in the preview but are not imported. File SHA-256 is
stored in `vsp_business_trip_imports` so confirming the same PDF again is
idempotent. Apply the latest `supabase_status_notifications.sql` before using the
Confirm button.

### Approved compensatory-leave PDF import

My Status Annual leave supports manual entry and an approved-PDF import for
compensatory leave. The preview extracts the employee name and ID, all leave
date ranges, location, and total hours. Both the frontend and the database RPC
require the PDF employee ID to match the signed-in user's active profile.
Confirmed files may write historical dates, overwrite the user's status for the
approved ranges, remove conflicting meeting attendance, and create shared leave
notifications marked `Synced from approved VSP PDF`. File hashes are stored in
`vsp_compensatory_leave_imports` to prevent duplicate imports. Apply the latest
`supabase_status_notifications.sql` before using the Confirm button.

## Build production

### Browser push notification pilot

The Admin page can register the current admin's browser and send a test Windows push notification. Assigned meeting attendees can receive pushes on meeting creation, update, cancellation, and a scheduled 15-minute reminder. Meeting reminders include **Snooze 5 minutes** and **Stop reminders** actions; clicking the notification body opens Meeting Info. Setup requires a VAPID key pair, SQL migrations, GitHub Actions public-key secret, Edge Function deployment, and an optional Supabase Cron job. See [SUPABASE_PUSH_NOTIFICATION_SETUP.md](./SUPABASE_PUSH_NOTIFICATION_SETUP.md) and [MEETING_PUSH_NOTIFICATION_DEPLOYMENT.md](./MEETING_PUSH_NOTIFICATION_DEPLOYMENT.md).

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
