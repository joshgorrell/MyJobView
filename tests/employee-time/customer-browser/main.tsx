import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../src/index.css";
import { ManualJobTimeRequestModal } from "../../../src/components/Technician/ManualJobTimeRequestModal";
import { CustomerTimeTimer } from "../../../src/components/Technician/CustomerTimeTimer";
function App() {
  const [open, setOpen] = useState(true);
  return open ? (
    <ManualJobTimeRequestModal
      onClose={() => setOpen(false)}
      onSubmitted={() => {}}
    />
  ) : (
    <>
      <CustomerTimeTimer />
      <button onClick={() => setOpen(true)}>Record more time</button>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
