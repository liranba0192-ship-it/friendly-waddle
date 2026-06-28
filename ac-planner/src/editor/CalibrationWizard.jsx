import { useState } from 'react';

// אשף כיול: באנר הוראות לפי שלב, ובסוף קלט המרחק האמיתי.
// state: 'pickA' | 'pickB' | 'enterDistance'
export default function CalibrationWizard({ state, onCancel, onConfirmDistance }) {
  const [meters, setMeters] = useState('');

  if (state === 'pickA') {
    return (
      <Banner onCancel={onCancel}>
        כיול — שלב 1/3: הקש על הנקודה הראשונה על קו שאתה יודע את אורכו (למשל קצה קיר).
      </Banner>
    );
  }
  if (state === 'pickB') {
    return (
      <Banner onCancel={onCancel}>
        כיול — שלב 2/3: הקש על הנקודה השנייה (הקצה השני של אותו קיר).
      </Banner>
    );
  }
  if (state === 'enterDistance') {
    return (
      <div className="modal-backdrop">
        <form
          className="card modal col"
          onSubmit={(e) => {
            e.preventDefault();
            onConfirmDistance(meters);
          }}
        >
          <h2>כיול — שלב 3/3</h2>
          <p className="muted">מה האורך האמיתי בין שתי הנקודות שסימנת?</p>
          <div className="row">
            <input
              autoFocus
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={meters}
              onChange={(e) => setMeters(e.target.value)}
              placeholder="לדוגמה: 4"
              dir="ltr"
              style={{ textAlign: 'center', fontSize: 22 }}
            />
            <span style={{ fontWeight: 700 }}>מטר</span>
          </div>
          <div className="row">
            <button type="button" className="ghost" onClick={onCancel}>ביטול</button>
            <div className="spacer" />
            <button type="submit" className="primary" disabled={!(Number(meters) > 0)}>
              שמור כיול
            </button>
          </div>
        </form>
      </div>
    );
  }
  return null;
}

function Banner({ children, onCancel }) {
  return (
    <div className="banner">
      <div>{children}</div>
      <button
        className="ghost"
        style={{ color: '#fff', marginTop: 8, minHeight: 36 }}
        onClick={onCancel}
      >
        ביטול כיול
      </button>
    </div>
  );
}
