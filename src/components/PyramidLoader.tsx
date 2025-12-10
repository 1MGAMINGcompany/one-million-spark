import { useGlobalLoading } from "@/contexts/LoadingContext";

const PyramidLoader = () => {
  const { isLoading, message } = useGlobalLoading();

  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-6">
        {/* Pyramid container with animations */}
        <div className="relative w-32 h-32 flex items-center justify-center animate-pulse">
          {/* Outer glow pulse */}
          <div 
            className="absolute inset-0 rounded-full opacity-40 blur-xl animate-[pulse_2s_ease-in-out_infinite]"
            style={{
              background: "radial-gradient(circle, hsl(45 93% 54% / 0.6) 0%, transparent 70%)"
            }}
          />
          
          {/* Large background pyramid */}
          <div 
            className="absolute w-[90%] h-[80%] opacity-20"
            style={{
              background: "linear-gradient(to top, hsl(45 93% 54% / 0.4) 0%, transparent 60%)",
              clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)"
            }}
          />
          
          {/* Main pyramid with glow */}
          <div 
            className="absolute w-[70%] h-[62%]"
            style={{
              background: "linear-gradient(to top, hsl(45 93% 54%) 0%, hsl(45 90% 65%) 40%, hsl(35 80% 50%) 100%)",
              clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
              filter: "drop-shadow(0 0 20px hsl(45 93% 54% / 0.6))",
              animation: "pyramidGlow 2s ease-in-out infinite"
            }}
          />

          {/* Eye element with pulsing glow */}
          <div 
            className="absolute flex items-center justify-center rounded-full border-2 border-primary/80"
            style={{
              width: 24,
              height: 24,
              top: "18%",
              background: "hsl(var(--background))",
              boxShadow: "0 0 15px hsl(45 93% 54% / 0.8), 0 0 30px hsl(45 93% 54% / 0.4)",
              animation: "eyePulse 1.5s ease-in-out infinite"
            }}
          >
            <div 
              className="rounded-full bg-primary"
              style={{
                width: 8,
                height: 8,
              }}
            />
          </div>
        </div>

        {/* Loading text */}
        <p 
          className="text-sm font-medium tracking-wide text-center"
          style={{
            background: "linear-gradient(135deg, #FCE68A 0%, #FACC15 50%, #AB8215 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {message}
        </p>

        {/* Animated dots */}
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-primary"
              style={{
                animation: `dotPulse 1.2s ease-in-out infinite`,
                animationDelay: `${i * 0.2}s`
              }}
            />
          ))}
        </div>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes pyramidGlow {
          0%, 100% {
            filter: drop-shadow(0 0 15px hsl(45 93% 54% / 0.5));
          }
          50% {
            filter: drop-shadow(0 0 25px hsl(45 93% 54% / 0.8));
          }
        }
        @keyframes eyePulse {
          0%, 100% {
            box-shadow: 0 0 10px hsl(45 93% 54% / 0.6), 0 0 20px hsl(45 93% 54% / 0.3);
          }
          50% {
            box-shadow: 0 0 20px hsl(45 93% 54% / 0.9), 0 0 40px hsl(45 93% 54% / 0.5);
          }
        }
        @keyframes dotPulse {
          0%, 100% {
            opacity: 0.3;
            transform: scale(0.8);
          }
          50% {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
};

export default PyramidLoader;
