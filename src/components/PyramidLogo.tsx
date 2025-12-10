interface PyramidLogoProps {
  size?: number;
  className?: string;
}

const PyramidLogo = ({ size = 40, className = "" }: PyramidLogoProps) => {
  return (
    <div 
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Outer glow */}
      <div 
        className="absolute inset-0 rounded-full opacity-60 blur-sm"
        style={{
          background: "radial-gradient(circle, hsl(45 93% 54% / 0.4) 0%, transparent 70%)"
        }}
      />
      
      {/* Pyramid shape */}
      <div 
        className="absolute"
        style={{
          width: size * 0.75,
          height: size * 0.65,
          background: "linear-gradient(to top, hsl(45 93% 54%) 0%, hsl(45 90% 65%) 40%, hsl(35 80% 50%) 100%)",
          clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
          filter: "drop-shadow(0 0 4px hsl(45 93% 54% / 0.5))"
        }}
      />
      
      {/* Eye element */}
      <div 
        className="absolute flex items-center justify-center rounded-full border border-primary/80"
        style={{
          width: size * 0.22,
          height: size * 0.22,
          top: size * 0.18,
          background: "hsl(var(--background))",
          boxShadow: "0 0 6px hsl(45 93% 54% / 0.6)"
        }}
      >
        <div 
          className="rounded-full bg-primary"
          style={{
            width: size * 0.08,
            height: size * 0.08
          }}
        />
      </div>
    </div>
  );
};

export default PyramidLogo;
