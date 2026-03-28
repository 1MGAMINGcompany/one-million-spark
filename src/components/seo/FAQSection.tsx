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
  "skill-games-not-luck": [
    { question: "Are skill games gambling?", answer: "No. Skill games are determined by player ability and strategy, not luck or chance. Chess tournaments have offered cash prizes for centuries and are recognized as legitimate competitions." },
    { question: "How does 1MGAMING ensure fair play?", answer: "All games use deterministic engines verified server-side. For games with dice (backgammon, ludo), we use provably fair seed mechanisms that both players can verify." },
    { question: "What is the platform fee?", answer: "1MGAMING charges a 5% fee on winnings, not on entry. The fee is disclosed upfront before every match." },
  ],
  "play-real-money-chess": [
    { question: "How do chess payouts work?", answer: "The winner receives the combined pot minus a 5% platform fee. Payouts are instant and automatic." },
    { question: "Can I practice before playing for stakes?", answer: "Yes. 1MGAMING offers free AI training modes with Stockfish-powered opponents at multiple difficulty levels." },
    { question: "What time controls are available?", answer: "You can choose from quick 30-second turns to more generous time limits when creating a room." },
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
    { question: "How does 1MGAMING handle my funds?", answer: "1MGAMING never holds your funds directly. All transactions happen through smart contracts. Your money goes into transparent pools and is paid out automatically when events resolve." },
  ],
  "prediction-markets-growth-2025": [
    { question: "How big are prediction markets in 2025?", answer: "Major platforms processed over $50 billion in 2024. Analysts project prediction markets could exceed $100 billion annual volume by 2026." },
    { question: "Why are prediction markets growing so fast?", answer: "Regulatory clarity, proven accuracy during the 2024 election, and maturing infrastructure are all driving growth." },
    { question: "What makes 1MGAMING different from other prediction platforms?", answer: "Easy access, near-zero fees, automatic settlement, and a clean interface designed for sports and event predictions." },
  ],
  "how-to-place-a-prediction": [
    { question: "How long does it take to place a prediction?", answer: "Under a minute. Sign in, browse events, pick an outcome, enter your amount, and confirm." },
    { question: "How are odds displayed on 1MGAMING?", answer: "Odds are shown as percentages reflecting market probability. For example, 43% means the market believes there's a 43% chance of that outcome." },
    { question: "What happens when an event resolves?", answer: "If you picked the correct outcome, your payout is sent automatically to your account. No claim process or withdrawal needed." },
    { question: "Can I sell my prediction before the event ends?", answer: "Currently, predictions are held until the event resolves. The ability to trade positions before resolution is planned for future updates." },
  ],
  "how-prediction-payouts-work": [
    { question: "How do I get paid when I win a prediction?", answer: "Your payout is sent automatically to your account when the event resolves. No manual claim or withdrawal process is needed." },
    { question: "How fast are prediction payouts?", answer: "Payouts are processed as soon as the event result is confirmed. This typically happens within minutes of the event concluding." },
    { question: "Do I need to pay taxes on prediction market winnings?", answer: "Tax obligations vary by jurisdiction. Consult a tax professional in your country for guidance on reporting trading gains." },
  ],
  "what-is-liquidity-prediction-markets": [
    { question: "What does liquidity mean in prediction markets?", answer: "Liquidity is the ability to buy or sell shares without significantly moving the price. High liquidity means you get the odds you see displayed." },
    { question: "What is slippage?", answer: "Slippage is the difference between the expected price and the actual execution price. High liquidity means low slippage — you get better prices." },
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
