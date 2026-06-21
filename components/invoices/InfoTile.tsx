import type { ReactNode } from "react";

export function InfoTile({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="info-tile">
      <span>{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{children}</strong>
      </div>
    </div>
  );
}
