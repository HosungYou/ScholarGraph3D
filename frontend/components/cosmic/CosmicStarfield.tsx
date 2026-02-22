'use client';

interface CosmicStarfieldProps {
  density?: 'normal' | 'dense';
}

export default function CosmicStarfield({ density = 'normal' }: CosmicStarfieldProps) {
  const opacity1 = density === 'dense' ? 0.8 : 0.5;
  const opacity2 = density === 'dense' ? 0.6 : 0.35;
  const opacity3 = density === 'dense' ? 0.4 : 0.25;

  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
      {/* Star layer 1 - small, many */}
      <div
        className="absolute inset-0 animate-drift-slow"
        style={{
          opacity: opacity1,
          background: `radial-gradient(1px 1px at 20px 30px, #E8EAF6, transparent),
            radial-gradient(1px 1px at 40px 70px, #7B8CDE, transparent),
            radial-gradient(1px 1px at 90px 40px, #00E5FF, transparent),
            radial-gradient(1px 1px at 130px 80px, #E8EAF6, transparent),
            radial-gradient(1px 1px at 160px 30px, #a29bfe, transparent),
            radial-gradient(1px 1px at 200px 60px, #E8EAF6, transparent),
            radial-gradient(1px 1px at 240px 90px, #7B8CDE, transparent),
            radial-gradient(1px 1px at 280px 20px, #00E5FF, transparent),
            radial-gradient(1px 1px at 320px 70px, #E8EAF6, transparent),
            radial-gradient(1px 1px at 360px 50px, #a29bfe, transparent)`,
          backgroundSize: '400px 100px',
        }}
      />
      {/* Star layer 2 - medium */}
      <div
        className="absolute inset-0 animate-drift"
        style={{
          opacity: opacity2,
          background: `radial-gradient(1.5px 1.5px at 50px 50px, #00E5FF, transparent),
            radial-gradient(1.5px 1.5px at 150px 120px, #6c5ce7, transparent),
            radial-gradient(1.5px 1.5px at 250px 40px, #E8EAF6, transparent),
            radial-gradient(1.5px 1.5px at 350px 100px, #a29bfe, transparent),
            radial-gradient(1.5px 1.5px at 450px 80px, #00E5FF, transparent)`,
          backgroundSize: '500px 150px',
        }}
      />
      {/* Star layer 3 - large, few, twinkling */}
      <div
        className="absolute inset-0 animate-drift-fast"
        style={{
          opacity: opacity3,
          background: `radial-gradient(2px 2px at 100px 80px, #00E5FF, transparent),
            radial-gradient(2px 2px at 300px 150px, #6c5ce7, transparent),
            radial-gradient(2px 2px at 500px 50px, #a29bfe, transparent)`,
          backgroundSize: '600px 200px',
        }}
      />
      {/* Nebula glow */}
      <div className="absolute top-1/4 left-1/3 w-[600px] h-[600px] rounded-full bg-cosmic-nebula/3 blur-[150px]" />
      <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] rounded-full bg-cosmic-glow/2 blur-[120px]" />
    </div>
  );
}
