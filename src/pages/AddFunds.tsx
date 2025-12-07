import { Wallet, ArrowRightLeft, Send } from "lucide-react";

const AddFunds = () => {
  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
            Add Funds
          </h1>
          <p className="text-muted-foreground">
            How to get USDT on Polygon to start playing
          </p>
        </div>

        <div className="space-y-8">
          {/* Step 1 */}
          <section className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <Wallet className="text-primary" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Step 1 – Get a Crypto Wallet
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Download and set up a crypto wallet like MetaMask or Trust Wallet. 
                  Make sure to securely save your recovery phrase. Once set up, 
                  add the Polygon network to your wallet to receive USDT.
                </p>
              </div>
            </div>
          </section>

          {/* Step 2 */}
          <section className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <ArrowRightLeft className="text-primary" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Step 2 – Buy USDT on an Exchange
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Create an account on a crypto exchange like Coinbase, Binance, or Kraken. 
                  Complete the verification process, then purchase USDT using your 
                  preferred payment method such as bank transfer or card.
                </p>
              </div>
            </div>
          </section>

          {/* Step 3 */}
          <section className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <Send className="text-primary" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Step 3 – Withdraw to Polygon
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Withdraw your USDT from the exchange to your wallet address. 
                  Make sure to select the Polygon network when withdrawing to 
                  minimize fees. The funds should arrive within a few minutes.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AddFunds;
