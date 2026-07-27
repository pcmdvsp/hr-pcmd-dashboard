import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, MapPin } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { formatDate, today } from "../utils/status";
import { showRoomReservationAlert } from "../components/RoomReservationAlert";
import { getUnavailableMeetingParticipants } from "../utils/meetingAvailability";
import { departmentAccent } from "../utils/departmentAccent";
import { notifyMeetingPush } from "../utils/pushNotifications";
import "./MeetingInfoPage.css";

const KNT_MEETING_ROOM = "KNT meeting room";
const ROOM_MESSAGE =
  "The meeting room has been reserved for the selected time. Please choose different time!";

const timeRange = (meeting) =>
  meeting.start_time && meeting.end_time
    ? `${meeting.start_time.slice(0, 5)} – ${meeting.end_time.slice(0, 5)}`
    : meeting.start_time?.slice(0, 5) || "Time not set";

const timeRange12Hour = (meeting) => {
  const format = (time) => time ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(`2000-01-01T${time.slice(0, 5)}:00`)) : "Time not set";
  return meeting.start_time && meeting.end_time ? `${format(meeting.start_time)} - ${format(meeting.end_time)}` : format(meeting.start_time);
};

const moveDate = (date, delta) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + delta);
  return value.toISOString().slice(0, 10);
};

const startOfWeek = (date) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() - ((value.getDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
};

const weekDates = (startDate) => Array.from({ length: 14 }, (_, index) => moveDate(startDate, index));
const shortDay = (date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));
const weekHeading = (date) => `Week of ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`))}`;
const departmentBorder = (names) => {
  const colors = names.map(departmentAccent);
  return `linear-gradient(90deg, ${colors.map((color, index) => `${color} ${(index / colors.length) * 100}% ${((index + 1) / colors.length) * 100}%`).join(", ")})`;
};

export default function MeetingInfoPage({ profile, goBack }) {
  const [date, setDate] = useState(today());
  const [viewMode, setViewMode] = useState("week");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [meetings, setMeetings] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [actionMeeting, setActionMeeting] = useState(null);
  const [cancellingMeeting, setCancellingMeeting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const meetingQuery = viewMode === "week"
      ? supabase.from("employee_meetings").select("id,organizer_id,date,content,location,online_link,start_time,end_time").gte("date", startOfWeek(date)).lte("date", moveDate(startOfWeek(date), 13)).order("date").order("start_time")
      : supabase.from("employee_meetings").select("id,organizer_id,date,content,location,online_link,start_time,end_time").eq("date", date).order("start_time");
    const [meetingResult, employeeResult, departmentResult] = await Promise.all(
      [
        meetingQuery,
        supabase
          .from("profiles")
          .select("id,full_name,employee_code,department_id")
          .eq("active", true)
          .order("full_name"),
        supabase
          .from("departments")
          .select("id,name,sort_order")
          .order("sort_order"),
      ],
    );
    if (meetingResult.error || employeeResult.error || departmentResult.error) {
      setError(
        meetingResult.error?.message ||
          employeeResult.error?.message ||
          departmentResult.error?.message,
      );
      setLoading(false);
      return;
    }
    const ids = (meetingResult.data || []).map((meeting) => meeting.id);
    const attendeeResult = ids.length
      ? await supabase
          .from("employee_meeting_attendees")
          .select("meeting_id,employee_id")
          .in("meeting_id", ids)
      : { data: [], error: null };
    if (attendeeResult.error) setError(attendeeResult.error.message);
    setMeetings(meetingResult.data || []);
    setEmployees(employeeResult.data || []);
    setDepartments(departmentResult.data || []);
    setAttendees(attendeeResult.data || []);
    setLoading(false);
  }, [date, viewMode]);

  useEffect(() => {
    load();
  }, [load]);

  const employeeById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  );
  const departmentById = useMemo(
    () => new Map(departments.map((department) => [department.id, department])),
    [departments],
  );
  const groupedMeetings = useMemo(() => {
    const groups = new Map();
    meetings.forEach((meeting) => {
      const organizer = employeeById.get(meeting.organizer_id);
      const participantPeople = attendees
        .filter((attendee) => attendee.meeting_id === meeting.id)
        .map((attendee) => employeeById.get(attendee.employee_id))
        .filter(Boolean);
      // A department appears only when it has an actual attendee. The organizer
      // alone must not create an empty department row.
      const departmentIds = [
        ...new Set(
          participantPeople.map(
            (person) => person.department_id || "leadership",
          ),
        ),
      ];
      departmentIds.forEach((departmentId) => {
        const department = departmentById.get(departmentId);
        if (!groups.has(departmentId))
          groups.set(departmentId, {
            name: department?.name || "Management Board",
            sortOrder: department?.sort_order ?? -1,
            items: [],
          });
        const participantsInDepartment = participantPeople.filter(
          (person) => (person.department_id || "leadership") === departmentId,
        );
        // The organizer is only the person who created the meeting. Do not
        // show them as a participant unless they were explicitly selected.
        groups
          .get(departmentId)
          .items.push({ ...meeting, participants: participantsInDepartment });
      });
    });
    return [...groups.values()].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
  }, [meetings, attendees, employeeById, departmentById]);

  const canEdit = (meeting) =>
    meeting.organizer_id === profile.id || profile.role === "admin";
  const selectedAttendeeIds = editing
    ? attendees
        .filter((attendee) => attendee.meeting_id === editing.id)
        .map((attendee) => attendee.employee_id)
    : [];
  const cancelMeeting = async (meeting) => {
    setActionMeeting(null);
    setCancellingMeeting(null);
    setError("");
    const attendeeLookup = await supabase
      .from("employee_meeting_attendees")
      .select("employee_id")
      .eq("meeting_id", meeting.id);
    if (attendeeLookup.error) return setError(attendeeLookup.error.message);
    const cancellationRows = (attendeeLookup.data || []).map((attendee) => ({
      employee_id: attendee.employee_id,
      meeting_id: meeting.id,
      content: meeting.content || "Meeting",
      meeting_date: meeting.date,
      start_time: meeting.start_time,
      end_time: meeting.end_time,
      location: meeting.location,
    }));
    if (cancellationRows.length) {
      const notificationResult = await supabase
        .from("employee_meeting_cancellations")
        .insert(cancellationRows);
      if (notificationResult.error)
        return setError(notificationResult.error.message);
    }
    try { await notifyMeetingPush(meeting.id, "cancelled"); }
    catch (pushError) { console.error("Unable to send meeting cancellation push notification:", pushError.message); }
    const attendeesResult = await supabase
      .from("employee_meeting_attendees")
      .delete()
      .eq("meeting_id", meeting.id);
    if (attendeesResult.error) return setError(attendeesResult.error.message);
    const meetingResult = await supabase
      .from("employee_meetings")
      .delete()
      .eq("id", meeting.id);
    if (meetingResult.error) return setError(meetingResult.error.message);
    load();
  };

  return (
    <main className="app-shell meeting-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">EMPLOYEE MEETINGS</p>
          <h1>Meeting Info</h1>
          <p className="subtle">{viewMode === "week" ? `Two-week view · ${weekHeading(startOfWeek(date))}` : formatDate(date)}</p>
        </div>
        <button className="secondary-button" onClick={goBack}>
          ← Back to dashboard
        </button>
      </header>
      <section className="monthly-controls">
        <div className="meeting-date-controls"><button onClick={() => setDate(moveDate(date, viewMode === "week" ? -7 : -1))}>
          ← Previous {viewMode === "week" ? "week" : "day"}
        </button>
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        <button onClick={() => setDate(moveDate(date, viewMode === "week" ? 7 : 1))}>Next {viewMode === "week" ? "week" : "day"} →</button></div>
        <button className={`meeting-view-toggle ${viewMode === "day" ? "is-active" : ""}`} onClick={() => { setDate(today()); setViewMode("day"); }}>By day</button>
        <button className={`meeting-view-toggle ${viewMode === "week" ? "is-active" : ""}`} onClick={() => setViewMode("week")}>By week</button>
        {viewMode === "week" && <label className="meeting-department-filter">Department<select value={departmentFilter} onChange={event => setDepartmentFilter(event.target.value)}><option value="all">All departments</option><option value="management">Management Board</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>}
      </section>
      {error && <p className="notice error">{error}</p>}
      {loading ? (
        <p className="loading">Loading meetings...</p>
      ) : viewMode === "week" ? (
        <WeeklyMeetingCalendar
          startDate={startOfWeek(date)}
          meetings={meetings}
          attendees={attendees}
          employeeById={employeeById}
          departmentById={departmentById}
          departmentFilter={departmentFilter}
          canEdit={canEdit}
          onEdit={setActionMeeting}
        />
      ) : (
        <div className="monthly-table-wrap">
          <table className="monthly-table meeting-info-table">
            <colgroup>
              <col className="meeting-content-column" />
              <col className="meeting-time-column" />
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>Content</th>
                <th>Time</th>
                <th>Location</th>
                <th>Participants</th>
                <th>Actions</th>
                <th>Online link</th>
              </tr>
            </thead>
            <tbody>
              {groupedMeetings.map((group) => (
                <Fragment key={group.name}>
                  <tr>
                    <td colSpan="6">
                      <b style={{ color: departmentAccent(group.name, group.sortOrder) }}>{group.name}</b>
                    </td>
                  </tr>
                  {group.items.map((meeting) => (
                    <tr key={`${group.name}-${meeting.id}`}>
                      <td>{meeting.content || "—"}</td>
                      <td>{timeRange(meeting)}</td>
                      <td>{meeting.location || "—"}</td>
                      <td>
                        {meeting.participants
                          .map((person) => person.full_name)
                          .join(", ") || "—"}
                      </td>
                      <td>
                        {canEdit(meeting) ? (
                          <button
                            className="secondary-button"
                            onClick={() => setActionMeeting(meeting)}
                          >
                            Edit
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {meeting.online_link ? (
                          <a
                            href={meeting.online_link}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Go online
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          {groupedMeetings.length === 0 && (
            <p className="empty">
              No meetings with participants scheduled for this day.
            </p>
          )}
        </div>
      )}
      {editing && (
        <div className="modal-backdrop">
          <div className="modal">
            <MeetingEditor
              meeting={editing}
              employees={employees}
              departments={departments}
              attendeeIds={selectedAttendeeIds}
              onClose={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                load();
              }}
            />
          </div>
        </div>
      )}
      {actionMeeting && (
        <div className="modal-backdrop">
          <section
            className="meeting-action-dialog"
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              className="close"
              onClick={() => setActionMeeting(null)}
              aria-label="Close"
            >
              ×
            </button>
            <p className="eyebrow">MEETING ACTIONS</p>
            <h2>{actionMeeting.content || "Meeting"}</h2>
            <p>Choose an action for this meeting.</p>
            <div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setActionMeeting(null);
                  setEditing(actionMeeting);
                }}
              >
                Update meeting
              </button>
              <button
                type="button"
                className="secondary-button cancel-action"
                onClick={() => {
                  setActionMeeting(null);
                  setCancellingMeeting(actionMeeting);
                }}
              >
                Cancel meeting
              </button>
            </div>
          </section>
        </div>
      )}
      {cancellingMeeting && (
        <div className="modal-backdrop">
          <section
            className="meeting-action-dialog meeting-cancel-confirm"
            role="alertdialog"
            aria-modal="true"
          >
            <p className="eyebrow">CONFIRM CANCELLATION</p>
            <h2>Cancel this meeting?</h2>
            <p>
              All assigned participants will be removed and receive a
              cancellation notification.
            </p>
            <div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setCancellingMeeting(null)}
              >
                Keep meeting
              </button>
              <button
                type="button"
                className="secondary-button cancel-action"
                onClick={() => cancelMeeting(cancellingMeeting)}
              >
                Cancel meeting
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function WeeklyMeetingCalendar({ startDate, meetings, attendees, employeeById, departmentById, departmentFilter, canEdit, onEdit }) {
  const [expandedDates, setExpandedDates] = useState(new Set());
  const meetingCardsByDate = useMemo(() => {
    const attendeeIdsByMeeting = new Map();
    attendees.forEach(({ meeting_id, employee_id }) => {
      attendeeIdsByMeeting.set(meeting_id, [...(attendeeIdsByMeeting.get(meeting_id) || []), employee_id]);
    });
    const cards = new Map();
    meetings.forEach(meeting => {
      const participants = (attendeeIdsByMeeting.get(meeting.id) || []).map(id => employeeById.get(id)).filter(Boolean);
      if (!participants.length) return;
      const matchesDepartment = departmentFilter === "all" || participants.some(person => departmentFilter === "management" ? !person.department_id : person.department_id === departmentFilter);
      if (!matchesDepartment) return;
      const departmentNames = [...new Set(participants.map(person => departmentById.get(person.department_id)?.name || "Management Board"))];
      const organizer = employeeById.get(meeting.organizer_id);
      const card = { ...meeting, participants, departmentNames, organizer };
      cards.set(meeting.date, [...(cards.get(meeting.date) || []), card]);
    });
    cards.forEach(items => items.sort((a, b) => String(a.start_time || "").localeCompare(String(b.start_time || ""))));
    return cards;
  }, [meetings, attendees, employeeById, departmentById, departmentFilter]);
  const dates = weekDates(startDate);

  return <section className="weekly-meeting-calendar" aria-label="Two-week meeting calendar">
    {[dates.slice(0, 7), dates.slice(7)].map((week, index) => <section className={`weekly-meeting-section ${index === 0 ? "is-current-week" : "is-next-week"}`} key={week[0]}>
      <h2>{index === 0 ? weekHeading(week[0]) : `Next week · ${weekHeading(week[0])}`}</h2>
      <div className="weekly-meeting-grid">{week.map(day => {
        const dayMeetings = meetingCardsByDate.get(day) || [];
        const isExpanded = expandedDates.has(day);
        const visibleMeetings = isExpanded ? dayMeetings : dayMeetings.slice(0, 3);
        const isWeekend = [0, 6].includes(new Date(`${day}T12:00:00`).getDay());
        return <article className={`weekly-meeting-day ${day === today() ? "is-today" : ""} ${isWeekend ? "is-weekend" : ""}`} key={day}>
          <header><strong>{shortDay(day)}</strong>{day === today() && <span>Today</span>}</header>
          <div className="weekly-meeting-items">{visibleMeetings.map(meeting => <article className="weekly-meeting-card" style={{ "--department-border": departmentBorder(meeting.departmentNames) }} tabIndex="0" key={meeting.id}>
            <strong>{meeting.content || "Meeting"}</strong>
            <span className="weekly-meeting-card-time"><Clock3 size={12} />{timeRange(meeting)}</span>
            <span className="weekly-meeting-card-location"><MapPin size={12} />{meeting.location || "Location not specified"}</span>
            <small className="weekly-meeting-departments">{meeting.departmentNames.map((name, index) => <span key={name} style={{ color: departmentAccent(name) }}>{index ? " · " : ""}{name}</span>)}</small>
            <div className="weekly-meeting-tooltip"><b>{meeting.content || "Meeting"}</b><span><strong>Time:</strong> {timeRange12Hour(meeting)}</span><span><strong>Location:</strong> {meeting.location || "Not specified"}</span><span><strong>Departments:</strong> {meeting.departmentNames.join(", ")}</span><span><strong>Participants:</strong> {meeting.participants.map(person => person.full_name).join(", ")}</span>{(meeting.online_link || canEdit(meeting)) && <div className="weekly-meeting-tooltip-actions">{meeting.online_link && <a className="weekly-meeting-online" href={meeting.online_link} target="_blank" rel="noreferrer">Go online</a>}{canEdit(meeting) && <button type="button" className="weekly-meeting-edit" onClick={event => { event.preventDefault(); event.stopPropagation(); onEdit(meeting); }}>Edit meeting</button>}</div>}</div>
          </article>)}</div>
          {dayMeetings.length > 3 && <button className="weekly-meeting-more" type="button" onClick={() => setExpandedDates(current => { const next = new Set(current); isExpanded ? next.delete(day) : next.add(day); return next; })}>{isExpanded ? "Show less" : `+${dayMeetings.length - 3} more`}</button>}
        </article>;
      })}</div>
    </section>)}
  </section>;
}

function MeetingEditor({ meeting, employees, departments, attendeeIds, onClose, onSaved }) {
  const [meetingDate, setMeetingDate] = useState(meeting.date || "");
  const [content, setContent] = useState(meeting.content || "");
  const [location, setLocation] = useState(meeting.location || "");
  const [onlineLink, setOnlineLink] = useState(meeting.online_link || "");
  const [startTime, setStartTime] = useState(
    meeting.start_time?.slice(0, 5) || "",
  );
  const [endTime, setEndTime] = useState(meeting.end_time?.slice(0, 5) || "");
  const [selectedIds, setSelectedIds] = useState(attendeeIds);
  const [query, setQuery] = useState("");
  const [unavailable, setUnavailable] = useState(new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (error === ROOM_MESSAGE) showRoomReservationAlert(ROOM_MESSAGE);
  }, [error]);
  useEffect(() => {
    if (!meetingDate) {
      setUnavailable(new Map());
      return;
    }
    getUnavailableMeetingParticipants([meetingDate]).then(
      (nextUnavailable) => {
        setUnavailable(nextUnavailable);
        setSelectedIds((ids) => ids.filter((id) => !nextUnavailable.has(id)));
      },
    );
  }, [meetingDate]);
  const results = useMemo(() => {
    const text = query.trim().toLowerCase();
    return text
      ? employees.filter((employee) =>
          `${employee.full_name} ${employee.employee_code}`
            .toLowerCase()
            .includes(text),
        )
      : [];
  }, [employees, query]);
  const departmentResults = useMemo(() => {
    const text = query.trim().toLowerCase();
    return text
      ? departments.filter((department) =>
          department.name.toLowerCase().includes(text),
        )
      : [];
  }, [departments, query]);
  const selectedEmployees = useMemo(
    () => employees.filter((employee) => selectedIds.includes(employee.id)),
    [employees, selectedIds],
  );
  const toggleParticipant = (id) => {
    if (!unavailable.has(id))
      setSelectedIds((ids) =>
        ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
      );
  };
  const addDepartmentParticipants = (departmentId) => {
    const availableIds = employees
      .filter(
        (employee) =>
          employee.department_id === departmentId && !unavailable.has(employee.id),
      )
      .map((employee) => employee.id);
    setSelectedIds((ids) => [...new Set([...ids, ...availableIds])]);
    setQuery("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!meetingDate) return setError("A meeting date is required.");
    if (!content.trim() || !location.trim())
      return setError("Content and location are required.");
    if (!startTime || !endTime)
      return setError("Start time and end time are required for a meeting.");
    if (endTime < startTime)
      return setError("The end time must not be earlier than the start time.");
    setSaving(true);
    setError("");
    const currentUnavailable = await getUnavailableMeetingParticipants([
      meetingDate,
    ]);
    const availableSelectedIds = [
      ...new Set(selectedIds.filter((id) => !currentUnavailable.has(id))),
    ];
    if (location.trim() === KNT_MEETING_ROOM) {
      const reservation = await supabase
        .from("employee_meetings")
        .select("id")
        .eq("date", meetingDate)
        .eq("location", KNT_MEETING_ROOM)
        .neq("id", meeting.id)
        .lt("start_time", endTime)
        .gt("end_time", startTime)
        .limit(1);
      if (reservation.error) {
        setSaving(false);
        return setError(reservation.error.message);
      }
      if (reservation.data?.length) {
        setSaving(false);
        return setError(ROOM_MESSAGE);
      }
    }
    const update = await supabase
      .from("employee_meetings")
      .update({
        date: meetingDate,
        content: content.trim(),
        location: location.trim(),
        online_link: onlineLink.trim() || null,
        start_time: startTime,
        end_time: endTime,
      })
      .eq("id", meeting.id);
    if (update.error) {
      setSaving(false);
      return setError(update.error.message);
    }
    const remove = await supabase
      .from("employee_meeting_attendees")
      .delete()
      .eq("meeting_id", meeting.id);
    if (remove.error) {
      setSaving(false);
      return setError(remove.error.message);
    }
    if (availableSelectedIds.length) {
      const insert = await supabase
        .from("employee_meeting_attendees")
        .insert(
          availableSelectedIds.map((employeeId) => ({
            meeting_id: meeting.id,
            employee_id: employeeId,
          })),
        );
      if (insert.error) {
        setSaving(false);
        return setError(insert.error.message);
      }
    }
    try { await notifyMeetingPush(meeting.id, "updated"); }
    catch (pushError) { console.error("Unable to send meeting update push notification:", pushError.message); }
    setSaving(false);
    onSaved();
  };

  return (
    <form className="status-form" onSubmit={submit}>
      <div className="form-title">
        <div>
          <p className="eyebrow">EDIT MEETING</p>
          <h2>{meetingDate}</h2>
        </div>
        <button
          type="button"
          className="close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <label>
        Date
        <input
          required
          type="date"
          value={meetingDate}
          onChange={(event) => setMeetingDate(event.target.value)}
        />
      </label>
      <div
        className="date-range"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        <label>
          Start time
          <input
            required
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </label>
        <label>
          End time
          <input
            required
            type="time"
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
          />
        </label>
      </div>
      <label>
        Content
        <textarea
          required
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows="3"
        />
      </label>
      <label>
        <span
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          Location{" "}
          <span>
            <input
              type="checkbox"
              checked={location === KNT_MEETING_ROOM}
              onChange={(event) =>
                setLocation(event.target.checked ? KNT_MEETING_ROOM : "")
              }
            />{" "}
            {KNT_MEETING_ROOM}
          </span>
        </span>
        <input
          required
          value={location}
          onChange={(event) => setLocation(event.target.value)}
        />
      </label>
      <label>
        Online Link <span className="subtle">(optional)</span>
        <input
          type="url"
          value={onlineLink}
          onChange={(event) => setOnlineLink(event.target.value)}
          placeholder="https://..."
        />
      </label>
      <p className="subtle">Selected participants</p>
      <div className="employee-list meeting-selected-participants" aria-label="Selected meeting participants">
        {selectedEmployees.map((employee) => {
          const reason = unavailable.get(employee.id);
          return (
            <button
              type="button"
              key={employee.id}
              disabled={Boolean(reason)}
              className="employee-badge is-editable is-selected"
              style={
                reason ? { opacity: 0.55, cursor: "not-allowed" } : undefined
              }
              onClick={() => toggleParticipant(employee.id)}
            >
              ✓ {employee.full_name}{" "}
              <span className="employee-code">
                {reason ? `Unavailable: ${reason}` : employee.employee_code}
              </span>
            </button>
          );
        })}
        {selectedEmployees.length === 0 && (
          <p className="empty">No participants selected</p>
        )}
      </div>
      <label>
        Search participants
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or employee ID"
        />
      </label>
      {query.trim() && (
        <div
          className="employee-list"
          aria-label="Meeting participant search results"
        >
          {departmentResults.map((department) => (
            <button
              type="button"
              key={department.id}
              className="employee-badge is-editable"
              onClick={() => addDepartmentParticipants(department.id)}
            >
              {department.name}{" "}
              <span className="employee-code">Add available members</span>
            </button>
          ))}
          {results.map((employee) => {
            const reason = unavailable.get(employee.id);
            return (
              <button
                type="button"
                key={employee.id}
                disabled={Boolean(reason)}
                className={`employee-badge is-editable ${selectedIds.includes(employee.id) ? "is-selected" : ""}`}
                style={
                  reason ? { opacity: 0.55, cursor: "not-allowed" } : undefined
                }
                onClick={() => toggleParticipant(employee.id)}
              >
                {selectedIds.includes(employee.id) ? "✓ " : ""}
                {employee.full_name}{" "}
                <span className="employee-code">
                  {reason ? `Unavailable: ${reason}` : employee.employee_code}
                </span>
              </button>
            );
          })}
          {results.length === 0 && departmentResults.length === 0 && (
            <p className="empty">No matching employees or departments</p>
          )}
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
      <button className="primary-button" disabled={saving}>
        {saving ? "Saving..." : "Update"}
      </button>
    </form>
  );
}
