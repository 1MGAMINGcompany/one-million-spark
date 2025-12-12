import { Link, useLocation } from "react-router-dom";

export default function Nav() {
  const { pathname } = useLocation();

  const Item = ({ to, label }: { to: string; label: string }) => (
    <Link
      to={to}
      style={{
        padding: "10px 14px",
        border: "1px solid #333",
        borderRadius: 12,
        textDecoration: "none",
        color: "inherit",
        background: pathname === to ? "#111" : "transparent",
      }}
    >
      {label}
    </Link>
  );

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <Item to="/" label="Lobby" />
      <Item to="/create-room" label="Create Room" />
    </div>
  );
}
