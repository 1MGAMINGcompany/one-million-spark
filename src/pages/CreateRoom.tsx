const CreateRoom = () => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-md p-6">
        <h1 className="text-3xl font-bold text-foreground mb-6 text-center">Create Game Room</h1>
        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Room Name</label>
            <input 
              type="text" 
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
              placeholder="Enter room name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Stake Amount (USDT)</label>
            <input 
              type="number" 
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
              placeholder="0.00"
            />
          </div>
          <button 
            type="button"
            className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md font-medium"
          >
            Create Room
          </button>
        </form>
      </div>
    </div>
  );
};

export default CreateRoom;
