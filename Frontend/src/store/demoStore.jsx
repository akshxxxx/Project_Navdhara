import { createContext, useContext, useState } from 'react';

const DemoContext = createContext(null);

export function DemoProvider({ children }) {
  const [demo, setDemo] = useState({
    active: false,
    simulateRainMm: null,
    asOf: null,
  });

  const activate = () => setDemo(d => ({ ...d, active: true }));
  const deactivate = () => setDemo({ active: false, simulateRainMm: null, asOf: null });
  const setStorm = (mm) => setDemo(d => ({ ...d, active: true, simulateRainMm: mm, asOf: null }));
  const setTimeMachine = (date) => setDemo(d => ({ ...d, active: true, asOf: date, simulateRainMm: null }));

  return (
    <DemoContext.Provider value={{ demo, activate, deactivate, setStorm, setTimeMachine }}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  return useContext(DemoContext);
}
