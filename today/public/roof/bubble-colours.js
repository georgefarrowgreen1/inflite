export const defaultBubbleColour = "opal";
// Rim swatches travel clockwise from the right-hand edge. Keep existing
// colourways available to people who chose them explicitly in Appearance.
export const minerals = {
  opal: {name:"Opal", light:{base:"#f4f1ef", atmosphere:"#e6dada"}, base:"#100e1a", atmosphere:"#382331", body:"#f1d5c8", shade:"#c3673a", pearl:"#fffcf7",
    rim:["#ffdb49","#e8cd86","#bdd2bd","#469bb9","#e8c1d5","#f57a9e","#e85152","#f19c35"]},
  midnight: {name:"Midnight", light:{base:"#f4f1f7", atmosphere:"#ded4e8"}, base:"#100e1a", atmosphere:"#352340", body:"#89749f", shade:"#392843", pearl:"#f1d9eb",
    rim:["#a581b4","#708fbc","#8ed6f0","#656bb6","#8c5f9d","#dc94b8","#a56da7","#6c5793"]},
  jade: {name:"Jade", light:{base:"#eff5f1", atmosphere:"#d3e4d9"}, base:"#091311", atmosphere:"#12362e", body:"#57907a", shade:"#1a4941", pearl:"#d6f1cf",
    rim:["#a9be76","#98c296","#88d9c7","#3e9796","#287e73","#6cb28c","#a4bc79","#77b193"]},
  cobalt: {name:"Cobalt", light:{base:"#f0f3f9", atmosphere:"#d4dfee"}, base:"#0a0f1d", atmosphere:"#1c304a", body:"#647ca9", shade:"#263353", pearl:"#e1edff",
    rim:["#6caee4","#69c4e5","#9eacfa","#6674bd","#514e9a","#8b7dc9","#6d9ee2","#7eabdd"]},
  lagoon: {name:"Lagoon", light:{base:"#eff5f6", atmosphere:"#cfe3e4"}, base:"#08131c", atmosphere:"#163746", body:"#659591", shade:"#214652", pearl:"#d9f6eb",
    rim:["#79cfab","#93d6bd","#a4c8ff","#5976ad","#326c9a","#5bb4b9","#52bdaa","#99d8bd"]}
};
export const bubbleColours = Object.entries(minerals).map(([value, ink]) => ({value, ...ink}));
