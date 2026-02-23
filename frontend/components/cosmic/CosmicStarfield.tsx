'use client';

/**
 * CSS-only starfield — lightweight fallback for pages that don't need
 * Three.js or Canvas rendering. Uses layered radial gradients.
 * Pure black (#000) background with circular star points.
 */

interface CosmicStarfieldProps {
  density?: 'normal' | 'dense';
}

export default function CosmicStarfield({ density = 'normal' }: CosmicStarfieldProps) {
  const baseOpacity = density === 'dense' ? 1 : 0.7;

  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none bg-black">
      {/* Layer 1 — faint field stars */}
      <div
        className="absolute inset-0"
        style={{
          opacity: baseOpacity * 0.4,
          background: `
            radial-gradient(circle 0.5px at 15px 25px, #C5CAE9, transparent),
            radial-gradient(circle 0.5px at 45px 65px, #90CAF9, transparent),
            radial-gradient(circle 0.5px at 85px 35px, #E8EAF6, transparent),
            radial-gradient(circle 0.5px at 125px 75px, #CFD8DC, transparent),
            radial-gradient(circle 0.5px at 165px 20px, #BBDEFB, transparent),
            radial-gradient(circle 0.5px at 205px 55px, #C5CAE9, transparent),
            radial-gradient(circle 0.5px at 245px 85px, #90CAF9, transparent),
            radial-gradient(circle 0.5px at 285px 15px, #E8EAF6, transparent),
            radial-gradient(circle 0.5px at 325px 60px, #CFD8DC, transparent),
            radial-gradient(circle 0.5px at 365px 45px, #BBDEFB, transparent)
          `,
          backgroundSize: '400px 100px',
        }}
      />
      {/* Layer 2 — medium stars */}
      <div
        className="absolute inset-0"
        style={{
          opacity: baseOpacity * 0.25,
          background: `
            radial-gradient(circle 0.8px at 60px 45px, #E8EAF6, transparent),
            radial-gradient(circle 0.8px at 180px 110px, #B39DDB, transparent),
            radial-gradient(circle 0.8px at 300px 30px, #90CAF9, transparent),
            radial-gradient(circle 0.8px at 420px 90px, #CFD8DC, transparent)
          `,
          backgroundSize: '500px 140px',
        }}
      />
      {/* Layer 3 — bright stars */}
      <div
        className="absolute inset-0 animate-twinkle-slow"
        style={{
          opacity: baseOpacity * 0.15,
          background: `
            radial-gradient(circle 1.2px at 120px 70px, #FFF9C4, transparent),
            radial-gradient(circle 1px at 350px 130px, #E8EAF6, transparent),
            radial-gradient(circle 1.2px at 550px 40px, #FFE0B2, transparent)
          `,
          backgroundSize: '650px 180px',
        }}
      />
    </div>
  );
}
