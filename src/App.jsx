import { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";

function App() {
  const [name, setName] = useState("");
  const [makeup, setMakeup] = useState("");
  const [customType, setCustomType] = useState("");
  const [customDuration, setCustomDuration] = useState("");
  const [hour, setHour] = useState("");
  const [reservations, setReservations] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(true);

  const NAMES = ["Ane", "César", "Eloi", "Elena", "Guilhem", "Jacob", "Lierni", "Martinet", "Maria", "Marta", "Martina", "Paula"];
  const MAKEUPS = [
    { type: "Pintura de cara", duration: 15 },
    { type: "Sombra de ojos", duration: 30 },
    { type: "Otro", duration: null },
  ];

  // Horas de 17:00 a 20:00 (cada 15 min)
  const HOURS = [];
  for (let h = 17; h < 20; h++) {
    for (let m = 0; m < 60; m += 15) {
      HOURS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }

  const loadReservations = async () => {
    const q = query(collection(db, "reservations"), orderBy("startTime"));
    const querySnapshot = await getDocs(q);
    const data = querySnapshot.docs.map((doc) => doc.data());
    setReservations(data);
    setLoading(false);
  };

  useEffect(() => {
    loadReservations();
  }, []);

  const getDuration = () => {
    if (makeup === "Otro") return parseInt(customDuration || "0");
    const found = MAKEUPS.find((m) => m.type === makeup);
    return found ? found.duration : 0;
  };

  const handleConfirm = async () => {
    const duration = getDuration();
    if (!name || !makeup || !hour || duration <= 0 || (makeup === "Otro" && !customType)) {
      alert("Rellena todos los campos correctamente 🎃");
      return;
    }

    const makeupType = makeup === "Otro" ? customType : makeup;

    // Validar que la persona no tenga el mismo tipo de maquillaje ya reservado
    if (reservations.some(r => r.name === name && r.makeupType === makeupType)) {
      alert("Ya tienes una reserva para este tipo de maquillaje 💀");
      return;
    }

    // Calcular slots que ocupará esta reserva
    const startIndex = HOURS.indexOf(hour);
    const slotsToBlock = Math.ceil(duration / 15);
    const selectedSlots = HOURS.slice(startIndex, startIndex + slotsToBlock);

    // Comprobar conflictos con reservas existentes
    const conflict = reservations.some(r => {
      const rHour = new Date(r.startTime).toISOString().slice(11,16); // "HH:MM"
      const rStartIndex = HOURS.indexOf(rHour);
      const rSlots = Math.ceil(r.duration / 15);
      const rOccupied = HOURS.slice(rStartIndex, rStartIndex + rSlots);
      return rOccupied.some(s => selectedSlots.includes(s));
    });

    if (conflict) {
      alert("💀 Este horario se solapa con otra reserva. Elige otra.");
      return;
    }

    const startTime = new Date(`2025-10-31T${hour}:00`);
    const newRes = {
      name,
      makeupType,
      startTime: startTime.toISOString(),
      duration,
      confirmed: true,
      createdAt: new Date().toISOString(),
    };

    await addDoc(collection(db, "reservations"), newRes);
    setReservations([...reservations, newRes]);

    alert("✨ ¡Reserva confirmada!");
    setName("");
    setMakeup("");
    setCustomType("");
    setCustomDuration("");
    setHour("");
    setConfirming(false);
  };

  if (loading)
    return (
      <div style={styles.loading}>
        <h2 style={{ color: "#ffa500" }}>🕸️ Cargando reservas...</h2>
      </div>
    );

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🎃 Reserva tu maquillaje</h1>

      {/* Selector de nombre */}
      <select style={styles.select} value={name} onChange={(e) => setName(e.target.value)}>
        <option value="">Selecciona tu nombre</option>
        {NAMES.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>

      {/* Selector de maquillaje */}
      <select
        style={styles.select}
        value={makeup}
        onChange={(e) => {
          setMakeup(e.target.value);
          setCustomType("");
          setCustomDuration("");
        }}
      >
        <option value="">Tipo de maquillaje</option>
        {MAKEUPS.map((m) => (
          <option key={m.type} value={m.type}>{m.type}</option>
        ))}
      </select>

      {makeup === "Otro" && (
        <div style={styles.customInputs}>
          <input
            style={styles.input}
            type="text"
            placeholder="Especifica el tipo"
            value={customType}
            onChange={(e) => setCustomType(e.target.value)}
          />
          <input
            style={styles.input}
            type="number"
            placeholder="Duración (min)"
            value={customDuration}
            onChange={(e) => setCustomDuration(e.target.value)}
          />
        </div>
      )}

      {/* Selector de hora */}
      <h3 style={{ color: "#ffa500", marginTop: "20px" }}>Selecciona hora disponible</h3>
      <div style={styles.grid}>
        {HOURS.map((h, idx) => {
          const duration = getDuration();
          const slotsToBlock = Math.ceil(duration / 15);
          const selectedSlots = HOURS.slice(idx, idx + slotsToBlock);

          const slotTaken = reservations.some(r => {
            const rHour = new Date(r.startTime).toISOString().slice(11,16);
            const rStartIndex = HOURS.indexOf(rHour);
            const rSlots = Math.ceil(r.duration / 15);
            const rOccupied = HOURS.slice(rStartIndex, rStartIndex + rSlots);
            return rOccupied.some(s => selectedSlots.includes(s));
          });

          return (
            <button
              key={h}
              style={{
                ...styles.slot,
                backgroundColor: slotTaken
                  ? "rgba(255, 69, 0, 0.3)"
                  : hour === h
                  ? "#ffa500"
                  : "rgba(255, 165, 0, 0.1)",
                color: slotTaken ? "#555" : hour === h ? "#000" : "#ffa500",
                cursor: slotTaken ? "not-allowed" : "pointer",
              }}
              disabled={slotTaken}
              onClick={() => setHour(h)}
            >
              {h}
            </button>
          );
        })}
      </div>

      {!confirming ? (
        <button
          style={styles.confirmBtn}
          onClick={() => setConfirming(true)}
          disabled={!name || !makeup || !hour}
        >
          Verificar disponibilidad
        </button>
      ) : (
        <div style={{ marginTop: "15px" }}>
          <p style={{ color: "#ffa500" }}>¿Confirmas tu reserva a las {hour}?</p>
          <button style={styles.yesBtn} onClick={handleConfirm}>Sí, confirmar</button>
          <button style={styles.noBtn} onClick={() => setConfirming(false)}>Cancelar</button>
        </div>
      )}

      <div style={{ marginTop: "40px" }}>
        <h2 style={{ color: "#ffa500" }}>👻 Reservas confirmadas</h2>
        <ul style={styles.resList}>
          {reservations
            .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
            .map((r, i) => (
              <li key={i} style={styles.resItem}>
                {r.name} — {r.makeupType} (
                {new Date(r.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                )
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}

/* 🎨 Estilos */
const styles = {
  container: { minHeight: "100vh", backgroundColor: "#0a0a0a", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", padding: "2rem", fontFamily: "'Creepster', cursive" },
  title: { fontSize: "2.5rem", color: "#ffa500", textShadow: "0 0 20px #ff5500" },
  select: { marginTop: "10px", padding: "10px", borderRadius: "8px", border: "2px solid #ffa500", backgroundColor: "#111", color: "#ffa500", fontSize: "1rem", width: "250px", textAlign: "center" },
  customInputs: { marginTop: "10px", display: "flex", gap: "10px", justifyContent: "center" },
  input: { padding: "8px", borderRadius: "8px", border: "2px solid #ffa500", backgroundColor: "#111", color: "#ffa500", width: "140px" },
  grid: { marginTop: "15px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: "8px", width: "90%", maxWidth: "400px" },
  slot: { padding: "10px", border: "2px solid #ffa500", borderRadius: "10px", fontSize: "0.9rem", transition: "0.3s" },
  confirmBtn: { marginTop: "20px", backgroundColor: "#ffa500", color: "#000", border: "none", borderRadius: "10px", padding: "10px 20px", fontSize: "1rem", cursor: "pointer", transition: "0.2s" },
  yesBtn: { backgroundColor: "#ffa500", color: "#000", border: "none", borderRadius: "10px", padding: "10px 20px", marginRight: "10px", cursor: "pointer" },
  noBtn: { backgroundColor: "#333", color: "#ffa500", border: "1px solid #ffa500", borderRadius: "10px", padding: "10px 20px", cursor: "pointer" },
  resList: { listStyle: "none", padding: 0 },
  resItem: { backgroundColor: "rgba(255, 165, 0, 0.1)", border: "1px solid #ffa500", borderRadius: "8px", margin: "5px 0", padding: "8px" },
  loading: { minHeight: "100vh", backgroundColor: "#000", display: "flex", justifyContent: "center", alignItems: "center" },
};

export default App;
