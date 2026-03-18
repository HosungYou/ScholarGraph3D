import { useCallback, useMemo, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { Paper } from '@/types';
import { createStarNode } from './cosmic/starNodeRenderer';
import { getStarColors, CLUSTER_COLORS } from './cosmic/cosmicConstants';
import type { ForceGraphNode, ForceGraphLink } from './ScholarGraph3D';

// ─── Parameters ─────────────────────────────────────────────────────

interface UseGraphRendererParams {
  fgRef: MutableRefObject<any>;
  selectedPaperIdRef: MutableRefObject<string | null>;
  newNodeIdsRef: MutableRefObject<Set<string>>;
  expandedFromRef: MutableRefObject<Map<string, string>>;
  expandedEdgeIdsRef: MutableRefObject<Set<string>>;
  highlightSet: Set<string>;
  highlightedPaperIds: Set<string>;
  highlightedClusterPair: [number, number] | null;
  selectedPaper: Paper | null;
  showLabels: boolean;
  showBloom: boolean;
  showOARings: boolean;
  showCitationAura: boolean;
  showCosmicTheme: boolean;
  yearRange: { min: number; max: number };
  activePath: string[] | null;
}

// ─── Hook ───────────────────────────────────────────────────────────

export function useGraphRenderer({
  fgRef,
  selectedPaperIdRef,
  newNodeIdsRef,
  expandedFromRef,
  expandedEdgeIdsRef,
  highlightSet,
  highlightedPaperIds,
  highlightedClusterPair,
  selectedPaper,
  showLabels,
  showBloom,
  showOARings,
  showCitationAura,
  showCosmicTheme,
  yearRange,
  activePath,
}: UseGraphRendererParams) {
  // ── Active path edge set for link color ────────────────────────

  const activePathEdgeSet = useMemo(() => {
    if (!activePath || activePath.length < 2) return null;
    const set = new Set<string>();
    for (let i = 0; i < activePath.length - 1; i++) {
      set.add(`${activePath[i]}-${activePath[i + 1]}`);
      set.add(`${activePath[i + 1]}-${activePath[i]}`);
    }
    return set;
  }, [activePath]);

  // ── nodeThreeObject ────────────────────────────────────────────

  const nodeThreeObject = useCallback(
    (nodeData: unknown) => {
      const node = nodeData as ForceGraphNode;

      const isHighlighted = highlightSet.has(node.id);
      const isSelected = selectedPaperIdRef.current === node.id;
      const hasSelection = selectedPaperIdRef.current !== null;
      const isHighlightedByPanel = highlightedPaperIds.has(node.id);

      // === COSMIC THEME: Star nodes ===
      if (showCosmicTheme) {
        const cosmicOpacity = (() => {
          if (highlightedClusterPair) {
            const [cidA, cidB] = highlightedClusterPair;
            if (node.paper.cluster_id === cidA || node.paper.cluster_id === cidB) return 1;
            return 0.05;
          }
          if (isSelected || isHighlightedByPanel || isHighlighted) return 1;
          if (hasSelection) return 0.15;
          return node.opacity;
        })();

        const isSeed = node.paper.direction === 'seed';
        const clusterColor = isSeed
          ? '#D4AF37'
          : node.paper.cluster_id >= 0
            ? CLUSTER_COLORS[node.paper.cluster_id % CLUSTER_COLORS.length]
            : undefined;

        const group = createStarNode({
          field: node.paper.fields?.[0] || 'Other',
          size: node.val,
          opacity: cosmicOpacity,
          year: node.paper.year || yearRange.min,
          yearRange,
          isSelected,
          isHighlighted,
          isHighlightedByPanel,
          hasSelection,
          isBridge: !!node.paper.is_bridge,
          isOpenAccess: !!node.paper.is_open_access,
          isTopCited: node.citationPercentile > 0.9,
          showBloom,
          showOARings,
          showCitationAura,
          direction: node.paper.direction,
          colorOverride: clusterColor,
          isSeed,
        });
        group.userData.nodeId = node.id;

        // Expansion pulse: pulsing ring on parent node that just expanded
        if (newNodeIdsRef.current.size > 0 && expandedFromRef.current.size > 0) {
          const isExpandParent = Array.from(expandedFromRef.current.values()).includes(node.id);
          if (isExpandParent) {
            const pulseRingGeo = new THREE.RingGeometry(node.val * 2.0, node.val * 2.3, 32);
            const pulseRingMat = new THREE.MeshBasicMaterial({
              color: 0xD4AF37,
              transparent: true,
              opacity: 0.6,
              side: THREE.DoubleSide,
              depthWrite: false,
            });
            const pulseRing = new THREE.Mesh(pulseRingGeo, pulseRingMat);
            pulseRing.rotation.x = Math.PI / 2;
            pulseRing.userData.isExpansionPulse = true;
            group.add(pulseRing);
          }
        }

        // New node glow pulse (newly expanded nodes)
        if (newNodeIdsRef.current.has(node.id)) {
          const newGlowGeo = new THREE.SphereGeometry(node.val * 1.5, 8, 8);
          const newGlowMat = new THREE.MeshBasicMaterial({
            color: 0xD4AF37,
            transparent: true,
            opacity: 0.15,
            depthWrite: false,
          });
          const newGlow = new THREE.Mesh(newGlowGeo, newGlowMat);
          newGlow.userData.isNewNodeGlow = true;
          group.add(newGlow);
        }

        // Frontier node indicator (red pulse ring for frontier_score > 0.7)
        if ((node.paper.frontier_score ?? 0) > 0.7) {
          const frontierRingGeo = new THREE.RingGeometry(node.val * 1.6, node.val * 1.9, 32);
          const frontierRingMat = new THREE.MeshBasicMaterial({
            color: 0xFF4444,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          const frontierRing = new THREE.Mesh(frontierRingGeo, frontierRingMat);
          frontierRing.rotation.x = Math.PI / 2;
          frontierRing.userData.isFrontierRing = true;
          group.add(frontierRing);
        }

        // Selection pulsing ring (gold, animated via CosmicAnimationManager)
        if (isSelected) {
          const selRingGeo = new THREE.RingGeometry(node.val * 2.2, node.val * 2.6, 48);
          const selRingMat = new THREE.MeshBasicMaterial({
            color: 0xD4AF37,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          const selRing = new THREE.Mesh(selRingGeo, selRingMat);
          selRing.rotation.x = Math.PI / 2;
          selRing.userData.isSelectionPulse = true;
          group.add(selRing);
        }

        // Centrality-based label: show only top 20% OR highlighted/selected
        const showLabel = showLabels && node.name && (
          isSelected || isHighlighted || node.citationPercentile > 0.8
        );

        if (showLabel) {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const scale = 2;
            canvas.width = 256 * scale;
            canvas.height = 64 * scale;
            ctx.scale(scale, scale);

            const fontSize = isSelected ? 20 : 10 + 18 * node.citationPercentile;
            const labelOpacity = isSelected ? 1.0 :
              isHighlighted ? 0.9 :
              0.3 + 0.7 * node.citationPercentile;

            const text = node.name.length > 18
              ? node.name.substring(0, 16) + '..'
              : node.name;

            ctx.font = `bold ${fontSize}px 'JetBrains Mono', monospace`;

            // Background box for selected node label
            if (isSelected) {
              const metrics = ctx.measureText(text);
              const textWidth = metrics.width;
              const boxPadX = 8;
              const boxPadY = 4;
              const boxX = (canvas.width / scale / 2) - textWidth / 2 - boxPadX;
              const boxY = (canvas.height / scale / 2) - fontSize / 2 - boxPadY;
              const boxW = textWidth + boxPadX * 2;
              const boxH = fontSize + boxPadY * 2;

              const radius = 4;
              ctx.fillStyle = 'rgba(0,0,0,0.65)';
              ctx.beginPath();
              ctx.moveTo(boxX + radius, boxY);
              ctx.lineTo(boxX + boxW - radius, boxY);
              ctx.quadraticCurveTo(boxX + boxW, boxY, boxX + boxW, boxY + radius);
              ctx.lineTo(boxX + boxW, boxY + boxH - radius);
              ctx.quadraticCurveTo(boxX + boxW, boxY + boxH, boxX + boxW - radius, boxY + boxH);
              ctx.lineTo(boxX + radius, boxY + boxH);
              ctx.quadraticCurveTo(boxX, boxY + boxH, boxX, boxY + boxH - radius);
              ctx.lineTo(boxX, boxY + radius);
              ctx.quadraticCurveTo(boxX, boxY, boxX + radius, boxY);
              ctx.closePath();
              ctx.fill();
            }

            ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 2;
            ctx.fillStyle = isSelected
              ? '#D4AF37'
              : isHighlighted
                ? '#FFFFFF'
                : '#FFFFFF';
            ctx.globalAlpha = labelOpacity;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(
              text,
              canvas.width / scale / 2,
              canvas.height / scale / 2
            );

            const texture = new THREE.CanvasTexture(canvas);
            texture.needsUpdate = true;
            const spriteMaterial = new THREE.SpriteMaterial({
              map: texture,
              transparent: true,
              depthTest: false,
            });
            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.scale.set(isSelected ? 50 : 40, isSelected ? 13 : 10, 1);
            sprite.position.set(0, node.val + 5, 0);
            group.add(sprite);
          }
        }

        // Role badge: Review paper (R) or Methodology (M)
        const abstract = (node.paper?.abstract || node.paper?.tldr || '').toLowerCase();
        const isReviewPaper = /systematic review|meta-analysis|scoping review|literature review/.test(abstract);
        const isMethodPaper = /randomized controlled trial|rct\b|survey methodology|mixed method/.test(abstract);

        if ((isReviewPaper || isMethodPaper) && node.val >= 3) {
          const badgeCanvas = document.createElement('canvas');
          const bCtx = badgeCanvas.getContext('2d');
          if (bCtx) {
            badgeCanvas.width = 32;
            badgeCanvas.height = 32;
            bCtx.fillStyle = isReviewPaper ? '#4A90D9' : '#9B59B6';
            bCtx.globalAlpha = 0.85;
            bCtx.beginPath();
            bCtx.arc(16, 16, 14, 0, Math.PI * 2);
            bCtx.fill();
            bCtx.globalAlpha = 1;
            bCtx.fillStyle = '#FFFFFF';
            bCtx.font = 'bold 16px Arial';
            bCtx.textAlign = 'center';
            bCtx.textBaseline = 'middle';
            bCtx.fillText(isReviewPaper ? 'R' : 'M', 16, 16);

            const badgeTexture = new THREE.CanvasTexture(badgeCanvas);
            const badgeSprite = new THREE.Sprite(
              new THREE.SpriteMaterial({ map: badgeTexture, transparent: true, depthTest: false })
            );
            badgeSprite.scale.set(node.val * 1.5, node.val * 1.5, 1);
            badgeSprite.position.set(node.val * 0.8, node.val * 0.8, 0);
            group.add(badgeSprite);
          }
        }

        return group;
      }

      // === FALLBACK: Original renderer (when showCosmicTheme is false) ===
      const group = new THREE.Group();
      group.userData.nodeId = node.id;

      let displayColor = node.color;
      if (isSelected) displayColor = '#D4AF37';
      else if (isHighlightedByPanel) displayColor = '#D4AF37';
      else if (isHighlighted) displayColor = '#FFFFFF';

      let displayOpacity = node.opacity;
      if (isSelected) displayOpacity = 1;
      else if (isHighlightedByPanel) displayOpacity = 1;
      else if (isHighlighted) displayOpacity = 1;
      else if (hasSelection) displayOpacity = 0.15;

      const geometry = new THREE.SphereGeometry(node.val, 16, 16);
      const material = new THREE.MeshPhongMaterial({
        color: displayColor,
        emissive: displayColor,
        emissiveIntensity: isSelected ? 0.6 : isHighlighted ? 0.4 : 0.15,
        transparent: true,
        opacity: displayOpacity,
        shininess: 30,
      });
      const mesh = new THREE.Mesh(geometry, material);
      group.add(mesh);

      // Highlight ring for selected
      if (isSelected) {
        const ringGeometry = new THREE.RingGeometry(
          node.val * 1.3,
          node.val * 1.5,
          32
        );
        const ringMaterial = new THREE.MeshBasicMaterial({
          color: '#D4AF37',
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
      }

      // Seed paper: gold glow ring
      if (node.paper?.direction === 'seed' && !isSelected) {
        const seedRingGeo = new THREE.RingGeometry(node.val * 1.4, node.val * 1.7, 32);
        const seedRingMat = new THREE.MeshBasicMaterial({
          color: '#D4AF37',
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const seedRing = new THREE.Mesh(seedRingGeo, seedRingMat);
        seedRing.rotation.x = Math.PI / 2;
        group.add(seedRing);
      }

      // Bridge node gold glow
      if (node.paper?.is_bridge) {
        const glowGeo = new THREE.SphereGeometry(node.val * 1.5, 8, 8);
        const glowMat = new THREE.MeshBasicMaterial({
          color: 0xD4AF37,
          transparent: true,
          opacity: 0.15,
          depthWrite: false,
        });
        group.add(new THREE.Mesh(glowGeo, glowMat));
      }

      // OA paper green ring (toggle)
      if (showOARings && node.paper?.is_open_access) {
        const ringGeo = new THREE.RingGeometry(node.val * 1.1, node.val * 1.3, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x2ECC71,
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
      }

      // High-citation gold aura (top 10%) - toggle
      if (showCitationAura && node.citationPercentile > 0.9 && !isSelected) {
        const auraGeo = new THREE.SphereGeometry(node.val * 1.5, 8, 8);
        const auraMat = new THREE.MeshBasicMaterial({
          color: 0xD4AF37,
          transparent: true,
          opacity: 0.12,
          depthWrite: false,
        });
        group.add(new THREE.Mesh(auraGeo, auraMat));
      }

      // Bloom effect for selected node
      if (showBloom && isSelected) {
        const bloomGeo = new THREE.SphereGeometry(node.val * 1.3, 8, 8);
        const bloomMat = new THREE.MeshBasicMaterial({
          color: displayColor,
          transparent: true,
          opacity: 0.12,
          depthWrite: false,
        });
        group.add(new THREE.Mesh(bloomGeo, bloomMat));
        // Strengthen emissive
        material.emissiveIntensity = 0.8;
      }

      // Centrality-based label: show only top 20% OR highlighted/selected
      const showLabel = showLabels && node.name && (
        isSelected || isHighlighted || node.citationPercentile > 0.8
      );

      if (showLabel) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const scale = 2;
          canvas.width = 256 * scale;
          canvas.height = 64 * scale;
          ctx.scale(scale, scale);

          const fontSize = isSelected ? 16 : 10 + 18 * node.citationPercentile;
          const labelOpacity = isSelected ? 1.0 :
            isHighlighted ? 0.9 :
            0.3 + 0.7 * node.citationPercentile;

          ctx.font = `bold ${fontSize}px 'JetBrains Mono', monospace`;
          ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 2;
          ctx.fillStyle = isSelected
            ? '#D4AF37'
            : isHighlighted
              ? '#FFFFFF'
              : '#FFFFFF';
          ctx.globalAlpha = labelOpacity;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            node.name.length > 18
              ? node.name.substring(0, 16) + '..'
              : node.name,
            canvas.width / scale / 2,
            canvas.height / scale / 2
          );

          const texture = new THREE.CanvasTexture(canvas);
          texture.needsUpdate = true;
          const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
          });
          const sprite = new THREE.Sprite(spriteMaterial);
          sprite.scale.set(40, 10, 1);
          sprite.position.set(0, node.val + 5, 0);
          group.add(sprite);
        }
      }

      // Role badge: Review paper (R) or Methodology (M)
      const abstract = (node.paper?.abstract || node.paper?.tldr || '').toLowerCase();
      const isReviewPaper = /systematic review|meta-analysis|scoping review|literature review/.test(abstract);
      const isMethodPaper = /randomized controlled trial|rct\b|survey methodology|mixed method/.test(abstract);

      if ((isReviewPaper || isMethodPaper) && node.val >= 3) {
        const badgeCanvas = document.createElement('canvas');
        const bCtx = badgeCanvas.getContext('2d');
        if (bCtx) {
          badgeCanvas.width = 32;
          badgeCanvas.height = 32;
          bCtx.fillStyle = isReviewPaper ? '#4A90D9' : '#9B59B6';
          bCtx.globalAlpha = 0.85;
          bCtx.beginPath();
          bCtx.arc(16, 16, 14, 0, Math.PI * 2);
          bCtx.fill();
          bCtx.globalAlpha = 1;
          bCtx.fillStyle = '#FFFFFF';
          bCtx.font = 'bold 16px Arial';
          bCtx.textAlign = 'center';
          bCtx.textBaseline = 'middle';
          bCtx.fillText(isReviewPaper ? 'R' : 'M', 16, 16);

          const badgeTexture = new THREE.CanvasTexture(badgeCanvas);
          const badgeSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({ map: badgeTexture, transparent: true, depthTest: false })
          );
          badgeSprite.scale.set(node.val * 1.5, node.val * 1.5, 1);
          badgeSprite.position.set(node.val * 0.8, node.val * 0.8, 0);
          group.add(badgeSprite);
        }
      }

      return group;
    },
    [highlightSet, showLabels, showBloom, showOARings, showCitationAura, highlightedPaperIds, showCosmicTheme, yearRange, highlightedClusterPair, selectedPaperIdRef, newNodeIdsRef, expandedFromRef]
  );

  // ── linkWidth ──────────────────────────────────────────────────

  const linkWidth = useCallback((linkData: unknown) => {
    const link = linkData as ForceGraphLink;
    if (expandedEdgeIdsRef.current.size > 0) {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as ForceGraphNode).id;
      const targetId = typeof link.target === 'string' ? link.target : (link.target as ForceGraphNode).id;
      if (expandedEdgeIdsRef.current.has(`${sourceId}-${targetId}`) ||
          expandedEdgeIdsRef.current.has(`${targetId}-${sourceId}`)) {
        return 3.0;
      }
    }
    if (link.isInfluential) {
      return (link.width || 0.5) * 1.5;
    }
    return Math.max(0.5, link.width || 0.5);
  }, [expandedEdgeIdsRef]);

  // ── linkColor ──────────────────────────────────────────────────

  const linkColor = useCallback(
    (linkData: unknown) => {
      const link = linkData as ForceGraphLink;

      const sourceId =
        typeof link.source === 'string'
          ? link.source
          : (link.source as ForceGraphNode).id;
      const targetId =
        typeof link.target === 'string'
          ? link.target
          : (link.target as ForceGraphNode).id;

      // Active path highlighting: gold path edges, dim everything else
      if (activePathEdgeSet) {
        if (activePathEdgeSet.has(`${sourceId}-${targetId}`)) {
          return '#D4AF37';
        }
        return '#050510';
      }

      // Highlight recently expanded edges
      if (expandedEdgeIdsRef.current.size > 0) {
        if (expandedEdgeIdsRef.current.has(`${sourceId}-${targetId}`) ||
            expandedEdgeIdsRef.current.has(`${targetId}-${sourceId}`)) {
          return '#D4AF37';
        }
      }

      // Check camera distance for LOD
      const camDist = fgRef.current?.camera()?.position?.length() ?? 0;
      const isFar = camDist > 2000;
      const isVeryFar = camDist > 3000;

      if (isFar && link.edgeType === 'similarity') {
        return '#050510';
      }
      if (isVeryFar && link.width < 1.5) {
        return '#050510';
      }

      // Always-on special edges (rare, high-signal)
      if (link.isBidirectional) return '#FFD700';
      if (link.hasSharedAuthors) return '#2ECC71';

      // Selection-based highlighting + intent colors
      if (!selectedPaper) {
        return link.dashed
          ? '#555555'
          : link.color || '#44444480';
      }
      if (highlightSet.has(sourceId) && highlightSet.has(targetId)) {
        return link.color || '#D4AF37';
      }
      return '#050510';
    },
    [selectedPaper, highlightSet, fgRef, activePathEdgeSet, expandedEdgeIdsRef]
  );

  // ── linkThreeObject (dashed similarity lines) ──────────────────

  const linkThreeObject = useCallback((linkData: unknown) => {
    const link = linkData as ForceGraphLink;
    if (!link.dashed) return null;

    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineDashedMaterial({
      color: 0x555555,
      dashSize: 2,
      gapSize: 1.5,
      opacity: 0.6,
      transparent: true,
    });
    return new THREE.Line(geometry, material);
  }, []);

  // ── linkPositionUpdate ─────────────────────────────────────────

  const linkPositionUpdate = useCallback(
    (
      line: THREE.Object3D,
      coords: {
        start: { x: number; y: number; z: number };
        end: { x: number; y: number; z: number };
      },
      linkData: unknown
    ) => {
      const link = linkData as ForceGraphLink;
      if (!link.dashed || !(line instanceof THREE.Line)) return false;

      const positions = new Float32Array([
        coords.start.x,
        coords.start.y,
        coords.start.z,
        coords.end.x,
        coords.end.y,
        coords.end.z,
      ]);
      line.geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(positions, 3)
      );
      line.computeLineDistances();
      return true;
    },
    []
  );

  return {
    nodeThreeObject,
    linkWidth,
    linkColor,
    linkThreeObject,
    linkPositionUpdate,
  };
}
