<!-- Original four yesid.dev construction artworks (4ac6a931), plus the bilingual stop sign. -->
<script lang="ts" module>
 export interface ConstructionPropsProps {
  /** Original warm spotlight treatment; plain artwork by default. */
  lighting?: boolean;
  /** Actual document/footer-bottom sentinel. Omit for a plain static floor. */
  revealAt?: Element;
 }
</script>
<script lang="ts">
 let { lighting = false, revealAt }: ConstructionPropsProps = $props();
 const uid = $props.id();
 let enhanced = $state(false);
 let shown = $state(false);
 $effect(() => {
  if (!revealAt) { enhanced = false; return; }
  enhanced = true;
  const observer = new IntersectionObserver(entries => {
   shown = entries.some(entry => entry.isIntersecting);
  });
  observer.observe(revealAt);
  return () => observer.disconnect();
 });
</script>

{#snippet light(name: string, width: number, height: number)}
 {#if lighting}
  <defs>
   <filter id={uid + '-' + name + '-light'} x="-50%" y="-50%" width="200%" height="200%">
    <feDiffuseLighting in="SourceGraphic" result="light" surfaceScale="4" diffuseConstant="1.3" lighting-color="var(--accent)">
     <feSpotLight x={width / 2} y={height + 100} z="50" pointsAtX={width / 2} pointsAtY="0" pointsAtZ="0" specularExponent="8" limitingConeAngle="45" />
    </feDiffuseLighting>
    <feComposite in="SourceGraphic" in2="light" operator="arithmetic" k1="1.3" k2="0.2" k3="0" k4="0" />
   </filter>
  </defs>
 {/if}
{/snippet}

<div class="construction-props" data-state={enhanced ? (shown ? 'visible' : 'hidden') : 'static'} data-slot="construction-props" aria-hidden="true">
 <div class="floor">
  <div class="prop sign" data-construction-prop="sign">
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 70" fill="none" focusable="false">
    {@render light('sign', 50, 70)}
    <g filter={lighting ? 'url(#' + uid + '-sign-light)' : undefined}>
  <!-- Railroad Crossing Warning Sign -->
  <!-- Sign head -->
  <svg x="1" y="0" width="48" height="48" viewBox="0 0 631 640">
    <rect x="38" y="320.893" width="393" height="393" rx="10" transform="rotate(-45 38 320.893)" fill="#FFE01B"/>
    <rect x="54.0711" y="320.701" width="370" height="370" rx="5" transform="rotate(-45 54.0711 320.701)" stroke="black" stroke-width="10"/>
    <rect x="297" y="160" width="38" height="322" fill="black"/>
    <rect x="152" y="283" width="328" height="26" fill="black"/>
    <rect x="152" y="333" width="328" height="26" fill="black"/>
    <rect x="401" y="264" width="33" height="19" fill="black"/>
    <rect x="401" y="359" width="33" height="19" fill="black"/>
    <rect x="352" y="264" width="33" height="19" fill="black"/>
    <rect x="352" y="359" width="33" height="19" fill="black"/>
    <rect x="248" y="264" width="33" height="19" fill="black"/>
    <rect x="248" y="359" width="33" height="19" fill="black"/>
    <rect x="199" y="359" width="33" height="19" fill="black"/>
    <rect x="199" y="264" width="33" height="19" fill="black"/>
    <rect x="409" y="309" width="17" height="24" fill="black"/>
    <rect x="360" y="309" width="17" height="24" fill="black"/>
    <rect x="255" y="309" width="17" height="24" fill="black"/>
    <rect x="207" y="309" width="17" height="24" fill="black"/>
  </svg>
  <!-- Post -->
  <line x1="25" y1="46" x2="25" y2="68" stroke="#555" stroke-width="3.5" stroke-linecap="round"/>
  <!-- Base plate -->
  <rect x="17" y="66" width="16" height="4" rx="1" fill="#444"/>
</g>
   </svg>
  </div>
  <div class="prop helmet" data-construction-prop="helmet">
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 65 44" fill="none" focusable="false">
    {@render light('helmet', 65, 44)}
    <g filter={lighting ? 'url(#' + uid + '-helmet-light)' : undefined}>
  <!-- Construction Helmet -->
  <path d="M5,42 Q5,10 32,6 Q60,10 60,42 Z" fill="#FFB627"/>
  <path d="M15,38 Q15,18 32,14 Q42,16 45,30" fill="none" stroke="#FFD060" stroke-width="1.5" opacity="0.5"/>
  <path d="M0,40 Q0,42 3,44 L62,44 Q65,42 65,40 L60,38 L5,38 Z" fill="#E6A020"/>
  <path d="M8,42 L57,42 L55,44 L10,44 Z" fill="#CC8800" opacity="0.4"/>
  <path d="M32,6 L32,38" stroke="#E6A020" stroke-width="2" opacity="0.6"/>
</g>
   </svg>
  </div>
  <div class="prop barricade" data-construction-prop="barricade">
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 75" fill="none" focusable="false">
    {@render light('barricade', 130, 75)}
    <g filter={lighting ? 'url(#' + uid + '-barricade-light)' : undefined}>
  <!-- Warning Barricade — yellow & black diagonal stripes -->
  <rect x="0" y="18" width="130" height="14" rx="2" fill="#FFB627"/>
  <defs>
    <clipPath id={uid + '-barricade-clip'}>
      <rect x="0" y="18" width="130" height="14" rx="2"/>
    </clipPath>
  </defs>
  <g clip-path={'url(#' + uid + '-barricade-clip)'}>
    <line x1="-2" y1="32" x2="12" y2="18" stroke="#111" stroke-width="6"/>
    <line x1="12" y1="32" x2="26" y2="18" stroke="#111" stroke-width="6"/>
    <line x1="26" y1="32" x2="40" y2="18" stroke="#111" stroke-width="6"/>
    <line x1="40" y1="32" x2="54" y2="18" stroke="#111" stroke-width="6"/>
    <line x1="54" y1="32" x2="68" y2="18" stroke="#111" stroke-width="6"/>
    <line x1="68" y1="32" x2="82" y2="18" stroke="#111" stroke-width="6"/>
    <line x1="82" y1="32" x2="96" y2="18" stroke="#111" stroke-width="6"/>
    <line x1="96" y1="32" x2="110" y2="18" stroke="#111" stroke-width="6"/>
    <line x1="110" y1="32" x2="124" y2="18" stroke="#111" stroke-width="6"/>
    <line x1="124" y1="32" x2="138" y2="18" stroke="#111" stroke-width="6"/>
  </g>
  <rect x="0" y="16" width="130" height="3" rx="1" fill="#E6A020"/>
  <line x1="18" y1="32" x2="8" y2="73" stroke="#555" stroke-width="4" stroke-linecap="round"/>
  <line x1="18" y1="32" x2="28" y2="73" stroke="#555" stroke-width="4" stroke-linecap="round"/>
  <line x1="112" y1="32" x2="102" y2="73" stroke="#555" stroke-width="4" stroke-linecap="round"/>
  <line x1="112" y1="32" x2="122" y2="73" stroke="#555" stroke-width="4" stroke-linecap="round"/>
  <line x1="12" y1="54" x2="24" y2="54" stroke="#444" stroke-width="2"/>
  <line x1="106" y1="54" x2="118" y2="54" stroke="#444" stroke-width="2"/>
  <rect x="5" y="71" width="8" height="4" rx="1" fill="#444"/>
  <rect x="25" y="71" width="8" height="4" rx="1" fill="#444"/>
  <rect x="99" y="71" width="8" height="4" rx="1" fill="#444"/>
  <rect x="119" y="71" width="8" height="4" rx="1" fill="#444"/>
</g>
   </svg>
  </div>
  <div class="prop balise" data-construction-prop="balise">
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 96" fill="none" focusable="false">
    {@render light('balise', 64, 96)}
    <g filter={lighting ? 'url(#' + uid + '-balise-light)' : undefined}>
  <!-- Montreal TRV-7 balise conique — 5 stacked cylinders, each only slightly
       narrower than the one below (near-columnar, subtle step), a white reflective
       stripe at the top of each, on a black weighted rubber foot. -->
  <!-- Flat cap -->
  <path d="M19 11 Q19 8.5 21.5 8.5 L42.5 8.5 Q45 8.5 45 11 Z" fill="#E07800"/>
  <!-- Stacked cylinder segments (bottom widest, ~0.5u narrower each step up) -->
  <rect x="19" y="11" width="26" height="14" fill="#E07800"/>
  <rect x="18.5" y="25" width="27" height="14" fill="#E07800"/>
  <rect x="18" y="39" width="28" height="14" fill="#E07800"/>
  <rect x="17.5" y="53" width="29" height="14" fill="#E07800"/>
  <rect x="17" y="67" width="30" height="14" fill="#E07800"/>
  <!-- Straight base skirt -->
  <rect x="17" y="81" width="30" height="8" fill="#E07800"/>
  <!-- White reflective stripe at the top of each segment -->
  <rect x="19" y="11" width="26" height="5" fill="#f4f4f4"/>
  <rect x="19" y="15" width="26" height="1" fill="#cfcfcf"/>
  <rect x="18.5" y="25" width="27" height="5" fill="#f4f4f4"/>
  <rect x="18.5" y="29" width="27" height="1" fill="#cfcfcf"/>
  <rect x="18" y="39" width="28" height="5" fill="#f4f4f4"/>
  <rect x="18" y="43" width="28" height="1" fill="#cfcfcf"/>
  <rect x="17.5" y="53" width="29" height="5" fill="#f4f4f4"/>
  <rect x="17.5" y="57" width="29" height="1" fill="#cfcfcf"/>
  <rect x="17" y="67" width="30" height="5" fill="#f4f4f4"/>
  <rect x="17" y="71" width="30" height="1" fill="#cfcfcf"/>
  <!-- Right-side shading for cylinder roundness -->
  <path d="M32 11 L45 11 L45 25 L45.5 25 L45.5 39 L46 39 L46 53 L46.5 53 L46.5 67 L47 67 L47 89 L32 89 Z" fill="#000000" opacity="0.09"/>
  <!-- Black weighted rubber foot — flat, wide pad -->
  <rect x="9" y="89" width="46" height="7" rx="1.5" fill="#222222"/>
  <rect x="10" y="89.5" width="44" height="2" rx="1" fill="#333333"/>
</g>
   </svg>
  </div>
  <div class="prop stop" data-construction-prop="stop">
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 68 112" fill="none" focusable="false">
    {@render light('stop', 68, 112)}
    <g filter={lighting ? 'url(#' + uid + '-stop-light)' : undefined}>
     <path d="M34 61 V108" stroke="#555" stroke-width="4" stroke-linecap="round" />
     <rect x="24" y="107" width="20" height="5" rx="1" fill="#444" />
     <path d="M18 1 H50 L66 17 V49 L50 65 H18 L2 49 V17 Z" fill="#C62832" stroke="#EEE" stroke-width="2" />
     <path d="M19 4 H49 L63 18 V48 L49 62 H19 L5 48 V18 Z" stroke="#FFF" stroke-width="0.8" />
     <text x="34" y="28" text-anchor="middle" fill="#FFF" font-family="var(--font-heading, sans-serif)" font-size="12" font-weight="800">ARRÊT</text>
     <text x="34" y="46" text-anchor="middle" fill="#FFF" font-family="var(--font-heading, sans-serif)" font-size="12" font-weight="800">STOP</text>
    </g>
   </svg>
  </div>
 </div>
</div>

<style>
 .construction-props { container-type: inline-size; width: 100%; pointer-events: none; }
 .floor { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: clamp(.75rem, 2cqi, 2rem); align-items: end; justify-items: center; }
 .prop { overflow: clip; max-width: 100%; line-height: 0; }
 .prop > svg { display: block; width: 100%; height: auto; transition: transform .45s var(--ease-out, ease-out), opacity .3s ease-out; }
 [data-state='hidden'] .prop > svg { transform: translateY(110%); opacity: 0; }
 .sign { width: clamp(4rem, 10cqi, 8.5rem); }
 .helmet { width: clamp(2.5rem, 5cqi, 4rem); }
 .barricade { width: clamp(6rem, 15cqi, 12.5rem); }
 .balise { width: clamp(3rem, 8cqi, 7rem); grid-row: 2; grid-column: 1; }
 .stop { width: clamp(5rem, 10cqi, 8.5rem); grid-row: 2; grid-column: 3; }
 @container (min-width: 40rem) {
  .floor { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .balise, .stop { grid-row: auto; grid-column: auto; }
 }
 @media (prefers-reduced-motion: reduce) { .prop > svg { transition: none; } }
</style>
