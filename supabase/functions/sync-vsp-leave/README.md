# Quy trình đồng bộ phép VSP

Thư mục này chứa Supabase Edge Function `sync-vsp-leave` và các helper dùng để
đọc đơn phép đã duyệt từ `https://phep.vietsov.com.vn`, kiểm tra ngày phê duyệt,
và đồng bộ trạng thái nghỉ phép vào dashboard.

## Thành phần chính

- `index.ts`: xác thực request, đăng nhập VSP, phân trang, lọc đơn và ghi Supabase.
- `approval-date.js`: xác định ngày phê duyệt từ lịch sử ký và chuẩn hóa ngày Việt Nam.
- `compensatory-leave.js`: chuẩn hóa đơn nghỉ bù thành cấu trúc phép chung.
- `employee-leave-search.js`: tạo kết quả tìm phép theo danh số và khoảng ngày nghỉ.
- `*.test.js`: test hồi quy cho ngày phê duyệt, nghỉ bù và tìm kiếm.

## Các trạng thái VSP được xử lý

| Loại phép | Trạng thái đơn đã duyệt | Bước ký cuối áp dụng |
| --- | ---: | ---: |
| Phép năm/thường | `142` | Chữ ký hợp lệ cuối cùng trong `nguoiKyDon` hoặc `nguoiKys` |
| Nghỉ bù | `187` | Người ký có `trangThai_id = 186` |

Các đơn không thuộc trạng thái trên không được đồng bộ.

## Xác định ngày phê duyệt

### 1. Thu thập lịch sử ký

Helper `annualLeaveApprovalDate(record)` đọc cả hai mảng:

```text
record.nguoiKyDon   // cấu trúc thực tế của phép năm
record.nguoiKys     // cấu trúc dùng bởi nghỉ bù hoặc dữ liệu tương thích
```

Hai mảng được gộp lại. Một phần tử lịch sử ký được xem xét khi:

1. Phần tử là một object hợp lệ.
2. `daDuyet !== false`.
3. `ngayKy` là timestamp có thể chuẩn hóa.
4. Nếu caller truyền thêm bộ lọc người ký thì phần tử phải thỏa bộ lọc đó.

Lưu ý: điều kiện hiện tại là `daDuyet !== false`, không phải
`daDuyet === true`. Vì vậy `false` chắc chắn bị loại; `true`, `null` hoặc trường
không tồn tại vẫn có thể được dùng nếu `ngayKy` hợp lệ. Cách này giữ tương thích
với dữ liệu VSP cũ không luôn trả `daDuyet`.

### 2. Chuẩn hóa về ngày Việt Nam

Hàm `vietnamDateOnly(value)` trả về `YYYY-MM-DD`:

- Timestamp có `Z` hoặc offset như `+07:00` được parse và chuyển sang
  `Asia/Ho_Chi_Minh`.
- Timestamp không có timezone, ví dụ `2026-11-09T15:16:56`, được coi là giờ
  địa phương do VSP cung cấp và giữ nguyên ngày `2026-11-09`.
- Giá trị rỗng, sai kiểu hoặc không có ngày ISO hợp lệ trả về `null`.

Ví dụ:

```text
2026-11-08T18:16:00Z      -> 2026-11-09
2026-11-09T15:16:56+07:00 -> 2026-11-09
2026-11-09T15:16:56       -> 2026-11-09
```

### 3. Chọn chữ ký cuối cùng

Các ngày chữ ký hợp lệ được sắp xếp tăng dần theo `YYYY-MM-DD`; ngày cuối cùng
được dùng làm approval date.

Ví dụ với danh số `18351`:

```json
{
  "ngayKy": "2026-11-07T08:00:00",
  "nguoiKyDon": [
    { "ngayKy": "2026-11-08T10:00:00", "daDuyet": true },
    { "ngayKy": "2026-11-09T15:16:56", "daDuyet": true }
  ]
}
```

Approval date là `2026-11-09`, không phải ngày cấp ngoài cùng `2026-11-07`.

### 4. Fallback khi không có lịch sử ký hợp lệ

Nếu không tìm được ngày trong lịch sử ký, helper lần lượt kiểm tra:

1. `record.ngayKy`
2. `record.ngayPheDuyet`
3. `record.ngayChapNhan`

Giá trị fallback vẫn phải đi qua bước chuẩn hóa giờ Việt Nam.

### 5. Điều kiện khớp ngày scan

Phép năm khớp khi:

```text
annualLeaveApprovalDate(record) === selectedDate
```

Nghỉ bù khớp khi:

```text
record.trangThai_id === 187
compensatoryApprovalDate(record) === selectedDate
```

Đối với nghỉ bù, lịch sử ký còn được giới hạn ở người ký có
`trangThai_id = 186` trước khi chọn ngày cuối cùng.

## Chọn ngày cần scan

`selectedDate` luôn dùng định dạng `YYYY-MM-DD` theo Việt Nam:

- Request thủ công có `date`: dùng ngày được gửi lên.
- Request thủ công bỏ trống `date`: dùng ngày hiện tại tại Việt Nam.
- Scheduler với `mode: "today"`: dùng hôm nay tại Việt Nam.
- Scheduler với `mode: "yesterday"`: dùng hôm qua tại Việt Nam.

Ngày gửi lên phải là một ngày lịch hợp lệ. Giá trị sai định dạng bị trả HTTP 400.

## Luồng scan phép theo approval date

### Bước 1: Xác thực caller

- Request thủ công phải có Supabase session hợp lệ.
- Profile caller phải `role = 'admin'` và `active = true`.
- Request scheduler phải gửi `x-cron-secret` đúng với `CRON_SECRET`.
- Tài khoản VSP được lấy từ Edge Function secrets
  `VSP_PHEP_USERNAME` và `VSP_PHEP_PASSWORD`.

### Bước 2: Đăng nhập VSP một lần

Function đăng nhập bằng `/api/Account/email-login`, lấy API token và dùng token
đó cho toàn bộ request trong một lần chạy. Token và mật khẩu không được ghi log.

### Bước 3: Xác định phạm vi

Khi không nhập danh số:

1. Gọi `/api/NhanVien/AdminDonVi` để lấy department scope.
2. Gửi scope qua `currentDepartmentFilter`.
3. Sau khi nhận dữ liệu, tiếp tục yêu cầu `record.donVi` bằng chính xác
   `Ban Quản lý các Hợp đồng Dầu khí`.

Khi Test VSP leave với danh số cụ thể:

1. Bỏ `currentDepartmentFilter`.
2. Gửi một request `nameFilter` cho mỗi danh số.
3. Chỉ giữ record có `danhSo` khớp chính xác sau khi chuẩn hóa chữ hoa.
4. Tối đa 50 danh số, mỗi danh số không quá 30 ký tự.
5. Chế độ danh số chỉ được dùng với `dryRun = true`.

### Bước 4: Lấy phép năm đã duyệt

Endpoint:

```text
POST /api/Phep/DanhSachGNPFilter
```

Filter chính:

```json
{
  "pageSize": 1000,
  "fromLeaveDateFilter": null,
  "toLeaveDateFilter": null,
  "trangThai_ids": [142],
  "languageId": "VI"
}
```

Hai filter ngày nghỉ được để `null` vì chúng lọc thời gian nghỉ, không lọc thời
gian phê duyệt. Function phân trang toàn bộ đơn đã duyệt trong phạm vi, sau đó
tự tính approval date và so sánh với `selectedDate`.

Giới hạn an toàn:

- Scan theo đơn vị: tối đa 100 trang.
- Test theo danh số: tối đa 10 trang cho mỗi danh số, `pageSize = 100`.

Sau khi lọc ngày, record được chống trùng bằng `donNghiPhep_id`.

### Bước 5: Lấy nghỉ bù đã duyệt

Không nhập danh số:

```text
POST /api/PhepBu/DanhSachDonByBoPhan
```

Payload gồm department ID, trạng thái `187`, phân trang tối đa 100 trang và
`pageSize = 1000`.

Có danh số:

1. Gọi `/api/NhanVien/NhanVienByDanhSo` để lấy `nhanVien_id`.
2. Gọi `POST /api/PhepBu/DanhSachDon` cho nhân viên đó.

Nghỉ bù được chuẩn hóa thành cùng cấu trúc `thongTinPhepCTs` với phép năm. Số
ngày lấy từ `soNgay`; không suy ra số ngày từ tổng số giờ.

### Bước 6: Test hoặc đồng bộ

`dryRun = true`:

- Trả JSON đã lọc.
- `sync.performed = false`.
- Không ghi `daily_status`.
- Không xóa meeting và không tạo notification.

`dryRun = false`:

1. Khớp `danhSo` VSP với `profiles.employee_code`.
2. Bỏ qua profile không tồn tại hoặc `active = false`.
3. Mở rộng mỗi `tuNgay`–`denNgay` thành từng ngày lịch, gồm cả cuối tuần.
4. So sánh với `daily_status` hiện tại.
5. Ngày không thay đổi được đếm vào `unchangedDayCount`.
6. Với ngày thay đổi, xóa meeting do nhân viên tổ chức và xóa nhân viên khỏi
   attendee của meeting khác trong ngày đó.
7. Upsert `daily_status` với:

```json
{
  "status": "leave",
  "source": "vsp",
  "is_overtime": false,
  "note": "noiNghiPhep hoặc noiNghiBu"
}
```

8. Chỉ tạo một `status_update_notifications` cho kỳ nghỉ khi có ít nhất một
   ngày được tạo hoặc thay đổi.

Upsert dùng khóa xung đột `employee_id,date`, vì vậy chạy lại cùng dữ liệu không
tạo thêm dòng `daily_status`.

## Search Employee VSP Leave

Action:

```json
{
  "action": "employee_range_search",
  "employeeCode": "18351",
  "fromDate": "2026-11-16",
  "toDate": "2026-11-16"
}
```

Chức năng này là read-only và chỉ dùng thủ công. Khoảng `fromDate`–`toDate` là
**khoảng ngày nghỉ**, không phải khoảng ngày phê duyệt.

Quy trình:

1. Lấy toàn bộ phép năm trạng thái `142` của đúng danh số.
2. Lấy nghỉ bù trạng thái `187` của đúng danh số.
3. Chỉ trả kỳ nghỉ có giao với khoảng tìm kiếm:

```text
startDate <= toDate AND endDate >= fromDate
```

4. Trường `approvalDate` trong mỗi kết quả vẫn dùng logic chữ ký cuối cùng và
   fallback giống scan tự động.
5. Không ghi Supabase, không gửi notification và không thay đổi meeting.
6. Khoảng tìm kiếm tối đa 366 ngày tính cả hai đầu.

Vì vậy một đơn nghỉ ngày `16/11/2026`, được phê duyệt ngày `09/11/2026`, vẫn
xuất hiện khi Search chọn ngày nghỉ `16/11/2026`. Đây là hành vi dự kiến.

## Log scheduler

Mỗi lần chạy tự động ghi một dòng vào `vsp_leave_sync_logs` với:

- Ngày mục tiêu, chế độ `today`/`yesterday` và thời gian chạy.
- Số record VSP đã đọc và số record khớp approval date.
- Số ngày tạo mới, cập nhật, không thay đổi.
- Số notification, lỗi và record bị bỏ qua.

Trạng thái:

- `no_matches`: VSP trả dữ liệu nhưng không có đơn khớp approval date.
- `success`: có record khớp và không có lỗi.
- `partial`: có thay đổi hoặc record khớp nhưng đồng thời có lỗi.
- `failed`: không đồng bộ được record nào và có lỗi.

Request Test/Get thủ công không ghi vào bảng log scheduler.

## Response chẩn đoán

Response Test/Get cho biết rõ cách xác định ngày:

```json
{
  "approvalDateField": "last confirmed nguoiKyDon/nguoiKys.ngayKy; fallback record.ngayKy",
  "approvalDateTimeZone": "Asia/Ho_Chi_Minh"
}
```

`rawResponse.paginatedList` chứa phép năm đã khớp; `compensatoryList` chứa nghỉ
bù đã khớp cùng dữ liệu chuẩn hóa.

## Kiểm thử

Chạy toàn bộ test mà không tạo child process trên Windows:

```powershell
node --test --test-isolation=none
```

Các test hồi quy chính:

- Chữ ký cuối `09/11/2026` được ưu tiên hơn `record.ngayKy` cũ.
- Chữ ký `daDuyet: false` bị loại.
- Timestamp UTC được đổi sang ngày Việt Nam.
- Timestamp không timezone giữ nguyên ngày VSP.
- Không có lịch sử ký thì dùng fallback.
- Search Employee trả đúng approval date nhưng vẫn lọc theo ngày nghỉ.
- Nghỉ bù chỉ dùng bước ký trạng thái `186` và đơn trạng thái `187`.

## Deploy

Không cần migration SQL cho thay đổi logic ngày phê duyệt. Deploy lại Edge
Function:

```cmd
supabase functions deploy sync-vsp-leave --project-ref kqifgovkyjkzgzbvuecc --no-verify-jwt
```

Sau deploy nên kiểm tra:

1. Test VSP leave với danh số `18351`, approval date `09/11/2026`.
2. Xác nhận `rawResponse.total` lớn hơn 0.
3. Kiểm tra `approvalDateField` và `approvalDateTimeZone` trong response.
4. Chạy lại scheduler hoặc chờ lịch kế tiếp và kiểm tra `vsp_leave_sync_logs`.
