import { Link } from "react-router-dom";
import PyramidLogo from "./PyramidLogo";

interface BrandLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const BrandLogo = ({ size = "md", className = "" }: BrandLogoProps) => {
  const sizeConfig = {
    sm: { icon: 28, text: "text-base", gap: "gap-2" },
    md: { icon: 32, text: "text-lg md:text-xl", gap: "gap-2 md:gap-3" },
    lg: { icon: 40, text: "text-xl md:text-2xl", gap: "gap-3" },
  };

  const config = sizeConfig[size];

  return (
    <Link
      to="/"
      className={`flex items-center ${config.gap} hover:opacity-90 transition-opacity ${className}`}
    >
      <PyramidLogo size={config.icon} />
      <span
        className={`${config.text} font-display font-bold tracking-wide`}
        style={{
          background: "linear-gradient(135deg, #FCE68A 0%, #FACC15 50%, #AB8215 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          filter: "drop-shadow(0 0 8px hsl(45 93% 54% / 0.3))",
        }}
      >
        1M GAMING
      </span>
    </Link>
  );
};

export default BrandLogo;
