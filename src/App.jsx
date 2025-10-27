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
  where,
  orderBy
} from 'firebase/firestore';

// ----- Firebase config desde env -----
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// Fecha fija
const FIXED_DATE = '2025-10-31';

// Datos de ejemplo (fallback) — solo para desarrollo/local
const MOCK_SLOTS = [
  { id: 'm-10-00', date: FIXED_DATE, time: '10:00', available: true, bookedBy: {} },
  { id: 'm-10-30', date: FIXED_DATE, time: '10:30', available: true, bookedBy: {} },
  { id: 'm-11-00', date: FIXED_DATE, time: '11:00', available: true, bookedBy: {} },
  { id: 'm-11-30', date: FIXED_DATE, time: '11:30', available: true, bookedBy: {} },
  { id: 'm-12-00', date: FIXED_DATE, time: '12:00', available: true, bookedBy: {} }
];

let db = null;
let firebaseInitialized = false;

if (firebaseConfig && firebaseConfig.apiKey) {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    firebaseInitialized = true;
  } catch (e) {
    console.error('Error inicializando Firebase:', e);
    firebaseInitialized = false;
  }
} else {
  firebaseInitialized = false;
}

function Slot({ slot, onReserve, reservingId, selected, onSelect }) {
  return (
    <div
      className={`slot ${slot.available ? 'free' : 'booked'} ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(slot)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(slot); }}
      style={{ cursor: 'pointer' }}
    >
      <div>
        <div style={{ fontWeight: 600 }}>{slot.time}</div>
        <div style={{ fontSize: 12, color: '#555' }}>{slot.date}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ marginBottom: 6 }}>{slot.available ? 'Disponible' : `Reservado por ${slot.bookedBy?.name || 'alguien'}`}</div>
        <button
          disabled={!slot.available || reservingId === slot.id}
          onClick={(e) => { e.stopPropagation(); onReserve(slot); }}
        >
          { reservingId === slot.id ? 'Reservando...' : (slot.available ? 'Reservar' : 'No disponible') }
        </button>
      </div>
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
  const [useMock, setUseMock] = useState(!firebaseInitialized);

  useEffect(() => {
    setMessage('');
    setLoading(true);

    if (!firebaseInitialized) {
      // Si Firebase no está configurado o no inicializa, usamos los datos de ejemplo
      setTimeout(() => {
        setSlots(MOCK_SLOTS);
        setLoading(false);
        setMessage('Modo demo: Firebase no configurado. Rellena las variables de entorno para usar Firestore.');
      }, 200); // pequeño delay para simular carga
      return;
    }

    // Si Firebase está inicializado, intentamos leer la colección 'slots' filtrada por fecha fija
    (async () => {
      try {
        const q = query(collection(db, 'slots'), where('date', '==', FIXED_DATE), orderBy('time'));
        const snap = await getDocs(q);
        const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // ordenar por time por si acaso
        arr.sort((a, b) => a.time.localeCompare(b.time));
        setSlots(arr);
        setUseMock(false);
        setLoading(false);
        if (arr.length === 0) setMessage('No hay franjas en Firestore para esa fecha. (Comprueba que existan documentos con date = 2025-10-31).');
      } catch (err) {
        console.error('Error leyendo Firestore:', err);
        setMessage('Error leyendo Firestore. Revisa la consola y las reglas de seguridad.');
        // fallback a mock
        setSlots(MOCK_SLOTS);
        setUseMock(true);
        setLoading(false);
      }
    })();
  }, []);

  async function reserve(slot) {
    if (!slot) { setMessage('Selecciona una franja para reservar'); return; }
    if (!name || !email) { setMessage('Pon tu nombre y email'); return; }

    setSelectedSlot(slot);
    setReservingId(slot.id);
    setMessage('Intentando reservar...');

    if (!firebaseInitialized || useMock) {
      // Simulamos la reserva localmente (solo demo)
      setTimeout(() => {
        setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, available: false, bookedBy: { name } } : s));
        setMessage('Reserva simulada (modo demo). Configura Firebase para reservas reales.');
        setReservingId(null);
        setSelectedSlot(null);
      }, 600);
      return;
    }

    const slotRef = doc(db, 'slots', slot.id);
    try {
      await runTransaction(db, async (transaction) => {
        const sDoc = await transaction.get(slotRef);
        if (!sDoc.exists()) throw new Error('Slot no existe');
        const data = sDoc.data();
        if (!data.available) throw new Error('Slot ya reservado');

        transaction.update(slotRef, {
          available: false,
          bookedBy: { name, email, note, at: new Date().toISOString() }
        });
      });

      setMessage('Reserva completada 🎉 — revisa el email (si has integrado envío)');
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, available: false, bookedBy: { name } } : s));
      setSelectedSlot(null);
    } catch (err) {
      console.error(err);
      setMessage(err.message || 'No se pudo reservar');
      // refrescar lista
      try {
        const snap = await getDocs(query(collection(db, 'slots'), where('date', '==', FIXED_DATE), orderBy('time')));
        setSlots(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error('Error refrescando slots', e); }
    } finally {
      setReservingId(null);
    }
  }

  if (loading) return <div style={{ padding: 24 }}>Cargando franjas...</div>;

  return (
    <div style={{ maxWidth: 760, margin: '24px auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h1>Reservas - Maquillaje Halloween</h1>
      <p>Selecciona una hora para el <strong>{FIXED_DATE}</strong> y rellena tus datos para reservar (duración: 30 min por defecto)</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
        <div>
          <h2>Franjas</h2>
          <div>
            {slots.length === 0 && <div>No hay franjas disponibles para esta fecha.</div>}
            {slots.map(s => (
              <Slot
                key={s.id}
                slot={s}
                onReserve={reserve}
                reservingId={reservingId}
                selected={selectedSlot?.id === s.id}
                onSelect={(slot) => setSelectedSlot(slot)}
              />
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
            <div style={{ marginBottom: 8 }}>
              <strong>Seleccionada:</strong> {selectedSlot ? selectedSlot.time : 'Ninguna'}
            </div>
            <button onClick={() => reserve(selectedSlot)} disabled={!selectedSlot || reservingId}>
              Reservar franja seleccionada
            </button>
            <div style={{ marginTop: 8, minHeight: 20 }}>{message}</div>
            {useMock && <div style={{ marginTop: 8, fontSize: 12, color:'#b44' }}>Nota: estás en modo demo (sin Firebase configurado).</div>}
          </div>
        </aside>
      </div>

      <style>{`
        .slot{ display:flex; justify-content:space-between; align-items:center; padding:12px; border:1px solid #ddd; margin-bottom:8px; border-radius:8px; background:#fff }
        .slot.free{ background:#f9fff9 }
        .slot.booked{ background:#fff7f7; opacity:0.95 }
        .slot.selected{ box-shadow: 0 0 0 3px rgba(59,130,246,0.12); border-color: rgba(59,130,246,0.4); }
        button{ padding:8px 12px; border-radius:6px; cursor:pointer }
        input{ padding:8px; margin-bottom:8px; box-sizing:border-box }
      `}</style>
    </div>
  );
}
