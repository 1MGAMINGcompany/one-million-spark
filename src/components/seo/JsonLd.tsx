interface JsonLdProps {
  data: Record<string, unknown>;
}

/** Renders a JSON-LD script tag. Safe to render multiple per page. */
const JsonLd = ({ data }: JsonLdProps) => (
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
  />
);

export default JsonLd;
