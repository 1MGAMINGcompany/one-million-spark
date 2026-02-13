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

const walletFAQs: Record<string, FAQItem[]> = {
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
};

interface Props {
  slug: string;
}

const FAQSection = ({ slug }: Props) => {
  const faqs = walletFAQs[slug];
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
