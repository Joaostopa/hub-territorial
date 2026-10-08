'use strict';
// Executive views share the same filters and current records as the original panel.
let municipalProfile = null, thematicLayer = null, comparisonSignature = '';
const executiveCard = (label, value, note) => `<div class="metric"><small>${esc(label)}</small><strong>${esc(value)}</strong><em>${esc(note)}</em></div>`;

function drawExecutive() {
  const groups = new Map();
  for (const row of selected) { const name = row.bairro || 'Não informado'; groups.set(name, (groups.get(name) || 0) + 1); }
  bars('executive-bairros', [...groups].sort((a,b) => b[1]-a[1]).slice(0,7));
  const rent = $('purpose').value === 'aluguel';
  const bounds = rent ? [1500,3000,5000,10000] : [300000,500000,800000,1500000];
  const labels = bounds.map((v,i) => i ? `${money.format(bounds[i-1])} a ${money.format(v)}` : `Até ${money.format(v)}`).concat(`Acima de ${money.format(bounds.at(-1))}`);
  const counts = labels.map(() => 0);
  for (const row of selected) { const value = number(row.preco); if (value > 0) { const i = bounds.findIndex(b => value <= b); counts[i < 0 ? bounds.length : i]++; } }
  bars('executive-prices', labels.map((label,i) => [label, counts[i]]));
  const dates = all.map(r => r.data_coleta?.slice(0,10)).filter(Boolean).sort();
  $('executive-quality').textContent = `${br.format(all.length)} anúncios na base histórica, com referência até ${dates.at(-1) || 'data não informada'}. ${br.format(selected.filter(mapped).length)} anúncios da seleção têm posição habilitada no mapa. Disponibilidade atual não reconfirmada.`;
  if (municipalProfile) {
    const p = municipalProfile;
    $('executive-census').innerHTML = executiveCard('População · 2022',br.format(p.population),'Município inteiro') + executiveCard('Renda média por pessoa',money.format(p.incomeMean),'Domiciliar per capita · 2022') + executiveCard('Densidade · 2022',br.format(p.density),'Habitantes por km²') + executiveCard('Bairros oficiais','75','Malha do Censo 2022');
  }
  drawComparison();
}

function drawMunicipalProfile() {
  const p = municipalProfile;
  if (!p) return;
  const growth = (p.population / p.previousPopulation - 1) * 100;
  const items = [
    ['População',br.format(p.population),'Censo 2022'],
    ['Crescimento 2010–2022',growth.toLocaleString('pt-BR',{maximumFractionDigits:2})+'%','Comparação municipal'],
    ['Renda média',money.format(p.incomeMean),'Domiciliar per capita · mensal · 2022'],
    ['Renda mediana',money.format(p.incomeMedian),'Domiciliar per capita · mensal · 2022'],
    ['Densidade',br.format(p.density)+' hab/km²','2022'],
    ['PIB por pessoa',money.format(p.gdpPerCapita),'2023 · não equivale à renda'],
    ['Escolarização · 6 a 14 anos',br.format(p.schooling)+'%','2022'],
    ['IDHM',br.format(p.idhm),'2010 · referência histórica']
  ];
  $('municipal-profile').innerHTML = items.map(x => executiveCard(...x)).join('');
  bars('expanded-ages',p.ages.map(x => [x.name,x.count]));
  $('profile-sources').innerHTML = `Valores nominais, com ano de referência próprio. <a href="${esc(p.source)}" target="_blank" rel="noopener">IBGE Cidades</a> · <a href="${esc(p.incomeSource)}" target="_blank" rel="noopener">Renda: tabela 10295</a> · <a href="${esc(p.ageSource)}" target="_blank" rel="noopener">Idades: tabela 9514</a> · <a href="${esc(p.previousSource)}" target="_blank" rel="noopener">População 2010: IPPUC / IBGE</a>. Verificado em ${esc(p.checked)}. Renda municipal não é estimativa de renda de cada bairro.`;
}

function drawComparison() {
  if (!territoryMesh) return;
  const features = [...territoryMesh.features].sort((a,b) => a.properties.nome.localeCompare(b.properties.nome,'pt'));
  if (!$('compare-1').options.length) {
    ['Bacacheri','Centro','Água Verde'].forEach((name,i) => {
      const select = $('compare-'+(i+1));
      select.innerHTML = features.map(f => `<option value="${esc(f.properties.codigo)}">${esc(f.properties.nome)}</option>`).join('');
      select.value = (features.find(f => f.properties.nome === name) || features[i]).properties.codigo;
    });
  }
  const chosen = [1,2,3].map(i => features.find(f => f.properties.codigo === $('compare-'+i).value)).filter(Boolean);
  const signature = chosen.map(f => f.properties.codigo).join('|');
  if (signature === comparisonSignature) return;
  comparisonSignature = signature;
  $('neighborhood-comparison').innerHTML = '<table><thead><tr><th>Bairro</th><th>População · 2022</th><th>Domicílios · 2022</th></tr></thead><tbody>'+chosen.map(f => `<tr><td>${esc(f.properties.nome)}</td><td>${br.format(f.properties.populacao)}</td><td>${br.format(f.properties.domicilios)}</td></tr>`).join('')+'</tbody></table><p class="note">Contagens oficiais dos bairros inteiros. A comparação independe dos filtros de anúncios.</p>';
}

function drawThematic() {
  thematicLayer?.remove(); thematicLayer = null;
  $('theme-legend').textContent = '';
  const key = $('map-theme').value;
  if (key === 'none' || !map || !territoryMesh || !window.L) return;
  const values = territoryMesh.features.map(f => f.properties[key]).filter(Number.isFinite).sort((a,b) => a-b);
  const cuts = [.25,.5,.75].map(q => values[Math.floor((values.length-1)*q)]);
  const palette = ['#d6eee8','#92cebf','#40a58f','#086d60'];
  thematicLayer = L.geoJSON(territoryMesh,{style:f => ({color:'#486b64',weight:1,fillOpacity:.48,fillColor:palette[cuts.filter(c => f.properties[key]>c).length]}),onEachFeature:(f,layer) => layer.bindTooltip(`${esc(f.properties.nome)} · ${br.format(f.properties[key])} ${key === 'populacao' ? 'habitantes' : 'domicílios'}`)}).addTo(map);
  thematicLayer.bringToBack();
  $('theme-legend').textContent = `Censo 2022 · tons claros → escuros: até ${br.format(cuts[0])}; até ${br.format(cuts[1])}; até ${br.format(cuts[2])}; acima de ${br.format(cuts[2])}. Contagens por bairro, não densidade.`;
}

const marketRender = render;
render = function() { marketRender(); drawExecutive(); };
$('city-picker').addEventListener('change',e => { if (e.target.value === 'londrina') window.location.assign('../index.html'); });
$('overview-export').onclick = () => $('csv').click();
$('map-theme').onchange = drawThematic;
$('downtown').onclick = () => { if (map && territoryMesh) map.fitBounds(L.geoJSON(territoryMesh).getBounds()); else map?.setView([-25.46,-49.27],11); };
for (const i of [1,2,3]) $('compare-'+i).onchange = drawComparison;
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
  if (button.dataset.tab === 'territorio' && map && $('scope').value === 'city' && territoryMesh) { map.fitBounds(L.geoJSON(territoryMesh).getBounds()); drawThematic(); }
}));
fetch('ibge.json?v=20261008').then(r => { if (!r.ok) throw Error(); return r.json(); }).then(p => { municipalProfile=p; drawMunicipalProfile(); drawExecutive(); }).catch(() => { $('municipal-profile').textContent='Indicadores municipais indisponíveis nesta conexão. Tente recarregar a página.'; });
