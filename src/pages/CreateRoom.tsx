import WalletBar from "../components/WalletBar";
import RoomLobby from "../components/RoomLobby";
import Nav from "../components/Nav";

export default function CreateRoom() {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 18, display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Create Room</div>
        <WalletBar />
      </div>

      <Nav />

      <RoomLobby />
    </div>
  );
}
