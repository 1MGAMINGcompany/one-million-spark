import WalletBar from "./components/WalletBar";
import RoomLobby from "./components/RoomLobby";

export default function App() {
  return (
    <div style={{ padding: 20 }}>
      <WalletBar />
      <hr />
      <RoomLobby />
    </div>
  );
}
