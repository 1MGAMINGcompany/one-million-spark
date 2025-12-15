import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PrivacyPolicy = () => {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Card className="bg-background/80 border-primary/20">
        <CardHeader>
          <CardTitle className="text-3xl font-cinzel text-primary text-center">
            Privacy Policy
          </CardTitle>
        </CardHeader>
        <CardContent className="prose prose-invert max-w-none space-y-6 text-foreground/80">
          <p className="text-sm text-foreground/60">Last updated: December 2024</p>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-2">1. Information We Collect</h2>
            <p>
              1M Gaming is a decentralized application. We do not collect personal information 
              beyond what is publicly available on the blockchain. When you connect your wallet, 
              we only access your public wallet address.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-2">2. How We Use Information</h2>
            <p>
              Your wallet address is used solely to facilitate gameplay, manage game rooms, 
              and process prize distributions through smart contracts on the Polygon network.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-2">3. Data Storage</h2>
            <p>
              Game states and transaction records are stored on the Polygon blockchain and are 
              publicly accessible. We do not maintain private databases of user information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-2">4. Cookies & Local Storage</h2>
            <p>
              We use browser local storage to save your preferences (language, sound settings). 
              No tracking cookies are used.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-2">5. Third-Party Services</h2>
            <p>
              We integrate with wallet providers (MetaMask, WalletConnect) and blockchain 
              infrastructure. These services have their own privacy policies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-2">6. Children's Privacy</h2>
            <p>
              1M Gaming is not intended for users under 18 years of age. We do not knowingly 
              collect information from minors.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary mb-2">7. Contact Us</h2>
            <p>
              For privacy-related questions, contact us at{" "}
              <a href="mailto:1mgaming@proton.me" className="text-primary hover:underline">
                1mgaming@proton.me
              </a>
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
};

export default PrivacyPolicy;
