# Hướng dẫn sử dụng cho người dùng / Normal User Guide

Tài liệu này dành cho **Normal user** của HR Working Dashboard.  
This guide is for **Normal users** of the HR Working Dashboard.

> Lưu ý / Note: Tên các nút và màn hình trong ứng dụng hiển thị bằng tiếng Anh.  
> Button and page labels in the application are displayed in English.

## 1. Đăng nhập / Sign in

1. Mở đường dẫn Dashboard được công ty cung cấp.  
   Open the Dashboard URL provided by the company.
2. Nhập email công việc và mật khẩu, sau đó bấm **Sign in**.  
   Enter your work email and password, then select **Sign in**.
3. Nếu đây là lần đăng nhập đầu tiên sau khi quản trị viên đổi mật khẩu, hệ thống sẽ yêu cầu đổi mật khẩu trước khi vào Dashboard.  
   If this is your first sign-in after an administrator changed your password, the system requires you to change it before opening the Dashboard.

## 2. Xem Dashboard trạng thái làm việc / View the working-status Dashboard

Dashboard mặc định hiển thị trạng thái theo ngày hiện tại.  
The Dashboard opens with statuses for the current date by default.

- **Display date**: chọn một ngày khác để xem dữ liệu lịch sử hoặc lịch sắp tới.  
  **Display date**: select another date to view historical or upcoming data.
- **All departments**: chọn **Leadership** hoặc một phòng ban cụ thể.  
  **All departments**: choose **Leadership** or a specific department.
- **Search by name or employee ID**: nhập tên hoặc mã nhân viên để tìm nhanh.  
  **Search by name or employee ID**: enter a name or employee ID to find someone quickly.
- **All / Working / Business trip / Annual leave / Sick leave**: lọc theo trạng thái.  
  **All / Working / Business trip / Annual leave / Sick leave**: filter by status.
- Di chuột lên tên nhân sự để xem trạng thái, thời gian áp dụng, nội dung, địa điểm hoặc ghi chú (nếu có).  
  Hover over an employee name to see their status, date range, content, location, or note when available.

### Ngày nghỉ và cuối tuần / Weekends and holidays

- Dashboard không tính nhân sự là **Working** mặc định vào cuối tuần, ngày lễ hoặc ngày nghỉ đặc biệt.  
  The Dashboard does not count employees as **Working** by default on weekends, holidays, or special leave days.
- Nhân sự đi công tác vẫn có thể hiển thị **Business trip** vào ngày nghỉ.  
  Employees on a trip may still appear as **Business trip** on non-working days.
- Làm việc hoặc họp vào cuối tuần cần xác nhận overtime khi cập nhật trạng thái.  
  Working or holding a meeting during a weekend requires overtime confirmation when updating status.

## 3. Xem thống kê tháng / View Monthly Statistics

1. Trên Dashboard, bấm **Monthly statistics**.  
   On the Dashboard, select **Monthly statistics**.
2. Dùng **Previous month**, **Next month**, bộ chọn tháng hoặc **Current month** để chọn kỳ cần xem.  
   Use **Previous month**, **Next month**, the month picker, or **Current month** to select a period.
3. Dùng ô tìm kiếm, bộ lọc phòng ban và bộ lọc trạng thái để thu hẹp kết quả.  
   Use the search box, department filter, and status filter to narrow the results.
4. Bấm vào một nhân sự để mở chi tiết: tổng ngày theo từng trạng thái và lịch của tháng.  
   Select an employee to open details: totals by status and a monthly calendar.

**Cách hệ thống tính số liệu / How the figures are calculated**

- Chỉ ngày `working_day` trong Work Calendar được tính vào thống kê tháng.  
  Only `working_day` dates in the Work Calendar are included in monthly statistics.
- Số liệu được cut-off tại ngày hiện tại; ngày sau ngày hiện tại chưa được tính.  
  Figures are cut off at today; future dates are not counted yet.
- Nếu không có bản ghi trạng thái vào ngày làm việc, ngày đó được tính là **Working**.  
  If no status record exists on a working day, that day is counted as **Working**.

## 4. My Status và My Schedule / My Status and My Schedule

1. Bấm **My Status** trên Dashboard.  
   Select **My Status** on the Dashboard.
2. Phần **My Schedule – This week & next week** hiển thị 14 ngày, gồm tuần hiện tại và tuần kế tiếp.  
   **My Schedule – This week & next week** displays 14 days covering the current and next week.
3. Ô **Today** được làm nổi bật. Màu của mỗi ngày thể hiện trạng thái của bạn.  
   The **Today** card is highlighted. Each day’s color represents your status.
4. Di chuột lên ngày để xem chi tiết. Với Business trip sẽ có Content và Location; với meeting sẽ có giờ, nội dung và địa điểm.  
   Hover over a day to see details. Business trips show Content and Location; meetings show time, content, and location.
5. Ngày nghỉ hiển thị **Weekend**, **Holiday** hoặc **Special leave**. Nếu đang đi công tác trong ngày nghỉ, lịch hiển thị `Weekend · Business trip`; nếu đã xác nhận làm thêm, hiển thị `Weekend · Overtime`.  
   Non-working days show **Weekend**, **Holiday**, or **Special leave**. A trip on a weekend shows `Weekend · Business trip`; confirmed overtime shows `Weekend · Overtime`.
6. Bấm **Back to dashboard** để quay lại Dashboard.  
   Select **Back to dashboard** to return to the Dashboard.

## 5. Cập nhật trạng thái / Update your status

Trong My Status, kéo xuống phần **UPDATE STATUS**. Chọn trạng thái và khoảng ngày, sau đó bấm **Save status**.  
In My Status, scroll to **UPDATE STATUS**. Select a status and date range, then select **Save status**.

### Working / Đi làm

- Chọn **Working** khi cần đưa trạng thái về đi làm. Trên ngày làm việc thông thường, hệ thống xóa trạng thái ngoại lệ và coi ngày đó là Working.  
  Select **Working** to return to normal working status. On a normal workday, the system removes the exception record and treats the day as Working.
- Nếu khoảng ngày gồm cuối tuần, hệ thống hỏi: **Please confirm your overtime working on selected weekend?**  
  If the range includes a weekend, the system asks: **Please confirm your overtime working on selected weekend?**
- Bấm **Yes** để xác nhận overtime hoặc **No** để không lưu overtime.  
  Select **Yes** to confirm overtime or **No** not to save overtime.

### Business trip / Đi công tác

1. Chọn **Business trip**.  
   Select **Business trip**.
2. Chọn **From date** và **To date**. Khoảng ngày có thể bao gồm cuối tuần.  
   Select **From date** and **To date**. The range may include weekends.
3. Nhập bắt buộc **Content** và **Location**.  
   Enter the required **Content** and **Location**.
4. Bấm **Save status**.  
   Select **Save status**.

### Annual leave / Nghỉ phép

1. Chọn **Annual leave**.  
   Select **Annual leave**.
2. Chọn khoảng ngày nghỉ.  
   Select the leave date range.
3. Điền **Location** nếu cần.  
   Enter **Location** if needed.
4. Bấm **Save status**.  
   Select **Save status**.

### Sick leave / Nghỉ ốm

1. Chọn **Sick leave**.  
   Select **Sick leave**.
2. Chọn khoảng ngày nghỉ.  
   Select the sick-leave date range.
3. Điền **Type of sickness** nếu cần.  
   Enter **Type of sickness** if needed.
4. Bấm **Save status**.  
   Select **Save status**.

### Meeting / Tạo cuộc họp

1. Chọn **Meeting**.  
   Select **Meeting**.
2. Chọn ngày hoặc khoảng ngày, rồi chọn **Start time** và **End time**.  
   Select a date or date range, then select **Start time** and **End time**.
3. Nhập bắt buộc **Content** và **Location**.  
   Enter the required **Content** and **Location**.
4. Có thể chọn **KNT meeting room** để điền nhanh phòng họp nội bộ. Nếu phòng đã có cuộc họp trùng giờ, hệ thống không cho lưu.  
   You can select **KNT meeting room** for the internal meeting room. The system prevents saving if another meeting overlaps its time.
5. **Online Link** là trường không bắt buộc; nhập link Teams/Zoom/meeting online khi cần.  
   **Online Link** is optional; enter a Teams, Zoom, or other online meeting link when needed.
6. Tại **Search participants**, nhập tên hoặc mã nhân viên để chọn từng người.  
   In **Search participants**, enter a name or employee ID to select people individually.
7. Có thể nhập tên phòng ban, ví dụ `Block 09-2/09`, rồi bấm tên phòng để thêm nhanh các thành viên available. Danh sách thành viên hiện ra với dấu tick; người unavailable vẫn hiển thị nhưng không thể chọn.  
   You can enter a department name, for example `Block 09-2/09`, then select it to add available members quickly. Members appear with ticks; unavailable people remain visible but cannot be selected.
8. Người đang **Business trip**, **Annual leave** hoặc **Sick leave** trong ngày họp không thể được thêm vào cuộc họp.  
   People who are on **Business trip**, **Annual leave**, or **Sick leave** on the meeting date cannot be added.
9. Người tạo được hiển thị riêng với nhãn **Meeting organizer** và có thể bỏ/chọn tick nếu available.  
   The creator is shown separately as **Meeting organizer** and can be selected or unselected if available.
10. Bấm **Save status** để tạo cuộc họp.  
    Select **Save status** to create the meeting.

## 6. Thông báo cuộc họp / Meeting notifications

1. Trên Dashboard, bấm biểu tượng chuông ở bên phải **Sign out**.  
   On the Dashboard, select the bell icon to the right of **Sign out**.
2. Số màu đỏ trên chuông là số notification chưa đọc.  
   The red number on the bell is the count of unread notifications.
3. Bạn chỉ nhận notification khi được gán làm attendee của meeting, khi meeting được cập nhật, hoặc khi meeting bị hủy.  
   You receive notifications only when you are assigned as an attendee, when a meeting is updated, or when it is cancelled.
4. Bấm một notification để đánh dấu notification là đã đọc và chuyển tới **My Status**.  
   Select a notification to mark it as read and open **My Status**.
5. Badge **New** trên lịch My Status chỉ biến mất khi bạn bấm vào ngày có meeting để mở chi tiết.  
   The **New** badge in My Status disappears only when you select the meeting day to open its details.

## 7. Thêm meeting vào Outlook Calendar / Add a meeting to Outlook Calendar

1. Vào **My Status**.  
   Open **My Status**.
2. Bấm vào ngày có meeting.  
   Select the day with the meeting.
3. Trong popup **Meetings**, kiểm tra Content, Time và Location.  
   In the **Meetings** popup, review Content, Time, and Location.
4. Bấm **Add to Outlook Calendar**. Trình duyệt tải file `.ics`.  
   Select **Add to Outlook Calendar**. The browser downloads an `.ics` file.
5. Mở file `.ics` bằng Outlook và chọn **Save & Close** hoặc **Add to Calendar**.  
   Open the `.ics` file in Outlook and select **Save & Close** or **Add to Calendar**.
6. File lịch có reminder mặc định 10 phút trước giờ họp.  
   The calendar file has a default reminder 10 minutes before the meeting.

## 8. Xem Meeting Info / View Meeting Info

1. Trên Dashboard, bấm **Meeting Info**.  
   On the Dashboard, select **Meeting Info**.
2. Dùng **Previous day**, **Next day**, ô chọn ngày hoặc **Today** để xem meeting theo ngày.  
   Use **Previous day**, **Next day**, the date picker, or **Today** to view meetings by date.
3. Meeting được nhóm theo phòng ban của người tạo và người tham gia.  
   Meetings are grouped by the department of the organizer and participants.
4. Cột **Online link** hiển thị **Go online** nếu meeting có Online Link; bấm để mở cuộc họp trực tuyến.  
   The **Online link** column shows **Go online** when a meeting has an Online Link; select it to open the online meeting.

## 9. Update hoặc Cancel cuộc họp / Update or cancel a meeting

Bạn chỉ có thể thay đổi meeting do mình tạo. Admin có thể thay đổi tất cả meeting.  
You can change only meetings that you created. Admins can change all meetings.

1. Trong **Meeting Info**, bấm **Edit** ở meeting cần xử lý.  
   In **Meeting Info**, select **Edit** for the meeting you need to manage.
2. Popup **MEETING ACTIONS** có hai lựa chọn:
   - **Update meeting**: mở form để sửa Content, Location, Online Link, giờ họp hoặc attendees.  
     **Update meeting**: opens a form to edit Content, Location, Online Link, meeting time, or attendees.
   - **Cancel meeting**: mở popup xác nhận hủy.  
     **Cancel meeting**: opens a cancellation confirmation popup.
3. Trong form update, người unavailable không thể được thêm; hệ thống kiểm tra lại availability khi lưu. Bấm **Update** để lưu.  
   In the update form, unavailable people cannot be added; the system checks availability again when saving. Select **Update** to save.
4. Để hủy, bấm **Cancel meeting**, sau đó bấm **Cancel meeting** lần nữa trong popup xác nhận.  
   To cancel, select **Cancel meeting**, then select **Cancel meeting** again in the confirmation popup.
5. Khi hủy, cuộc họp và danh sách attendees bị xóa; attendees nhận notification hủy meeting.  
   When cancelled, the meeting and attendee list are removed; attendees receive a cancellation notification.

## 10. Lưu ý quyền hạn / Permission notes

- Normal user có thể xem Dashboard, Monthly Statistics, Meeting Info và cập nhật trạng thái của chính mình.  
  A Normal user can view the Dashboard, Monthly Statistics, Meeting Info, and update their own status.
- Normal user không chỉnh sửa Work Calendar, phòng ban hoặc hồ sơ người dùng khác.  
  A Normal user cannot edit the Work Calendar, departments, or other users’ profiles.
- Nếu gặp lỗi dữ liệu, thiếu profile hoặc không thể cập nhật, liên hệ Administrator.  
  If you encounter data errors, a missing profile, or cannot update information, contact an Administrator.
