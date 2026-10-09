import { useEffect, useState } from "react";
import { provider, useCounter } from "./counter";

export default function App() {
  const count = useCounter((state) => state.count);
  const increment = useCounter((state) => state.increment);
  const [synced, setSynced] = useState(provider.synced);

  useEffect(() => {
    provider.on("sync", setSynced);
    setSynced(provider.synced);
    return () => provider.off("sync", setSynced);
  }, []);

  return (
    <main>
      <h1>Shared counter</h1>
      <p role="status">
        {synced ? "Connected" : "Connecting to the sync server…"}
      </p>
      <p>Count: {count}</p>
      <button disabled={!synced} onClick={increment}>
        Increment
      </button>
    </main>
  );
}
