// Physical materials: detector response, preservation behaviour, appearance.
export interface Material {
  id: string; name: string; density: number; // g/cm3
  metal: boolean; ferrous: boolean; conductivity: number; // 0..1 detector response
  decay: number;       // corrosion rate: fraction of mass-equivalent lost per century in neutral soil
  acid: number; moist: number; salt: number; oxy: number; // sensitivities (0..2) to acid soil, moisture, salinity, aeration
  organic: boolean; hex: string; patina: string; spot: number; // spot price/g (0 for worthless)
  hard: number;        // mohs-ish for damage by digging; fragility
  fragile: boolean;
}
const M = (id: string, name: string, density: number, o: Partial<Material>): Material => ({
  id, name, density, metal: false, ferrous: false, conductivity: 0, decay: 0.01, acid: 0.3, moist: 0.3, salt: 0.2, oxy: 0.3, organic: false, hex: '#888', patina: '', spot: 0, hard: 5, fragile: false, ...o,
});
export const MATERIALS: Material[] = [
  M('gold', 'gold', 19.3, { metal: true, conductivity: 0.92, decay: 0.0005, hex: '#d9a916', patina: 'none', spot: 62, hard: 2.5 }),
  M('silver', 'silver', 10.5, { metal: true, conductivity: 1.0, decay: 0.05, salt: 1.6, acid: 0.4, hex: '#c3c5c8', patina: 'black tarnish and horn silver crust', spot: 0.85, hard: 2.7 }),
  M('copper', 'copper', 8.9, { metal: true, conductivity: 0.86, decay: 0.12, acid: 1.2, moist: 1.0, salt: 0.8, hex: '#b3633a', patina: 'green verdigris', spot: 0.0095, hard: 3 }),
  M('bronze', 'bronze', 8.8, { metal: true, conductivity: 0.8, decay: 0.09, acid: 1.0, moist: 0.9, salt: 0.8, hex: '#a0693a', patina: 'green-brown patina', spot: 0.008, hard: 3.5 }),
  M('brass', 'brass', 8.5, { metal: true, conductivity: 0.76, decay: 0.07, acid: 0.9, moist: 0.8, salt: 0.7, hex: '#b8962e', patina: 'dull olive-green patina', spot: 0.007, hard: 3.5 }),
  M('cupronickel', 'copper-nickel', 8.9, { metal: true, conductivity: 0.6, decay: 0.03, acid: 0.5, moist: 0.4, salt: 0.5, hex: '#b9bbb8', patina: 'dull grey', spot: 0.012, hard: 3.5 }),
  M('nickel', 'nickel', 8.9, { metal: true, conductivity: 0.5, decay: 0.02, acid: 0.4, moist: 0.4, hex: '#b4b7b5', patina: 'dull grey', spot: 0.018, hard: 4 }),
  M('zinc', 'zinc', 7.1, { metal: true, conductivity: 0.55, decay: 0.3, acid: 1.6, moist: 1.2, salt: 1.0, hex: '#8f9498', patina: 'white zinc crust, often blistered', spot: 0.003, hard: 2.5 }),
  M('iron', 'iron', 7.8, { metal: true, ferrous: true, conductivity: 0.3, decay: 0.55, acid: 1.5, moist: 1.5, salt: 1.2, oxy: 1.2, hex: '#6b3d22', patina: 'thick orange rust and soil concretion', spot: 0.0006, hard: 4 }),
  M('steel', 'steel', 7.85, { metal: true, ferrous: true, conductivity: 0.3, decay: 0.4, acid: 1.4, moist: 1.4, salt: 1.2, oxy: 1.2, hex: '#5b5b5e', patina: 'orange rust', spot: 0.0008, hard: 6 }),
  M('lead', 'lead', 11.3, { metal: true, conductivity: 0.42, decay: 0.03, acid: 0.8, moist: 0.4, hex: '#7c7f84', patina: 'white lead carbonate crust', spot: 0.0022, hard: 1.5 }),
  M('tin', 'tin', 7.3, { metal: true, conductivity: 0.5, decay: 0.08, acid: 0.8, moist: 0.8, hex: '#aeb1b3', patina: 'grey tin pest', spot: 0.03, hard: 1.5 }),
  M('pewter', 'pewter', 8.0, { metal: true, conductivity: 0.46, decay: 0.07, acid: 0.8, moist: 0.8, hex: '#8d9091', patina: 'dull grey crust', spot: 0.012, hard: 1.8 }),
  M('aluminium', 'aluminium', 2.7, { metal: true, conductivity: 0.58, decay: 0.05, acid: 1.0, moist: 0.6, salt: 1.4, hex: '#c8cbcc', patina: 'white oxide pitting', spot: 0.0025, hard: 2.5 }),
  M('silverplate', 'silver plate', 8.6, { metal: true, conductivity: 0.74, decay: 0.08, salt: 1.2, hex: '#bdbdb9', patina: 'worn plate over brass', spot: 0.012, hard: 3 }),
  M('goldfilled', 'gold-filled', 8.8, { metal: true, conductivity: 0.78, decay: 0.03, hex: '#cfae43', patina: 'worn gilding', spot: 0.8, hard: 3 }),
  M('glass', 'glass', 2.5, { decay: 0.0015, hex: '#6fa38b', patina: 'iridescent weathering', fragile: true, hard: 5.5 }),
  M('earthenware', 'earthenware', 2.0, { decay: 0.002, hex: '#b5774b', patina: 'worn glaze', fragile: true, hard: 4 }),
  M('stoneware', 'stoneware', 2.4, { decay: 0.001, hex: '#a89a7a', patina: 'stained glaze', fragile: true, hard: 6 }),
  M('porcelain', 'porcelain', 2.4, { decay: 0.001, hex: '#e8e4da', patina: 'crazed glaze', fragile: true, hard: 7 }),
  M('claypipe', 'white clay', 1.9, { decay: 0.004, hex: '#e6e0cf', patina: 'stained clay', fragile: true, hard: 2 }),
  M('stone', 'stone', 2.6, { decay: 0.0005, hex: '#8a877e', patina: 'weathered surface', hard: 6 }),
  M('bone', 'bone', 1.8, { organic: true, decay: 0.25, acid: 2.0, moist: 0.8, oxy: 1.0, hex: '#d7ccb0', patina: 'stained and flaking', hard: 2.5, fragile: true }),
  M('shell', 'shell', 2.7, { organic: true, decay: 0.1, acid: 2.0, moist: 0.4, hex: '#e4ddd0', patina: 'chalky', hard: 3, fragile: true }),
  M('wood', 'wood', 0.6, { organic: true, decay: 0.8, acid: 0.4, moist: -0.9, oxy: 1.8, hex: '#6a4b2b', patina: 'waterlogged or rotted', hard: 2, fragile: true }),
  M('leather', 'leather', 0.9, { organic: true, decay: 0.85, acid: 0.4, moist: -0.8, oxy: 1.8, hex: '#4d3624', patina: 'stiff and cracked', hard: 1 }),
  M('cloth', 'cloth', 0.4, { organic: true, decay: 0.95, acid: 0.4, moist: -0.7, oxy: 1.9, hex: '#7b6e5b', patina: 'rotted to threads', hard: 1 }),
  M('paper', 'paper', 0.7, { organic: true, decay: 0.98, acid: 0.4, moist: -0.6, oxy: 1.9, hex: '#cbbf9e', patina: 'pulp', hard: 1 }),
  M('plastic', 'plastic', 1.2, { decay: 0.002, hex: '#a33a3a', patina: 'faded and brittle', hard: 3 }),
  M('celluloid', 'celluloid', 1.4, { decay: 0.03, hex: '#d8cdb4', patina: 'yellowed and crazed', hard: 2.5, fragile: true }),
  M('bakelite', 'bakelite', 1.3, { decay: 0.004, hex: '#3a2a22', patina: 'dulled', hard: 4 }),
  M('rubber', 'rubber', 1.2, { organic: true, decay: 0.3, hex: '#2b2a2a', patina: 'perished', hard: 1 }),
];
export const MAT = Object.fromEntries(MATERIALS.map(m => [m.id, m])) as Record<string, Material>;
