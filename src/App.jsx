// src/App.jsx
import React, { useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  runTransaction,
  query,
  orderBy
} from 'firebase/firestore';

// ----- TODO: replace these with your Firebase config in .env -----
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function Slot({ slot, onReserve, reservingId }) {
  return (
    <div className={`slot ${slot.available ? 'free' : 'booked'}`}>
      <div>{slot.date} — {slot.time}</div>
      <div>{slot.available ? 'Disponible' : `Reservado por ${slot.bookedBy?.name || 'alguien'}`}</div>
      <button disabled={!slot.available || reservingId === slot.id} onClick={() => onReserve(slot)}>
        { reservingId === slot.id ? 'Reservando...' : (slot.available ? 'Reservar' : 'No disponible') }
      </button>
    </div>
  );
}

export default function App() {
  const [slots, setSlots] = useState([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [reservingId, setReservingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'slots'), orderBy('date'), orderBy('time'));
    getDocs(q).then(snap => {
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSlots(arr);
      setLoading(false);
    }).catch(err => { console.error(err); setMessage('Error cargando slots'); setLoading(false); });
  }, []);

  async function reserve(slot) {
    if (!name || !email) { setMessage('Pon tu nombre y email'); return; }
    setSelectedSlot(slot);
    setReservingId(slot.id);
    setMessage('Intentando reservar...');

    const slotRef = doc(db, 'slots', slot.id);
    try {
      await runTransaction(db, async (transaction) => {
        const sDoc = await transaction.get(slotRef);
        if (!sDoc.exists()) throw new Error('Slot no existe');
        const data = sDoc.data();
        if (!data.available) throw new Error('Slot ya reservado');

        // marca como reservado
        transaction.update(slotRef, {
          available: false,
          bookedBy: { name, email, note, at: new Date().toISOString() }
        });
      });

      setMessage('Reserva completada 🎉 — revisa el email (si has integrado envío)');
      // actualizar UI localmente
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, available: false, bookedBy: { name } } : s));
    } catch (err) {
      console.error(err);
      setMessage(err.message || 'No se pudo reservar');
    } finally {
      setReservingId(null);
      setSelectedSlot(null);
    }
  }

  if (loading) return <div>Cargando slots...</div>;

  return (
    <div style={{ maxWidth: 760, margin: '24px auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h1>Reservas - Maquillaje Halloween</h1>
      <p>Selecciona una franja y rellena tus datos para reservar (duración: 30 min por defecto)</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
        <div>
          <h2>Franjas</h2>
          <div>
            {slots.map(s => (
              <Slot key={s.id} slot={s} onReserve={reserve} reservingId={reservingId} />
            ))}
          </div>
        </div>

        <aside style={{ border: '1px solid #eee', padding: 12, borderRadius: 8 }}>
          <h3>Tus datos</h3>
          <label>Nombre</label>
          <input value={name} onChange={e => setName(e.target.value)} style={{ width: '100%' }} />
          <label>Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%' }} />
          <label>Nota (tipo de maquillaje)</label>
          <input value={note} onChange={e => setNote(e.target.value)} style={{ width: '100%' }} />
          <div style={{ marginTop: 8 }}>
            <button onClick={() => reserve(selectedSlot)} disabled={!selectedSlot || reservingId}>
              Reservar franjas seleccionada
            </button>
            <div style={{ marginTop: 8 }}>{message}</div>
          </div>
        </aside>
      </div>

      <style>{`
        .slot{ display:flex; justify-content:space-between; align-items:center; padding:8px; border:1px solid #ddd; margin-bottom:8px; border-radius:6px }
        .slot.free{ background:#f9fff9 }
        .slot.booked{ background:#fff7f7 }
        button{ padding:8px 12px; border-radius:6px; cursor:pointer }
      `}</style>
    </div>
  );
}