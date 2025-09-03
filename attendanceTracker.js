// attendanceTracker.js
const activeSessions = new Map(); // attendee_id -> { join_time, isActive, onlineStatus }

function diffAttendees(currentList, eventId, now) {
  const updates = [];

  const currentNames = currentList.map(a => typeof a === 'string' ? a : a.name);
  const currentSet = new Set(currentNames);
  const knownSet = new Set(activeSessions.keys());

  const statusMap = new Map();
  for (const attendee of currentList) {
    if (typeof attendee === 'object') {
      statusMap.set(attendee.name, attendee.onlineStatus);
    }
  }

  console.log('[DEBUG] currentList:', currentNames);
  console.log('[DEBUG] knownAttendees:', Array.from(knownSet));

  // Neue Teilnehmer
  for (const id of currentSet) {
    const status = statusMap.get(id);
    if (!activeSessions.has(id) && status === 'online') {
      console.log('[DEBUG] New attendee joined:', id);
      activeSessions.set(id, { join_time: now, isActive: true, onlineStatus: status });
      updates.push({ type: 'join', attendee_id: id, join_time: now, event_id: eventId });
    } else if (activeSessions.has(id)) {
      const session = activeSessions.get(id);
      const prevStatus = session.onlineStatus;

      if (status === 'online' && prevStatus !== 'online') {
        console.log('[DEBUG] Attendee came online:', id);
        updates.push({ type: 'join', attendee_id: id, join_time: now, event_id: eventId });
      } else if (status === 'offline' && prevStatus !== 'offline') {
        console.log('[DEBUG] Attendee went offline:', id);
        updates.push({ type: 'leave', attendee_id: id, join_time: session.join_time, leave_time: now, event_id: eventId });
      }
      // Update session status and mark present
      session.onlineStatus = status;
      session.isActive = true;
    }
  }

  // Verlassene Teilnehmer
  for (const id of knownSet) {
    if (!currentSet.has(id) && activeSessions.get(id).isActive) {
      console.log('[DEBUG] Attendee left:', id);
      const { join_time } = activeSessions.get(id);
      updates.push({ type: 'leave', attendee_id: id, join_time, leave_time: now, event_id: eventId });
      activeSessions.delete(id);
    }
  }

  // Cleanup: mark all as not present
  for (const id of currentSet) {
    const session = activeSessions.get(id);
    if (session) session.isActive = false;
  }

  return updates;
}

module.exports = { diffAttendees };