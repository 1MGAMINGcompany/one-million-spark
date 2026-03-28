import JsonLd from "./JsonLd";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export interface FAQItem {
  question: string;
  answer: string;
}

const articleFAQs: Record<string, FAQItem[]> = {
  "connect-phantom-wallet-1mgaming": [
    { question: "Is Phantom safe to use with 1MGAMING?", answer: "Yes. Phantom is a non-custodial wallet — 1MGAMING never has access to your private keys. Connecting only shares your public wallet address." },
    { question: "Why doesn't my Phantom wallet connect?", answer: "Ensure the Phantom browser extension is installed and enabled. Refresh the page and try again. If using multiple wallet extensions, set Phantom as your default Solana wallet." },
    { question: "Does Phantom work on mobile with 1MGAMING?", answer: "Yes. Use Phantom's built-in browser (tap the globe icon) and navigate to 1mgaming.com. External browsers like Safari or Chrome cannot detect the Phantom mobile wallet." },
    { question: "What Solana network does 1MGAMING use?", answer: "1MGAMING operates on Solana Mainnet. Make sure your Phantom wallet is set to Mainnet, not Devnet or Testnet." },
    { question: "Do I need SOL for transaction fees?", answer: "Yes, but Solana fees are extremely low — typically under $0.01 per transaction. You need enough SOL to cover the game entry fee plus a tiny network fee." },
    { question: "Can I use Phantom with a Ledger hardware wallet?", answer: "Yes. Phantom supports Ledger devices. Connect your Ledger to Phantom first, then connect Phantom to 1MGAMING as normal." },
  ],
  "connect-solflare-wallet-1mgaming": [
    { question: "Is Solflare safe to use with 1MGAMING?", answer: "Yes. Solflare is a non-custodial wallet. Connecting to 1MGAMING only shares your public address — your private keys never leave your device." },
    { question: "Why doesn't my Solflare wallet connect?", answer: "Make sure the Solflare extension is installed and up to date. Restart your browser if needed. If you accidentally rejected the connection, refresh and try again." },
    { question: "Does Solflare work on mobile with 1MGAMING?", answer: "Yes. Use Solflare's built-in browser tab to navigate to 1mgaming.com. Your phone's default browser cannot detect the wallet." },
    { question: "What network do I need for Solflare?", answer: "Set your Solflare wallet to Solana Mainnet. 1MGAMING does not support Devnet or Testnet." },
    { question: "Do I need SOL for fees with Solflare?", answer: "Yes. Solana transaction fees are under $0.01. You need SOL for the game stake plus a negligible network fee." },
    { question: "Can I use my Ledger with Solflare on 1MGAMING?", answer: "Yes. Solflare has the best Ledger integration on Solana. Make sure the Solana app is open on your Ledger and blind signing is enabled." },
  ],
  "connect-backpack-wallet-1mgaming": [
    { question: "Is Backpack safe to use with 1MGAMING?", answer: "Yes. Backpack is non-custodial and built by the Coral team (creators of the Anchor framework). Connecting only shares your public wallet address." },
    { question: "Why doesn't my Backpack wallet connect?", answer: "If you have multiple wallet extensions installed, they may conflict. Try disabling other wallet extensions temporarily and refresh the page." },
    { question: "Does Backpack work on mobile?", answer: "Yes. Backpack has iOS and Android apps with built-in browsers. Navigate to 1mgaming.com within the Backpack app to connect." },
    { question: "What network does Backpack need to be on?", answer: "Solana Mainnet. 1MGAMING only operates on mainnet for real SOL games." },
    { question: "Do I need SOL to play on 1MGAMING?", answer: "Yes. You need SOL for the game entry fee and a small network fee (under $0.01). You can buy SOL directly in Backpack or transfer from an exchange." },
  ],
  "what-are-prediction-markets": [
    { question: "What is a prediction market?", answer: "A prediction market is an exchange where you buy and sell shares in the outcomes of real-world events. Prices reflect the crowd's estimate of each outcome's probability." },
    { question: "How are prediction markets different from betting?", answer: "Prediction markets are driven by information and analysis, not luck. Participants trade based on research, and the aggregate price becomes a powerful forecasting tool." },
    { question: "What does a 43% price mean?", answer: "It means the market believes there's roughly a 43% chance that outcome will happen. If you buy at 43% and the outcome occurs, you receive 100% — a profit of 57%." },
    { question: "Are prediction markets accurate?", answer: "Yes. Academic research shows prediction markets consistently outperform polls, expert panels, and statistical models at forecasting events." },
    { question: "Can I use prediction markets for sports?", answer: "Absolutely. Sports prediction markets are the fastest-growing category. On 1MGAMING, you can predict outcomes for soccer, boxing, MMA, and more." },
  ],
  "are-prediction-markets-legal": [
    { question: "Are prediction markets legal in the United States?", answer: "Yes, prediction markets are increasingly accepted in the U.S. The CFTC regulates event contracts, and the 2024 Kalshi ruling opened the door for broader political and sports prediction markets." },
    { question: "Is 1MGAMING a gambling platform?", answer: "No. Prediction markets are information aggregation tools, not games of chance. Outcomes are determined by real-world events, and participants use research and analysis to make decisions." },
    { question: "Do I need to do KYC to use 1MGAMING predictions?", answer: "No. 1MGAMING is a non-custodial, crypto-native platform. You connect your wallet and trade — no identity verification required." },
    { question: "Are crypto prediction markets regulated?", answer: "Crypto-based prediction markets operate on decentralized blockchains. While regulatory frameworks are evolving, they are accessible globally and increasingly recognized as legitimate financial instruments." },
    { question: "How does 1MGAMING handle my funds?", answer: "1MGAMING never holds your funds. All transactions happen through on-chain smart contracts. Your money goes into transparent pools and is paid out automatically when events resolve." },
  ],
  "prediction-markets-growth-2025": [
    { question: "How big are prediction markets in 2025?", answer: "Polymarket alone processed over $50 billion in 2024. Analysts project on-chain prediction markets could exceed $100 billion annual volume by 2026." },
    { question: "Why are prediction markets growing so fast?", answer: "Regulatory clarity (Kalshi ruling), proven accuracy (2024 election), and maturing crypto infrastructure (stablecoins, low-fee chains like Solana) are all driving growth." },
    { question: "Is 1MGAMING a Polymarket alternative?", answer: "1MGAMING aggregates Polymarket's liquidity and presents it in a simpler interface. You get the same deep markets with an easier user experience." },
    { question: "What makes 1MGAMING different from other prediction platforms?", answer: "Crypto-native, no KYC, near-zero fees on Solana, automatic settlement, and a clean interface designed for sports and event predictions." },
  ],
  "how-to-place-a-prediction": [
    { question: "How long does it take to place a prediction?", answer: "Under a minute. Connect your wallet, browse events, pick an outcome, enter your amount, and confirm the transaction." },
    { question: "What wallets can I use for predictions?", answer: "1MGAMING supports Phantom, Solflare, and Backpack wallets — all non-custodial Solana wallets." },
    { question: "How are odds displayed on 1MGAMING?", answer: "Odds are shown as percentages reflecting market probability. For example, 43% means the market believes there's a 43% chance of that outcome." },
    { question: "What happens when an event resolves?", answer: "If you picked the correct outcome, your payout is sent automatically to your wallet. No claim process or withdrawal needed." },
    { question: "Can I sell my prediction before the event ends?", answer: "Currently, predictions are held until the event resolves. The ability to trade positions before resolution is planned for future updates." },
  ],
  "how-prediction-payouts-work-crypto": [
    { question: "How do I get paid when I win a prediction?", answer: "Your payout is sent automatically to your connected wallet when the event resolves. No manual claim or withdrawal process is needed." },
    { question: "What are gas fees on Solana?", answer: "Solana transaction fees are typically under $0.01 — far cheaper than Ethereum ($5-$50). Nearly all of your payout goes directly to you." },
    { question: "How do I convert crypto winnings to cash?", answer: "Send your SOL or USDC to a centralized exchange like Coinbase or Binance, sell for your local currency, and withdraw to your bank account." },
    { question: "How fast are prediction payouts?", answer: "Payouts are processed on-chain as soon as the event result is confirmed. This typically happens within minutes of the event concluding." },
    { question: "Do I need to pay taxes on prediction market winnings?", answer: "Tax obligations vary by jurisdiction. Consult a tax professional in your country for guidance on reporting crypto trading gains." },
  ],
  "what-is-liquidity-prediction-markets": [
    { question: "What does liquidity mean in prediction markets?", answer: "Liquidity is the ability to buy or sell shares without significantly moving the price. High liquidity means you get the odds you see displayed." },
    { question: "What is slippage?", answer: "Slippage is the difference between the expected price and the actual execution price. High liquidity means low slippage — you get better prices." },
    { question: "Why does 1MGAMING use Polymarket's liquidity?", answer: "Polymarket has the deepest liquidity in prediction markets, with billions in volume. By sourcing from Polymarket, 1MGAMING ensures accurate pricing and competitive execution." },
    { question: "What is an order book vs. an AMM?", answer: "An order book matches buyers and sellers directly (like a stock exchange). An AMM uses algorithms to provide constant pricing. Polymarket uses order books for tighter spreads." },
    { question: "Does higher volume mean better odds?", answer: "Yes. Markets with more trading volume have more participants, which drives prices closer to true probabilities and reduces slippage." },
  ],
};

interface Props {
  slug: string;
}

const FAQSection = ({ slug }: Props) => {
  const faqs = articleFAQs[slug];
  if (!faqs) return null;

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  return (
    <div className="mt-12">
      <JsonLd data={faqJsonLd} />
      <h2 className="text-2xl font-semibold text-primary/90 mb-4">
        Frequently Asked Questions
      </h2>
      <Accordion type="single" collapsible className="w-full">
        {faqs.map((faq, i) => (
          <AccordionItem key={i} value={`faq-${i}`}>
            <AccordionTrigger className="text-left text-foreground/80 hover:no-underline">
              {faq.question}
            </AccordionTrigger>
            <AccordionContent className="text-foreground/60">
              {faq.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};

export default FAQSection;
