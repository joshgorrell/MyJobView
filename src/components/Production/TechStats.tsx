import type { FC } from "react";
import TechProductionStats from "./TechProductionStats";

// Keep the existing route contract while presenting one production-focused experience.
export const TechStats: FC<{ onNavigate?: (tab: string) => void }> = () => (
  <TechProductionStats />
);
