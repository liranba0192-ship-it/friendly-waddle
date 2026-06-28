import { useState } from 'react';

// דיאלוג יצירת פרויקט חדש לפי לקוח.
export default function NewProjectDialog({ onCreate, onClose }) {
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  function submit(e) {
    e.preventDefault();
    onCreate({ client_name: clientName, address, date });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="card modal col" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>פרויקט חדש</h2>
        <div>
          <label>שם הלקוח</label>
          <input autoFocus value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="לדוגמה: משפחת כהן" required />
        </div>
        <div>
          <label>כתובת (אופציונלי)</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="רחוב, עיר" />
        </div>
        <div>
          <label>תאריך</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" />
        </div>
        <div className="row">
          <button type="button" className="ghost" onClick={onClose}>ביטול</button>
          <div className="spacer" />
          <button type="submit" className="primary">יצירה</button>
        </div>
      </form>
    </div>
  );
}
